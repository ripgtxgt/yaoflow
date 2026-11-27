import { createRefund, getCheckoutSession } from "./stripe";
import { buildRefundEmail, sendEmail, type RefundReason, type RefundWhat } from "./email";
import { customerIdByEmail, customerLocaleById, emailAlreadySent, markOrderRefunded, orderBySession, recordEmail, recordOps, recordOrder, setOrderPaymentIntent } from "./db";
import { formatMoney, isCurrency, DEFAULT_CURRENCY, type Currency } from "./money";
import { asLocale } from "./locales";
import type { Locale } from "./locales";

/**
 * One refund path for every caller — the admin button, the fulfilment sweep
 * that gives up, a webhook that learns Stripe already refunded. Order of
 * operations: money first (Stripe), then the row (status → refunded, spend
 * corrected, first-deep entitlement and revenue drop out by status), then
 * the customer hears about it. Nothing here throws past the caller without
 * an ops record.
 */
export interface RefundResult { ok: boolean; refundId?: string; error?: string; amountLabel?: string }

/** 10-23 进度表 111 ②: the language a refund letter is written in — the reader's account, else their address's account, else 繁體 */
export function readerLocale(customerId: number | null | undefined, email: string | null | undefined): Locale {
  const cid = customerId ?? (email ? customerIdByEmail(email) : null);
  return asLocale(cid ? customerLocaleById(cid) : null, "zh-hant");
}

/** what a full refund of this order leaves: a reading (「這一卦不必重新起」), a 通卡 ended with it, or something else bought once */
export function refundWhatForTier(tier: string | null | undefined): RefundWhat {
  if (/^pass_/.test(tier ?? "")) return "pass_ended";
  return tier === "one" || tier === "deep" ? "reading" : "other";
}

export async function refundSession(i: {
  sessionId: string;
  reason: RefundReason;
  /** who or what asked: admin | sweep | stripe */
  by: string;
  /** when Stripe already moved the money (webhook), skip the API call */
  alreadyRefunded?: boolean;
  /** fill-ins for a session that never became an order (paid, never fulfilled) */
  fallback?: { tier: string; amountCents: number | null; currency: string | null; email: string | null; locale: Locale; paymentIntent: string | null; customerId?: number | null };
}): Promise<RefundResult> {
  const existing = orderBySession(i.sessionId);
  if (existing?.payment_state === "refunded") return { ok: true, error: "already_refunded" };

  const tier = existing?.tier ?? i.fallback?.tier ?? "one";
  const amountCents = existing?.amount_cents ?? i.fallback?.amountCents ?? null;
  const currencyRaw = (existing?.currency ?? i.fallback?.currency ?? DEFAULT_CURRENCY).toUpperCase();
  const currency: Currency = isCurrency(currencyRaw) ? currencyRaw : DEFAULT_CURRENCY;
  const email = existing?.email ?? i.fallback?.email ?? null;
  // 10-23 进度表 111 ②: the reader's own language — a refund made in Stripe's dashboard used to come in Simplified Chinese to everyone
  const locale = i.fallback?.locale ?? readerLocale(existing?.customer_id ?? i.fallback?.customerId ?? null, email);
  let paymentIntent = existing?.payment_intent ?? i.fallback?.paymentIntent ?? null;

  let refundId: string | undefined;
  if (!i.alreadyRefunded) {
    try {
      if (!paymentIntent) {
        const session = await getCheckoutSession(i.sessionId);
        paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : null;
      }
      if (!paymentIntent) throw new Error("no payment intent on session");
      const r = await createRefund(paymentIntent, i.reason);
      refundId = r.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      recordOps("refund_fail", `${i.sessionId} ${i.by} ${msg.slice(0, 200)}`);
      return { ok: false, error: msg };
    }
  }

  if (!existing) {
    recordOrder({
      sessionId: i.sessionId, customerId: i.fallback?.customerId ?? null, castId: null, tier,
      amountCents, currency, email, status: "refunded", paymentIntent,
    });
  }
  if (paymentIntent) setOrderPaymentIntent(i.sessionId, paymentIntent); // orders from before 09-10 never stored it
  markOrderRefunded(i.sessionId, i.reason);
  recordOps("refund", `${i.sessionId} ${i.by} ${i.reason} ${amountCents ?? "?"} ${currency}${refundId ? " " + refundId : ""}`);

  const amountLabel = amountCents !== null ? formatMoney(currency, amountCents, locale) : "";
  if (email && !emailAlreadySent(i.sessionId, "refund")) {
    const mail = buildRefundEmail({ locale, amountLabel, reason: i.reason, what: refundWhatForTier(tier) });
    const sent = await sendEmail(email, mail.subject, mail.html, mail.text, { kind: "refund", sessionId: i.sessionId, customerId: existing?.customer_id ?? i.fallback?.customerId ?? null });
    recordEmail(i.sessionId, "refund", email, sent.ok ? "sent" : "failed", sent.error ?? sent.id);
  }
  return { ok: true, refundId, amountLabel };
}
