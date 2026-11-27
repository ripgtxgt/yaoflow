import { customerEmailById, customerLocaleById, db, recordEmail, recordOps, subscriptionByStripeId, type OrderRow, type SubscriptionRow } from "./db";
import { buildRefundEmail, sendEmail, type RefundWhat } from "./email";
import { asLocale, type Locale } from "./locales";
import { formatMoney, isCurrency } from "./money";
import { readerLocale } from "./refund";
import { letterDate } from "./welcome";
import { syncSubscription } from "./subscription";

/**
 * 10-23 进度表 111 ②: the refund letters the webhook was missing.
 *
 *   A part of a payment (Stripe's dashboard, or our own button for a part): the order stays paid — it used to be marked
 *   refunded whole and get a second, 「全額退回」 letter — and the reader hears the amount once. Our own button writes a
 *   mark before it asks Stripe, so the webhook that follows knows the letter is already on its way.
 *
 *   A membership (a subscription bill — no order behind it): the member hears it too (10-10 there was one, and no letter).
 *   Queued, not sent at once: Neil usually cancels the membership in the same minute, and the letter says what became of
 *   it — ended / carries on until a day / renews as before — so it waits five minutes and reads the membership then.
 */

const MIN = 60_000;
const OWN_MARK = "refund_own";

function tzOf(customerId: number | null | undefined): string | null {
  if (!customerId) return null;
  try { return (db().prepare("SELECT tz FROM customers WHERE id = ?").get(customerId) as { tz: string | null } | undefined)?.tz ?? null; } catch { return null; }
}
function money(currency: string | null | undefined, minor: number, locale: Locale): string {
  const c = (currency ?? "USD").toUpperCase();
  return isCurrency(c) ? formatMoney(c, minor, locale) : `${c} ${(minor / 100).toFixed(2)}`;
}

/** our own button is refunding a part of this payment — the webhook that follows must not write a second letter */
export function markOwnPartialRefund(paymentIntent: string, email: string | null, now = Date.now()): void {
  db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?, ?, ?, ?, 'own', NULL) ON CONFLICT(session_id, kind) DO UPDATE SET sent_at = excluded.sent_at")
    .run(`refund-part:${paymentIntent}`, OWN_MARK, email ?? "", now);
}
function ownPartialRefund(paymentIntent: string, now = Date.now()): boolean {
  return !!db().prepare("SELECT 1 FROM emails WHERE session_id = ? AND kind = ? AND sent_at > ?").get(`refund-part:${paymentIntent}`, OWN_MARK, now - 15 * MIN);
}

/** the 通卡 an order bought: its end, written for the reader (to the minute for a 1-day pass) */
export function passUntil(sessionId: string, locale: Locale, customerId?: number | null): string | null {
  const row = subscriptionByStripeId(`pass_${sessionId.slice(-40)}`);
  if (!row?.period_end || row.status === "canceled") return null;
  return letterDate(row.period_end, locale, tzOf(customerId), row.pass_days === 1);
}

/** what a part refunded leaves of the thing bought */
export function partialWhat(order: Pick<OrderRow, "tier" | "session_id" | "customer_id">, locale: Locale): { what: RefundWhat; until: string | null } {
  if (/^pass_/.test(order.tier ?? "")) {
    const until = passUntil(order.session_id, locale, order.customer_id);
    return until ? { what: "pass_keeps", until } : { what: "other", until: null };
  }
  return { what: "other", until: null };
}

export interface ChargeLike { id?: string; payment_intent?: string | null; amount?: number; amount_refunded?: number; currency?: string; customer?: string | null; created?: number }

/** this refund's own amount: what the event added (Stripe's previous_attributes), else all refunded so far */
export function thisRefund(ch: ChargeLike, prev?: { amount_refunded?: number } | null): number {
  const now = ch.amount_refunded ?? 0;
  return typeof prev?.amount_refunded === "number" && prev.amount_refunded < now ? now - prev.amount_refunded : now;
}

/** Webhook: a part of an order's payment came back. The order stays paid; the reader hears it once. */
export async function onPartialRefund(order: OrderRow, ch: ChargeLike, prev?: { amount_refunded?: number } | null): Promise<"sent" | "own" | "already" | "no_email" | "failed"> {
  if (ch.payment_intent && ownPartialRefund(ch.payment_intent)) return "own";
  if (!order.email) return "no_email";
  const key = `refund-part:${ch.id ?? ch.payment_intent ?? order.session_id}:${ch.amount_refunded ?? 0}`;
  const claimed = Number((db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?, 'refund', ?, ?, 'sending', NULL) ON CONFLICT(session_id, kind) DO NOTHING")
    .run(key, order.email, Date.now()) as unknown as { changes?: number }).changes ?? 0);
  if (!claimed) return "already";
  const locale = readerLocale(order.customer_id, order.email);
  const w = partialWhat(order, locale);
  const mail = buildRefundEmail({ locale, amountLabel: money(order.currency ?? ch.currency, thisRefund(ch, prev), locale), reason: "other", partial: true, what: w.what, until: w.until });
  const r = await sendEmail(order.email, mail.subject, mail.html, mail.text, { kind: "refund", sessionId: order.session_id, customerId: order.customer_id, locale }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "?" } as { ok: boolean; id?: string; error?: string }));
  recordEmail(key, "refund", order.email, r.ok ? "sent" : "failed", r.ok ? r.id : r.error);
  recordOps("refund_partial", `${order.session_id} stripe ${thisRefund(ch, prev)} ${order.currency ?? ch.currency ?? ""} letter ${r.ok ? "sent" : "failed"}`);
  return r.ok ? "sent" : "failed";
}

