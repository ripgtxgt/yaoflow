import { db, STATUS_SPLIT } from "./db";
import { qianResultPath } from "./qian-meta";

/**
 * 10-23 进度表 105 ②／106 (Neil: 「有些数据好像不太准确」「我看不到每个产品的详细使用情况和内容」): every reading or report
 * the site handed over, read from each product's own table, with why it was handed over —
 *   付费 (paid) — money for this one (refunded ones included: it was delivered)
 *   通卡 (pass) — a 1 日／7 天／30 天 pass: a reading under it, or the one bought together with it on the cast page
 *   会员 (member) — a membership's allowance (one we gave, comp_, counts here too)
 *   免费 (free) — the free layers, a friend's gift, rewards, joint readings
 * Before this, the dashboard's 「交付解读」 counted two event kinds (10-22: about 10, against 97), the daily table only the
 * I Ching orders, and a pass's readings were all 「会员额度」. Our own test accounts and tester sessions stay out unless
 * asked for. Server only; read-only.
 *
 * What counts, product by product:
 *   六爻 — every order row of a reading (deep / one / light), and a pass order that carries its cast (bought on the cast
 *          page: the order row is both the pass and that reading). A membership order is a pass's or a membership's by
 *          the allowance unit behind it (sub_uses → subscriptions).
 *   塔罗／解籤 — a draw with its personal reading written; who paid by paid_session (member:<subscription id>).
 *   八字／紫微／星盘 — a deep report written (正缘画像 is the bazi table's kind love; the year-kind parts belong to 年书).
 *   合盘／年书 — paid for and written.
 */

export type Source = "paid" | "pass" | "member" | "free";
export const SOURCES: readonly Source[] = ["paid", "pass", "member", "free"];
export const SOURCE_ZH: Record<Source, string> = { paid: "付费", pass: "通卡", member: "会员", free: "免费" };

export type DeliveryProduct = "liuyao" | "tarot" | "jieqian" | "bazi" | "ziwei" | "astro" | "zhengyuan" | "hepan" | "nianshu";
export const DELIVERY_PRODUCTS: readonly DeliveryProduct[] = ["liuyao", "tarot", "jieqian", "bazi", "ziwei", "astro", "zhengyuan", "hepan", "nianshu"];
export const DELIVERY_ZH: Record<DeliveryProduct, string> = {
  liuyao: "六爻", tarot: "塔罗", jieqian: "解籤", bazi: "八字报告", ziwei: "紫微报告", astro: "星盘报告", zhengyuan: "正缘画像", hepan: "合盘", nianshu: "年书",
};

export interface Delivery {
  product: DeliveryProduct;
  at: number;
  customerId: number | null;
  source: Source;
  /** the row: an order's session id, a draw's or a report's token */
  ref: string;
  /** what it was, in a few words: 深断 / 轻解读 / 3 张 / 六十甲子籤 第 23 籤 / 深度报告 … */
  what: string;
  /** the reader's own page (an admin link; never shown anywhere public) */
  href: string | null;
  /** the browser tab / the browser it happened in, when known (the daily table's grouping) */
  bs: string | null;
  bid: string | null;
  locale: string | null;
  /** a row of ours (a test account, a tester session) — only returned with { test: true } */
  test: boolean;
}

const many = <T,>(sql: string, ...a: unknown[]): T[] => {
  try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; /* a product's table not made yet */ }
};
const TEST_CUST = "customer_id IN (SELECT id FROM customers WHERE test_flag = 1)";

/** subscription row id → a pass's or a membership's (comp_ included) — read once per call */
function subKinds(): Map<number, "pass" | "member"> {
  return new Map(many<{ id: number; sid: string }>("SELECT id, stripe_subscription_id AS sid FROM subscriptions").map((r) => [r.id, r.sid.startsWith("pass_") ? "pass" : "member"]));
}
/** a draw's or a report's paid_session → who paid: member:<id> is a pass or a membership; money otherwise; nothing → free */
function sourceOfSession(paidSession: string | null, amountMinor: number | null, kinds: Map<number, "pass" | "member">): Source {
  const s = paidSession ?? "";
  if (s.startsWith("member:")) {
    const id = Number(/^member:(\d+)$/.exec(s)?.[1]);
    return id ? kinds.get(id) ?? "member" : "member";
  }
  return (amountMinor ?? 0) > 0 ? "paid" : "free";
}

