import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest, setSessionCookies } from "@/lib/auth";
import { markCustomer } from "@/lib/browsers";
import { getCheckoutSession } from "@/lib/stripe";
import { fulfilPass, rowPassDays } from "@/lib/pass";
import { entitlementFor } from "@/lib/subscription";
import { maskEmail, PAY_LOGIN_COOKIE, PAY_SESSION_TTL_MS, redeemPayLoginForPass } from "@/lib/pay-login";
import { recordOps } from "@/lib/db";

export const runtime = "nodejs";

/**
 * 09-26 会员单月: back from Checkout with ?pass=cs_… — record the month now, no waiting on the cron.
 * 10-22 通卡: the pass may have been bought without an account. Then the paying browser is signed in to the new
 * address (lib/pay-login.ts rules — once, from the browser that paid, only when the address had nothing before);
 * an address that already has an account gets {signedIn: false, reason: "existing"} and the page asks for an
 * email sign-in. The answer always carries the pass itself (days, ends) so the page can say what was bought.
 */
export async function POST(req: NextRequest) {
  let body: { session?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const sid = typeof body.session === "string" ? body.session : "";
  if (!/^cs_[a-zA-Z0-9_]+$/.test(sid)) return NextResponse.json({ error: "bad_session" }, { status: 400 });
  const c = customerFromRequest(req);
  try {
    const s = await getCheckoutSession(sid);
    // the pass belongs to the account it was bought from (metadata.cust) or the address Stripe collected, whoever is signed in
    const r = await fulfilPass(s);
    if (!r.ok) return NextResponse.json({ error: r.why }, { status: 400 });
    const pass = { days: rowPassDays(r.row), endsAt: r.row.period_end, startsAt: r.row.period_start, scheduled: r.row.status === "scheduled" };
    if (c) {
      return NextResponse.json({ ok: true, signedIn: true, mine: r.row.customer_id === c.customerId, pass, entitlement: await entitlementFor(c.customerId) });
    }
    const login = redeemPayLoginForPass(sid, req.cookies.get(PAY_LOGIN_COOKIE)?.value, r.row);
    if (!login.ok) {
      if (login.reason !== "no_cookie" && login.reason !== "unknown") recordOps("pay_login_skip", `pass ${login.reason} ${sid.slice(0, 14)}`);
      return markCustomer(req, NextResponse.json({ ok: true, signedIn: false, reason: login.reason, pass, email: r.email ? maskEmail(r.email) : null }), login.reason === "existing" ? login.customerId : null, "pay");
    }
    recordOps("pay_login", `pass #${login.customerId} ${sid.slice(0, 14)}`);
    const res = NextResponse.json({ ok: true, signedIn: true, mine: true, pass, email: maskEmail(login.email), entitlement: await entitlementFor(login.customerId) });
    setSessionCookies(res, login.sessionId, PAY_SESSION_TTL_MS);
    markCustomer(req, res, login.customerId, "pay");
    res.cookies.set(PAY_LOGIN_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0 });
    return res;
  } catch (e) {
    return NextResponse.json({ error: "sync_failed", detail: e instanceof Error ? e.message : "unknown" }, { status: 502 });
  }
}
