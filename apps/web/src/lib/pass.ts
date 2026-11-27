import { addOrderToCustomer, customerIdByEmail, db, recordOps, recordOrder, subscriptionByStripeId, upsertCustomer, upsertSubscription, type SubscriptionRow } from "./db";
import { getCheckoutSession, type CheckoutSession } from "./stripe";
import { isTongkaDays, tongkaT, type TongkaDays } from "./tongka";
import { sendWelcomeIfNew } from "./welcome";
import { maybeGrantGiftReward } from "./referral";

/**
 * 会员单月 (09-26, Neil: 「选B吧」— 单月 NT$299 不续订，订阅 NT$269/月).
 *
 * A paid Checkout session (mode payment, metadata.kind = "pass") becomes a
 * local membership row `pass_<session tail>`: status active, 30 days from the
 * moment it is recorded, cancel_at_period_end set, the monthly caps. Nothing
 * in Stripe to re-read (see isLocalSubscription); expireLocalSubscriptions
 * closes it after its end. Idempotent per session: the account page's return
 * and the fulfil cron may both call it.
 *
 * 10-22 通卡 (lib/tongka.ts): the same row for the 1 日 / 7 天 / 30 天 passes — metadata.days says which; a session with no
 * days is the old one-off month (30). The row keeps pass_days. A 通卡 bought from the cast page carries the cast too
 * (metadata.values …), and the reading page records that reading as usual — only the pass part is done here.
 */
export const PASS_DAYS = 30;
export const passDaysOf = (s: Pick<CheckoutSession, "metadata">): TongkaDays => { const d = Number(s.metadata?.days); return isTongkaDays(d) ? d : 30; };
/** the days of a pass row (an old one-off month has none → 30) */
export const rowPassDays = (row: Pick<SubscriptionRow, "pass_days">): TongkaDays => (isTongkaDays(row.pass_days) ? row.pass_days : 30);
export const passIdFor = (sessionId: string): string => `pass_${sessionId.slice(-40)}`;

export type PassResult =
  | { ok: true; row: SubscriptionRow; created: boolean; email: string }
  | { ok: false; why: "not_pass" | "unpaid" | "no_email" };

export async function fulfilPass(s: CheckoutSession, now = Date.now()): Promise<PassResult> {
  if (s.metadata?.kind !== "pass") return { ok: false, why: "not_pass" };
  if (s.payment_status !== "paid") return { ok: false, why: "unpaid" };
  const id = passIdFor(s.id);
  const existing = subscriptionByStripeId(id);
  const email = (s.metadata?.email || s.customer_details?.email || "").toLowerCase();
  if (existing) return { ok: true, row: existing, created: false, email };
  if (!email) return { ok: false, why: "no_email" };
  const cid = Number(s.metadata?.cust) || customerIdByEmail(email) || upsertCustomer(email, s.metadata?.locale);
  // 10-14 进度表 42 「再買一個月」: bought while a month is still running — it starts the day that one ends
  const prev = s.metadata?.after ? subscriptionByStripeId(s.metadata.after) : null;
  const days = passDaysOf(s);
  // 10-22 通卡: a pass bought while another pass (or the old one-off month) is running starts when that one ends
  const running = prev ?? latestRunningPass(cid, now);
  const startAt = running && running.customer_id === cid && running.status === "active" && running.period_end && running.period_end > now ? running.period_end : now;
  const row = upsertSubscription({
    customerId: cid,
    stripeCustomerId: typeof s.customer === "string" ? s.customer : null,
    stripeSubscriptionId: id,
    status: startAt > now ? "scheduled" : "active",
    plan: "month",
    periodStart: startAt,
    periodEnd: startAt + days * 86_400_000,
    cancelAtPeriodEnd: true,
    currency: s.currency ? s.currency.toUpperCase() : null,
    amountMinor: s.amount_total ?? null,
    passDays: days,
  });
  // 10-22 通卡: an orders row too (tier pass_<days>d), so the books, the customer's total and the sign-in-after-payment see it;
  // a reading bought together with the pass lands on the same session and only adds its cast (recordOrder keeps the first tier)
  if (s.metadata?.kind === "pass") {
    recordOrder({
      sessionId: s.id, customerId: cid, castId: null, tier: `pass_${days}d`, amountCents: s.amount_total ?? null, currency: s.currency ? s.currency.toUpperCase() : null,
      email, status: "paid", paymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : null, campaign: s.metadata?.c ?? null,
      browserSid: s.metadata?.bs ?? null, edgeCountry: s.metadata?.country ?? null,
    });
    if (s.amount_total) addOrderToCustomer(cid, s.amount_total);
  }
  recordOps("pass_started", `${id} ${days}d cust ${cid} ${s.currency ?? "?"} ${s.amount_total ?? "?"}${startAt > now ? ` scheduled after ${running?.stripe_subscription_id ?? "?"}` : ""}${s.metadata?.first_pass === "1" ? " first" : ""}`);
  await sendWelcomeIfNew(null, row).catch(() => undefined);
  await maybeGrantGiftReward({ customerId: cid, email, sessionId: s.id }).catch(() => undefined);
  return { ok: true, row, created: true, email };
}

