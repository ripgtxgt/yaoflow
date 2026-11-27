import { STRIPE_VERSION } from "./stripe";
import {
  lastProviderBalance, newestTxnCreated, ordersNeedingLedger, providerBalanceSeries, recordOps,
  recordProviderBalance, saveOrderLedger, saveStripeTxn, noteLedgerFailure, saveCardCountry, saveReceiptUrl, saveCardFp,
} from "./db";
import { fingerprintOf } from "./card-fp";

/**
 * 账本 (09-21, Neil: 「我还需要一个流水，各项成本，净利的更新和统计表」).
 *
 * Two things a profit line needs that the orders table cannot answer:
 *
 *  1. What Stripe actually settled. Managed Payments converts every sale into
 *     our settlement currency and takes processing, withheld tax and FX out of
 *     it — NT$72.45 arrives as US$2.28 gross, US$0.53 fee, US$1.75 net. Only
 *     the charge's balance transaction knows those numbers, so we read them
 *     once per order and store them.
 *  2. What the model costs. DeepSeek bills against a prepaid balance and has
 *     no usage-by-period endpoint, but it does report the balance — so we read
 *     it daily and take spend to be the drop between readings. A rise is a
 *     top-up, not negative spend, and is skipped.
 */

const STRIPE = "https://api.stripe.com/v1";

