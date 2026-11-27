import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeStats, readEventsBetween } from "./analytics-server";
import { db, ordersByPaymentIntent, txnsBetween } from "./db";
import { groupFunnels } from "./admin-groups";
import { toUsdCents } from "./live";

/**
 * 11-01 T-014 ② (推广→开发，Neil 定：推广任务不再 ssh 读后台) — a numbers-only file a day for the promotion runs:
 * ~/yaoflow-data/promo-stats/YYYY-MM-DD.json for the Taipei day that just ended (the same numbers as /admin?days=1: the
 * funnel, by language, by ?c= tag, sharing and K, the 問事／看自己／每天 groups, 今日三卦 picks, generation failures),
 * and on Mondays week-YYYY-MM-DD.json (the seven days before, plus last calendar month's revenue in USD).
 * ONLY aggregate counts: no email, no customer number, no question, no address, no share code.
 */
const DAY = 86_400_000, TPE = 8 * 3_600_000;
const NOT_TEST = "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
const one = (sql: string, ...a: unknown[]): number => {
  try { return Number((db().prepare(sql).get(...(a as never[])) as { v: number | null } | undefined)?.v ?? 0); } catch { return 0; }
};
const ymd = (ms: number) => new Date(ms + TPE).toISOString().slice(0, 10);
export const tpeDayStart = (ms: number) => Math.floor((ms + TPE) / DAY) * DAY - TPE;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

function paid(since: number, until: number): { orders: number; usd: number; byTier: Record<string, number> } {
  const byTier: Record<string, number> = {};
  let cents = 0, n = 0;
  try {
    for (const r of db().prepare(`SELECT tier, amount_cents, currency FROM orders WHERE created_at >= ? AND created_at < ? AND status = 'paid' AND amount_cents > 0 AND ${NOT_TEST}`).all(since, until) as { tier: string; amount_cents: number; currency: string | null }[]) {
      n++; byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
      if (r.currency) cents += toUsdCents(r.amount_cents, r.currency);
    }
  } catch { /* no orders yet */ }
  return { orders: n, usd: Math.round(cents) / 100, byTier };
}

/**
 * 11-09 (T-033 ①: the week file said 412 orders / US$1,267 for October, /admin/finance 510 / US$2,204): what customers
 * paid, counted the way the finance page counts it — every Stripe charge in the window that is not our own test and not
 * Stripe's fee coupon, in the settled currency. The orders table alone misses membership invoices (renewals and first
 * months have no order row) and member packs.
 */
function ledgerSales(since: number, until: number): { orders: number; usd: number } {
  let n = 0, cents = 0;
  try {
    const byPi = ordersByPaymentIntent();
    for (const t of txnsBetween(since, until)) {
      if (t.balance_type === "fee_credits" || t.type === "fee_credit_funding") continue;
      if (t.type !== "charge" && t.type !== "payment") continue;
      if (t.payment_intent && byPi.get(t.payment_intent)?.test_flag === 1) continue;
      n++; cents += t.amount;
    }
  } catch { /* no ledger yet */ }
  return { orders: n, usd: Math.round(cents) / 100 };
}

/** the numbers of [since, until) */
export function promoNumbers(since: number, until: number, lookbackDays = 0): Record<string, unknown> {
  const evs = readEventsBetween(since, until);
  const st = computeStats(evs, undefined, { full: true });
  const f = st.funnel;
  // paid sessions by the ?c= tag their session carried (first touch)
  const tagOf = new Map<string, string>();
  for (const e of evs) if (e.c && !tagOf.has(e.s)) tagOf.set(e.s, e.c);
  const paidBy: Record<string, Set<string>> = {};
  for (const e of evs) if (e.e === "purchase" && e.method === "paid") { const c = tagOf.get(e.s) ?? "—"; (paidBy[c] ??= new Set()).add(e.s); }
  const money = paid(since, until);
  const ledger = ledgerSales(since, until);
  return {
    funnel: {
      visitors: f.visitors, sessions: f.sessions, firstVisits: f.firstVisits, returnVisits: f.returnVisits,
      castComplete: f.castComplete, activation: r3(st.rates.activation),
      priceClicks: f.readingClick, priceRate: r3(st.rates.priceRate),
      checkoutStart: f.checkoutStart, giftClaims: f.giftClaims,
      delivered: st.byDay.reduce((a, d) => a + d.readings, 0),
      // 11-09 T-033 ①: the money as the finance page has it (Stripe ledger); the orders-table count stays as orderRows*
      paidOrders: ledger.orders, paidUsd: ledger.usd, orderRowsPaid: money.orders, orderRowsUsd: money.usd, paidByTier: money.byTier,
    },
    byLocale: st.byLocaleFunnel.map((x) => ({ locale: x.locale, visitors: x.visitors, sessions: x.sessions, casts: x.casts, clicks: x.clicks, claims: x.claims, readings: x.readings, purchases: x.purchases })),
    byCampaign: st.byChannel.map((x) => ({ c: x.c, visitors: x.visitors, sessions: x.sessions, casts: x.casts, clicks: x.clicks, claims: x.claims, paid: paidBy[x.c]?.size ?? 0 })),
    sharing: { k: r3(st.sharing.k), shareClicks: st.sharing.clicks, sharers: st.sharing.shareRate.sharers, casters: st.sharing.shareRate.casters, shareRate: r3(st.sharing.shareRate.rate), referredSessions: st.sharing.referredSessions, referredCasts: st.sharing.referredCasts, referredPurchases: st.sharing.referredPurchases, giftSent: st.sharing.giftSent, giftClaimed: st.sharing.giftClaimed },
    groups: groupFunnels(since, until, { lookbackDays }).map((g) => ({ id: g.id, name: g.name, steps: g.steps.map((s) => ({ label: s.label, n: s.n })) })),
    dailyPick: evs.filter((e) => e.e === "daily_pick").length,
    genFail: one("SELECT COUNT(*) AS v FROM ops_events WHERE kind = 'gen_fail' AND at >= ? AND at < ?", since, until),
  };
}

export function promoDir(): string {
  return join(process.env.DATA_DIR ?? join(process.cwd(), ".data"), "promo-stats");
}

/** write yesterday's file (Taipei), and on a Monday the week's; returns the files written */
export function writePromoStats(now = Date.now(), dir = promoDir()): string[] {
  mkdirSync(dir, { recursive: true });
  const today = tpeDayStart(now), since = today - DAY;
  const out: string[] = [];
  const day = ymd(since);
  const file = join(dir, `${day}.json`);
  writeFileSync(file, JSON.stringify({ day, tz: "Asia/Taipei", generatedAt: new Date(now).toISOString(), ...promoNumbers(since, today, 7) }, null, 1)); // 11-09 T-033 ②: 「隔天又来」 looks back 7 days
  out.push(file);
  if (new Date(today + TPE).getUTCDay() === 1) {
    const w0 = today - 7 * DAY;
    const t = new Date(today + TPE);
    const m1 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - TPE, m0 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1) - TPE;
    const last = ledgerSales(m0, m1); // 11-09 T-033 ①: same as /admin/finance?p=last
    const wfile = join(dir, `week-${ymd(today)}.json`);
    writeFileSync(wfile, JSON.stringify({ week: `${ymd(w0)}..${ymd(today - DAY)}`, tz: "Asia/Taipei", generatedAt: new Date(now).toISOString(), ...promoNumbers(w0, today), lastMonth: { month: ymd(m0).slice(0, 7), paidOrders: last.orders, paidUsd: last.usd } }, null, 1));
    out.push(wfile);
  }
  return out;
}
