import { db, recordOps } from "./db";
import { createPromoCoupon, getCoupon } from "./stripe";
import { isCurrency, type Currency } from "./money";
import { isCampaignTag } from "./campaign";

/**
 * 10-23 进度表 109 ① 优惠码与活动连结. A promo is made in the admin (/admin/promos): a Stripe coupon (a percentage, or a
 * fixed amount in one currency; once — for a membership, its first invoice) plus our own rules — which products it is
 * good for, from when to when, how many uses — and a campaign link that carries it:
 *     https://yaoflow.com/zh-hant/<page>?c=<tag>&promo=<CODE>
 * The page sets the `yf_promo` cookie (middleware, 7 days); the checkout reads it and, when the promo is good for what
 * is being bought, puts the coupon on Stripe's page. It never stacks: a first 1-day pass is already at its first price,
 * and a membership already carrying a credit (an earlier purchase toward the first month) keeps that credit instead.
 * The wallet sheet (Apple / Google Pay on our page) cannot carry a coupon — a promo there sends the reader to Stripe's
 * page instead. What it did is read back from the orders (one-off products) and from Stripe's own count (memberships).
 */

export const PROMO_COOKIE = "yf_promo";
// the action log is loaded when an action is taken — the checkout path that reads promos stays free of the admin's imports
const logAction = async (...a: Parameters<typeof import("./admin-actions").logAction>) => (await import("./admin-actions")).logAction(...a);
export const PROMO_RE = /^[A-Z0-9][A-Z0-9_-]{2,23}$/;
export const isPromoCode = (x: unknown): x is string => typeof x === "string" && PROMO_RE.test(x);

/** what a promo may be good for (catalog ids) */
export const PROMO_PRODUCTS = ["pass_1", "pass_7", "pass_30", "month", "year", "tarot", "qian_personal", "hepan", "nianshu"] as const;
export type PromoProduct = (typeof PROMO_PRODUCTS)[number];
export const PROMO_PRODUCT_ZH: Record<PromoProduct, string> = {
  pass_1: "1 日通卡", pass_7: "7 天通卡", pass_30: "30 天通卡", month: "月付会员（首期）", year: "年付会员（首期）", tarot: "塔罗解读", qian_personal: "解籤个人解读", hepan: "合盘", nianshu: "年书",
};
/** the orders tiers each product is written down as — for the report */
const ORDER_TIERS: Record<PromoProduct, string[]> = {
  pass_1: ["pass_1d"], pass_7: ["pass_7d"], pass_30: ["pass_30d"], month: [], year: [], tarot: ["tarot"], qian_personal: ["qian"], hepan: ["hepan"], nianshu: ["nianshu"],
};

