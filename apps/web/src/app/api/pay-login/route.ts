import { NextRequest, NextResponse } from "next/server";
import { markCustomer } from "@/lib/browsers";
import { customerFromRequest, setSessionCookies } from "@/lib/auth";
import { maskEmail, PAY_LOGIN_COOKIE, PAY_SESSION_TTL_MS, redeemPayLogin } from "@/lib/pay-login";
import { recordOps } from "@/lib/db";

export const runtime = "nodejs";

/**
 * 10-02 付款后自动登录: the reading page asks this once, right after a payment, from the browser that paid
 * (lib/pay-login.ts has the rules). Signs that browser in to the new account, or says why not.
 */
export async function POST(req: NextRequest) {
  let sid = "";
  try { sid = String(((await req.json()) as { sid?: unknown }).sid ?? ""); } catch { /* empty body */ }
  if (!/^(cs|pi)_[A-Za-z0-9_]{8,200}$/.test(sid)) return NextResponse.json({ signedIn: false, reason: "bad_sid" }, { status: 400 });
  const me = customerFromRequest(req);
  if (me) return markCustomer(req, NextResponse.json({ signedIn: true, already: true }), me.customerId, "pay");
  const r = redeemPayLogin(sid, req.cookies.get(PAY_LOGIN_COOKIE)?.value);
  if (!r.ok) {
    if (r.reason !== "no_cookie" && r.reason !== "unknown") recordOps("pay_login_skip", `${r.reason} ${sid.slice(0, 14)}`);
    // 10-02: an existing customer is not signed in by a payment — but this browser did pay as them: the board's yf_who mark
    return markCustomer(req, NextResponse.json({ signedIn: false, reason: r.reason }), r.reason === "existing" ? r.customerId : null, "pay");
  }
  recordOps("pay_login", `#${r.customerId} ${sid.slice(0, 14)}`);
  const res = NextResponse.json({ signedIn: true, email: maskEmail(r.email) });
  setSessionCookies(res, r.sessionId, PAY_SESSION_TTL_MS);
  markCustomer(req, res, r.customerId, "pay");
  res.cookies.set(PAY_LOGIN_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0 });
  return res;
}
