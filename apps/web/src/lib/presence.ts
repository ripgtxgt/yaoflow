import { readEventsBetween, type TrackedEvent } from "./analytics-server";
import { activeMembership } from "./membership";
import { standingKindOf, type StandingKind } from "./standing-label";
import { PULSE_MS } from "./presence-const";
import { BOT_UA_RE } from "./bot-ua";
import { browserStats, type BrowserStats } from "./browsers";
import { db } from "./db";
import { boardDevice, HUMAN_EVENTS } from "./cloud-ip";
import { deviceModel } from "./ua-brief";

/**
 * 实时在线 (10-02, Neil: 「后台能做一个实时在线的监测功能吗？显示实时的用户在线数据…人数、是否会员、新用户、
 * 回访用户、所在页面、动作、停留时间」).
 *
 * Who is on the site right now, one row per browser tab-session (the `s` tag every event carries — it lives in
 * sessionStorage, dies with the tab, and is never tied to a person by itself). Fed by two things:
 *   - every event /api/track records (page_view, cast_start, heat_click, …), and
 *   - a heartbeat (/api/pulse) the page sends every PULSE_MS while it is visible — the only way to know that someone
 *     reading a deep reading for eight minutes is still there. Pulses live only here, never in the event files.
 * The signed-in customer and membership come from the request's login cookie on the server, not from the page.
 *
 * In memory, in the one Node process, on globalThis (so every route handler sees the same table). A restart
 * loses it; the next pulse (≤ 30 s) rebuilds each open tab, and the last 30 minutes of recorded events are
 * replayed from today's file on boot so the board is not blank right after a deploy.
 *
 * Kept: nothing about the question, nothing about the reading. Shown only in /admin.
 */

export { PULSE_MS };
/** a tab is "online" when its last signal is this recent (with a 30 s pulse, four missed beats) */
export const ONLINE_MS = 2 * 60_000;
/** rows older than this leave the table */
export const KEEP_MS = 30 * 60_000;
const TRAIL_MAX = 12;
const FEED_MAX = 80;
const MEMBER_TTL = 60_000;

export type Device = "phone" | "tablet" | "desktop" | "bot" | null;

/**
 * 10-02 (Neil: 「这些访客里面有没有可能是我们的用户，只是没有登陆而已？」→「都做吧」): what a visitor's browser already
 * says about itself through the marker cookies the site sets anyway — never who they are.
 *   paid  — this browser has a paid full reading (yf_fd, set on that reading page)
 *   free  — this browser has used a free first reading (yf_il / yf_ff)
 *   was   — this browser carries a session cookie that no longer signs anyone in (signed in once; expired or ended)
 */
export interface Marks { paid?: boolean; free?: boolean; was?: boolean }

/** `num`: an event's small number where the board shows it — for repeat_blocked, how alike the two wordings were (0–100) */
export interface Trail { t: number; e: string; path?: string | null; method?: string | null; tier?: string | null; num?: number | null }

export interface Presence {
  s: string;
  firstAt: number;
  lastAt: number;
  /** the page they are on, and when they opened it */
  path: string | null;
  pathSince: number;
  /** the page they came in on */
  landing: string | null;
  pages: number;
  /** the tab is hidden / they have left this page (page_leave) and nothing has come since */
  hidden: boolean;
  lastEvent: Trail | null;
  trail: Trail[];
  locale: string | null;
  vt: "n" | "r" | null;
  vn: number | null;
  c: string | null;
  via: string | null;
  ab: string | null;
  customerId: number | null;
  email: string | null;
  /** 10-02: recognised by the yf_who mark while not signed in */
  knownId: number | null;
  knownEmail: string | null;
  member: boolean | null;
  /** 11-01 (Neil: 通卡和会员一定要区分清楚): which it is — member, pass (通卡) or comp (赠送会员) — and the pass's days */
  standing: StandingKind | null;
  passDays: number | null;
  memberAt: number;
  device: Device;
  model: string | null;
  country: string | null;
  marks: Marks;
  bid: string | null;
  bstats: BrowserStats | null;
}