export interface Promo {
  id: number; code: string; created_at: number; kind: "percent" | "amount"; value: number; currency: string | null; products_json: string;
  campaign: string | null; starts_at: number | null; ends_at: number | null; max_uses: number | null; stripe_coupon_id: string | null;
  status: "active" | "off"; reason: string | null; note: string | null;
}
export const productsOf = (p: Pick<Promo, "products_json">): PromoProduct[] => {
  try { return (JSON.parse(p.products_json) as string[]).filter((x): x is PromoProduct => (PROMO_PRODUCTS as readonly string[]).includes(x)); } catch { return []; }
};

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS promos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, kind TEXT NOT NULL, value INTEGER NOT NULL,
      currency TEXT, products_json TEXT NOT NULL, campaign TEXT, starts_at INTEGER, ends_at INTEGER, max_uses INTEGER, stripe_coupon_id TEXT,
      status TEXT NOT NULL DEFAULT 'active', reason TEXT, note TEXT
    );
    CREATE TABLE IF NOT EXISTS promo_uses (
      session_id TEXT PRIMARY KEY, code TEXT NOT NULL, product TEXT NOT NULL, currency TEXT, customer_id INTEGER, at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_promo_uses_code ON promo_uses(code, at);
  `);
  ready = true;
}

export function promos(): Promo[] { ensure(); return db().prepare("SELECT * FROM promos ORDER BY id DESC").all() as unknown as Promo[]; }
export function promoByCode(code: string): Promo | null { ensure(); return (db().prepare("SELECT * FROM promos WHERE code = ?").get(code) as Promo | undefined) ?? null; }

export function discountLine(p: Pick<Promo, "kind" | "value" | "currency">): string {
  if (p.kind === "percent") return `${p.value}% off（${(100 - p.value) / 10} 折）`;
  const cur = (p.currency ?? "").toUpperCase();
  const zeroDecimal = cur === "JPY" || cur === "KRW";
  return `减 ${cur} ${zeroDecimal ? p.value : (p.value / 100).toFixed(2)}`;
}

export interface NewPromo {
  code: string; kind: "percent" | "amount"; value: number; currency?: string | null; products: string[]; campaign?: string | null;
  startsAt?: number | null; endsAt?: number | null; maxUses?: number | null; reason: string; note?: string | null;
}
type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/** make one: the Stripe coupon first, then our row (a refusal from Stripe leaves nothing behind but the log line) */
export async function createPromo(i: NewPromo, now = Date.now()): Promise<Result<{ promo: Promo }>> {
  ensure();
  const code = i.code.trim().toUpperCase();
  if (!PROMO_RE.test(code)) return { ok: false, error: "优惠码只能用英文字母、数字、- 和 _，3–24 个字" };
  if (promoByCode(code)) return { ok: false, error: "这个优惠码已经有了" };
  const products = [...new Set(i.products)].filter((x): x is PromoProduct => (PROMO_PRODUCTS as readonly string[]).includes(x));
  if (!products.length) return { ok: false, error: "要选至少一种能用的东西" };
  const cur = (i.currency ?? "").toUpperCase();
  if (i.kind === "percent" ? !(Number.isInteger(i.value) && i.value >= 1 && i.value <= 90) : !(Number.isInteger(i.value) && i.value > 0 && isCurrency(cur))) {
    return { ok: false, error: i.kind === "percent" ? "折扣要在 1%–90% 之间" : "减多少要写金额和币别" };
  }
  if (i.endsAt != null && i.endsAt <= now) return { ok: false, error: "结束时间已经过了" };
  if (i.startsAt != null && i.endsAt != null && i.startsAt >= i.endsAt) return { ok: false, error: "开始要早于结束" };
  if (i.maxUses != null && !(Number.isInteger(i.maxUses) && i.maxUses > 0)) return { ok: false, error: "次数要是正整数" };
  const campaign = i.campaign ? i.campaign.trim().toLowerCase() : null;
  if (campaign && !isCampaignTag(campaign)) return { ok: false, error: "来源标签只能用小写英文字母、数字、- 和 _，最多 16 个字" };
  let coupon: { id: string };
  try {
    coupon = await createPromoCoupon({ code, percentOff: i.kind === "percent" ? i.value : null, amountOff: i.kind === "amount" ? i.value : null, currency: i.kind === "amount" ? cur : null, redeemBy: i.endsAt ?? null, maxRedemptions: i.maxUses ?? null });
  } catch (e) {
    const error = `Stripe 没建成：${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`;
    await logAction({ customerId: null, action: "promo", params: { code, op: "create" }, reason: i.reason, ok: false, result: error }, now);
    return { ok: false, error };
  }
  const r = db().prepare(`INSERT INTO promos (code, created_at, kind, value, currency, products_json, campaign, starts_at, ends_at, max_uses, stripe_coupon_id, status, reason, note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, 'active', ?, ?)`).run(code, now, i.kind, i.value, i.kind === "amount" ? cur : null, JSON.stringify(products), campaign, i.startsAt ?? null, i.endsAt ?? null, i.maxUses ?? null, coupon.id, i.reason.slice(0, 300), i.note?.slice(0, 300) ?? null) as unknown as { lastInsertRowid: number | bigint };
  const promo = db().prepare("SELECT * FROM promos WHERE id = ?").get(Number(r.lastInsertRowid)) as unknown as Promo;
  recordOps("promo_created", `${code} ${discountLine(promo)} ${products.join(",")} coupon ${coupon.id}`);
  await logAction({ customerId: null, action: "promo", params: { code, op: "create" }, reason: i.reason, ok: true, result: `${code}：${discountLine(promo)}，${products.map((x) => PROMO_PRODUCT_ZH[x]).join("、")}`, stripeRef: coupon.id }, now);
  return { ok: true, promo };
}

/** on / off (ours only — an off promo is simply not applied; the Stripe coupon stays, unused) */
export async function setPromoActive(id: number, on: boolean, reason: string, now = Date.now()): Promise<Result> {
  ensure();
  const p = db().prepare("SELECT * FROM promos WHERE id = ?").get(id) as Promo | undefined;
  if (!p) return { ok: false, error: "找不到这个优惠码" };
  db().prepare("UPDATE promos SET status = ? WHERE id = ?").run(on ? "active" : "off", id);
  await logAction({ customerId: null, action: "promo", params: { code: p.code, op: on ? "on" : "off" }, reason, ok: true, result: `${p.code}：${on ? "打开" : "停用"}` }, now);
  return { ok: true };
}

/** uses so far that were paid for (one-off orders; a membership counts once Stripe has it) */
export function paidUses(code: string): number {
  ensure();
  try {
    return (db().prepare(`SELECT COUNT(*) AS n FROM promo_uses u JOIN orders o ON o.session_id = u.session_id
      WHERE u.code = ? AND (o.payment_state IN ('paid', 'refunded', 'disputed') OR (o.payment_state IS NULL AND o.status = 'paid'))`).get(code) as { n: number }).n;
  } catch { return 0; }
}

export type PromoMiss = "none" | "unknown" | "off" | "early" | "ended" | "product" | "currency" | "used_up" | "first";
/** is this promo good for this purchase now? */
export function promoFor(code: string | null | undefined, product: string, currency: Currency, o: { now?: number; first?: boolean } = {}): { ok: true; promo: Promo } | { ok: false; why: PromoMiss } {
  if (!code) return { ok: false, why: "none" };
  if (!isPromoCode(code)) return { ok: false, why: "unknown" };
  const p = promoByCode(code);
  const now = o.now ?? Date.now();
  if (!p || !p.stripe_coupon_id) return { ok: false, why: "unknown" };
  if (p.status !== "active") return { ok: false, why: "off" };
  if (p.starts_at && now < p.starts_at) return { ok: false, why: "early" };
  if (p.ends_at && now >= p.ends_at) return { ok: false, why: "ended" };
  if (!productsOf(p).includes(product as PromoProduct)) return { ok: false, why: "product" };
  if (p.kind === "amount" && (p.currency ?? "").toUpperCase() !== currency) return { ok: false, why: "currency" };
  if (o.first) return { ok: false, why: "first" };
  if (p.max_uses && paidUses(p.code) >= p.max_uses) return { ok: false, why: "used_up" };
  return { ok: true, promo: p };
}

/** a checkout that carries the coupon (written when Stripe gave the page) */
export function notePromoUse(i: { sessionId: string; code: string; product: string; currency: string | null; customerId: number | null }, now = Date.now()): void {
  ensure();
  try { db().prepare("INSERT OR IGNORE INTO promo_uses (session_id, code, product, currency, customer_id, at) VALUES (?,?,?,?,?,?)").run(i.sessionId, i.code, i.product, i.currency, i.customerId, now); } catch { /* the report only */ }
  recordOps("promo_checkout", `${i.code} ${i.product} ${i.currency ?? ""}`);
}

/* ---------------- the report ---------------- */

export interface PromoReport { promo: Promo; checkouts: number; paid: number; byCurrency: Record<string, number>; stripeRedeemed: number | null; stripeValid: boolean | null }

/** each promo: checkouts that carried it, those paid (and how much, per currency), and Stripe's own count */
export async function promoReports(withStripe = true): Promise<PromoReport[]> {
  ensure();
  const out: PromoReport[] = [];
  for (const p of promos()) {
    const checkouts = (db().prepare("SELECT COUNT(*) AS n FROM promo_uses WHERE code = ?").get(p.code) as { n: number }).n;
    const rows = (() => {
      try {
        return db().prepare(`SELECT UPPER(COALESCE(o.currency, '')) AS cur, COUNT(*) AS n, COALESCE(SUM(o.amount_cents), 0) AS amt FROM promo_uses u JOIN orders o ON o.session_id = u.session_id
          WHERE u.code = ? AND (o.payment_state IN ('paid', 'refunded', 'disputed') OR (o.payment_state IS NULL AND o.status = 'paid')) GROUP BY 1`).all(p.code) as { cur: string; n: number; amt: number }[];
      } catch { return []; }
    })();
    let stripeRedeemed: number | null = null, stripeValid: boolean | null = null;
    if (withStripe && p.stripe_coupon_id) {
      try { const c = await getCoupon(p.stripe_coupon_id); stripeRedeemed = c.times_redeemed; stripeValid = c.valid; } catch { /* shown as unknown */ }
    }
    out.push({ promo: p, checkouts, paid: rows.reduce((a, r) => a + r.n, 0), byCurrency: Object.fromEntries(rows.map((r) => [r.cur, r.amt])), stripeRedeemed, stripeValid });
  }
  return out;
}

export interface SourceRow { tag: string; orders: number; customers: number; byCurrency: Record<string, number>; byTier: Record<string, number> }

/**
 * paid orders by the campaign tag the buyer arrived with (orders.campaign: a link's ?c=, or the referrer guessed as
 * ~platform) — our own test accounts left out. Memberships carry no order row and are not in here.
 */
export function sourceReport(since: number, until = Date.now(), tiers?: readonly string[]): SourceRow[] {
  try {
    const tierSql = tiers?.length ? `AND tier IN (${tiers.map(() => "?").join(",")})` : "";
    const rows = db().prepare(`SELECT COALESCE(campaign, '') AS tag, tier, UPPER(COALESCE(currency, '')) AS cur, customer_id AS cid, amount_cents AS amt FROM orders
      WHERE created_at >= ? AND created_at < ? AND COALESCE(amount_cents, 0) > 0 AND (payment_state IN ('paid', 'refunded', 'disputed') OR (payment_state IS NULL AND status = 'paid'))
        AND COALESCE(test_flag, 0) = 0 AND (customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)) ${tierSql}`)
      .all(since, until, ...(tiers ?? [])) as { tag: string; tier: string; cur: string; cid: number | null; amt: number }[];
    const m = new Map<string, SourceRow & { cids: Set<number> }>();
    for (const r of rows) {
      const k = r.tag || "（没有来源）";
      const s = m.get(k) ?? { tag: k, orders: 0, customers: 0, byCurrency: {}, byTier: {}, cids: new Set<number>() };
      s.orders++;
      if (r.cid) s.cids.add(r.cid);
      s.byCurrency[r.cur] = (s.byCurrency[r.cur] ?? 0) + r.amt;
      s.byTier[r.tier] = (s.byTier[r.tier] ?? 0) + 1;
      m.set(k, s);
    }
    return [...m.values()].map(({ cids, ...s }) => ({ ...s, customers: cids.size })).sort((a, b) => b.orders - a.orders);
  } catch { return []; }
}

/** one line for a product page: its paid orders by source */
export function sourceLineFor(tiers: readonly string[], since: number, until = Date.now()): string {
  const rows = sourceReport(since, until, tiers);
  return rows.slice(0, 8).map((r) => `${r.tag} ${r.orders}`).join(" · ") || "—";
}
export const PROMO_ORDER_TIERS = ORDER_TIERS;

/** the link a campaign hands out */
export function promoLink(site: string, locale: string, path: string, campaign: string | null, code: string | null): string {
  const q = [campaign ? `c=${encodeURIComponent(campaign)}` : null, code ? `promo=${encodeURIComponent(code)}` : null].filter(Boolean).join("&");
  const p = path.startsWith("/") ? path : `/${path}`;
  const [base, hash] = p.split("#");
  return `${site}/${locale}${base === "/" ? "" : base}${q ? `${base!.includes("?") ? "&" : "?"}${q}` : ""}${hash ? `#${hash}` : ""}`;
}
