import { minOf } from "@/lib/minmax";
import { db, STATUS_SPLIT } from "./db";
import { homeDay } from "./clock";
import { isClientEvent, type TrackedEvent } from "./analytics-server";
import { isTabEvent } from "./presence";
import { personResolver } from "./purchases";
import { LIVE_STATUSES } from "./subscription";
import { deliveries } from "./deliveries";
import { passCharges } from "./admin-money";
import { isMachineVisit, machineBrowsers } from "./machine-visit";

/**
 * 10-03 每日按身份 (Neil, on the daily table: 「在这个表上面显示各个阶段的转化率，然后也要区分会员，免费，付费的」→ 两种都做).
 *
 * Two things the daily table did not say:
 *   1. what a delivered reading was — paid for, a member's allowance, or free (a claim, a friend's gift, a reward…). Read
 *      from the orders: every delivery writes one, and its entitlement_kind says why it was handed over, so the free kinds
 *      the events never counted (a gift a friend spent, a referral reward, a joint reading) are in too. 付费 is money:
 *      paid readings, memberships started (monthly or a single month) and packs — refunded ones included.
 *      10-23 进度表 105 ①②: every product's deliveries now (lib/deliveries.ts — tarot and lot readings, the reports, 合盘,
 *      年书), and 通卡 is its own kind; a pass is counted once as money (its subscriptions row — the order row it also
 *      writes since 10-22 was counted a second time as a paid reading: 10-22 showed 15 against 11).
 *   2. who was at each step, counted in people (a browser) rather than tabs. Each browser goes into one group for the
 *      day, by what its person was when it first showed up that day:
 *        member  — a membership was running then (or it spent an allowance unit that day);
 *        pass    — 10-23 进度表 105: a 通卡 was running then (they were 「会员」 here before — a pass is not a membership);
 *        paid    — had paid before (a reading, a membership or a pack — a lapsed member too);
 *        free    — had had a free reading before and never paid;
 *        none    — neither: new visitors, and returning ones who never bought or claimed;
 *        unknown — no browser id (before 10-03, or cookies blocked): each such tab counts as one person.
 *      A person is the browser id joined with every browser and customer it was filed with (lib/purchases.ts). The
 *      grouping runs when the page is drawn, so a browser filed later (a sign-in, a payment) puts its earlier days right too.
 * A delivery or a payment goes to the group of the browser it happened in; without one, to what its person was just before.
 */

export type Who = "none" | "free" | "paid" | "pass" | "member" | "unknown";
export const WHO_ORDER: Who[] = ["none", "free", "paid", "pass", "member", "unknown"];
export const WHO_ZH: Record<Who, string> = { none: "未转化", free: "领过免费", paid: "付过钱", pass: "通卡期内", member: "会员", unknown: "没认出" };

export interface DayCells {
  /** unique visitors (visit_day); null on days before visit_day existed */
  visitors: number | null;
  /** 11-06: server-room browsers that only looked (link checkers) — left out of `visitors`; whole-site row only */
  machine?: number;
  sessions: number;
  casters: number;
  casts: number;
  taps: number;
  tapsBlocked: number;
  claims: number;
  /** readings and reports delivered (every product), by why */
  delivered: { paid: number; pass: number; member: number; free: number };
  /** money, one per charge: single purchases, passes bought, memberships started, packs */
  money: { readings: number; passes: number; memberships: number; packs: number };
}
export interface DailyRow { day: string; all: DayCells; who: Record<Who, DayCells> | null }

export const moneyOf = (c: DayCells): number => c.money.readings + c.money.passes + c.money.memberships + c.money.packs;
export const deliveredOf = (c: DayCells): number => c.delivered.paid + c.delivered.pass + c.delivered.member + c.delivered.free;

const blank = (visitors: number | null): DayCells => ({
  visitors, sessions: 0, casters: 0, casts: 0, taps: 0, tapsBlocked: 0, claims: 0,
  delivered: { paid: 0, pass: 0, member: 0, free: 0 }, money: { readings: 0, passes: 0, memberships: 0, packs: 0 },
});

/**
 * A tab's own event — not one the server writes under an order's or a grant's id (a delivery, a reward, a revisit
 * answer…), which used to count as a session of its own in 会话.
 */
const tabEvent = (e: TrackedEvent): boolean => isClientEvent(e) && isTabEvent(e);

