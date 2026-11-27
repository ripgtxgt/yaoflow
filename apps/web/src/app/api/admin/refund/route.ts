import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { orderBySession } from "@/lib/db";
import { refundSession } from "@/lib/refund";
import { asLocale } from "@/lib/locales";
import type { RefundReason } from "@/lib/email";

export const runtime = "nodejs";

const REASONS = new Set<RefundReason>(["technical_failure", "duplicate", "requested", "other"]);

/**
 * The refund button on a customer's page (admin only, ADMIN_KEY in the form).
 * Refunds a paid one-time order in full through Stripe, flips the row, mails
 * the customer, and returns to the page it came from.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, typeof key === "string" ? key : null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sessionId = String(form.get("session_id") ?? "");
  const reasonRaw = String(form.get("reason") ?? "requested") as RefundReason;
  const reason: RefundReason = REASONS.has(reasonRaw) ? reasonRaw : "requested";
  const back = String(form.get("back") ?? "/admin/customers");

  const order = orderBySession(sessionId);
  if (!order) return NextResponse.json({ error: "no such order" }, { status: 404 });
  if (order.status !== "paid" && order.status !== "disputed") return NextResponse.json({ error: `order is ${order.status}, nothing to refund` }, { status: 400 });
  if (!order.amount_cents) return NextResponse.json({ error: "nothing was charged" }, { status: 400 });

  const locale = asLocale(String(form.get("locale") ?? ""));
  const r = await refundSession({ sessionId, reason, by: "admin", fallback: { tier: order.tier, amountCents: order.amount_cents, currency: order.currency, email: order.email, locale, paymentIntent: order.payment_intent, customerId: order.customer_id } });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  const url = new URL(back, (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  url.searchParams.set("key", key);
  url.searchParams.set("refunded", sessionId.slice(-8));
  return NextResponse.redirect(url, { status: 303 });
}
