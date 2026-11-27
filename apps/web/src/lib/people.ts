import { db } from "./db";
import { machineBids } from "./machine-visit";
import { readEvents, type TrackedEvent } from "./analytics-server";
import { browsersOfCustomer, customersOfBrowser, tabsOfBrowsers, type BrowserRow } from "./browsers";
import { homeDay, homeMinute } from "./clock";
import { castsOfBids, isPaidSession, threadRow } from "./cast-log";
import { personResolver, purchaseRecords, type PurchaseRec } from "./purchases";
import { personHistories } from "./daily-who";
import { LIVE_STATUSES } from "./subscription";

/**
 * 10-03 按人看 (Neil: 「把一个人的标识从第一次进入，到第几天回访，第几次摇卦，都能精准的识别出来」): the dashboard's
 * reading of the browser ids (lib/browsers.ts) — a list of who came lately, one person's day-by-day trail, and the
 * funnel counted per person instead of per tab. Days are the house clock (UTC+8). A "person" is a browser until it is
 * filed under a customer; a customer is every browser filed under them.
 *
 * 10-04 排除会员 (Neil: 「这页应该要标明和排除会员的吧？」): a member sees no price, so a member's visits are not a
 * funnel to convert — the lists leave them out (the 「会员」 list shows them, marked), and the funnel counts only new people.
 * What a person paid is read per person too: any browser of theirs, their account, a membership.
 */
export const PEOPLE_SINCE = Date.parse("2026-10-03T00:00:00+08:00");

export interface PersonRow extends BrowserRow {
  customerId: number | null;
  who: string | null;
  /** paid readings of this person — this browser and every browser and account filed with it (10-04; was this browser's tabs) */
  paidOrders: number;
  /** their first purchase of any kind (a reading, a membership) */
  firstPaidAt: number | null;
  /** 10-03 起卦记录: the most casts this browser put on one matter (0 = none logged) */
  maxThread: number;
  /** 10-04: a member when they came in the window (or made a member since, free) — sees no price; only the 「会员」 list shows them */
  member: boolean;
  /** the membership still runs (a member whose membership ran out in the window: false) */
  memberNow: boolean;
  /** 11-01 (Neil: 通卡和会员一定要区分清楚): what covered them — a membership, a 通卡, or the page said so without a row we can see */
  coverKind: "member" | "pass" | "unknown" | null;
  /** started a paid membership in the window — a conversion: stays in the lists, counts as paid */
  joinedAt: number | null;
  /** was a member once, not in the window: sees prices again, stays in the lists */
  lapsed: boolean;
  /** paid anything, ever: a reading, a membership, a pack — on any browser of theirs */
  everPaid: boolean;
}

export type PeopleFilter = "all" | "paid" | "unpaid" | "back" | "repeat" | "member";
export const PEOPLE_FILTERS: PeopleFilter[] = ["all", "unpaid", "repeat", "paid", "back", "member"];

/** What the list needs about everyone: who is whom, what they bought, when they were members, which browsers cast as one. */
interface Known {
  person: ReturnType<typeof personResolver>;
  hist: ReturnType<typeof personHistories>;
  recs: Map<string, PurchaseRec[]>;
  /** browsers with a cast in the window that the page said a membership covered (cast_log.member) */
  flagged: Set<string>;
}
function known(since: number): Known {
  const person = personResolver();
  return {
    person, hist: personHistories(person), recs: purchaseRecords(0, person),
    flagged: new Set((db().prepare("SELECT DISTINCT bid FROM cast_log WHERE member = 1 AND created_at >= ?").all(since) as { bid: string }[]).map((r) => r.bid)),
  };
}
const within = (spans: [number, number][] | undefined, t: number) => (spans ?? []).some(([a, z]) => a <= t && t < z);

