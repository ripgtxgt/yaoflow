import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { createSession, customerEmailById, db, markPayLoginUsed, orderBasics, payLoginEligible, payLoginRow, recordOps, rememberPayLogin, type SubscriptionRow } from "./db";

/**
 * 10-02 付款后自动登录 (Neil: 「都做吧」 — 117 of 172 paying readers had never signed in, so the live board shows
 * them as nameless visitors, and they themselves have no 「我的卦」 without asking for an email link).
 *
 * The browser that pays is signed in to the address it paid with — once, at that moment, and only when it is safe:
 *   - At checkout (/api/checkout) the browser gets an httpOnly nonce cookie (yf_pl, 3 h); only its hash is kept,
 *     against the Stripe checkout / payment-intent id. The reading link (?sid=…) alone never signs anyone in — it is
 *     in the delivery email and it may be shared.
 *   - Back on the reading page, /api/pay-login checks: the cookie matches this checkout, the order is a real payment
 *     (status "paid"), it is fresh (3 h), it has not been used for a sign-in before.
 *   - And the address had nothing before this purchase — no other order of any kind, no membership, no session ever
 *     (db.ts payLoginEligible). Anyone can type any address at Stripe; an address that already holds readings must
 *     prove itself with an email link, as before.
 *   - The session is marked via='pay' and lasts 30 days, not 180; when the owner later signs in with an email link,
 *     pay-made sessions on other browsers end (auth.ts redeemLoginToken).
 */
export const PAY_LOGIN_COOKIE = "yf_pl";
export const PAY_LOGIN_TTL_MS = 3 * 3_600_000;
export const PAY_SESSION_TTL_MS = 30 * 86_400_000;

const NONCE_RE = /^[0-9a-f]{48}$/;
const hash = (s: string) => createHash("sha256").update(`yaoflow-pay-login:${s}`).digest("hex");

/** Called where a checkout is created for a browser that is not signed in: remember it, and keep (or give) its nonce. */
export function armPayLogin(req: NextRequest, res: NextResponse, stripeSid: string | null | undefined): void {
  if (!stripeSid) return;
  try {
    const have = req.cookies.get(PAY_LOGIN_COOKIE)?.value ?? "";
    const nonce = NONCE_RE.test(have) ? have : randomBytes(24).toString("hex");
    rememberPayLogin(stripeSid, hash(nonce));
    res.cookies.set(PAY_LOGIN_COOKIE, nonce, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: PAY_LOGIN_TTL_MS / 1000 });
  } catch (e) {
    recordOps("pay_login_arm_fail", (e instanceof Error ? e.message : "?").slice(0, 120));
  }
}

export type PayLoginResult =
  | { ok: true; customerId: number; email: string; sessionId: string }
  | { ok: false; reason: "no_cookie" | "unknown" | "mismatch" | "used" | "stale" | "not_paid" | "existing"; /** 10-02: "existing" — whose paid order this browser started (for the yf_who mark only, never a sign-in) */ customerId?: number };

/** The checks above, and the session when they pass. Pure decision + one insert; the route sets the cookies. */
export function redeemPayLogin(sid: string, nonce: string | undefined, now = Date.now()): PayLoginResult {
  if (!nonce || !NONCE_RE.test(nonce)) return { ok: false, reason: "no_cookie" };
  const row = payLoginRow(sid);
  if (!row) return { ok: false, reason: "unknown" };
  if (row.nonce_hash !== hash(nonce)) return { ok: false, reason: "mismatch" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (now - row.created_at > PAY_LOGIN_TTL_MS) return { ok: false, reason: "stale" };
  const order = orderBasics(sid);
  if (!order || order.status !== "paid" || !order.customer_id || !order.email) return { ok: false, reason: "not_paid" };
  if (!payLoginEligible(order.customer_id, sid, order.created_at)) { markPayLoginUsed(sid); return { ok: false, reason: "existing", customerId: order.customer_id }; }
  const sessionId = randomBytes(32).toString("hex");
  createSession(sessionId, order.customer_id, PAY_SESSION_TTL_MS, "pay");
  markPayLoginUsed(sid);
  return { ok: true, customerId: order.customer_id, email: order.email, sessionId };
}

/** "le***@gmail.com" — enough for the reader to recognise their own address on the page */
export function maskEmail(email: string): string {
  const [u = "", d = ""] = email.split("@");
  return `${u.slice(0, 2)}${u.length > 2 ? "***" : ""}@${d}`;
}

/**
 * 10-22 通卡: the same sign-in for a pass bought without an account (/api/pass/sync). The proof is the pass row the
 * session made, not an orders row; eligibility is the same test with this pass (and a reading that rode along on the
 * same session) left out of "had anything before".
 */
export function redeemPayLoginForPass(sid: string, nonce: string | undefined, pass: Pick<SubscriptionRow, "customer_id" | "stripe_subscription_id" | "created_at">, now = Date.now()): PayLoginResult {
  if (!nonce || !NONCE_RE.test(nonce)) return { ok: false, reason: "no_cookie" };
  const row = payLoginRow(sid);
  if (!row) return { ok: false, reason: "unknown" };
  if (row.nonce_hash !== hash(nonce)) return { ok: false, reason: "mismatch" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (now - row.created_at > PAY_LOGIN_TTL_MS) return { ok: false, reason: "stale" };
  const email = customerEmailById(pass.customer_id);
  if (!email) return { ok: false, reason: "not_paid" };
  const d = db();
  const n = (sql: string, ...a: unknown[]) => ((d.prepare(sql).get(...(a as never[])) as { v: number } | undefined)?.v ?? 0);
  const fresh = n("SELECT COUNT(*) AS v FROM orders WHERE customer_id = ? AND session_id <> ?", pass.customer_id, sid) === 0
    && n("SELECT COUNT(*) AS v FROM subscriptions WHERE customer_id = ? AND stripe_subscription_id <> ?", pass.customer_id, pass.stripe_subscription_id) === 0
    && n("SELECT COUNT(*) AS v FROM sessions WHERE customer_id = ?", pass.customer_id) === 0
    && (() => { const c = d.prepare("SELECT first_seen, last_login_at FROM customers WHERE id = ?").get(pass.customer_id) as { first_seen: number; last_login_at: number | null } | undefined; return !!c && !c.last_login_at && c.first_seen >= pass.created_at - 24 * 3_600_000; })();
  if (!fresh) { markPayLoginUsed(sid); return { ok: false, reason: "existing", customerId: pass.customer_id }; }
  const sessionId = randomBytes(32).toString("hex");
  createSession(sessionId, pass.customer_id, PAY_SESSION_TTL_MS, "pay");
  markPayLoginUsed(sid);
  return { ok: true, customerId: pass.customer_id, email, sessionId };
}