const NOT_TEST = "COALESCE(o.test_flag,0) = 0 AND (o.customer_id IS NULL OR o.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
const DEAD = new Set(["incomplete", "incomplete_expired"]);

interface OrderRow { t: number; kind: string | null; status: string; pay: string | null; cents: number | null; bs: string | null; bid: string | null; cid: number | null; tier?: string }

/** Why an order's reading was handed over, in the table's three words. */
export function orderKind(o: Pick<OrderRow, "kind" | "status">): "paid" | "member" | "free" {
  const kind = o.kind ?? STATUS_SPLIT[o.status]?.kind ?? null;
  return kind === "purchase" ? "paid" : kind === "membership" ? "member" : "free";
}
const isMoney = (o: Pick<OrderRow, "kind" | "status" | "pay" | "cents">) =>
  orderKind(o) === "paid" && ["paid", "refunded", "disputed"].includes(o.pay ?? STATUS_SPLIT[o.status]?.pay ?? "") && (o.cents ?? 0) > 0;

interface Hist { paid: number; free: number; member: [number, number][]; pass?: [number, number][] }

/** Everyone's history, by person: when they first paid, when they first had a free reading, when a membership ran. */
export interface WhoContext { person: ReturnType<typeof personResolver>; hist: Map<string, Hist> }
export function whoContext(): WhoContext {
  const person = personResolver();
  return { person, hist: personHistories(person) };
}

export function personHistories(person = personResolver()): Map<string, Hist> {
  const d = db();
  const hist = new Map<string, Hist>();
  const at = (k: string): Hist => {
    let x = hist.get(k);
    if (!x) { x = { paid: Infinity, free: Infinity, member: [], pass: [] }; hist.set(k, x); }
    return x;
  };
  // an order with both a browser and a customer is filed under both (they are one person once the browser is linked)
  const keys = (bid: string | null, cid: number | null): string[] =>
    [...new Set([bid ? person(bid, null) : null, cid ? person(null, cid) : null].filter((k): k is string => !!k))];
  for (const o of d.prepare(
    `SELECT o.created_at AS t, o.entitlement_kind AS kind, o.status, o.payment_state AS pay, o.amount_cents AS cents, tb.bid, o.customer_id AS cid
     FROM orders o LEFT JOIN tab_browsers tb ON tb.s = o.browser_sid WHERE ${NOT_TEST}`,
  ).all() as unknown as OrderRow[]) {
    const kind = orderKind(o);
    for (const k of keys(o.bid, o.cid)) {
      const x = at(k);
      if (isMoney(o)) x.paid = Math.min(x.paid, o.t);
      else if (kind === "free") x.free = Math.min(x.free, o.t);
    }
  }
  for (const s of d.prepare(
    "SELECT customer_id AS cid, stripe_subscription_id AS sid, status, created_at AS t, period_start AS ps, period_end AS pe, updated_at AS up, amount_minor AS amount FROM subscriptions WHERE customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)",
  ).all() as { cid: number; sid: string; status: string; t: number; ps: number | null; pe: number | null; up: number; amount: number | null }[]) {
    if (DEAD.has(s.status)) continue;
    const k = person(null, s.cid);
    if (!k) continue;
    const x = at(k);
    // 10-23 进度表 105: a pass runs from its start (a queued one later than it was bought) to its end, whatever its status
    if (s.sid.startsWith("pass_")) (x.pass ??= []).push([s.ps ?? s.t, s.pe ?? s.up]);
    // a running membership is open-ended; an ended one ran to the end of its last paid period
    else x.member.push([s.t, LIVE_STATUSES.has(s.status) ? Infinity : (s.pe ?? s.up)]);
    // a membership we gave, or a pass we gave (107 补通卡, no money): not a payment
    if (s.sid.startsWith("comp_") || (s.sid.startsWith("pass_") && s.amount === 0)) x.free = Math.min(x.free, s.t);
    else x.paid = Math.min(x.paid, s.t);
  }
  for (const p of d.prepare("SELECT customer_id AS cid, created_at AS t FROM member_packs WHERE customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)").all() as { cid: number; t: number }[]) {
    const k = person(null, p.cid);
    if (k) at(k).paid = Math.min(at(k).paid, p.t);
  }
  return hist;
}

