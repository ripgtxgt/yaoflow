import { computeStats, mergeStats, mergeVisitorTypes, readEventsBetween, visitorTypes, type TrackedEvent } from "./analytics-server";
import { homeDay } from "./clock";
import { pieceGet, pieceSet } from "./event-store";
import { isRealDeliveryEvent, paidOrdersIn, realOrderSessionTails, realPaidBrowserSessions } from "./db";
import { dailyBreakdown, whoContext, type WhoContext } from "./daily-who";
import { LIVE_SINCE } from "./live";
import { refresh, swr } from "./swr";
import { warmHeat } from "./admin-heat";

/**
 * 10-14 后台变卡: everything the /admin overview reads from the event log, computed together and kept (lib/swr.ts).
 * Fresh for 2 minutes; up to 30 minutes old it is shown at once and recomputed behind the page; the 10-minute cron
 * recomputes the three windows the page offers (上线以来 / 7 天 / 30 天), so the first click is not the slow one.
 */
export interface AdminBundle {
  at: number; since: number; realTails: Set<string>;
  /** 10-15 进度表 60: no longer every event — inWindow holds the kinds in PAGE_KINDS, twoWindows the browser errors */
  twoWindows: TrackedEvent[]; inWindow: TrackedEvent[];
  stats: ReturnType<typeof computeStats>; prev: ReturnType<typeof computeStats>["funnel"] | null;
  daily: ReturnType<typeof dailyBreakdown>; vtypes: ReturnType<typeof visitorTypes>;
}

export function windowOf(days: string | undefined, now = Date.now()): { window: number; live: boolean; since: number } {
  const live = !days || days === "live";
  const window = live ? Math.max(1, Math.ceil((now - LIVE_SINCE) / 86400_000)) : Math.min(Math.max(Number(days) || 30, 1), 365);
  return { window, live, since: live ? LIVE_SINCE : now - window * 86400_000 };
}

/**
 * 10-15 进度表 60: the window is counted one Taipei day at a time and the days added up (mergeStats) — memory stays at
 * about one day's events however long 「上线以来」 gets.
 *
 * Each day's piece takes the tabs that STARTED that day (events.db keeps every tab's first moment, ev_sessions) with all
 * their events in the window, whatever day they fall on — so a tab left open across midnight, or picked up again the
 * next morning, is one tab in one piece and the days add up to the count over the whole window. (A plain cut at midnight
 * had counted 57 casters twice on 10-15; carrying tabs only six hours lost 24 visitors who came back next morning in
 * the same tab.) The window's first piece also takes the tabs that started before the window. The daily table is per
 * day by nature and reads the plain day.
 *
 * A finished full day is kept — in memory and in events.db, so a restart or a deploy does not re-count every day: 6 hours
 * while fresh (its tabs may still be open, an order may be marked as a test), a week once it is two days old.
 */
type Piece = { stats: ReturnType<typeof computeStats>; daily: ReturnType<typeof dailyBreakdown>; vtypes: ReturnType<typeof visitorTypes> };
/**
 * 10-23 进度表 105 ⑪: the kept days carry the counting rules they were made with — when the rules change, bump this and
 * every kept day is counted again (they were kept up to a week, so a fix showed on new days only). 4: 通卡 its own
 * delivery kind and group, a pass counted once as money, every product's deliveries.
 */
const PIECE_VERSION = 4;
// 11-06: visitors leave out server-room link checkers (lib/machine-visit.ts) — only days with browser addresses on file
// (10-31 on) change, so only they are counted again: recounting every kept day at once took the cold overview past 99 s
const MACHINE_SINCE = Date.parse("2026-10-30T16:00:00Z"); // 10-31 00:00 Taipei
const pieceVersion = (from: number) => (from >= MACHINE_SINCE ? `${PIECE_VERSION}m` : `${PIECE_VERSION}`);
const PG = globalThis as unknown as { __yfAdminPieces?: Map<string, { at: number; piece: Piece }> };
const PIECE_TTL = 6 * 3_600_000;
const DAY = 86_400_000;
const taipeiDayStart = (t: number) => Date.parse(`${homeDay(t)}T00:00:00+08:00`);

export function piecesOf(since: number, until: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let from = since; from < until;) {
    const to = Math.min(taipeiDayStart(from) + DAY, until);
    out.push({ from, to });
    from = to;
  }
  return out;
}

