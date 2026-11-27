import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { FLAG_COOKIE_NAME } from "./auth-flag";
import type { NextRequest, NextResponse } from "next/server";
import {
  bumpLoginCodeTries, consumeLoginRow, consumeLoginToken, createLoginToken, createSession, customerForSession, deleteSession, dropPaySessions,
  liveLoginCodes, recentLoginTokens, upsertCustomer, type SessionCustomer, setMarketingConsent } from "./db";

/**
 * Accounts without passwords. An email address IS the account: a magic link
 * proves possession of the mailbox, the same address Stripe reports on a
 * purchase, so paid readings and logins meet in one customer row.
 *
 * Tokens are stored hashed (a leaked database cannot log anyone in); the
 * session id is 32 random bytes in an httpOnly cookie. A second, readable
 * cookie only says "someone is signed in" so the static header can show
 * "my casts" instead of "sign in" without any server round-trip.
 */

export const SESSION_COOKIE = "yf_session";
export const FLAG_COOKIE = FLAG_COOKIE_NAME;
export const TOKEN_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 180 * 86_400_000;
/** links per address per hour — enough for a mistyped address, useless for flooding a stranger's inbox */
export const LINKS_PER_HOUR = 5;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

/**
 * 10-02 登录码 (Neil: 「好，都做吧」 — hmp4 asked for a link inside Threads, the link signed in Safari, and the Threads
 * tab paid as a guest): every letter also carries a six-digit code, typed on the page the reader is already on.
 * Stored hashed with the address; five wrong codes and that letter's code is dead (its link still works); at most
 * LINKS_PER_HOUR letters an hour — so a stranger gets at most ~25 guesses an hour at one in a million.
 */
export const CODE_TRIES = 5;
const codeHash = (email: string, code: string) => hash(`code:${email.trim().toLowerCase()}:${code}`);

/** Mint a login token for an address; the raw token for the link and the code for the letter, or null when throttled. */
export function issueLoginToken(email: string, locale: string, nextPath: string | null, notify = false): { raw: string; code: string } | null {
  const e = email.trim().toLowerCase();
  if (recentLoginTokens(e, 3_600_000) >= LINKS_PER_HOUR) return null;
  const raw = randomBytes(32).toString("hex");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  createLoginToken({ email: e, tokenHash: hash(raw), locale, nextPath, ttlMs: TOKEN_TTL_MS, notify, codeHash: codeHash(e, code) });
  return { raw, code };
}

type Started = { sessionId: string; customerId: number; email: string; locale: string | null; nextPath: string | null };
function startSession(t: { email: string; locale: string | null; nextPath: string | null; notify: boolean }): Started {
  const customerId = upsertCustomer(t.email, t.locale ?? undefined);
  // the box on the sign-in form counts only once the address proved it is theirs
  if (t.notify) setMarketingConsent(t.email, true);
  const sessionId = randomBytes(32).toString("hex");
  createSession(sessionId, customerId, SESSION_TTL_MS);
  // 10-02: the mailbox is proven now — sessions only a payment made (lib/pay-login.ts), on other browsers, end
  dropPaySessions(customerId, sessionId);
  return { sessionId, customerId, email: t.email, locale: t.locale, nextPath: t.nextPath };
}

/** Exchange a raw token for a session; null when the link is unknown, used or expired. */
export function redeemLoginToken(raw: string): Started | null {
  if (!/^[0-9a-f]{64}$/.test(raw)) return null;
  const t = consumeLoginToken(hash(raw));
  if (!t) return null;
  return startSession(t);
}

/** 10-02: the same, by the six digits in the letter — in the browser the reader typed them into. */
export function redeemLoginCode(email: string, typed: string, now = Date.now()): ({ ok: true } & Started) | { ok: false; reason: "bad" | "expired" | "too_many" } {
  const e = email.trim().toLowerCase();
  const code = typed.replace(/\D/g, "");
  if (!e || code.length !== 6) return { ok: false, reason: "bad" };
  const live = liveLoginCodes(e, now);
  const open = live.filter((r) => r.code_tries < CODE_TRIES);
  if (!open.length) return { ok: false, reason: live.length ? "too_many" : "expired" };
  const want = codeHash(e, code);
  const hit = open.find((r) => safeEqual(r.code_hash, want));
  if (!hit) {
    bumpLoginCodeTries(e, now);
    return { ok: false, reason: open.every((r) => r.code_tries + 1 >= CODE_TRIES) ? "too_many" : "bad" };
  }
  if (!consumeLoginRow(hit.id, now)) return { ok: false, reason: "expired" };
  return { ok: true, ...startSession({ email: hit.email, locale: hit.locale, nextPath: hit.next_path, notify: hit.notify === 1 }) };
}

const cookieBase = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export function setSessionCookies(res: NextResponse, sessionId: string, ttlMs = SESSION_TTL_MS): void {
  res.cookies.set(SESSION_COOKIE, sessionId, { ...cookieBase, httpOnly: true, maxAge: ttlMs / 1000 });
  res.cookies.set(FLAG_COOKIE, "1", { ...cookieBase, httpOnly: false, maxAge: ttlMs / 1000 });
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieBase, httpOnly: true, maxAge: 0 });
  res.cookies.set(FLAG_COOKIE, "", { ...cookieBase, httpOnly: false, maxAge: 0 });
}

const validSid = (x: string | undefined | null): x is string => !!x && /^[0-9a-f]{64}$/.test(x);

/** The signed-in customer for a server component / server action (reads the request cookies). */
export async function currentCustomer(): Promise<SessionCustomer | null> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!validSid(sid)) return null;
  return customerForSession(sid);
}

/** The signed-in customer for a route handler. */
export function customerFromRequest(req: NextRequest): SessionCustomer | null {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!validSid(sid)) return null;
  return customerForSession(sid);
}

export function endSession(req: NextRequest): void {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (validSid(sid)) deleteSession(sid);
}

/** Constant-time string compare for secrets (webhook signatures, admin keys). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Only ever send people back to our own pages after login. */
export function safeNextPath(x: unknown): string | null {
  return typeof x === "string" && /^\/[a-z-]{2,7}(\/[A-Za-z0-9\-_/?=&%.]*)?$/.test(x) && !x.startsWith("//") ? x : null;
}