const PASS_NAME: Record<string, string> = { pass_1d: "1 日通卡", pass_7d: "7 天通卡", pass_30d: "30 天通卡" };
const REPORT_KIND: Record<string, string> = { deep: "深度报告", love: "正缘画像", year: "流年" };

export interface DeliveryOpts { products?: readonly DeliveryProduct[]; test?: boolean }

/** Every delivery in [since, until), oldest first. */
export function deliveries(since: number, until = Date.now(), opts: DeliveryOpts = {}): Delivery[] {
  const want = new Set(opts.products ?? DELIVERY_PRODUCTS);
  const out: Delivery[] = [];
  const kinds = subKinds();
  const keep = (d: Delivery) => { if (opts.test || !d.test) out.push(d); };

  if (want.has("liuyao")) {
    for (const o of many<{ sid: string; at: number; cid: number | null; tier: string; kind: string | null; status: string; bs: string | null; bid: string | null; locale: string | null; via: string | null; test: number }>(
      `SELECT o.session_id AS sid, o.created_at AS at, o.customer_id AS cid, o.tier, o.entitlement_kind AS kind, o.status, o.browser_sid AS bs, tb.bid,
              c.locale AS locale, substr(s.stripe_subscription_id, 1, 5) AS via,
              (COALESCE(o.test_flag, 0) = 1 OR o.customer_id IN (SELECT id FROM customers WHERE test_flag = 1)) AS test
         FROM orders o
         LEFT JOIN tab_browsers tb ON tb.s = o.browser_sid
         LEFT JOIN casts c ON c.id = o.cast_id
         LEFT JOIN sub_uses u ON substr(o.session_id, 1, 4) = 'sub_' AND u.token = substr(o.session_id, 5)
         LEFT JOIN subscriptions s ON s.id = u.subscription_id
        WHERE o.created_at >= ? AND o.created_at < ?
          AND (o.tier IN ('deep', 'one', 'light') OR (substr(o.tier, 1, 5) = 'pass_' AND o.cast_id IS NOT NULL))
        ORDER BY o.created_at`, since, until,
    )) {
      const kind = o.kind ?? STATUS_SPLIT[o.status]?.kind ?? null;
      const pass = o.tier.startsWith("pass_");
      const source: Source = kind === "purchase" ? (pass ? "pass" : "paid") : kind === "membership" ? (o.via === "pass_" ? "pass" : "member") : "free";
      const what = pass ? `深断（随${PASS_NAME[o.tier] ?? "通卡"}）` : o.tier === "deep" ? "深断" : "轻解读";
      keep({
        product: "liuyao", at: o.at, customerId: o.cid, source, ref: o.sid, what,
        href: `/${o.locale ?? "zh-hant"}/reading?sid=${encodeURIComponent(o.sid)}`, bs: o.bs, bid: o.bid, locale: o.locale, test: !!o.test,
      });
    }
  }

  if (want.has("tarot")) {
    for (const r of many<{ token: string; at: number; cid: number | null; ps: string | null; amount: number | null; spread: number; locale: string; bid: string | null; test: number }>(
      `SELECT token, COALESCE(paid_at, created_at) AS at, customer_id AS cid, paid_session AS ps, amount_minor AS amount, spread, locale, bid,
              (COALESCE(paid_session, '') LIKE 'tester:%' OR ${TEST_CUST}) AS test
         FROM tarot_draws WHERE personal_json IS NOT NULL AND COALESCE(paid_at, created_at) >= ? AND COALESCE(paid_at, created_at) < ? ORDER BY 2`, since, until,
    )) {
      keep({
        product: "tarot", at: r.at, customerId: r.cid, source: sourceOfSession(r.ps, r.amount, kinds), ref: r.token, what: `${r.spread} 张`,
        href: `/${r.locale || "zh-hant"}/tarot/r/${r.token}`, bs: null, bid: r.bid, locale: r.locale, test: !!r.test,
      });
    }
  }

  if (want.has("jieqian")) {
    for (const r of many<{ token: string; at: number; cid: number | null; ps: string | null; amount: number | null; set_name: string; num: number; locale: string; device: string | null; test: number }>(
      `SELECT token, COALESCE(personal_at, paid_at, created_at) AS at, customer_id AS cid, paid_session AS ps, amount_minor AS amount, set_name, num, locale, device,
              (COALESCE(paid_session, '') LIKE 'tester:%' OR ${TEST_CUST}) AS test
         FROM qian_draws WHERE personal_json IS NOT NULL AND COALESCE(personal_at, paid_at, created_at) >= ? AND COALESCE(personal_at, paid_at, created_at) < ? ORDER BY 2`, since, until,
    )) {
      keep({
        product: "jieqian", at: r.at, customerId: r.cid, source: sourceOfSession(r.ps, r.amount, kinds), ref: r.token, what: `${r.set_name} 第 ${r.num} 籤`,
        href: qianResultPath(r.token), bs: null, bid: null, locale: r.locale, test: !!r.test,
      });
    }
  }

  const reports = (product: DeliveryProduct, table: string, path: string, where: string) => {
    if (!want.has(product)) return;
    for (const r of many<{ token: string; at: number; cid: number | null; ps: string | null; amount: number | null; kind: string; locale: string; test: number }>(
      `SELECT token, COALESCE(paid_at, created_at) AS at, customer_id AS cid, paid_session AS ps, amount_minor AS amount, kind, locale,
              (COALESCE(paid_session, '') LIKE 'tester:%' OR ${TEST_CUST}) AS test
         FROM ${table} WHERE body_json IS NOT NULL AND ${where} AND COALESCE(paid_at, created_at) >= ? AND COALESCE(paid_at, created_at) < ? ORDER BY 2`, since, until,
    )) {
      keep({
        product, at: r.at, customerId: r.cid, source: sourceOfSession(r.ps, r.amount, kinds), ref: r.token, what: REPORT_KIND[r.kind] ?? r.kind,
        href: `/${r.locale || "zh-hant"}/${path}/r/${r.token}`, bs: null, bid: null, locale: r.locale, test: !!r.test,
      });
    }
  };
  reports("bazi", "bazi_reports", "bazi", "kind = 'deep'");
  reports("zhengyuan", "bazi_reports", "bazi", "kind = 'love'");
  reports("ziwei", "ziwei_reports", "ziwei", "kind = 'deep'");
  reports("astro", "astro_reports", "xingpan", "kind = 'deep'");
  reports("hepan", "hepan_reports", "hepan", "paid_at IS NOT NULL");

  if (want.has("nianshu")) {
    for (const r of many<{ token: string; at: number; cid: number | null; ps: string | null; amount: number | null; year: number; locale: string; test: number }>(
      `SELECT token, COALESCE(paid_at, created_at) AS at, customer_id AS cid, paid_session AS ps, amount_minor AS amount, year, locale,
              (COALESCE(paid_session, '') LIKE 'tester:%' OR ${TEST_CUST}) AS test
         FROM nianshu_reports WHERE paid_at IS NOT NULL AND body_json IS NOT NULL AND paid_at >= ? AND paid_at < ? ORDER BY 2`, since, until,
    )) {
      keep({
        product: "nianshu", at: r.at, customerId: r.cid, source: sourceOfSession(r.ps, r.amount, kinds), ref: r.token, what: `${r.year} 年`,
        href: `/${r.locale || "zh-hant"}/nianshu/r/${r.token}`, bs: null, bid: null, locale: r.locale, test: !!r.test,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export type BySource = Record<Source, number> & { total: number };
const blank = (): BySource => ({ paid: 0, pass: 0, member: 0, free: 0, total: 0 });

export interface DeliveryCounts { all: BySource; byProduct: Record<DeliveryProduct, BySource> }

/** the counts of a window: all products, and each — by why it was handed over */
export function deliveryCounts(since: number, until = Date.now(), opts: DeliveryOpts = {}): DeliveryCounts {
  const all = blank();
  const byProduct = Object.fromEntries(DELIVERY_PRODUCTS.map((p) => [p, blank()])) as Record<DeliveryProduct, BySource>;
  for (const d of deliveries(since, until, opts)) {
    all[d.source] += 1; all.total += 1;
    byProduct[d.product][d.source] += 1; byProduct[d.product].total += 1;
  }
  return { all, byProduct };
}

/** 「付费 3 · 通卡 40 · 会员 50 · 免费 12」 — zero parts left out */
export const sourceLine = (c: BySource): string => SOURCES.filter((s) => c[s] > 0).map((s) => `${SOURCE_ZH[s]} ${c[s]}`).join(" · ") || "—";