/** One browser's standing over [since, now]: a member then, a new member, a lapsed one, what it paid. */
function standing(k: Known, bid: string, firstAt: number, since: number, now: number) {
  const key = k.person(bid, null);
  const h = key ? k.hist.get(key) : undefined;
  const recs = key ? k.recs.get(key) ?? [] : [];
  const arrival = Math.max(since, firstAt);
  const spans = h?.member ?? [];
  const passSpans = h?.pass ?? [];
  const joinedAt = recs.find((p) => p.kind === "membership" && p.t > arrival && p.t <= now)?.t ?? null;
  // a member when they came; or one now without having paid for it in the window (given one); or the page said so
  const member = within(spans, arrival) || (!joinedAt && (within(spans, now) || k.flagged.has(bid)));
  const memberSpan = within(spans, arrival) || within(spans, now);
  const passSpan = within(passSpans, arrival) || within(passSpans, now);
  const coverKind = !member ? null : memberSpan ? "member" as const : passSpan ? "pass" as const : "unknown" as const;
  return {
    member, coverKind, memberNow: within(spans, now) || within(passSpans, now) || (member && !spans.length), joinedAt,
    lapsed: !member && !joinedAt && spans.length > 0,
    everPaid: !!h && h.paid < Infinity,
    paidOrders: recs.filter((p) => p.kind === "order").length,
    firstPaidAt: recs[0]?.t ?? null,
  };
}

type Keepable = Pick<PersonRow, "member" | "everPaid" | "days" | "maxThread">;
const KEEP: Record<PeopleFilter, (r: Keepable) => boolean> = {
  all: (r) => !r.member,
  paid: (r) => !r.member && r.everPaid,
  unpaid: (r) => !r.member && !r.everPaid,
  back: (r) => !r.member && r.days >= 2,
  repeat: (r) => !r.member && !r.everPaid && r.maxThread >= 3,
  member: (r) => r.member,
};

/**
 * Browsers seen since `since`, newest first: the filter keeps the ones that paid, never paid, came back another day — or
 * (10-03, the reason the cast log exists) asked about one matter three times or more and never paid. Members are only in
 * the 「会员」 list (10-04).
 */
export function peopleList(since: number, filter: PeopleFilter = "all", limit = 300, now = Date.now()): PersonRow[] {
  return peopleView(since, filter, limit, now).rows;
}

/**
 * The list (the newest `limit`), how many browsers in the window the filter keeps in all, and how many were members'
 * (left out of every list but 「会员」).
 */
export function peopleView(since: number, filter: PeopleFilter = "all", limit = 300, now = Date.now()): { rows: PersonRow[]; total: number; members: number; machines: number } {
  const k = known(since);
  const rows = db().prepare(
    `SELECT b.*,
       (SELECT l.customer_id FROM browser_links l WHERE l.bid = b.bid ORDER BY l.last_at DESC LIMIT 1) AS customer_id,
       (SELECT COALESCE(MAX(c.thread_n), 0) FROM cast_log c WHERE c.bid = b.bid) AS max_thread
     FROM browsers b WHERE b.last_at >= ? ORDER BY b.last_at DESC LIMIT ?`,
  ).all(since, limit * 3) as unknown as (BrowserRow & { customer_id: number | null; max_thread: number })[];
  // 11-08: server-room link checkers are not people (lib/machine-visit.ts) — counted apart
  const machinesShown = machineBids(rows.map((r) => r.bid));
  const emails = new Map<number, string>();
  const ids = [...new Set(rows.map((r) => r.customer_id).filter((x): x is number => !!x))];
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    for (const c of db().prepare(`SELECT id, email FROM customers WHERE id IN (${part.map(() => "?").join(",")})`).all(...part) as { id: number; email: string }[]) emails.set(c.id, c.email);
  }
  const list: PersonRow[] = rows.filter((r) => !machinesShown.has(r.bid)).map(({ customer_id, max_thread, ...r }) => ({
    ...r, customerId: customer_id, who: customer_id ? emails.get(customer_id)?.split("@")[0] ?? `#${customer_id}` : null,
    maxThread: max_thread ?? 0, ...standing(k, r.bid, r.first_at, since, now),
  }));
  // every browser in the window (not only the newest few hundred): how many the filter keeps, how many were members'
  let members = 0, total = 0;
  const every = db().prepare(
    "SELECT b.bid, b.first_at, b.days, (SELECT COALESCE(MAX(c.thread_n), 0) FROM cast_log c WHERE c.bid = b.bid) AS max_thread FROM browsers b WHERE b.last_at >= ?",
  ).all(since) as { bid: string; first_at: number; days: number; max_thread: number }[];
  const machines = machineBids(every.map((b) => b.bid));
  for (const b of every) {
    if (machines.has(b.bid)) continue;
    const s = standing(k, b.bid, b.first_at, since, now);
    if (s.member) members += 1;
    if (KEEP[filter]({ ...s, days: b.days, maxThread: b.max_thread ?? 0 })) total += 1;
  }
  return { rows: list.filter(KEEP[filter]).slice(0, limit), total, members, machines: machines.size };
}