/**
 * Stripe line-item names for the one-off month — neutral "digital content" wording, like the plans. 10-22 (Neil: 「要」):
 * the one-off month is the 30 天通卡, so its line item is the 30-day pass's own (lib/tongka.ts) — the page Stripe shows
 * and the receipt say 通卡, never 單月會員, whichever path sold it (the reminder's 「再買一張」 included).
 */
export const PASS_NAMES: Record<string, string> = Object.fromEntries(
  ["zh-hant", "zh", "en", "ja", "ko", "fr", "de", "es", "pt"].map((l) => [l, tongkaT(l).product[30]]),
);

/** the customer's pass (or old one-off month) still running, if any — the one a new pass queues behind */
export function latestRunningPass(customerId: number, now = Date.now()): SubscriptionRow | null {
  return (db().prepare("SELECT * FROM subscriptions WHERE customer_id = ? AND stripe_subscription_id LIKE 'pass\\_%' ESCAPE '\\' AND status = 'active' AND period_end > ? ORDER BY period_end DESC LIMIT 1")
    .get(customerId, now) as SubscriptionRow | undefined) ?? null;
}

/** 10-22 通卡 bought from the cast page: the reading page knows only the session id — fetch it once and record the pass */
export async function fulfilPassBySid(sid: string): Promise<PassResult | null> {
  if (!/^cs_[A-Za-z0-9_]{8,200}$/.test(sid)) return null;
  const existing = subscriptionByStripeId(passIdFor(sid));
  if (existing) return { ok: true, row: existing, created: false, email: "" };
  try { return await fulfilPass(await getCheckoutSession(sid)); } catch (e) { recordOps("pass_by_sid_fail", `${sid.slice(-8)} ${(e instanceof Error ? e.message : "?").slice(0, 120)}`); return null; }
}

/**
 * 10-22 首次 1 日通卡 NT$75: the account's (or address's) first pass of any kind — no membership row ever, no earlier
 * paid order of any kind. A browser that is not signed in and names no address is judged by the first-deep cookie
 * (lib/money FIRST_DEEP_COOKIE) at checkout, like the first-time full reading was.
 */
export function firstPassEligible(customerId: number | null, email: string | null): boolean {
  const d = db();
  const n = (sql: string, ...a: unknown[]) => ((d.prepare(sql).get(...(a as never[])) as { v: number } | undefined)?.v ?? 0);
  const cid = customerId ?? (email ? customerIdByEmail(email) : null);
  if (!cid) return true;
  if (n("SELECT COUNT(*) AS v FROM subscriptions WHERE customer_id = ?", cid) > 0) return false;
  if (n("SELECT COUNT(*) AS v FROM orders WHERE customer_id = ? AND status = 'paid' AND amount_cents > 0", cid) > 0) return false;
  return true;
}

/**
 * 10-22 升級會員差額折抵 (进度表 75 ⑧ 第二批): a 通卡 holder who subscribes gets what is left of the pass back as a one-time
 * discount on the first invoice — the unused share of what they paid (days left over days bought), in the pass's
 * currency, only when that is the currency they subscribe in. The pass itself is closed when the subscription starts
 * (/api/sub/sync passCredited), so nothing runs twice.
 */
export function passCredit(customerId: number, currency: string, now = Date.now()): { passId: string; amountMinor: number; currency: string; daysLeft: number } | null {
  if (process.env.UPGRADE_CREDIT !== "on") return null; // 10-24 (Neil): no credit on the way into a membership (lib/upgrade-credit.ts)
  const row = latestRunningPass(customerId, now);
  if (!row || !row.amount_minor || !row.period_end || !row.period_start) return null;
  const cur = (row.currency ?? "").toUpperCase();
  if (!cur || cur !== currency.toUpperCase()) return null;
  const total = Math.max(1, row.period_end - row.period_start);
  const left = Math.max(0, row.period_end - now);
  const amountMinor = Math.floor(row.amount_minor * left / total);
  if (amountMinor < 50) return null; // nothing worth a coupon
  return { passId: row.stripe_subscription_id, amountMinor, currency: cur, daysLeft: Math.ceil(left / 86_400_000) };
}

/** the pass behind a credited subscription ends now (idempotent) */
export function closePassForCredit(passId: string, now = Date.now()): boolean {
  const r = db().prepare("UPDATE subscriptions SET period_end = ?, status = 'canceled', updated_at = ? WHERE stripe_subscription_id = ? AND stripe_subscription_id LIKE 'pass\\_%' ESCAPE '\\' AND period_end > ?").run(now, now, passId, now) as unknown as { changes?: number | bigint };
  const ok = Number(r.changes ?? 0) > 0;
  if (ok) recordOps("pass_credited", passId);
  return ok;
}
