import { db } from "./db";
import { toUsdCents } from "./live";

/**
 * 10-23 进度表 105 (Neil: 「有些数据好像不太准确」) — the dashboard's money counted the way the 通卡 model sells:
 *   - one line per charge: a single purchase, a pass, a membership started, a pack — a pass is an order row AND a
 *     subscriptions row since 10-22, and the daily table counted it twice (10-22 showed 15 against 11);
 *   - which product a pass was bought on (the cast page, a tarot spread, a report page… or the pricing pages);
 *   - the 六爻 sales a conversion rate can be taken of (the cast page's own: a reading bought there, or a pass bought with
 *     a cast) — the old rate divided every product's sales by the I Ching casts;
 *   - 首张 1 日卡 → 再买通卡／开会员, in place of 首次价深断 → 全价回头 (single readings are no longer sold).
 * Our own test accounts stay out. Server only; read-only.
 */

export { SALE_KEYS, saleBucket, type SaleKey } from "./sale-bucket";

const many = <T,>(sql: string, ...a: unknown[]): T[] => {
  try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; }
};
const one = (sql: string, ...a: unknown[]): number => {
  try { return Number((db().prepare(sql).get(...(a as never[])) as { v: number | null } | undefined)?.v ?? 0); } catch { return 0; }
};
const NOT_TEST_O = "COALESCE(o.test_flag, 0) = 0 AND (o.customer_id IS NULL OR o.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
const SALE_O = "o.payment_state IN ('paid', 'refunded', 'disputed') AND COALESCE(o.amount_cents, 0) > 0";
const NOT_TEST_S = "customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)";
const LIVE_ROW = "status NOT IN ('incomplete', 'incomplete_expired')";
const IS_PASS = "substr(stripe_subscription_id, 1, 5) = 'pass_'";
const IS_SUB = "substr(stripe_subscription_id, 1, 4) = 'sub_'";

export interface Charges {
  /** single purchases: a reading (before 10-22), tarot, a lot, 合盘, 年书, a report… — never a pass */
  singles: number;
  /** passes bought, once each (passCharges: the order row since 10-22, the subscriptions row before) */
  passes: { d1: number; d7: number; d30: number; n: number };
  /** memberships started (renewals are not counted; a comp_ one is not a charge) */
  members: number;
  /** member add-on packs (sold until 10-22) */
  packs: number;
  /** all of the above: one per charge */
  total: number;
  /** the cast page's own sales — a reading bought there, or a pass bought with its cast: 六爻's conversion takes these */
  liuyao: number;
}

export interface PassCharge { at: number; customerId: number | null; days: number; bs: string | null; bid: string | null }

/**
 * Every pass bought in the window, once, at the moment it was paid for: since 10-22 a pass writes an order row (tier
 * pass_<n>d) and its subscriptions row pass_<the order's session tail> — the order is the charge. A subscriptions row
 * with no order row is a pass from before 10-22 (the one-off month) and counts by its own date. (10-23: four single
 * readings of 10-22 were turned into 1 日 cards the next day — their order rows keep the day they were paid.)
 */
/** the pass rows that have their order row (pass_<the order's session tail>) — read at most every 30 s (the dashboard asks once per day of its window) */
let WITH_ORDER: { at: number; set: Set<string> } | null = null;
function passRowsWithOrder(now = Date.now()): Set<string> {
  if (WITH_ORDER && now - WITH_ORDER.at < 30_000) return WITH_ORDER.set;
  WITH_ORDER = { at: now, set: new Set(many<{ sid: string }>("SELECT session_id AS sid FROM orders WHERE substr(tier, 1, 5) = 'pass_'").map((r) => `pass_${r.sid.slice(-40)}`)) };
  return WITH_ORDER.set;
}
/** for tests: forget the 30 seconds */
export const resetPassRows = () => { WITH_ORDER = null; };