/* ---------------- 10-24 没登录的回头客 ---------------- */

/** where a returning reader without an account stopped, furthest step first */
export type AnonStep = "checkout" | "price" | "teaser" | "cast" | "tools" | "browse";
export const ANON_STEP_ZH: Record<AnonStep, string> = {
  checkout: "去付款了，没付完", price: "点了价格，没去付款", teaser: "看完免费一句，没点价格", cast: "起了卦，没看到免费一句",
  tools: "只用免费工具（擲筊／求籤／塔罗／问答）", browse: "只看了页面",
};
export interface AnonRow extends BrowserRow {
  tarot: number; jiaobei: number; qiuqian: number; qa: number;
  step: AnonStep;
  /** the newest question they typed anywhere (a sensitive 六爻 question: its category only) */
  lastQ: string | null; lastQAt: number | null;
}
export function anonStep(r: Pick<AnonRow, "casts" | "teased" | "clicks" | "checkouts" | "tarot" | "jiaobei" | "qiuqian" | "qa">): AnonStep {
  if (r.checkouts > 0) return "checkout";
  if (r.clicks > 0) return "price";
  if (r.teased > 0) return "teaser";
  if (r.casts > 0) return "cast";
  return r.tarot + r.jiaobei + r.qiuqian + r.qa > 0 ? "tools" : "browse";
}

/**
 * 10-24 (Neil: 「除了我们有邮箱记录的，所有的浏览器……这个数据有吗？」→「要」): browsers seen since `since` that came on two
 * days or more, never signed in or paid (no account filed with them) and are not a member — what they used, the newest
 * thing they asked, and the furthest step they reached. `steps` counts every one of them, the list is the newest `limit`.
 */
