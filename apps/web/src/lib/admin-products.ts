import { db } from "./db";
import { readEventsBetween, type TrackedEvent } from "./analytics-server";
import { toUsdCents } from "./live";
import { productReviewLines, PRODUCT_REVIEWS, type ReviewLine } from "./product-review";
import { deliveryCounts, type BySource, type DeliveryCounts, type DeliveryProduct } from "./deliveries";
import { passSales, type PassSale } from "./admin-money";
import { bmgPeople, bmgRecent } from "./bmg-store";
import { hexByKw } from "./bmg";

/**
 * 10-22 进度表 94 第二批 「产品」页 — the products in one table (seventeen; 10-29 + 姓名學、解夢、犯太歲): people today and in 7 days, what was paid and
 * how much, revisits sent and answered, the day it opened and the day to decide (lib/product-review.ts, the weekly
 * report's lines, here at any time). Each product's own numbers come from its own table where it has one, else from the
 * page events. Our own test accounts are left out. Server only; read-only.
 */

const DAY = 86_400_000;
const NOT_TEST_CLAUSE = "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
/** the test-account filter every query below reads when it runs — productTable／productDetail set it for one synchronous pass */
let NOT_TEST = NOT_TEST_CLAUSE;
function withTest<T>(test: boolean, fn: () => T): T {
  NOT_TEST = test ? "1 = 1" : NOT_TEST_CLAUSE;
  try { return fn(); } finally { NOT_TEST = NOT_TEST_CLAUSE; }
}
const one = (sql: string, ...a: unknown[]): number => {
  try { return Number((db().prepare(sql).get(...(a as never[])) as { v: number | null } | undefined)?.v ?? 0); } catch { return 0; }
};
const many = <T,>(sql: string, ...a: unknown[]): T[] => {
  try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; }
};
const usdOf = (rows: { amount: number | null; currency: string | null }[]) => rows.reduce((a, r) => a + (r.amount && r.currency ? toUsdCents(r.amount, r.currency) : 0), 0);

export interface Window { since: number; until: number; ev: TrackedEvent[] }
export interface Numbers {
  people: number; paid: number; usd: number; rvSent: number; rvAnswered: number;
  /** 10-23 进度表 105 ⑦: what this product handed over, by why (付费／通卡／会员／免费) — null for a product with nothing to hand over */
  delivered?: BySource | null;
  /** …and the passes bought on this product's page (a cast: the cast page), with their money — counted in paid／usd too */
  passes?: number; passUsd?: number;
}
export interface ProductDef {
  id: string; name: string; group: "问事" | "看自己" | "每天" | "钱";
  /** the product-review entry it is judged by (lib/product-review.ts) */
  review?: string;
  /** its own detail page, when there is one already */
  detail?: string;
  numbers: (w: Window) => Numbers;
  /** the latest rows, for the detail page (customer, when, paid) */
  recent?: (limit: number) => { at: number; customerId: number | null; what: string; paid: string | null }[];
}