export function passCharges(since: number, until = Date.now()): PassCharge[] {
  const orders = many<{ at: number; cid: number | null; tier: string; bs: string | null; bid: string | null }>(
    `SELECT o.created_at AS at, o.customer_id AS cid, o.tier, o.browser_sid AS bs, tb.bid FROM orders o LEFT JOIN tab_browsers tb ON tb.s = o.browser_sid
      WHERE substr(o.tier, 1, 5) = 'pass_' AND o.created_at >= ? AND o.created_at < ? AND ${SALE_O} AND ${NOT_TEST_O}`, since, until);
  let withOrder = passRowsWithOrder();
  const rows = many<{ at: number; cid: number; days: number | null; sid: string }>(
    `SELECT created_at AS at, customer_id AS cid, pass_days AS days, stripe_subscription_id AS sid FROM subscriptions
      WHERE created_at >= ? AND created_at < ? AND ${IS_PASS} AND ${LIVE_ROW} AND ${NOT_TEST_S} AND COALESCE(amount_minor, 0) > 0`, since, until); // a pass we gave (107 补通卡) is not a charge
  // a pass bought in the last minutes may be newer than the remembered set: read it again rather than count it twice
  if (rows.some((r) => !withOrder.has(r.sid) && r.at > Date.now() - 600_000)) { WITH_ORDER = null; withOrder = passRowsWithOrder(); }
  const daysOf = (tier: string) => (tier === "pass_1d" ? 1 : tier === "pass_7d" ? 7 : 30);
  return [
    ...orders.map((o) => ({ at: o.at, customerId: o.cid, days: daysOf(o.tier), bs: o.bs, bid: o.bid })),
    ...rows.filter((r) => !withOrder.has(r.sid)).map((r) => ({ at: r.at, customerId: r.cid, days: r.days === 1 || r.days === 7 ? r.days : 30, bs: null, bid: null })),
  ].sort((a, b) => a.at - b.at);
}

export function chargesIn(since: number, until = Date.now()): Charges {
  const singles = one(`SELECT COUNT(*) AS v FROM orders o WHERE o.created_at >= ? AND o.created_at < ? AND ${SALE_O} AND substr(o.tier, 1, 5) <> 'pass_' AND ${NOT_TEST_O}`, since, until);
  const pc = passCharges(since, until);
  const passes = { d1: pc.filter((r) => r.days === 1).length, d7: pc.filter((r) => r.days === 7).length, d30: pc.filter((r) => r.days === 30).length, n: pc.length };
  const members = one(`SELECT COUNT(*) AS v FROM subscriptions WHERE created_at >= ? AND created_at < ? AND ${IS_SUB} AND ${LIVE_ROW} AND ${NOT_TEST_S}`, since, until);
  const packs = one(`SELECT COUNT(*) AS v FROM member_packs WHERE created_at >= ? AND created_at < ? AND ${NOT_TEST_S}`, since, until);
  const liuyao = one(
    `SELECT COUNT(*) AS v FROM orders o WHERE o.created_at >= ? AND o.created_at < ? AND ${SALE_O} AND ${NOT_TEST_O}
       AND (o.tier IN ('deep', 'one', 'light') OR (substr(o.tier, 1, 5) = 'pass_' AND o.cast_id IS NOT NULL))`, since, until);
  return { singles, passes, members, packs, total: singles + passes.n + members + packs, liuyao };
}

/** the product ids of the 「产品」 page (lib/admin-products.ts) a pass can be bought on */
export type PassFrom = "liuyao" | "tarot" | "jieqian" | "bazi" | "ziwei" | "astro" | "zhengyuan" | "hepan" | "nianshu" | "tongka";
const PATH_PRODUCT: [RegExp, PassFrom][] = [
  [/\/(reading|cast|ask)\b/, "liuyao"], [/\/tarot\b/, "tarot"], [/\/(jieqian|qian)\b/, "jieqian"], [/\/bazi\b/, "bazi"],
  [/\/ziwei\b/, "ziwei"], [/\/xingpan\b/, "astro"], [/\/hepan\b/, "hepan"], [/\/nianshu\b/, "nianshu"],
];
export const passFromPath = (url: string | null): PassFrom => {
  const path = (url ?? "").replace(/^https?:\/\/[^/]+/, "").split("?")[0] ?? "";
  for (const [re, p] of PATH_PRODUCT) if (re.test(path)) return p;
  return "tongka";
};

export interface PassSale { at: number; customerId: number | null; tier: string; from: PassFrom; usd: number }

