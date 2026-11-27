import { NextRequest, NextResponse } from "next/server";
import { passCreditNote, sendWelcomeIfNew } from "@/lib/welcome";
import { subscriptionByStripeId } from "@/lib/db";
import { customerFromRequest } from "@/lib/auth";
import { getCheckoutSession, getSubscription } from "@/lib/stripe";
import { entitlementFor, mirrorSubscription } from "@/lib/subscription";
import { recordOps } from "@/lib/db";
import { maybeGrantGiftReward } from "@/lib/referral";
import { closePassForCredit } from "@/lib/pass";

export const runtime = "nodejs";

/**
 * Back from Stripe Checkout: read the session, mirror its subscription, and
 * answer with the entitlement — so the account page is right immediately,
 * webhook or no webhook.
 */
export async function POST(req: NextRequest) {
  const c = customerFromRequest(req);
  if (!c) return NextResponse.json({ error: "login_required" }, { status: 401 });
  let body: { session?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const sid = typeof body.session === "string" ? body.session : "";
  if (!/^cs_[a-zA-Z0-9_]+$/.test(sid)) return NextResponse.json({ error: "bad_session" }, { status: 400 });
  try {
    const session = await getCheckoutSession(sid);
    if (session.mode !== "subscription" || !session.subscription) return NextResponse.json({ error: "not_subscription" }, { status: 400 });
    const s = await getSubscription(session.subscription);
    // the session belongs to whoever is signed in only if the emails agree
    const paidEmail = (session.customer_details?.email ?? s.metadata?.email ?? "").toLowerCase();
    if (paidEmail && paidEmail !== c.email.toLowerCase()) {
      recordOps("sub_sync_mismatch", `${sid}`);
      return NextResponse.json({ error: "email_mismatch" }, { status: 409 });
    }
    const before = subscriptionByStripeId(s.id);
    const row = mirrorSubscription(s, c.customerId, c.email);
    recordOps("sub_started", `${s.id} ${s.status}`);
    // 10-22 升級會員差額折抵: the 通卡 whose remainder paid for this first month ends now (its value is on the invoice)
    if (session.metadata?.pass_credit) closePassForCredit(session.metadata.pass_credit);
    // 09-25: the welcome letter — once, whichever of this route or the webhook saw the subscription go live first
    if (row) await sendWelcomeIfNew(before, row, { passCredit: passCreditNote(session.metadata) }).catch(() => undefined);
    // 09-24 R1: someone who was given a reading and now joins — their giver earns one
    await maybeGrantGiftReward({ customerId: c.customerId, email: c.email, sessionId: sid }).catch(() => undefined);
    return NextResponse.json({ ok: true, entitlement: await entitlementFor(c.customerId) });
  } catch (e) {
    return NextResponse.json({ error: "sync_failed", detail: e instanceof Error ? e.message : "unknown" }, { status: 502 });
  }
}