export function anonReturners(since: number, limit = 300, now = Date.now()): { rows: AnonRow[]; total: number; steps: Record<AnonStep, number> } {
  const k = known(since);
  const base = db().prepare(
    `SELECT b.* FROM browsers b
      WHERE b.last_at >= ? AND b.days >= 2 AND NOT EXISTS (SELECT 1 FROM browser_links l WHERE l.bid = b.bid)
      ORDER BY b.last_at DESC`,
  ).all(since) as unknown as BrowserRow[];
  const kept = base.filter((b) => { const st = standing(k, b.bid, b.first_at, since, now); return !st.member && !st.everPaid; });
  const count = (table: string) => {
    const m = new Map<string, number>();
    try { for (const r of db().prepare(`SELECT bid, COUNT(*) AS n FROM ${table} WHERE bid IS NOT NULL GROUP BY bid`).all() as { bid: string; n: number }[]) m.set(r.bid, r.n); } catch { /* not made yet */ }
    return m;
  };
  const tarot = count("tarot_draws"), jiaobei = count("jiaobei_asks"), qiuqian = count("qiuqian_draws"), qa = count("mingli_qa");
  const steps: Record<AnonStep, number> = { checkout: 0, price: 0, teaser: 0, cast: 0, tools: 0, browse: 0 };
  const all = kept.map((b) => {
    const r = { ...b, tarot: tarot.get(b.bid) ?? 0, jiaobei: jiaobei.get(b.bid) ?? 0, qiuqian: qiuqian.get(b.bid) ?? 0, qa: qa.get(b.bid) ?? 0 };
    const step = anonStep(r);
    steps[step] += 1;
    return { ...r, step };
  });
  const latest = (bid: string): { q: string; at: number } | null => {
    const one = (sql: string) => { try { return db().prepare(sql).get(bid) as { q: string | null; at: number } | undefined; } catch { return undefined; } };
    const c = [
      one("SELECT COALESCE(question, CASE WHEN sensitive IS NOT NULL THEN '（' || sensitive || '类问题）' END) AS q, created_at AS at FROM cast_log WHERE bid = ? ORDER BY created_at DESC LIMIT 1"),
      one("SELECT question AS q, created_at AS at FROM tarot_draws WHERE bid = ? ORDER BY created_at DESC LIMIT 1"),
      one("SELECT question AS q, created_at AS at FROM jiaobei_asks WHERE bid = ? AND question IS NOT NULL AND question <> '' ORDER BY created_at DESC LIMIT 1"),
      one("SELECT question AS q, created_at AS at FROM qiuqian_draws WHERE bid = ? AND question IS NOT NULL AND question <> '' ORDER BY created_at DESC LIMIT 1"),
      one("SELECT question AS q, at FROM mingli_qa WHERE bid = ? ORDER BY at DESC LIMIT 1"),
    ].filter((x): x is { q: string; at: number } => !!x && !!x.q);
    return c.sort((a, b) => b.at - a.at)[0] ?? null;
  };
  const rows = all.slice(0, limit).map((r) => { const l = latest(r.bid); return { ...r, lastQ: l?.q ?? null, lastQAt: l?.at ?? null }; });
  return { rows, total: all.length, steps };
}

/* ---------------- 10-03 起卦记录: one person's casts and matters ---------------- */

export interface TrailCast {
  id: number; at: number; s: string | null; question: string | null; sensitive: string | null; primary: number; changed: number | null;
  teaser: string | null; capped: boolean; threadId: number | null; n: number | null; nudge: string | null; nudgeSeen: boolean; style: string | null; paidSid: string | null;
  /** 10-04: a membership covered it (the page said so, or one was running then) — no price was shown */
  member: boolean;
  /** 10-13 全部起卦: the six values and the cast's clock, so the admin page can lay the chart out; the free line's lean */
  values: string; tz: number; lean: string | null; locale: string | null;
}
export interface TrailThread { id: number; title: string | null; sensitive: string | null; casts: number; firstAt: number; lastAt: number; paid: boolean; /** 11-05: read with a 通卡/会员 allowance or a free claim — not bought, but the reader did get the reading */ viewed: boolean }

/** `memberSpans`: when this person was a member (Trail.memberships), to mark the casts a membership covered */
export function castsForTrail(bids: string[], since: number, memberSpans: [number, number][] = []): { casts: TrailCast[]; threads: TrailThread[] } {
  const rows = castsOfBids(bids, since);
  const casts: TrailCast[] = rows.map((r) => ({
    id: r.id, at: r.at, s: r.s, question: r.question, sensitive: r.sensitive, primary: r.primary_num, changed: r.changed_num, teaser: r.teaser,
    capped: r.capped === 1, threadId: r.thread_id, n: r.thread_n, nudge: r.nudge, nudgeSeen: r.nudge_seen === 1, style: r.style, paidSid: r.paid_sid,
    member: r.member === 1 || within(memberSpans, r.created_at),
    values: r.values_str, tz: r.tz, lean: r.lean, locale: r.locale,
  }));
  const ids = [...new Set(casts.map((c) => c.threadId).filter((x): x is number => !!x))];
  const threads: TrailThread[] = ids.map((id) => {
    const t = threadRow(id);
    const mine = casts.filter((c) => c.threadId === id);
    return { id, title: t?.title ?? null, sensitive: t?.sensitive ?? null, casts: t?.n ?? mine.length, firstAt: t?.first_at ?? mine[0]!.at, lastAt: t?.last_at ?? mine[mine.length - 1]!.at, paid: mine.some((c) => isPaidSession(c.paidSid)), viewed: mine.some((c) => !!c.paidSid) };
  }).sort((a, b) => b.lastAt - a.lastAt);
  return { casts, threads };
}