/** What a person was at `t`: the group a session beginning then goes into. */
export function whoAt(hist: Map<string, Hist>, key: string | null, t: number, spentAllowance = false): Who {
  if (!key) return spentAllowance ? "member" : "unknown";
  const x = hist.get(key);
  if (x?.member.some(([a, z]) => a <= t && t < z)) return "member";
  if (x?.pass?.some(([a, z]) => a <= t && t < z)) return "pass";
  // an allowance unit spent with no period on file: a membership's (as before)
  if (spentAllowance) return "member";
  if (!x) return "none";
  if (x.paid < t) return "paid";
  if (x.free < t) return "free";
  return "none";
}

/**
 * The daily table: per house-clock day, the whole site and each group. `evs` are the window's events; orders,
 * memberships and packs are read from `since` on.
 *
 * The steps count PEOPLE, not tabs: a browser that cast in three tabs is one 起卦人 (a session without a browser id
 * counts as its own). A browser is put in one group for the whole day — what it was when it first showed up that day —
 * so its visit, its casts and its taps stay together and each group's rates are of the same people. Days before browser
 * ids (or where most sessions lack one) have no group rows; their steps are the tab counts they always were.
 */
export function dailyBreakdown(allEvs: TrackedEvent[], since: number, ctx?: WhoContext, until = Date.now() + 60_000): DailyRow[] {
  // 11-09 (T-033 ③): a link checker's tabs are not sessions — its events leave here; its visit_days are counted apart below
  const machines = machineBrowsers(allEvs);
  const machineSessions = new Set<string>();
  for (const e of allEvs) if (e.b && machines.has(e.b)) machineSessions.add(e.s);
  // 10-15 进度表 60: the overview calls this once per day of its window — the people and their histories are read once
  const evs = machines.size ? allEvs.filter((e) => !machineSessions.has(e.s)) : allEvs;
  const { person, hist } = ctx ?? whoContext();

  // each tab session's browser (the unit a person is counted by; the session itself when it has none)
  const bidOf = new Map<string, string>();
  for (const e of evs) if (e.b && tabEvent(e) && !bidOf.has(e.s)) bidOf.set(e.s, e.b);
  const unitOf = (s: string) => bidOf.get(s) ?? `s:${s}`;

  // one group per browser per day: what it was at its first event that day (or a member, if it spent an allowance unit)
  const first = new Map<string, { t: number; mem: boolean }>();
  for (const e of evs) {
    if (!tabEvent(e)) continue;
    const k = `${homeDay(e.t)}|${unitOf(e.s)}`;
    const x = first.get(k) ?? { t: e.t, mem: false };
    if (e.t < x.t) x.t = e.t;
    if (e.e === "sub_redeem" || ((e.e === "repeat_blocked" || e.e === "repeat_capped") && e.mem === 1)) x.mem = true;
    first.set(k, x);
  }
  const dayGroup = new Map<string, Who>();
  for (const [k, x] of first) {
    const unit = k.slice(k.indexOf("|") + 1);
    dayGroup.set(k, whoAt(hist, unit.startsWith("s:") ? null : person(unit, null), x.t, x.mem));
  }
  const groupAt = (day: string, s: string): Who => dayGroup.get(`${day}|${unitOf(s)}`) ?? "unknown";

  // visit_day: once per browser and local day, from the first day there was one (as computeStats counts it)
  // 11-06: a server-room browser that did nothing a person does is a link checker — counted apart (lib/machine-visit.ts)
  const seenVd = new Set<string>();
  const vds: TrackedEvent[] = [];
  const machineVds: TrackedEvent[] = [];
  for (const e of allEvs) {
    if (e.e !== "visit_day") continue;
    const k = `${e.s}|${e.td ?? ""}`;
    if (seenVd.has(k)) continue;
    seenVd.add(k);
    if (isMachineVisit(e, machines, bidOf)) machineVds.push(e); else vds.push(e);
  }
  const allVds = [...vds, ...machineVds];
  const firstVdDay = allVds.length ? homeDay(minOf(allVds.map((e) => e.t))) : null;

  interface Acc { v: Set<string>; c: Set<string>; n: number; t: Set<string>; tb: Set<string>; cl: Set<string>; vis: number; cells: DayCells }
  const newAcc = (day: string): Acc => ({ v: new Set(), c: new Set(), n: 0, t: new Set(), tb: new Set(), cl: new Set(), vis: 0, cells: blank(firstVdDay !== null && day >= firstVdDay ? 0 : null) });
  const days = new Map<string, { all: Acc; who: Map<Who, Acc>; tabs: Set<string>; withId: Set<string> }>();
  const dayOf = (day: string) => {
    let x = days.get(day);
    if (!x) { x = { all: newAcc(day), who: new Map(), tabs: new Set(), withId: new Set() }; days.set(day, x); }
    return x;
  };
  const accs = (day: string, g: Who): Acc[] => {
    const D = dayOf(day);
    let a = D.who.get(g);
    if (!a) { a = newAcc(day); D.who.set(g, a); }
    return [D.all, a];
  };

  for (const e of evs) {
    const day = homeDay(e.t);
    if (!tabEvent(e)) { dayOf(day); continue; }
    const D = dayOf(day);
    D.tabs.add(e.s);
    if (bidOf.has(e.s)) D.withId.add(e.s);
    const u = unitOf(e.s);
    for (const a of accs(day, groupAt(day, e.s))) {
      a.v.add(e.s);
      if (e.e === "cast_complete") { a.c.add(u); a.n += 1; }
      else if (e.e === "reading_click") a.t.add(u);
      else if (e.e === "reading_click_blocked") a.tb.add(u);
      else if (e.e === "gift_claim" || e.e === "checkout_start") a.cl.add(u);
    }
  }
  for (const e of vds) {
    const day = homeDay(e.t);
    if (firstVdDay === null || day < firstVdDay) continue;
    for (const a of accs(day, groupAt(day, e.s))) a.vis += 1;
  }
  const machineByDay = new Map<string, number>();
  for (const e of machineVds) { const day = homeDay(e.t); machineByDay.set(day, (machineByDay.get(day) ?? 0) + 1); }

  // deliveries and money: the group of the browser they happened in that day, else what the person was just before
  const d = db();
  const groupFor = (bs: string | null, bid: string | null, cid: number | null, t: number): Who =>
    (bs ? dayGroup.get(`${homeDay(t)}|${unitOf(bs)}`) : bid ? dayGroup.get(`${homeDay(t)}|${bid}`) : undefined)
      ?? whoAt(hist, bid ? person(bid, null) : cid ? person(null, cid) : null, t - 1);
  // 10-23 进度表 105 ②: every product's deliveries, by why (付费／通卡／会员／免费)
  for (const x of deliveries(since, until)) {
    for (const a of accs(homeDay(x.at), groupFor(x.bs, x.bid, x.customerId, x.at))) a.cells.delivered[x.source] += 1;
  }
  // money, one per charge: a single purchase here; a pass's order row is left to its subscriptions row below (105 ①)
  for (const o of d.prepare(
    `SELECT o.created_at AS t, o.entitlement_kind AS kind, o.status, o.payment_state AS pay, o.amount_cents AS cents, o.browser_sid AS bs, tb.bid, o.customer_id AS cid, o.tier
     FROM orders o LEFT JOIN tab_browsers tb ON tb.s = o.browser_sid WHERE o.created_at >= ? AND o.created_at < ? AND ${NOT_TEST}`,
  ).all(since, until) as unknown as OrderRow[]) {
    if (!isMoney(o) || (o.tier ?? "").startsWith("pass_")) continue;
    for (const a of accs(homeDay(o.t), groupFor(o.bs, o.bid, o.cid, o.t))) a.cells.money.readings += 1;
  }
  // a pass once, when it was paid for (lib/admin-money.ts passCharges); memberships started
  for (const p of passCharges(since, until)) {
    for (const a of accs(homeDay(p.at), groupFor(p.bs, p.bid, p.customerId, p.at))) a.cells.money.passes += 1;
  }
  for (const s of d.prepare(
    `SELECT customer_id AS cid, created_at AS t, status FROM subscriptions
     WHERE created_at >= ? AND created_at < ? AND substr(stripe_subscription_id, 1, 4) = 'sub_' AND customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)`,
  ).all(since, until) as { cid: number; t: number; status: string }[]) {
    if (DEAD.has(s.status)) continue;
    for (const a of accs(homeDay(s.t), groupFor(null, null, s.cid, s.t))) a.cells.money.memberships += 1;
  }
  for (const p of d.prepare(
    "SELECT customer_id AS cid, created_at AS t FROM member_packs WHERE created_at >= ? AND created_at < ? AND customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)",
  ).all(since, until) as { cid: number; t: number }[]) {
    for (const a of accs(homeDay(p.t), groupFor(null, null, p.cid, p.t))) a.cells.money.packs += 1;
  }

  const finish = (a: Acc): DayCells => ({
    ...a.cells,
    visitors: a.cells.visitors === null ? null : a.vis,
    sessions: a.v.size, casters: a.c.size, casts: a.n, taps: a.t.size, tapsBlocked: a.tb.size, claims: a.cl.size,
  });
  return [...days.entries()]
    .filter(([day]) => day >= homeDay(since))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, D]) => ({
      day,
      all: { ...finish(D.all), machine: machineByDay.get(day) ?? 0 },
      // groups only where at least half the day's tabs carried a browser id (10-02 had a few late in the evening)
      who: D.tabs.size > 0 && D.withId.size * 2 >= D.tabs.size
        ? (Object.fromEntries(WHO_ORDER.map((g) => [g, D.who.get(g) ? finish(D.who.get(g)!) : blank(D.all.cells.visitors === null ? null : 0)])) as Record<Who, DayCells>)
        : null,
    }));
}

