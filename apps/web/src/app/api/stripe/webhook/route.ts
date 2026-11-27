import { NextRequest, NextResponse } from "next/server";
import { passCreditNote, sendWelcomeIfNew } from "@/lib/welcome";
import { sessionForPaymentIntent, verifyWebhookSignature, type StripeSubscription } from "@/lib/stripe";
import { mirrorSubscription } from "@/lib/subscription";
import { markMembershipRefunded, markOrderDispute, orderByPaymentIntent, orderBySession, recordOps, refundPackByIntent, subscriptionByStripeId } from "@/lib/db";
import { refundSession } from "@/lib/refund";
import { alertSubscriptionTurn, turnFor } from "@/lib/sub-alert";
import { onCancelled, onYearlyFromRetain } from "@/lib/retain";
import { onSubscriptionChange } from "@/lib/sub-letters";
import { onPartialRefund, queueMemberRefundLetter, type ChargeLike } from "@/lib/refund-letters";

export const runtime = "nodejs";

/**
 * Stripe → us. Only subscription lifecycle events matter; one-time payments
 * are verified by session lookup as before. Signature is checked against
 * STRIPE_WEBHOOK_SECRET; without that secret the endpoint refuses everything,
 * and the cron keeps the mirror fresh instead.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  const payload = await req.text();
  if (!verifyWebhookSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }
  let event: { type: string; data: { object: unknown } };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (event.type.startsWith("customer.subscription.")) {
    const s = event.data.object as StripeSubscription;
    // 09-22: read the mirror BEFORE writing it, so we can tell a turn from a
    // no-op. Without the before-picture every renewal would look like news.
    const before = subscriptionByStripeId(s.id);
    const row = mirrorSubscription(s);
    recordOps("sub_webhook", `${event.type} ${s.id} ${s.status}${row ? "" : " (no customer)"}`);
    // a cancellation used to be recorded and then sit there, silent, until
    // Monday's digest — see lib/sub-alert
    const deleted = event.type === "customer.subscription.deleted";
    // 09-23 挽回: the moment they cancel, the customer gets a receipt with a
    // one-tap undo, and how they used it decides the letter three days out
    let extra: string[] = [];
    if (row && turnFor(before, s, deleted) === "canceling") extra = await onCancelled(row).catch((e) => [`确认信　出错：${e instanceof Error ? e.message : "?"}`]);
    if (event.type === "customer.subscription.created") await onYearlyFromRetain(s).catch(() => undefined);
    // 09-25: welcome letter, if the page's sync call has not already sent it
    if (row) await sendWelcomeIfNew(before, row, { passCredit: passCreditNote(s.metadata) }).catch(() => undefined);
    // 10-23 进度表 111 / 110: the member hears it too — a renewal that failed, paid after all, the end it led to, renewal back on
    extra = [...extra, ...(await onSubscriptionChange(before, s, row, deleted).catch(() => [] as string[]))];
    await alertSubscriptionTurn(s, before, deleted, extra).catch(() => undefined);
  }

  // Money moving back without us pressing the button: a refund issued in the
  // Stripe Dashboard, or by Link support on a Managed Payments sale (09-10).
  if (event.type === "charge.refunded") {
    const ch = event.data.object as ChargeLike;
    const prev = (event.data as { previous_attributes?: { amount_refunded?: number } }).previous_attributes ?? null;
    const order = await orderForIntent(ch.payment_intent ?? null);
    // 10-23 进度表 111 ②: a part of the payment leaves the order paid — it used to be marked refunded whole and get a
    // second letter saying 「全額退回」; now the reader hears the part, once (not again when our own button did it)
    const partial = (ch.amount_refunded ?? 0) < (ch.amount ?? 0);
    if (order && order.status !== "refunded") {
      if (partial) await onPartialRefund(order, ch, prev).catch(() => undefined);
      else await refundSession({ sessionId: order.session_id, reason: "other", by: "stripe", alreadyRefunded: true });
    }
    // 09-29 会员增购包: a refunded pack takes its unspent readings back
    if (!order && ch.payment_intent) {
      const p = refundPackByIntent(ch.payment_intent);
      if (p) recordOps("pack_refunded", `cust ${p.customer_id} pack ${p.id}`);
    }
    // 10-10 首月同价: a refunded one-off month or subscription no longer counts as "been a member" (lib/db startsAtMonthlyFee)
    if (!order) {
      const sid = await membershipMoneyBack(ch.payment_intent ?? null, ch.customer ?? null, ch.created).catch(() => null);
      // 10-23 进度表 111 ②: and the member hears it — a few minutes on, once the membership's own change has landed
      if (sid) queueMemberRefundLetter(sid, ch, prev);
    }
    recordOps("refund_webhook", `${ch.payment_intent ?? "?"} ${ch.amount_refunded ?? "?"}/${ch.amount ?? "?"} ${ch.currency ?? ""}${order ? "" : " (no order)"}`);
  }

  // A chargeback. Stripe handles the evidence on Managed Payments sales; here
  // the order is flagged so the dashboards and the weekly digest show it.
  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    const d = event.data.object as { id: string; payment_intent?: string | null; status?: string; amount?: number; currency?: string; reason?: string; charge?: string | { customer?: string | null } | null; created?: number };
    const order = await orderForIntent(d.payment_intent ?? null);
    // 10-10: a chargeback on a membership counts like a refund (lost or won — the money was pulled back to dispute it)
    if (!order && event.type === "charge.dispute.created") {
      const cust = d.charge && typeof d.charge === "object" ? d.charge.customer ?? null : null;
      await membershipMoneyBack(d.payment_intent ?? null, cust, d.created).catch(() => undefined);
    }
    const closed = event.type === "charge.dispute.closed";
    const state = !closed ? "open" : d.status === "won" ? "won" : d.status === "lost" ? "lost" : "won";
    if (order) markOrderDispute(order.session_id, state);
    recordOps(closed ? "dispute_closed" : "dispute_open", `${d.id} ${d.payment_intent ?? "?"} ${d.status ?? ""} ${d.reason ?? ""} ${d.amount ?? "?"} ${d.currency ?? ""}${order ? "" : " (no order)"}`);
  }
  return NextResponse.json({ received: true });
}

/** 10-10: money back on a membership — a one-off month by its checkout session, else the customer's latest subscription. Returns that row's id. */
async function membershipMoneyBack(pi: string | null, customer: string | null, createdSec?: number): Promise<string | null> {
  const at = createdSec ? createdSec * 1000 : Date.now();
  if (pi) {
    const session = await sessionForPaymentIntent(pi).catch(() => null);
    if (session?.metadata?.kind === "pass") {
      const id = markMembershipRefunded({ passSessionId: session.id });
      if (id) recordOps("membership_refunded", `${id.slice(-8)} (one-off month)`);
      return id;
    }
    if (session && session.mode !== "subscription") return null; // a pack or a reading: not a membership
  }
  const id = markMembershipRefunded({ stripeCustomer: customer, chargeAt: at });
  if (id) recordOps("membership_refunded", `${id.slice(-8)}`);
  return id;
}

/** The order behind a PaymentIntent: by the stored id first, else by asking Stripe which checkout session it belongs to. */
async function orderForIntent(pi: string | null) {
  if (!pi) return null;
  const direct = orderByPaymentIntent(pi);
  if (direct) return direct;
  try {
    const session = await sessionForPaymentIntent(pi);
    return session ? orderBySession(session.id) : null;
  } catch {
    return null;
  }
}