/* ---------------- one person's trail ---------------- */

export interface TrailOrder { at: number; tier: string; cents: number | null; currency: string | null; status: string; firstDeep: boolean; paid: boolean }
export interface TrailSession { s: string; start: number; end: number; landing: string | null; from: string | null; events: TrackedEvent[]; orders: TrailOrder[] }
export interface TrailDay { day: string; index: number; sessions: TrailSession[] }
/** 10-04: one membership of the person — monthly (sub_), a single month (pass_) or given (comp_); `to` null = still running */
export interface TrailMembership { from: number; to: number | null; kind: "monthly" | "month" | "given" }
export interface Trail {
  bids: string[];
  customers: { id: number; email: string | null }[];
  /** 10-04 排除会员: their memberships, oldest first (a member sees no price) */
  memberships: TrailMembership[];
  days: TrailDay[];
  /** orders of the customer(s) that no tab of these browsers placed (another browser, before the ids, a gift) */
  otherOrders: TrailOrder[];
  summary: {
    firstAt: number | null; firstFrom: string | null; firstDayLocal: string | null;
    visitDays: number; sessions: number; casts: number; teased: number; clicks: number; checkouts: number;
    paid: number; firstPaidAt: number | null; castsBeforePaid: number | null; dayOfFirstPaid: number | null; calendarDaysToPaid: number | null;
  };
}

type OrderRow = { session_id: string; created_at: number; tier: string; amount_cents: number | null; currency: string | null; status: string; payment_state: string | null; first_deep: number | null; browser_sid: string | null; test_flag: number | null };
const toOrder = (o: OrderRow): TrailOrder => ({
  at: o.created_at, tier: o.tier, cents: o.amount_cents, currency: o.currency, status: o.status, firstDeep: o.first_deep === 1,
  paid: ["paid", "refunded", "disputed"].includes(o.payment_state ?? "") && (o.amount_cents ?? 0) > 0 && !o.test_flag,
});