function piece(from: number, to: number, since: number, until: number, now: number, realTails: Set<string>, paidSessions: ReadonlySet<string>, who: () => WhoContext): Piece {
  const first = from === since;
  const aligned = from === taipeiDayStart(from) || from === LIVE_SINCE;
  // kept only when it will be asked for again: a whole day (or go-live's first day) that is over, not a window's first
  // piece (that one also holds the tabs from before the window)
  const keep = aligned && to === taipeiDayStart(from) + DAY && to <= now - 60_000 && (!first || from === LIVE_SINCE);
  const cache = (PG.__yfAdminPieces ??= new Map());
  const key = `v${pieceVersion(from)}|${from}|${to}`;
  const ttl = to < now - 2 * DAY ? 7 * DAY : PIECE_TTL;
  if (keep) {
    const hit = cache.get(key);
    if (hit && now - hit.at < ttl) return hit.piece;
    try {
      const v = pieceGet(`admin|${key}`, ttl, now);
      if (v) { const p = JSON.parse(v) as Piece; cache.set(key, { at: now, piece: p }); return p; }
    } catch { /* recount */ }
  }
  const real = <E extends Parameters<typeof isRealDeliveryEvent>[0]>(xs: E[]) => xs.filter((e) => isRealDeliveryEvent(e, realTails));
  const end = until + (until === now ? 60_000 : 0); // events stamped a moment ahead (a browser clock)
  const evs = real(readEventsBetween(since, end, { startedIn: [first ? -Infinity : from, to] }));
  const own = real(readEventsBetween(from, Math.min(to, end) + (to === now ? 60_000 : 0)));
  const day = homeDay(from);
  const p: Piece = {
    stats: computeStats(evs, paidSessions, { full: true }),
    daily: dailyBreakdown(own, from, who(), to).filter((r) => r.day === day),
    vtypes: visitorTypes(evs, realPaidBrowserSessions(from)),
  };
  if (keep) {
    cache.set(key, { at: now, piece: p });
    try { pieceSet(`admin|${key}`, JSON.stringify(p), now); } catch { /* memory only */ }
    if (cache.size > 900) for (const [k, v] of cache) if (now - v.at >= PIECE_TTL) cache.delete(k);
  }
  return p;
}

/** The kinds the overview page still reads one by one (plays, today's hours, first campaign tag, browser errors). */
const PAGE_KINDS = ["seal_sent", "seal_watch", "daily_pick", "revisit_answer", "revisit_light_claimed", "visit_day", "cast_complete", "purchase", "page_view"] as const;

function compute(days: string | undefined): AdminBundle {
  const now = Date.now();
  const { window, live, since } = windowOf(days, now);
  const realTails = realOrderSessionTails();
  const paidSessions = paidOrdersIn(0).sessions;
  let ctx: WhoContext | null = null;
  const who = () => (ctx ??= whoContext()); // read once, and only if some day has to be counted
  const parts = piecesOf(since, now).map((x) => piece(x.from, x.to, since, now, now, realTails, paidSessions, who));
  // the overview compares against the window just before this one — only outside live mode
  const prevSince = since - window * DAY;
  const prev = live ? null : mergeStats(piecesOf(prevSince, since).map((x) => piece(x.from, x.to, prevSince, since, now, realTails, paidSessions, who).stats)).funnel;
  const inWindow = readEventsBetween(since, now + 60_000, { only: PAGE_KINDS }).filter((e) => isRealDeliveryEvent(e, realTails));
  const twoWindows = readEventsBetween(since, now + 60_000, { only: ["client_error"] });
  return {
    at: now, since, realTails, twoWindows, inWindow,
    stats: mergeStats(parts.map((p) => p.stats)),
    prev,
    daily: parts.flatMap((p) => p.daily),
    vtypes: mergeVisitorTypes(parts.map((p) => p.vtypes)),
  };
}

const keyOf = (days: string | undefined) => `admin|${!days || days === "live" ? "live" : String(windowOf(days).window)}`;

export function adminBundle(days: string | undefined): AdminBundle {
  return swr(keyOf(days), 2 * 60_000, 30 * 60_000, () => compute(days));
}

/** The cron's warm-up: the three windows the page's buttons offer. */
export function warmAdmin(): void {
  for (const d of ["live", "7", "30"]) refresh(keyOf(d), () => compute(d));
  warmDoor();
  warmHeat();
}

/** The painted-door fortnight (before 09-21): fixed history — kept 6 hours, and warmed with the rest. */
function computeDoor(): ReturnType<typeof computeStats> {
  const tails = realOrderSessionTails();
  // 10-15 进度表 60: only the fortnight before go-live is read (an index range, not 400 days)
  return computeStats(readEventsBetween(0, LIVE_SINCE).filter((e) => isRealDeliveryEvent(e, tails)));
}
export function doorStats(): ReturnType<typeof computeStats> {
  return swr("admin|door", 6 * 3_600_000, 7 * 24 * 3_600_000, computeDoor);
}
export function warmDoor(): void {
  doorStats();
}