export interface TouchInput {
  s: string;
  t: number;
  e: string;
  path?: string | null;
  locale?: string | null;
  vt?: "n" | "r" | null;
  vn?: number | null;
  c?: string | null;
  via?: string | null;
  ab?: string | null;
  method?: string | null;
  tier?: string | null;
  num?: number | null;
  /** the login cookie's customer, when the request carried one */
  customer?: { id: number; email: string } | null;
  /** 10-02: not signed in, but the browser's yf_who mark says whose it is (lib/who-mark.ts) */
  known?: { id: number; email: string } | null;
  /** 10-02: "iPhone 16 Pro Max · iOS 26.6 · Threads" (lib/ua-brief.ts deviceModel) — board only */
  model?: string | null;
  /** 10-03 按人看: the browser's id and its totals since the id (lib/browsers.ts) */
  bid?: string | null;
  /** 11-04: this request shows a person (signed in / known / cast / priced tap) — undoes a server-room 爬虫 filing */
  human?: boolean;
  bstats?: BrowserStats | null;
  /** from the request's User-Agent */
  device?: Device;
  /** from the edge's country header */
  country?: string | null;
  /** a pulse from a hidden tab (sent once on visibilitychange) */
  hidden?: boolean;
  /** marker cookies on the request (lib/presence-marks.ts) */
  marks?: Marks;
  /** replaying recorded events on boot: no membership lookups */
  replay?: boolean;
}

interface Store { rows: Map<string, Presence>; feed: (Trail & { s: string })[]; booted: boolean }

const G = globalThis as unknown as { __yfPresence?: Store };
function store(): Store {
  if (!G.__yfPresence) G.__yfPresence = { rows: new Map(), feed: [], booted: false };
  return G.__yfPresence;
}

export function deviceFromUA(ua: string | null | undefined): Device {
  if (!ua) return null;
  if (BOT_UA_RE.test(ua)) return "bot";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "phone";
  return "desktop";
}

/** One signal from one tab. Everything the board shows is derived here. */
export function touch(i: TouchInput): void {
  const st = store();
  if (!st.booted) boot(st);
  const s = i.s;
  if (!s || s === "anon" || s === "nosession") return;
  let p = st.rows.get(s);
  if (!p) {
    p = {
      s, firstAt: i.t, lastAt: i.t, path: null, pathSince: i.t, landing: null, pages: 0, hidden: false,
      lastEvent: null, trail: [], locale: null, vt: null, vn: null, c: null, via: null, ab: null,
      customerId: null, email: null, knownId: null, knownEmail: null, member: null, standing: null, passDays: null, memberAt: 0, device: null, model: null, country: null, marks: {},
      bid: null, bstats: null,
    };
    st.rows.set(s, p);
  }
  if (i.t < p.firstAt) p.firstAt = i.t;
  p.lastAt = Math.max(p.lastAt, i.t);
  if (i.locale) p.locale = i.locale;
  if (i.vt) p.vt = i.vt;
  if (typeof i.vn === "number") p.vn = i.vn;
  if (i.c) p.c = i.c;
  if (i.via) p.via = i.via;
  if (i.ab) p.ab = i.ab;
  if (i.device && (!p.device || i.device === "bot")) p.device = i.device;
  // 11-04: a visitor first filed as a server-room scanner who then acts like a person (lib/cloud-ip.ts) is a reader on a VPN
  if (i.human && i.device && i.device !== "bot" && p.device === "bot") p.device = i.device;
  if (i.country) p.country = i.country;
  if (i.customer) { p.customerId = i.customer.id; p.email = i.customer.email; }
  else if (i.known) { p.knownId = i.known.id; p.knownEmail = i.known.email; }
  if (i.model) p.model = i.model;
  if (i.bid) p.bid = i.bid;
  if (i.bstats) p.bstats = i.bstats;
  if (i.marks) {
    // paid / free only ever turn on; "was" follows the latest request (a fresh sign-in ends it)
    p.marks = { paid: p.marks.paid || !!i.marks.paid, free: p.marks.free || !!i.marks.free, was: !i.customer && !!i.marks.was };
  }

  const trail: Trail = { t: i.t, e: i.e, path: i.path ?? null, method: i.method ?? null, tier: i.tier ?? null, ...(typeof i.num === "number" ? { num: i.num } : {}) };
  if (i.e === "page_view") {
    if (!p.landing) p.landing = i.path ?? null;
    if (i.path && i.path !== p.path) { p.path = i.path; p.pathSince = i.t; }
    else if (!p.path && i.path) { p.path = i.path; p.pathSince = i.t; }
    p.pages += 1;
    p.hidden = false;
  } else if (i.e === "page_leave") {
    // a leave for the page they are still on means the tab went hidden (or closed); a late leave for an earlier
    // page — the two keepalive requests race — says nothing about now
    if (!i.path || i.path === p.path) p.hidden = true;
  } else if (i.e === "pulse") {
    if (i.path && i.path !== p.path) { p.path = i.path; p.pathSince = i.t; }
    p.hidden = !!i.hidden;
  } else {
    p.hidden = false;
    if (i.path && !p.path) { p.path = i.path; p.pathSince = i.t; }
  }
  if (i.e !== "pulse") {
    p.lastEvent = trail;
    p.trail.push(trail);
    if (p.trail.length > TRAIL_MAX) p.trail.splice(0, p.trail.length - TRAIL_MAX);
    // (replayed events fill the feed too, so the board is not blank for the first minutes after a deploy)
    if (i.e !== "page_leave" && i.e !== "visit_day") {
      st.feed.push({ ...trail, s });
      if (st.feed.length > FEED_MAX) st.feed.splice(0, st.feed.length - FEED_MAX);
    }
  }
  // membership: looked up at most once a minute per signed-in (or recognised) tab
  const cid = p.customerId ?? p.knownId;
  if (!i.replay && cid && i.t - p.memberAt > MEMBER_TTL) {
    try {
      const sub = activeMembership(cid, i.t);
      p.member = !!sub; p.standing = standingKindOf(sub?.stripe_subscription_id); p.passDays = sub?.pass_days ?? null;
    } catch { p.member = null; p.standing = null; p.passDays = null; }
    p.memberAt = i.t;
  }
  if (st.rows.size > 2000) sweep(st, i.t);
}