/** A browser (`b=<id>`) or a customer (`c=<id>`): every event of their browsers in the last `days`, by day and by tab. */
export function personTrail(target: { bid: string } | { customerId: number }, days = 60): Trail {
  const customers = "customerId" in target
    ? [{ id: target.customerId, email: (db().prepare("SELECT email FROM customers WHERE id = ?").get(target.customerId) as { email: string } | undefined)?.email ?? null }]
    : customersOfBrowser(target.bid).map((c) => ({ id: c.customer_id, email: c.email }));
  const bids = "customerId" in target ? browsersOfCustomer(target.customerId).map((x) => x.bid) : [target.bid];
  const set = new Set(bids);
  const events = readEvents(days, { browsers: bids }).filter((e) => e.b && set.has(e.b)).sort((a, b) => a.t - b.t);
  const tabs = tabsOfBrowsers(bids);
  const sids = [...tabs.keys()];
  const custIds = customers.map((c) => c.id);
  const orders: OrderRow[] = [];
  const cols = "session_id, created_at, tier, amount_cents, currency, status, payment_state, first_deep, browser_sid, test_flag";
  if (sids.length) orders.push(...(db().prepare(`SELECT ${cols} FROM orders WHERE browser_sid IN (${sids.map(() => "?").join(",")})`).all(...sids) as unknown as OrderRow[]));
  if (custIds.length) orders.push(...(db().prepare(`SELECT ${cols} FROM orders WHERE customer_id IN (${custIds.map(() => "?").join(",")})`).all(...custIds) as unknown as OrderRow[]));
  const seenOrder = new Set<string>();
  const uniq = orders.filter((o) => (seenOrder.has(o.session_id) ? false : (seenOrder.add(o.session_id), true))).sort((a, b) => a.created_at - b.created_at);
  // 10-04: their memberships — a running one is open-ended; an ended one ran to the end of its last paid period
  const memberships: TrailMembership[] = custIds.length
    ? (db().prepare(
        `SELECT stripe_subscription_id AS sid, status, created_at AS t, period_end AS pe, updated_at AS up FROM subscriptions
         WHERE customer_id IN (${custIds.map(() => "?").join(",")}) AND status NOT IN ('incomplete','incomplete_expired') ORDER BY created_at`,
      ).all(...custIds) as { sid: string; status: string; t: number; pe: number | null; up: number }[]).map((s) => ({
        // 11-01: a 通卡 runs to its own end, whatever its status says
        from: s.t, to: s.sid.startsWith("pass_") ? (s.pe ?? s.up) : LIVE_STATUSES.has(s.status) ? null : (s.pe ?? s.up),
        kind: s.sid.startsWith("pass_") ? "month" : s.sid.startsWith("comp_") ? "given" : "monthly",
      }))
    : [];

  // tabs, in the order they started
  const bySession = new Map<string, TrailSession>();
  for (const e of events) {
    let t = bySession.get(e.s);
    if (!t) { t = { s: e.s, start: e.t, end: e.t, landing: null, from: null, events: [], orders: [] }; bySession.set(e.s, t); }
    t.end = Math.max(t.end, e.t);
    if (!t.landing && e.e === "page_view") t.landing = e.path ?? null;
    if (!t.from && (e.c || e.ref)) t.from = e.c ?? e.ref ?? null;
    t.events.push(e);
  }
  const otherOrders: TrailOrder[] = [];
  for (const o of uniq) {
    const t = o.browser_sid ? bySession.get(o.browser_sid) : undefined;
    if (t) t.orders.push(toOrder(o)); else otherOrders.push(toOrder(o));
  }
  const dayMap = new Map<string, TrailSession[]>();
  for (const t of [...bySession.values()].sort((a, b) => a.start - b.start)) {
    const k = homeDay(t.start);
    dayMap.set(k, [...(dayMap.get(k) ?? []), t]);
  }
  const dayList: TrailDay[] = [...dayMap.entries()].map(([day, sessions], i) => ({ day, index: i + 1, sessions }));

  const count = (name: string, pred: (e: TrackedEvent) => boolean = () => true) => events.filter((e) => e.e === name && pred(e)).length;
  const paidOrders = uniq.filter((o) => toOrder(o).paid);
  const firstPaidAt = paidOrders[0]?.created_at ?? null;
  const firstAt = events[0]?.t ?? null;
  const firstFrom = events.find((e) => e.c || e.ref)?.c ?? events.find((e) => e.ref)?.ref ?? null;
  const firstVisitDay = events.find((e) => e.e === "visit_day" && e.fd)?.fd ?? null;
  return {
    bids, customers, memberships, days: dayList, otherOrders,
    summary: {
      firstAt, firstFrom, firstDayLocal: firstVisitDay,
      visitDays: dayList.length, sessions: bySession.size,
      casts: count("cast_complete"), teased: count("teaser_shown"),
      clicks: count("reading_click", (e) => !(e.method ?? "").startsWith("wallet")), checkouts: count("checkout_start"),
      paid: paidOrders.length, firstPaidAt,
      castsBeforePaid: firstPaidAt ? events.filter((e) => e.e === "cast_complete" && e.t < firstPaidAt).length : null,
      dayOfFirstPaid: firstPaidAt ? dayList.filter((d) => d.day <= homeDay(firstPaidAt)).length : null,
      calendarDaysToPaid: firstPaidAt && firstAt ? Math.round((Date.parse(homeDay(firstPaidAt)) - Date.parse(homeDay(firstAt))) / 86_400_000) : null,
    },
  };
}

/* ---------------- the funnel, per person ---------------- */