const evPeople = (w: Window, name: string, m: (x: string) => boolean) => new Set(w.ev.filter((e) => e.e === name && e.t >= w.since && e.t < w.until && m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
const tablePeople = (table: string, at: string, who: string, w: Window) => one(`SELECT COUNT(DISTINCT ${who}) AS v FROM ${table} WHERE ${at} >= ? AND ${at} < ? AND ${NOT_TEST}`, w.since, w.until);
const tablePaid = (table: string, w: Window, extra = "") => {
  const rs = many<{ amount: number | null; currency: string | null }>(`SELECT amount_minor AS amount, currency FROM ${table} WHERE paid_at >= ? AND paid_at < ? AND COALESCE(amount_minor,0) > 0 ${extra} AND ${NOT_TEST}`, w.since, w.until);
  return { paid: rs.length, usd: usdOf(rs) };
};
const selfRevisits = (kinds: string[], w: Window) => ({
  rvSent: one(`SELECT COUNT(*) AS v FROM revisits WHERE status = 'sent' AND sent_at >= ? AND sent_at < ? AND COALESCE(kind,'liuyao') IN (${kinds.map(() => "?").join(",")}) AND ${NOT_TEST}`, w.since, w.until, ...kinds),
  rvAnswered: one(`SELECT COUNT(*) AS v FROM revisits WHERE outcome IS NOT NULL AND outcome_at >= ? AND outcome_at < ? AND COALESCE(kind,'liuyao') IN (${kinds.map(() => "?").join(",")}) AND ${NOT_TEST}`, w.since, w.until, ...kinds),
});
const none = { rvSent: 0, rvAnswered: 0 };
const money = (amount: number | null, currency: string | null) => (amount && currency ? `${currency.toUpperCase()} ${(amount / (["JPY", "KRW"].includes(currency.toUpperCase()) ? 1 : 100)).toFixed(["JPY", "KRW"].includes(currency.toUpperCase()) ? 0 : 2)}` : null);
const recentFrom = (table: string, at: string, what: string, extra = "") => (limit: number) =>
  many<{ at: number; customer_id: number | null; what: string; amount: number | null; currency: string | null }>(
    `SELECT ${at} AS at, customer_id, ${what} AS what, amount_minor AS amount, currency FROM ${table} WHERE ${NOT_TEST} ${extra} ORDER BY ${at} DESC LIMIT ?`, limit,
  ).map((r) => ({ at: r.at, customerId: r.customer_id, what: String(r.what ?? ""), paid: money(r.amount, r.currency) }));

export const PRODUCTS: ProductDef[] = [
  {
    id: "liuyao", name: "六爻（起卦与深断）", group: "问事", detail: "/admin#funnel",
    numbers: (w) => {
      const rs = many<{ amount: number | null; currency: string | null }>(`SELECT amount_cents AS amount, currency FROM orders WHERE created_at >= ? AND created_at < ? AND payment_state IN ('paid','refunded','disputed') AND COALESCE(amount_cents,0) > 0 AND tier IN ('deep','one','light') AND ${NOT_TEST}`, w.since, w.until);
      return { people: evPeople(w, "cast_complete", () => true), paid: rs.length, usd: usdOf(rs), ...selfRevisits(["liuyao", "cast"], w) };
    },
    recent: (limit) => many<{ at: number; customer_id: number | null; tier: string; amount: number | null; currency: string | null }>(
      `SELECT created_at AS at, customer_id, tier, amount_cents AS amount, currency FROM orders WHERE tier IN ('deep','one','light') AND ${NOT_TEST} ORDER BY created_at DESC LIMIT ?`, limit,
    ).map((r) => ({ at: r.at, customerId: r.customer_id, what: r.tier === "deep" ? "深断" : "轻解读", paid: money(r.amount, r.currency) })),
  },
  {
    id: "jiaobei", name: "擲筊", group: "问事", review: "jiaobei",
    numbers: (w) => ({ people: tablePeople("jiaobei_asks", "created_at", "COALESCE(CAST(customer_id AS TEXT), bid)", w), paid: 0, usd: 0, ...none }),
    recent: (limit) => many<{ at: number; customer_id: number | null; sign: string }>(`SELECT created_at AS at, customer_id, sign FROM jiaobei_asks WHERE ${NOT_TEST} ORDER BY created_at DESC LIMIT ?`, limit)
      .map((r) => ({ at: r.at, customerId: r.customer_id, what: r.sign, paid: null })),
  },
  {
    id: "qiuqian", name: "线上求籤", group: "问事", review: "jiaobei",
    numbers: (w) => ({ people: evPeople(w, "jiaobei", (m) => m === "qq_done"), paid: 0, usd: 0, ...none }),
  },
  {
    id: "jieqian", name: "解籤", group: "问事", detail: "/admin/qian",
    numbers: (w) => ({ people: tablePeople("qian_draws", "created_at", "COALESCE(CAST(customer_id AS TEXT), device, token)", w), ...tablePaid("qian_draws", w), ...none }),
    recent: recentFrom("qian_draws", "created_at", "set_name || ' 第 ' || num || ' 籤'"),
  },
  {
    id: "tarot", name: "塔罗", group: "问事", review: "tarot",
    numbers: (w) => ({
      people: tablePeople("tarot_draws", "created_at", "COALESCE(CAST(customer_id AS TEXT), bid, token)", w), ...tablePaid("tarot_draws", w),
      rvSent: one(`SELECT COUNT(*) AS v FROM tarot_draws WHERE revisit_sent_at >= ? AND revisit_sent_at < ? AND ${NOT_TEST}`, w.since, w.until),
      rvAnswered: one(`SELECT COUNT(*) AS v FROM tarot_draws WHERE revisit_answer_at >= ? AND revisit_answer_at < ? AND ${NOT_TEST}`, w.since, w.until),
    }),
    recent: recentFrom("tarot_draws", "created_at", "spread || ' 张'"),
  },
  {
    id: "today-qian", name: "今日一籤", group: "每天", review: "today-qian",
    numbers: (w) => {
      const cards = many<{ amount: number | null; currency: string | null }>(`SELECT amount, currency FROM qian_cards WHERE created_at >= ? AND created_at < ? AND COALESCE(amount,0) > 0 AND ${NOT_TEST}`, w.since, w.until);
      return { people: one("SELECT COUNT(DISTINCT subject) AS v FROM tq_draws WHERE at >= ? AND at < ?", w.since, w.until), paid: cards.length, usd: usdOf(cards), ...none };
    },
  },
  { id: "huangli", name: "黄历", group: "每天", review: "huangli", numbers: (w) => ({ people: evPeople(w, "huangli", (m) => m.startsWith("view")), paid: 0, usd: 0, ...none }) },
  // 10-23 进度表 105 (次要): the people who opened 择日 count, not only those who ran a search (10-22: 11 opened, 2 counted)
  { id: "zeri", name: "择日", group: "每天", review: "zeri", numbers: (w) => ({ people: evPeople(w, "zeri", (m) => m.startsWith("query") || m.startsWith("view")), paid: 0, usd: 0, ...selfRevisits(["zeri"], w) }) },
  { id: "yunshi", name: "每日运势", group: "每天", review: "yunshi", numbers: (w) => ({ people: evPeople(w, "yunshi", (m) => m.startsWith("view")), paid: 0, usd: 0, ...none }) },
  // 10-29 进度表 124／125
  { id: "dream", name: "解梦", group: "每天", numbers: (w) => ({ people: evPeople(w, "dream", (m) => m === "index" || m.startsWith("view")), paid: 0, usd: 0, ...none }) },
  { id: "taisui", name: "犯太岁查询", group: "每天", numbers: (w) => ({ people: evPeople(w, "taisui", (m) => m.startsWith("view")), paid: 0, usd: 0, ...none }) },
  // 10-29 进度表 127: 尋物 — no account; the people who threw the dice (by browser)
  {
    id: "xunwu", name: "寻物（东西不见了？）", group: "每天", review: "xunwu",
    numbers: (w) => ({ people: tablePeople("xunwu_casts", "created_at", "COALESCE(CAST(customer_id AS TEXT), bid, token)", w), paid: 0, usd: 0, ...none }),
    recent: (limit) => many<{ at: number; customer_id: number | null; cat: string; tier: string }>(`SELECT created_at AS at, customer_id, cat, tier FROM xunwu_casts WHERE ${NOT_TEST} ORDER BY created_at DESC LIMIT ?`, limit)
      .map((r) => ({ at: r.at, customerId: r.customer_id, what: `${r.cat} · ${r.tier}`, paid: null })),
  },
  // 11-05 进度表 136–139 本命卦: free, no account; people who finished the quiz (by browser), the latest with where they came from
  {
    id: "bmg", name: "本命卦小测", group: "看自己",
    numbers: (w) => ({ people: bmgPeople(w.since, w.until), paid: 0, usd: 0, ...none }),
    recent: (limit) => bmgRecent(limit).map((r) => ({ at: r.at, customerId: r.customer_id, what: `${hexByKw(r.kw)?.name ?? r.kw} · ${r.mode === "quick" ? "快速版" : "完整版"}${r.invited ? " · 合卦邀请" : ""}${r.via ? ` · ${r.via}` : ""}`, paid: null })),
  },
  {
    id: "bazi", name: "八字", group: "看自己", review: "bazi",
    numbers: (w) => ({ people: evPeople(w, "bazi", (m) => m.startsWith("chart")), ...tablePaid("bazi_reports", w, "AND kind <> 'love'"), ...selfRevisits(["bazi"], w) }),
    recent: recentFrom("bazi_reports", "created_at", "kind || CASE WHEN body_json IS NULL THEN '（没写完）' ELSE '' END", "AND kind <> 'love'"),
  },
  {
    id: "ziwei", name: "紫微斗数", group: "看自己", review: "ziwei",
    numbers: (w) => ({ people: evPeople(w, "ziwei", (m) => m.startsWith("chart")), ...tablePaid("ziwei_reports", w), ...selfRevisits(["ziwei"], w) }),
    recent: recentFrom("ziwei_reports", "created_at", "kind || CASE WHEN body_json IS NULL THEN '（没写完）' ELSE '' END"),
  },
  {
    id: "astro", name: "星盘", group: "看自己", review: "astro",
    numbers: (w) => ({ people: evPeople(w, "astro", (m) => m.startsWith("chart")), ...tablePaid("astro_reports", w), ...selfRevisits(["astro"], w) }),
    recent: recentFrom("astro_reports", "created_at", "kind || CASE WHEN body_json IS NULL THEN '（没写完）' ELSE '' END"),
  },
  {
    id: "zhengyuan", name: "正缘画像", group: "看自己",
    numbers: (w) => ({ people: one(`SELECT COUNT(DISTINCT COALESCE(CAST(customer_id AS TEXT), token)) AS v FROM bazi_reports WHERE kind = 'love' AND created_at >= ? AND created_at < ? AND ${NOT_TEST}`, w.since, w.until), ...tablePaid("bazi_reports", w, "AND kind = 'love'"), ...none }),
    recent: recentFrom("bazi_reports", "created_at", "CASE WHEN body_json IS NULL THEN '没写完' ELSE '写好' END", "AND kind = 'love'"),
  },
  {
    id: "qa", name: "命盘问答", group: "看自己",
    numbers: (w) => ({ people: tablePeople("mingli_qa", "at", "COALESCE(CAST(customer_id AS TEXT), bid)", w), paid: 0, usd: 0, ...none }),
    recent: (limit) => many<{ at: number; customer_id: number | null; system: string }>(`SELECT at, customer_id, system FROM mingli_qa WHERE ${NOT_TEST} ORDER BY at DESC LIMIT ?`, limit)
      .map((r) => ({ at: r.at, customerId: r.customer_id, what: { bazi: "八字", ziwei: "紫微", astro: "星盘" }[r.system] ?? r.system, paid: null })),
  },
  {
    id: "hepan", name: "合盘", group: "看自己", review: "hepan",
    numbers: (w) => ({ people: evPeople(w, "hepan", (m) => m.startsWith("pair")), ...tablePaid("hepan_reports", w), ...none }),
    recent: recentFrom("hepan_reports", "created_at", "CASE WHEN paid_at IS NULL THEN '没付' WHEN body_json IS NULL THEN '已付·没写完' ELSE '已付·写好' END"),
  },
  {
    id: "nianshu", name: "三合一年书", group: "看自己", review: "nianshu",
    numbers: (w) => ({ people: evPeople(w, "nianshu", (m) => m === "view"), ...tablePaid("nianshu_reports", w), ...selfRevisits(["nianshu"], w) }),
    recent: recentFrom("nianshu_reports", "created_at", "year || ' 年 · ' || CASE WHEN paid_at IS NULL THEN '没付' WHEN body_json IS NULL THEN '已付·没写完' ELSE '已付·写好' END"),
  },
  // 10-29 进度表 122: 姓名學 — the free query and the two paid references
  {
    id: "name", name: "姓名学（取名／改名参考）", group: "看自己",
    numbers: (w) => ({ people: evPeople(w, "name", (m) => m === "view" || m.startsWith("read") || m === "zi"), ...tablePaid("name_reports", w, "AND COALESCE(paid_session, '') NOT LIKE 'tester:%'"), ...none }),
    recent: recentFrom("name_reports", "created_at", "CASE kind WHEN 'rename' THEN '改名' ELSE '宝宝取名' END || ' · ' || CASE WHEN paid_at IS NULL THEN '没付' WHEN body_json IS NULL THEN '已付·没写完' ELSE '已付·写好' END"),
  },
  {
    id: "tongka", name: "通卡与会员", group: "钱", review: "tongka", detail: "/admin/members",
    numbers: (w) => {
      const pass = many<{ amount: number | null; currency: string | null }>(`SELECT amount_cents AS amount, currency FROM orders WHERE tier IN ('pass_1d','pass_7d','pass_30d') AND created_at >= ? AND created_at < ? AND payment_state IN ('paid','refunded','disputed') AND ${NOT_TEST}`, w.since, w.until);
      const subs = many<{ amount: number | null; currency: string | null }>(`SELECT amount_minor AS amount, currency FROM subscriptions WHERE created_at >= ? AND created_at < ? AND substr(stripe_subscription_id,1,4) = 'sub_' AND ${NOT_TEST}`, w.since, w.until);
      const live = one(`SELECT COUNT(DISTINCT customer_id) AS v FROM subscriptions WHERE status IN ('active','trialing','past_due') AND COALESCE(period_end, 0) > ? AND ${NOT_TEST}`, w.until - 1);
      return { people: live, paid: pass.length + subs.length, usd: usdOf(pass) + usdOf(subs), ...none };
    },
  },
];

export interface ProductRow { def: ProductDef; today: Numbers; week: Numbers; review: ReviewLine | null }

/** the 「产品」 page's ids that hand something over, and what lib/deliveries.ts calls them */
const DELIVERS: Partial<Record<string, DeliveryProduct>> = {
  liuyao: "liuyao", tarot: "tarot", jieqian: "jieqian", bazi: "bazi", ziwei: "ziwei", astro: "astro", zhengyuan: "zhengyuan", hepan: "hepan", nianshu: "nianshu",
};
/** one window's deliveries and passes, read once for every product of the table */
interface Extra { dc: DeliveryCounts; passes: PassSale[] }
function extraOf(w: { since: number; until: number }, test: boolean): Extra {
  return { dc: deliveryCounts(w.since, w.until, { test }), passes: passSales(w.since, w.until) };
}
/** 10-23 进度表 105 ⑦: a product's own numbers, plus what it handed over and the passes bought on its page */
function withExtra(id: string, n: Numbers, x: Extra): Numbers {
  const dp = DELIVERS[id];
  if (id === "tongka") return { ...n, delivered: null };
  const mine = x.passes.filter((p) => p.from === id);
  const passUsd = mine.reduce((a, p) => a + p.usd, 0);
  return { ...n, delivered: dp ? x.dc.byProduct[dp] : null, passes: mine.length, passUsd, paid: n.paid + mine.length, usd: n.usd + passUsd };
}

const reviewLineFor = (lines: ReviewLine[], id?: string) => (id ? lines.find((l) => l.id === id) ?? null : null);

export function productTable(now = Date.now(), test = false): ProductRow[] {
  return withTest(test, () => productTableIn(now));
}
function productTableIn(now: number): ProductRow[] {
  const since7 = now - 7 * DAY;
  const tpe = 8 * 3_600_000;
  const today = Math.floor((now + tpe) / DAY) * DAY - tpe;
  const ev = readEventsBetween(since7, now, { only: ["cast_complete", "jiaobei", "huangli", "zeri", "yunshi", "bazi", "ziwei", "astro", "hepan", "nianshu", "name", "dream", "taisui"] });
  const lines = (() => { try { return productReviewLines(now); } catch { return []; } })();
  const test = NOT_TEST !== NOT_TEST_CLAUSE;
  const xToday = extraOf({ since: today, until: now }, test), xWeek = extraOf({ since: since7, until: now }, test);
  return PRODUCTS.map((def) => {
    const safe = (w: Window, x: Extra): Numbers => { try { return withExtra(def.id, def.numbers(w), x); } catch { return { people: 0, paid: 0, usd: 0, rvSent: 0, rvAnswered: 0 }; } };
    return { def, today: safe({ since: today, until: now, ev }, xToday), week: safe({ since: since7, until: now, ev }, xWeek), review: reviewLineFor(lines, def.review) };
  });
}

/** one product, day by day for 14 days, plus its review line and latest rows */
export function productDetail(id: string, now = Date.now(), test = false) {
  return withTest(test, () => productDetailIn(id, now));
}
function productDetailIn(id: string, now: number) {
  const def = PRODUCTS.find((p) => p.id === id);
  if (!def) return null;
  const tpe = 8 * 3_600_000;
  const today = Math.floor((now + tpe) / DAY) * DAY - tpe;
  const since = today - 13 * DAY;
  const ev = readEventsBetween(since, now, { only: ["cast_complete", "jiaobei", "huangli", "zeri", "yunshi", "bazi", "ziwei", "astro", "hepan", "nianshu", "name", "dream", "taisui"] });
  const test = NOT_TEST !== NOT_TEST_CLAUSE;
  const days = Array.from({ length: 14 }, (_, i) => {
    const s = today - i * DAY;
    const w = { since: s, until: Math.min(s + DAY, now), ev };
    let n: Numbers; try { n = withExtra(def.id, def.numbers(w), extraOf(w, test)); } catch { n = { people: 0, paid: 0, usd: 0, rvSent: 0, rvAnswered: 0 }; }
    return { day: new Date(s + tpe).toISOString().slice(0, 10), ...n };
  });
  const lines = (() => { try { return productReviewLines(now); } catch { return []; } })();
  const review = reviewLineFor(lines, def.review);
  const rule = def.review ? PRODUCT_REVIEWS.find((p) => p.id === def.review)?.rule ?? null : null;
  return { def, days, review, rule, recent: def.recent ? def.recent(40) : [] };
}