/** 105 ⑦: every pass sold in the window and the product it was bought on — a cast means the cast page, else the page the checkout was to return to */
export function passSales(since: number, until = Date.now()): PassSale[] {
  const sql = (join: boolean) =>
    `SELECT o.created_at AS at, o.customer_id AS cid, o.tier, o.cast_id, o.amount_cents AS amount, o.currency${join ? ", p.success_url AS url" : ", NULL AS url"}
       FROM orders o${join ? " LEFT JOIN pending_checkouts p ON p.session_id = o.session_id" : ""}
      WHERE substr(o.tier, 1, 5) = 'pass_' AND o.created_at >= ? AND o.created_at < ? AND ${SALE_O} AND ${NOT_TEST_O} ORDER BY o.created_at`;
  type Row = { at: number; cid: number | null; tier: string; cast_id: number | null; amount: number | null; currency: string | null; url: string | null };
  let rows: Row[];
  try { rows = db().prepare(sql(true)).all(since, until) as Row[]; } catch { rows = many<Row>(sql(false), since, until); /* no checkout notes yet */ }
  return rows.map((r) => ({
    at: r.at, customerId: r.cid, tier: r.tier, from: r.cast_id != null ? "liuyao" : passFromPath(r.url),
    usd: r.amount && r.currency ? toUsdCents(r.amount, r.currency) : 0,
  }));
}

/**
 * 105 ⑧ 「首张 1 日卡 → 再买通卡／开会员」: the people whose first pass was a 1 日 card, and of them, who bought another pass
 * later, and who started a membership later. All time (the 1 日 card exists since 10-22).
 */
export function firstDayPassFollowups(): { first: number; repass: number; member: number; either: number } {
  const rows = many<{ cid: number; sid: string; days: number | null; t: number }>(
    `SELECT customer_id AS cid, stripe_subscription_id AS sid, pass_days AS days, created_at AS t FROM subscriptions
      WHERE ((${IS_PASS} AND COALESCE(amount_minor, 0) > 0) OR ${IS_SUB}) AND ${LIVE_ROW} AND ${NOT_TEST_S} ORDER BY created_at`);
  const byCid = new Map<number, typeof rows>();
  for (const r of rows) (byCid.get(r.cid) ?? byCid.set(r.cid, []).get(r.cid)!).push(r);
  let first = 0, repass = 0, member = 0, either = 0;
  for (const list of byCid.values()) {
    const firstPass = list.find((r) => r.sid.startsWith("pass_"));
    if (!firstPass || firstPass.days !== 1) continue;
    first += 1;
    const later = list.filter((r) => r.t > firstPass.t);
    const p = later.some((r) => r.sid.startsWith("pass_"));
    const m = later.some((r) => r.sid.startsWith("sub_"));
    if (p) repass += 1;
    if (m) member += 1;
    if (p || m) either += 1;
  }
  return { first, repass, member, either };
}

/** 105 ⑤ 在册: live memberships (renewing or not yet ended; 月 / 年), the ones we gave, and passes running now — apart */
export function standing(now = Date.now()): { members: number; monthly: number; yearly: number; comps: number; passes: number } {
  // the customer page's 「live」 (lib/admin-customer.ts): a day's grace after the period's end while Stripe settles a renewal
  const LIVE = `status IN ('active', 'trialing', 'past_due') AND (period_end IS NULL OR period_end > ${now - 86_400_000})`;
  return {
    members: one(`SELECT COUNT(*) AS v FROM subscriptions WHERE ${LIVE} AND ${IS_SUB} AND ${NOT_TEST_S}`),
    monthly: one(`SELECT COUNT(*) AS v FROM subscriptions WHERE ${LIVE} AND ${IS_SUB} AND plan = 'month' AND ${NOT_TEST_S}`),
    yearly: one(`SELECT COUNT(*) AS v FROM subscriptions WHERE ${LIVE} AND ${IS_SUB} AND plan = 'year' AND ${NOT_TEST_S}`),
    comps: one(`SELECT COUNT(*) AS v FROM subscriptions WHERE ${LIVE} AND substr(stripe_subscription_id, 1, 5) = 'comp_' AND ${NOT_TEST_S}`),
    passes: one(`SELECT COUNT(*) AS v FROM subscriptions WHERE status = 'active' AND period_end > ${now} AND ${IS_PASS} AND ${NOT_TEST_S}`),
  };
}
