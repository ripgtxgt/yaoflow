import { db, saveReceiptUrl } from "./db";
import { formatMoney, isCurrency } from "./money";
import { receiptUrlFor } from "./stripe";
import type { Locale } from "./locales";

/**
 * 10-23 进度表 111 ③: a single purchase's letter (塔羅、解籤、合盤、年書) carries what was paid and Stripe's receipt page —
 * until now only the reading letter did. Only for money actually taken on this checkout: something included in a pass
 * or a membership, a gift, a refunded order, has no receipt line. Best-effort: no receipt page found → no line.
 */
export async function receiptFor(sessionId: string | null | undefined, locale: Locale): Promise<{ amount: string; url: string } | null> {
  if (!sessionId || !sessionId.startsWith("cs_")) return null;
  try {
    const o = db().prepare("SELECT amount_cents, currency, payment_intent, receipt_url, status FROM orders WHERE session_id = ?").get(sessionId) as
      { amount_cents: number | null; currency: string | null; payment_intent: string | null; receipt_url: string | null; status: string } | undefined;
    if (!o || !o.amount_cents || o.status !== "paid") return null;
    const url = o.receipt_url ?? (await receiptUrlFor(o.payment_intent));
    if (!url) return null;
    if (!o.receipt_url) saveReceiptUrl(sessionId, url);
    const c = (o.currency ?? "USD").toUpperCase();
    return { amount: isCurrency(c) ? formatMoney(c, o.amount_cents, locale) : `${c} ${(o.amount_cents / 100).toFixed(2)}`, url };
  } catch {
    return null;
  }
}