/** the address's local part — the signed-in one, else the one the yf_who mark names */
const whoOf = (p: Presence): string | null => (p.email ? p.email.split("@")[0]! : p.knownEmail ? p.knownEmail.split("@")[0]! : null);

function sweep(st: Store, now: number): void {
  for (const [k, p] of st.rows) if (now - p.lastAt > KEEP_MS) st.rows.delete(k);
}

/**
 * Events the server records under an order's or a grant's id, not a browser tab's (10-02: after each deploy the replay
 * turned them into made-up visitors — 「访客 850b 付款成功：深断」 was a member's allowance reading). Live, they never
 * reach the board (only /api/track and /api/pulse touch it); the replay leaves them out too.
 */
const SERVER_EVENTS = new Set([
  "purchase", "gift", "gift_sent", "gift_claimed", "invite_free_light", "case_reward", "case_published",
  "revisit_reward", "revisit_light_claimed", "revisit_answer", "progress_note", "pair_sent", "pair_claimed",
]);
export const isTabEvent = (e: { e: string; s: string }): boolean => !SERVER_EVENTS.has(e.e) && !(e.e === "seal_watch" && e.s.startsWith("seal"));

/** After a restart: the last 30 minutes of recorded events, so the board shows who was here before the deploy. */
function boot(st: Store): void {
  st.booted = true;
  try {
    const since = Date.now() - KEEP_MS;
    const evs = readEventsBetween(since, Date.now() + 60_000).filter((e) => e.t >= since && isTabEvent(e)).sort((a, b) => a.t - b.t);
    for (const e of evs) touch(fromEvent(e, true));
    restoreFromDb(st);
  } catch { /* no event files yet */ }
}

/**
 * 11-27 (Sakura：「现在所有的访客都在后台看不到设备和访客足迹了吗？」, after three restarts in 50 minutes): the replay
 * above brings back each tab's pages, but device, model, country, who it is and the browser's history come only from
 * the live request's headers, so every visitor from before a restart showed bare until their next heartbeat — and
 * those who had left stayed bare for half an hour. They are on file: the browser of each tab (events carry it), its
 * last address and device (browser_net), and the customer it is filed under (browser_links). Filled in here, once.
 */
