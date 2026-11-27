import { NextRequest, NextResponse } from "next/server";
import { guaranteeCheck, recordOps } from "@/lib/db";
import { refundSession } from "@/lib/refund";
import { asLocale } from "@/lib/locales";
import { ensureOrderCardFp } from "@/lib/card-fp";

export const runtime = "nodejs";

/**
 * 首次付费保证 (09-26): the reading page's one-tap refund. The session id is
 * the reading's own key (whoever holds the link owns the reading), so it is
 * enough to ask with; every rule is checked again here, not on the page.
 *
 * 10-07 补洞: before the check, this order's payment method identifier is
 * looked up if the sweep has not done it yet (lib/card-fp.ts), so "once per
 * person" also covers a new address paid with the same card or Alipay account.
 * A refusal says only that this order is not eligible; which signal matched
 * goes to the owner's log (ops guarantee_denied), never to the page.
 */
const BUCKET = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now(), b = BUCKET.get(ip);
  if (!b || now - b.t > 3_600_000) { BUCKET.set(ip, { n: 1, t: now }); return false; }
  b.n += 1;
  return b.n > 10;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: { sid?: unknown; locale?: unknown; why?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const sid = typeof body.sid === "string" ? body.sid : "";
  if (!/^(cs|pi)_[A-Za-z0-9_]{8,200}$/.test(sid)) return NextResponse.json({ error: "bad_sid" }, { status: 400 });
  // the identifier of the card / wallet / Alipay account that paid this order — at most a few seconds; the check runs without it if Stripe is slow
  await Promise.race([ensureOrderCardFp(sid).catch(() => null), new Promise((r) => setTimeout(r, 8_000))]);
  const g = guaranteeCheck(sid);
  if (!g.ok) {
    if (g.why === "used" || g.why === "not_first" || g.why === "not_covered" || g.why === "over_used") recordOps("guarantee_denied", `${sid.slice(-8)} ${g.why}${g.by ? ` by ${g.by}` : ""}${g.pieces ? ` pieces ${g.pieces}` : ""}`);
    return NextResponse.json({ error: g.why }, { status: 403 });
  }
  const why = typeof body.why === "string" ? body.why.replace(/\s+/g, " ").slice(0, 200) : "";
  const r = await refundSession({ sessionId: sid, reason: "guarantee", by: "guarantee", fallback: { tier: "deep", amountCents: g.amountCents, currency: g.currency, email: null, locale: asLocale(body.locale), paymentIntent: null } });
  if (!r.ok) return NextResponse.json({ error: "refund_failed" }, { status: 502 });
  recordOps("guarantee_refund", `${sid.slice(-8)}${why ? ` · ${why}` : ""}`);
  return NextResponse.json({ ok: true });
}