/* ---------------- a membership's money back ---------------- */

interface Queued { sid: string; amount: number; currency: string; partial: boolean }

/** Webhook: money back on a membership bill — the letter waits a few minutes (see above). `sid` = the membership row it was for. */
export function queueMemberRefundLetter(sid: string, ch: ChargeLike, prev?: { amount_refunded?: number } | null, now = Date.now()): boolean {
  const row = subscriptionByStripeId(sid);
  if (!row) return false;
  const email = customerEmailById(row.customer_id);
  if (!email) return false;
  const q: Queued = { sid, amount: thisRefund(ch, prev), currency: (ch.currency ?? row.currency ?? "usd").toUpperCase(), partial: (ch.amount_refunded ?? 0) < (ch.amount ?? 0) };
  const r = db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?, 'refund_member', ?, ?, 'queued', ?) ON CONFLICT(session_id, kind) DO NOTHING")
    .run(`refund-member:${ch.id ?? ch.payment_intent ?? sid}:${ch.amount_refunded ?? 0}`, email, now, JSON.stringify(q)) as unknown as { changes?: number };
  return Number(r.changes ?? 0) > 0;
}

/** what became of the membership, as the letter says it */
export function memberWhat(row: SubscriptionRow, locale: Locale, now = Date.now()): { what: RefundWhat; until: string | null } {
  const tz = tzOf(row.customer_id);
  const day = (ms: number) => letterDate(ms, locale, tz);
  const live = ["active", "trialing", "past_due"].includes(row.status) && (row.period_end ?? Infinity) > now;
  if (!live) return { what: "member_ended", until: null };
  const ends = row.cancel_at_period_end === 1 || row.cancel_at != null;
  const at = row.cancel_at ?? row.period_end;
  if (ends && at) return { what: "member_until", until: day(at) };
  return row.period_end ? { what: "member_renews", until: day(row.period_end) } : { what: "other", until: null };
}

/** Cron: the queued membership refund letters, five minutes on — the membership read fresh from Stripe first. */
export async function runMemberRefundLetters(now = Date.now()): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  const rows = db().prepare("SELECT session_id AS key, email, detail FROM emails WHERE kind = 'refund_member' AND status = 'queued' AND sent_at <= ? ORDER BY sent_at LIMIT 20").all(now - 5 * MIN) as { key: string; email: string; detail: string | null }[];
  for (const q of rows) {
    // claim it: another run (or process) leaves it alone
    const took = Number((db().prepare("UPDATE emails SET status = 'sending' WHERE session_id = ? AND kind = 'refund_member' AND status = 'queued'").run(q.key) as unknown as { changes?: number }).changes ?? 0);
    if (!took) continue;
    let d: Queued;
    try { d = JSON.parse(q.detail ?? "") as Queued; } catch { recordEmail(q.key, "refund_member", q.email, "failed", "bad detail"); out.failed += 1; continue; }
    let row = subscriptionByStripeId(d.sid);
    if (row && d.sid.startsWith("sub_")) { try { row = (await syncSubscription(d.sid, row.customer_id)) ?? row; } catch { /* the mirror, then */ } }
    const locale = asLocale(row ? customerLocaleById(row.customer_id) : null, "zh-hant");
    const w = row && d.sid.startsWith("sub_") ? memberWhat(row, locale, now) : { what: "other" as RefundWhat, until: null };
    const mail = buildRefundEmail({ locale, amountLabel: money(d.currency, d.amount, locale), reason: "other", partial: d.partial, what: w.what, until: w.until });
    const r = await sendEmail(q.email, mail.subject, mail.html, mail.text, { kind: "refund", customerId: row?.customer_id ?? null, locale }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "?" } as { ok: boolean; id?: string; error?: string }));
    db().prepare("UPDATE emails SET status = ?, detail = ? WHERE session_id = ? AND kind = 'refund_member'").run(r.ok ? "sent" : "failed", JSON.stringify({ ...d, mail: r.ok ? r.id : r.error, what: w.what }), q.key);
    recordOps("refund_member_letter", `${d.sid.slice(-8)} ${d.amount} ${d.currency}${d.partial ? " part" : ""} ${w.what} ${r.ok ? "sent" : "failed"}`);
    if (r.ok) out.sent += 1; else out.failed += 1;
  }
  return out;
}