function restoreFromDb(st: Store): void {
  try {
    const rows = [...st.rows.values()].filter((p) => p.bid);
    if (!rows.length) return;
    const d = db();
    const bids = [...new Set(rows.map((p) => p.bid!))];
    const net = new Map<string, { ip: string; country: string | null; ua: string | null; device: string | null }>();
    const who = new Map<string, { id: number; email: string | null }>();
    for (let i = 0; i < bids.length; i += 400) {
      const chunk = bids.slice(i, i + 400);
      const ph = chunk.map(() => "?").join(",");
      try {
        for (const r of d.prepare(`SELECT bid, ip, country, ua, device FROM browser_net WHERE bid IN (${ph}) ORDER BY last_at`).all(...chunk) as { bid: string; ip: string; country: string | null; ua: string | null; device: string | null }[])
          net.set(r.bid, r); // the latest row wins
      } catch { /* no table yet */ }
      try {
        for (const r of d.prepare(`SELECT l.bid, l.customer_id AS id, c.email FROM browser_links l LEFT JOIN customers c ON c.id = l.customer_id WHERE l.bid IN (${ph}) ORDER BY l.last_at`).all(...chunk) as { bid: string; id: number; email: string | null }[])
          who.set(r.bid, { id: r.id, email: r.email });
      } catch { /* no table yet */ }
    }
    for (const p of rows) {
      const b = p.bid!;
      const c = who.get(b);
      if (c && !p.customerId && !p.knownId) { p.knownId = c.id; p.knownEmail = c.email; }
      if (!p.bstats) p.bstats = browserStats(b);
      const n = net.get(b);
      if (!n) continue;
      if (!p.country && n.country) p.country = n.country;
      if (!p.device) {
        const human = !!c || p.trail.some((t) => HUMAN_EVENTS.has(t.e));
        const dev = (n.device === "phone" || n.device === "tablet" || n.device === "desktop" || n.device === "bot" ? n.device : deviceFromUA(n.ua)) as Device;
        const bd = boardDevice(n.ip || null, dev, deviceModel(n.ua) ?? null, human, { ua: n.ua });
        p.device = bd.device as Device;
        if (!p.model) p.model = bd.model;
      }
    }
  } catch { /* best-effort: the board works without it */ }
}

export function fromEvent(e: TrackedEvent, replay = false): TouchInput {
  return { s: e.s, t: e.t, e: e.e, path: e.path, locale: e.locale, vt: e.vt ?? null, vn: e.vn ?? null, c: e.c, via: e.via, ab: e.ab, method: e.method, tier: e.tier, replay,
    ...(replay && e.b ? { bid: e.b } : {}), // 11-27: the tab's browser, so a restart can fill in its device (restoreFromDb)
    // 10-03: on the free line and the block before the price, the same slot says which cast of one matter this is
    ...((e.e === "repeat_blocked" || e.e === "teaser_shown" || e.e === "nudge_shown") && typeof e.hex === "number" ? { num: e.hex } : {}) };
}

export interface LiveRow {
  s: string;
  online: boolean;
  hidden: boolean;
  bot: boolean;
  /** ms since the current page was opened (while online and visible) */
  onPageMs: number;
  /** ms since the first signal of this tab */
  sessionMs: number;
  idleMs: number;
  /** the raw stamps, so the board can keep the clocks ticking between polls */
  pathSince: number;
  lastAt: number;
  firstAt: number;
  path: string | null;
  landing: string | null;
  pages: number;
  last: Trail | null;
  trail: Trail[];
  locale: string | null;
  vt: "n" | "r" | null;
  vn: number | null;
  c: string | null;
  via: string | null;
  ab: string | null;
  customerId: number | null;
  /** the address's local part, as the other admin pages show it */
  who: string | null;
  /** 10-02: who comes from the yf_who mark, not a sign-in (knownId is that customer) */
  recognized: boolean;
  knownId: number | null;
  member: boolean | null;
  standing: StandingKind | null;
  passDays: number | null;
  device: Device;
  model: string | null;
  country: string | null;
  marks: Marks;
  /** 10-03 按人看 */
  bid: string | null;
  bstats: BrowserStats | null;
}