async function stripeGet(path: string): Promise<Record<string, unknown> | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const r = await fetch(`${STRIPE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) return null;
  return (await r.json()) as Record<string, unknown>;
}

interface BalanceTx { amount?: number; currency?: string; fee?: number; net?: number }
interface Charge { balance_transaction?: BalanceTx | string; refunds?: { data?: { balance_transaction?: BalanceTx | string }[] } }

const asTx = (x: BalanceTx | string | undefined): BalanceTx | null => (x && typeof x === "object" ? x : null);

/**
 * Read the settled figures for up to `limit` orders that lack them (or whose
 * refund landed after the last read). Safe to call on a page load: it is
 * bounded, it never throws, and an order it cannot price is simply left for
 * next time.
 */
export async function syncStripeLedger(limit = 25): Promise<{ done: number; failed: number }> {
  const rows = ordersNeedingLedger(limit);
  let done = 0, failed = 0;
  for (const o of rows) {
    try {
      const pi = await stripeGet(`/payment_intents/${o.payment_intent}?expand[]=latest_charge.balance_transaction&expand[]=latest_charge.refunds.data.balance_transaction&expand[]=latest_charge.payment_method_details`);
      const charge = pi?.latest_charge as Charge | undefined;
      const tx = asTx(charge?.balance_transaction);
      if (!tx || typeof tx.net !== "number") { noteLedgerFailure(o.session_id); failed++; continue; }
      const refundNet = (charge?.refunds?.data ?? []).reduce((a, r) => {
        const rt = asTx(r.balance_transaction);
        return a + (typeof rt?.net === "number" ? rt.net : 0);
      }, 0);
      // 09-22: the card's country is the only trustworthy answer to "where is
      // this buyer", and it only exists after the payment. Keep it so the
      // dashboard can mark the currency we guessed wrong.
      const card = (charge as { payment_method_details?: { card?: { country?: string } } })?.payment_method_details?.card?.country;
      if (card) saveCardCountry(o.session_id, card);
      // 10-07 首次付费保证补洞: the payment method's own identifier comes with the same charge (lib/card-fp.ts)
      const fp = fingerprintOf(charge);
      if (fp) saveCardFp(o.session_id, fp);
      // 09-25: the receipt page, for orders delivered before we started keeping it
      const receipt = (charge as { receipt_url?: string | null } | undefined)?.receipt_url;
      if (receipt) saveReceiptUrl(o.session_id, receipt);
      saveOrderLedger(o.session_id, {
        currency: tx.currency ?? "usd",
        settled: tx.amount ?? 0,
        fee: tx.fee ?? 0,
        net: tx.net,
        refundNet,
      });
      done++;
    } catch {
      noteLedgerFailure(o.session_id);
      failed++;
    }
  }
  if (failed > 0) recordOps("ledger_sync", `done=${done} failed=${failed}`);
  return { done, failed };
}

/**
 * 09-22: the orders table is not the books. A membership has no order row, and
 * a refund's kept fee lives nowhere but Stripe — which is why the first version
 * of this page said $22.09 when the account had taken $29.61. So the ledger is
 * synced wholesale from balance transactions: every charge, invoice payment,
 * refund and adjustment, already in the settlement currency.
 *
 * Incremental: it asks for everything since the newest row we hold (minus a
 * day's overlap, because a transaction can be written slightly late), and
 * upserts. Bounded by `pages` so a page load can never hang.
 */
export async function syncStripeTxns(pages = 3): Promise<{ saved: number }> {
  const newest = newestTxnCreated();
  const gte = newest ? Math.floor(newest / 1000) - 86_400 : undefined;
  let saved = 0;
  let after: string | undefined;
  for (let page = 0; page < pages; page++) {
    const q = new URLSearchParams({ limit: "100", "expand[]": "data.source" });
    if (gte) q.set("created[gte]", String(gte));
    if (after) q.set("starting_after", after);
    const j = await stripeGet(`/balance_transactions?${q.toString()}`);
    const data = (j?.data ?? []) as Record<string, unknown>[];
    if (data.length === 0) break;
    for (const t of data) {
      const src = t.source && typeof t.source === "object" ? (t.source as Record<string, unknown>) : null;
      const pi = src && typeof src.payment_intent === "string" ? src.payment_intent : null;
      // 09-22: without this a membership invoice cannot be attributed to anyone
      const cust = src && typeof src.customer === "string" ? src.customer : null;
      saveStripeTxn({
        id: String(t.id),
        created: Number(t.created) * 1000,
        type: String(t.type),
        currency: String(t.currency ?? "usd"),
        amount: Number(t.amount) || 0,
        fee: Number(t.fee) || 0,
        net: Number(t.net) || 0,
        source: typeof t.source === "string" ? t.source : src ? String(src.id) : null,
        payment_intent: pi,
        stripe_customer: cust,
        // 09-30: 'fee_credits' is a coupon against Stripe's fees, not money (docs.stripe.com/stripe-fee-credits)
        balance_type: typeof t.balance_type === "string" ? t.balance_type : "payments",
        // 09-26: Stripe's fee field folds in the sales tax Managed Payments withheld; keep it apart
        fee_tax: ((t.fee_details ?? []) as { type?: string; amount?: number }[]).filter((f) => f.type === "withheld_tax").reduce((a, f) => a + (Number(f.amount) || 0), 0),
      });
      saved++;
      after = String(t.id);
    }
    if (!j?.has_more) break;
  }
  return { saved };
}

/** 09-26: Stripe's balance as its Dashboard shows it (USD cents): available + pending. */
export async function stripeBalanceUsd(): Promise<{ available: number; pending: number; total: number }> {
  const j = await stripeGet("/balance");
  const sum = (xs: unknown) => ((xs ?? []) as { amount?: number; currency?: string }[]).filter((x) => (x.currency ?? "").toLowerCase() === "usd").reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const available = sum(j?.available), pending = sum(j?.pending);
  return { available, pending, total: available + pending };
}

/* ---------------- model providers ---------------- */

export interface ProviderBalance { provider: string; currency: string; balance: number }

/** DeepSeek is the only provider of ours with a balance endpoint; the backups are entered by hand as costs. */
export async function readDeepSeekBalance(): Promise<ProviderBalance | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { balance_infos?: { currency?: string; total_balance?: string }[] };
    const info = j.balance_infos?.[0];
    const balance = Number(info?.total_balance);
    if (!Number.isFinite(balance)) return null;
    return { provider: "deepseek", currency: info?.currency ?? "CNY", balance };
  } catch {
    return null;
  }
}

/** Take a reading if the last one is older than `maxAgeMs`. Returns what is on record now. */
export async function refreshProviderBalances(maxAgeMs = 6 * 3_600_000): Promise<void> {
  const last = lastProviderBalance("deepseek");
  if (last && Date.now() - last.at < maxAgeMs) return;
  const b = await readDeepSeekBalance();
  if (b) recordProviderBalance(b.provider, b.currency, b.balance);
}

export interface ProviderSpend {
  provider: string; currency: string; spent: number; toppedUp: number;
  readings: number; latest: number | null;
  /** when the first balance reading in this window was taken — spend before it is invisible */
  firstAt: number | null;
}

/**
 * Spend between readings: every drop counts, every rise is a top-up. With one
 * reading or none we cannot say anything, and say so by returning readings ≤ 1.
 */
export function providerSpend(provider: string, sinceMs: number): ProviderSpend {
  const series = providerBalanceSeries(provider, sinceMs);
  let spent = 0, toppedUp = 0;
  for (let i = 1; i < series.length; i++) {
    const delta = series[i - 1]!.balance - series[i]!.balance;
    if (delta > 0) spent += delta; else toppedUp += -delta;
  }
  return {
    provider,
    currency: series[0]?.currency ?? "CNY",
    spent: Math.round(spent * 100) / 100,
    toppedUp: Math.round(toppedUp * 100) / 100,
    readings: series.length,
    latest: series.length ? series[series.length - 1]!.balance : null,
    // 09-22: a balance difference can only measure what happened BETWEEN two
    // readings. Everything spent before the first one is invisible and can
    // never be recovered, so the page has to say when the meter started.
    firstAt: series.length ? series[0]!.at : null,
  };
}

/**
 * 09-22: the books used to refresh only while /admin/finance was rendering —
 * a data sync hidden behind a page view. So the dashboard, the headline
 * figures and the weekly digest all read whatever the ledger happened to hold
 * the last time someone opened that one page; a $79 annual membership sat
 * invisible for hours. The 10-minute fulfil cron now keeps it fresh, at most
 * once every 30 minutes so we are not hammering Stripe on every heartbeat.
 */
/*
 * 10-13 (Neil 「可以」, after #1951's payment took 40 minutes to show): the throttle was exactly 30 minutes, and the cron
 * fires every 10 — a sync at 12:10:06 makes the 12:40:01 tick 29:55 later, five seconds short, so it skipped and the
 * next sync came at 12:50: every 40 minutes whenever the phase was unlucky, while the pages promise 30. At 25 minutes
 * the tick 20 minutes on always skips and the one 30 minutes on always runs, with five minutes to spare for a slow
 * request — every 30 minutes, as written.
 */
export const LEDGER_EVERY_MS = 25 * 60_000;
/** Whether a refresh is due — pure, so the cadence against the 10-minute cron is a test. */
export const ledgerDue = (now: number, last: number): boolean => now - last >= LEDGER_EVERY_MS;
let lastLedgerRun = 0;
export async function refreshBooks(force = false): Promise<{ ran: boolean; saved: number; done: number; failed: number }> {
  if (!force && !ledgerDue(Date.now(), lastLedgerRun)) return { ran: false, saved: 0, done: 0, failed: 0 };
  lastLedgerRun = Date.now();
  const txns = await syncStripeTxns(3).catch(() => ({ saved: 0 }));
  const led = await syncStripeLedger(25).catch(() => ({ done: 0, failed: 0 }));
  // 09-22: model spend is worked out from the drop in the provider's balance,
  // so it is only as good as how often we read that balance — and the reader
  // was still sitting on the finance page. Two readings in two days made a
  // day of traffic look like CN¥0.29. It samples on the clock now.
  await refreshProviderBalances(6 * 3_600_000).catch(() => {});
  return { ran: true, saved: txns.saved, done: led.done, failed: led.failed };
}
