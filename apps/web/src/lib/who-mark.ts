import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

/**
 * 10-02 (Neil: 「这里付过钱的，为什么还是访客呢？」「领过免费的，也应该能查到是谁吧」→「好，都做吧」).
 *
 * `yf_who` says which customer this browser belongs to — for our own live board, nothing else. It is set only in the
 * browser that did something only that customer could: paid (proven by the checkout's own pay-login cookie), claimed a
 * free or gifted reading with their address, spent their allowance, or signed in. It is NOT a sign-in: it opens no
 * account, shows the reader nothing, and no page reads it but the board's two endpoints (api/track, api/pulse). Signed
 * so a hand-made cookie cannot put a stranger's name on the board; 180 days, like a sign-in. The privacy policy says so.
 */
export const WHO_COOKIE = "yf_who";
export const WHO_MAX_AGE_S = 180 * 86_400;

const secret = () => process.env.WHO_SECRET ?? process.env.REVISIT_SECRET ?? process.env.ADMIN_KEY ?? "yaoflow-dev-who";
const sig = (id: number) => createHmac("sha256", secret()).update(`who:${id}`).digest("base64url").slice(0, 22);

export function whoValue(customerId: number): string {
  return `${customerId}.${sig(customerId)}`;
}

/** The customer id a cookie value vouches for, or null (absent, malformed or not ours). */
export function whoFrom(v: string | null | undefined): number | null {
  const m = /^(\d{1,9})\.([A-Za-z0-9_-]{22})$/.exec(v ?? "");
  if (!m) return null;
  const id = Number(m[1]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const a = Buffer.from(m[2]!);
  const b = Buffer.from(sig(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export function setWhoCookie(res: NextResponse, customerId: number | null | undefined): NextResponse {
  if (customerId && customerId > 0) {
    res.cookies.set(WHO_COOKIE, whoValue(customerId), {
      path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: WHO_MAX_AGE_S,
    });
  }
  return res;
}
