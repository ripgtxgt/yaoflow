import { NextRequest, NextResponse } from "next/server";
import { asLocale } from "@/lib/locales";
import { customerFromRequest } from "@/lib/auth";
import { latestSubscription } from "@/lib/db";
import { createPortalSession } from "@/lib/stripe";

export const runtime = "nodejs";

/** Hand the customer to Stripe's portal to change card, cancel, or download invoices. */
export async function POST(req: NextRequest) {
  const c = customerFromRequest(req);
  if (!c) return NextResponse.json({ error: "login_required" }, { status: 401 });
  let locale = "en";
  let flow: unknown = null;
  try {
    const b = (await req.json()) as { locale?: unknown; flow?: unknown };
    locale = asLocale(b.locale);
    flow = b.flow;
  } catch { /* no body */ }
  const sub = latestSubscription(c.customerId);
  if (!sub?.stripe_customer_id) return NextResponse.json({ error: "no_subscription" }, { status: 404 });
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  try {
    // back from the portal, the account page re-reads Stripe before it trusts the mirror
    // 09-30: "cancel" arrives from /account/cancel, after the reader has seen what stops — open Stripe on the cancel step
    const cancelId = flow === "cancel" && sub.stripe_subscription_id.startsWith("sub_") ? sub.stripe_subscription_id : undefined;
    const p = await createPortalSession(sub.stripe_customer_id, `${origin}/${locale}/account?sync=1`, asLocale(locale), cancelId);
    return NextResponse.json({ url: p.url });
  } catch (e) {
    return NextResponse.json({ error: "portal_failed", detail: e instanceof Error ? e.message : "unknown" }, { status: 502 });
  }
}