export interface PersonFunnel {
  /** new people — a browser, joined with every browser and account filed with it — who first came on or after `since` */
  people: number; cast: number; back: number; paid: number;
  /** of those who paid: what the first purchase was — a reading, or a membership (a single month too) */
  paidBy: { reading: number; membership: number };
  /**
   * 10-04, left out: `old` had come before `since` (the browser remembers an earlier first visit, another browser of theirs
   * or their account is older, or they had paid before); `members` were members when they first came (no price to see)
   */
  old: number; members: number;
  /** among those who paid: casts before the first payment, and on which visiting day it came */
  castsBeforePaid: Record<"1" | "2" | "3" | "4+", number>;
  payDay: Record<"1" | "2" | "3" | "4+", number>;
  medianCasts: number | null;
  /** paid share by how many casts / how many visiting days a person had (everyone with a cast) */
  byCasts: { k: string; n: number; paid: number }[];
  byDays: { k: string; n: number; paid: number }[];
}

const bucket4 = (n: number): "1" | "2" | "3" | "4+" => (n <= 1 ? "1" : n === 2 ? "2" : n === 3 ? "3" : "4+");

export function personFunnel(since = PEOPLE_SINCE, now = Date.now()): PersonFunnel {
  const d = db();
  const person = personResolver();
  const hist = personHistories(person);
  const recs = purchaseRecords(since, person);
  const sinceDay = homeDay(since);
  // every browser that first showed up in the window, gathered into people
  type P = { key: string; bids: string[]; firstAt: number; casts: number; days: number; old: boolean };
  const people = new Map<string, P>();
  const firsts = d.prepare("SELECT bid, first_at, first_day, casts, days FROM browsers WHERE first_at >= ?").all(since) as { bid: string; first_at: number; first_day: string | null; casts: number; days: number }[];
  const machines = machineBids(firsts.map((r) => r.bid)); // 11-08: link checkers are not new people
  for (const r of firsts) {
    if (machines.has(r.bid)) continue;
    const key = person(r.bid, null)!;
    const p = people.get(key) ?? { key, bids: [], firstAt: r.first_at, casts: 0, days: 0, old: false };
    p.bids.push(r.bid);
    p.firstAt = Math.min(p.firstAt, r.first_at);
    p.casts += r.casts;
    p.days = Math.max(p.days, r.days);
    // the browser remembers coming before (its own first-visit day, kept in its storage from before the ids)
    if (r.first_day && r.first_day < sinceDay) p.old = true;
    people.set(key, p);
  }
  // another browser of theirs, or their account, is older than the window
  for (const l of d.prepare("SELECT l.bid FROM browser_links l JOIN browsers b ON b.bid = l.bid WHERE b.first_at < ?").all(since) as { bid: string }[]) {
    const p = people.get(person(l.bid, null)!);
    if (p) p.old = true;
  }
  for (const c of d.prepare("SELECT DISTINCT l.customer_id AS cid FROM browser_links l JOIN customers c ON c.id = l.customer_id WHERE c.first_seen < ?").all(since) as { cid: number }[]) {
    const p = people.get(person(null, c.cid)!);
    if (p) p.old = true;
  }
  // casts the page said a membership covered (a member's browser not filed under them yet)
  const flagged = new Set((d.prepare("SELECT DISTINCT bid FROM cast_log WHERE member = 1 AND created_at >= ?").all(since) as { bid: string }[]).map((r) => r.bid));
  let old = 0, members = 0;
  const kept: (P & { paidAt: number | null })[] = [];
  for (const p of people.values()) {
    const h = hist.get(p.key);
    const joined = (recs.get(p.key) ?? []).some((x) => x.kind === "membership" && x.t > p.firstAt);
    // a member when they first came (or the page said so, and they never paid for one here): no price to see
    if ((h && within(h.member, p.firstAt)) || (!joined && p.bids.some((b) => flagged.has(b)))) { members += 1; continue; }
    if (p.old || (h && h.paid < p.firstAt)) { old += 1; continue; }
    kept.push({ ...p, paidAt: h && h.paid < Infinity ? h.paid : null });
  }

  // the events of those who paid (casts before paying, which visiting day) and of people with several browsers (their days)
  const want = new Set(kept.filter((p) => p.paidAt || p.bids.length > 1).flatMap((p) => p.bids));
  const per = new Map<string, TrackedEvent[]>();
  if (want.size) {
    for (const e of readEvents(Math.min(90, Math.ceil((now - since) / 86_400_000) + 1), { browsers: [...want] })) {
      if (!e.b || !want.has(e.b)) continue;
      const list = per.get(e.b);
      if (list) list.push(e); else per.set(e.b, [e]);
    }
  }
  const eventsOf = (p: P) => p.bids.flatMap((b) => per.get(b) ?? []).sort((a, b) => a.t - b.t);
  for (const p of kept) if (p.bids.length > 1) p.days = Math.max(p.days, new Set(eventsOf(p).map((e) => homeDay(e.t))).size);

  const out: PersonFunnel = {
    people: kept.length, cast: kept.filter((p) => p.casts > 0).length, back: kept.filter((p) => p.days >= 2).length,
    paid: kept.filter((p) => p.paidAt).length, paidBy: { reading: 0, membership: 0 }, old, members,
    castsBeforePaid: { "1": 0, "2": 0, "3": 0, "4+": 0 }, payDay: { "1": 0, "2": 0, "3": 0, "4+": 0 }, medianCasts: null,
    byCasts: [], byDays: [],
  };
  const castCounts: number[] = [];
  for (const p of kept) {
    if (!p.paidAt) continue;
    const first = (recs.get(p.key) ?? []).find((x) => x.t >= p.firstAt);
    out.paidBy[first?.kind === "membership" ? "membership" : "reading"] += 1;
    const list = eventsOf(p);
    const before = list.filter((e) => e.e === "cast_complete" && e.t < p.paidAt!).length;
    castCounts.push(before);
    out.castsBeforePaid[bucket4(before)] += 1;
    const visitDays = new Set(list.filter((e) => e.t <= p.paidAt!).map((e) => homeDay(e.t))).size;
    out.payDay[bucket4(Math.max(1, visitDays))] += 1;
  }
  castCounts.sort((a, b) => a - b);
  out.medianCasts = castCounts[Math.floor(castCounts.length / 2)] ?? null;
  const withCast = kept.filter((p) => p.casts > 0);
  for (const k of ["1", "2", "3", "4+"] as const) {
    const g = withCast.filter((p) => bucket4(p.casts) === k);
    out.byCasts.push({ k, n: g.length, paid: g.filter((p) => p.paidAt).length });
    const h = withCast.filter((p) => bucket4(Math.max(1, p.days)) === k);
    out.byDays.push({ k, n: h.length, paid: h.filter((p) => p.paidAt).length });
  }
  return out;
}

export { homeMinute };

/**
 * 10-13 (Neil: 「付费解读的正文也并到这里来」): the reading a paid cast-log row led to — order → cast → its reading (the
 * deep one when both exist) and the follow-up conversation. Null when the session has no stored reading.
 */
export interface PaidReading { tier: "one" | "deep"; locale: string; body: unknown; followups: { role: "user" | "assistant"; content: string }[] }
export function paidReadingFor(sid: string): PaidReading | null {
  const r = db().prepare(
    `SELECT r.tier, r.locale, r.body_json, o.cast_id FROM orders o JOIN readings r ON r.cast_id = o.cast_id
     WHERE o.session_id = ? ORDER BY (r.tier = 'deep') DESC, r.id DESC LIMIT 1`,
  ).get(sid) as { tier: string; locale: string; body_json: string; cast_id: number } | undefined;
  if (!r) return null;
  let body: unknown;
  try { body = JSON.parse(r.body_json); } catch { return null; }
  const followups = db().prepare("SELECT role, content FROM followups WHERE cast_id = ? ORDER BY created_at, id").all(r.cast_id) as unknown as PaidReading["followups"];
  return { tier: r.tier === "deep" ? "deep" : "one", locale: r.locale, body, followups };
}