/**
 * 10-13 (Neil: 「10月3号之前的数据是分不清楚的吗」→「要」): the overview's delivery and payment boxes split by member / not for
 * the WHOLE window — orders carry a customer and a time, and memberships their start and end, so unlike the visit-side
 * steps (no browser id before 10-02) these can be told apart from the first day. A sale is counted the way the
 * 「真实付费」 box counts it (paid / refunded / disputed, money taken), so the two sides add up to the box.
 */
export function orderSplitSince(since: number): {
  non: { delivered: number; deliveredPaid: number; deliveredFree: number; paid: number; passes: number; subsStarted: number };
  member: { allowance: number; delivered: number; deliveredPaid: number; deliveredFree: number; paid: number; passes: number; packs: number };
} {
  const person = personResolver();
  const hist = personHistories(person);
  const out = {
    non: { delivered: 0, deliveredPaid: 0, deliveredFree: 0, paid: 0, passes: 0, subsStarted: 0 },
    member: { allowance: 0, delivered: 0, deliveredPaid: 0, deliveredFree: 0, paid: 0, passes: 0, packs: 0 },
  };
  const d = db();
  for (const o of d.prepare(
    `SELECT o.created_at AS t, o.entitlement_kind AS kind, o.status, o.payment_state AS pay, o.amount_cents AS cents, o.browser_sid AS bs, tb.bid, o.customer_id AS cid, o.tier
     FROM orders o LEFT JOIN tab_browsers tb ON tb.s = o.browser_sid WHERE o.created_at >= ? AND ${NOT_TEST}`,
  ).all(since) as unknown as OrderRow[]) {
    const kind = orderKind(o);
    const sale = ["paid", "refunded", "disputed"].includes(o.pay ?? STATUS_SPLIT[o.status]?.pay ?? "") && (o.cents ?? 0) > 0;
    const key = o.bid ? person(o.bid, null) : o.cid ? person(null, o.cid) : null;
    const isMember = kind === "member" || whoAt(hist, key, o.t - 1) === "member";
    if (kind === "member") out.member.allowance += 1;
    else { const side = isMember ? out.member : out.non; side.delivered += 1; if (kind === "paid") side.deliveredPaid += 1; else side.deliveredFree += 1; }
    // 10-23 进度表 105 ①: a pass is counted once below (passCharges) — not also here as a single sale
    if (sale && !(o.tier ?? "").startsWith("pass_")) { if (isMember) out.member.paid += 1; else out.non.paid += 1; }
  }
  out.non.subsStarted = (d.prepare(
    `SELECT COUNT(*) AS v FROM subscriptions WHERE created_at >= ? AND substr(stripe_subscription_id, 1, 4) = 'sub_'
       AND status NOT IN ('incomplete','incomplete_expired') AND customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)`,
  ).get(since) as { v: number }).v;
  for (const p of passCharges(since, Date.now() + 60_000)) {
    const key = p.bid ? person(p.bid, null) : p.customerId ? person(null, p.customerId) : null;
    if (whoAt(hist, key, p.at - 1) === "member") out.member.passes += 1; else out.non.passes += 1;
  }
  out.member.packs = (d.prepare("SELECT COUNT(*) AS v FROM member_packs WHERE created_at >= ? AND customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)").get(since) as { v: number }).v;
  return out;
}