export interface LiveSnapshot {
  at: number;
  online: number;
  recent: number;
  /** 11-01: real members (monthly / yearly, and given ones) — 通卡 holders are counted apart */
  members: number;
  passes: number;
  signedIn: number;
  newToday: number;
  returning: number;
  /** online, not signed in, and the browser carries a mark — someone who has been a customer here before */
  knownAnon: number;
  knownAnonPaid: number;
  byLocale: Record<string, number>;
  byPage: { label: string; path: string; n: number }[];
  byDevice: Record<string, number>;
  rows: LiveRow[];
  feed: (Trail & { s: string; who: string | null; member: boolean | null; standing: StandingKind | null; passDays: number | null; recognized: boolean; customerId: number | null })[];
}

export function snapshot(now = Date.now()): LiveSnapshot {
  const st = store();
  if (!st.booted) boot(st);
  sweep(st, now);
  const rows: LiveRow[] = [...st.rows.values()]
    .map((p) => ({
      s: p.s,
      online: now - p.lastAt <= ONLINE_MS,
      hidden: p.hidden,
      bot: p.device === "bot",
      onPageMs: Math.max(0, (p.hidden ? p.lastAt : now) - p.pathSince),
      sessionMs: Math.max(0, p.lastAt - p.firstAt),
      idleMs: Math.max(0, now - p.lastAt),
      pathSince: p.pathSince, lastAt: p.lastAt, firstAt: p.firstAt,
      path: p.path, landing: p.landing, pages: p.pages, last: p.lastEvent, trail: [...p.trail].reverse(),
      locale: p.locale, vt: p.vt, vn: p.vn, c: p.c, via: p.via, ab: p.ab,
      customerId: p.customerId, who: whoOf(p), recognized: !p.customerId && !!p.knownId, knownId: p.customerId ? null : p.knownId, member: p.member, standing: p.standing, passDays: p.passDays,
      device: p.device, model: p.model, country: p.country, marks: { ...p.marks }, bid: p.bid, bstats: p.bstats,
    }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.idleMs - b.idleMs);
  const live = rows.filter((r) => r.online && !r.bot);
  const byLocale: Record<string, number> = {};
  const byDevice: Record<string, number> = {};
  const pages = new Map<string, number>();
  for (const r of live) {
    if (r.locale) byLocale[r.locale] = (byLocale[r.locale] ?? 0) + 1;
    byDevice[r.device ?? "?"] = (byDevice[r.device ?? "?"] ?? 0) + 1;
    if (r.path) pages.set(r.path, (pages.get(r.path) ?? 0) + 1);
  }
  const who = (s: string) => st.rows.get(s);
  return {
    at: now,
    online: live.length,
    recent: rows.filter((r) => !r.bot).length,
    members: live.filter((r) => r.member && r.standing !== "pass").length,
    passes: live.filter((r) => r.standing === "pass").length,
    signedIn: live.filter((r) => r.customerId).length,
    newToday: live.filter((r) => r.vt === "n").length,
    returning: live.filter((r) => r.vt === "r").length,
    knownAnon: live.filter((r) => !r.customerId && (r.recognized || r.marks.paid || r.marks.free || r.marks.was)).length,
    knownAnonPaid: live.filter((r) => !r.customerId && r.marks.paid).length,
    byLocale,
    byPage: [...pages.entries()].map(([path, n]) => ({ path, label: path, n })).sort((a, b) => b.n - a.n).slice(0, 12),
    byDevice,
    rows,
    // 11-04 (Neil, the live board full of 「访客 … 打开页面 卦页」 every five seconds): a tab filed as a bot — headless Chrome,
    // a crawler, a server-room scanner — stays off the feed too, as it already stayed off every count above
    feed: [...st.feed].reverse().filter((f) => who(f.s)?.device !== "bot").slice(0, 60).map((f) => {
      const p = who(f.s);
      return { ...f, who: p ? whoOf(p) : null, member: p?.member ?? null, standing: p?.standing ?? null, passDays: p?.passDays ?? null, recognized: !!p && !p.customerId && !!p.knownId, customerId: p?.customerId ?? p?.knownId ?? null };
    }),
  };
}

/** tests */
export function _resetPresence(): void {
  G.__yfPresence = { rows: new Map(), feed: [], booted: true };
}
