import type { NextRequest } from "next/server";
import type { Marks } from "./presence";
import { customerEmailById } from "./db";
import { WHO_COOKIE, whoFrom } from "./who-mark";

/**
 * 10-02: the marker cookies a request already carries, read for the live board (lib/presence.ts Marks).
 * Names only — the values say nothing about who it is. yf_fd: a paid full reading in this browser
 * (components/FirstDeepMark); yf_il / yf_ff: a free first reading used (lib/grants, api/checkout);
 * yf_session without a signed-in customer: a sign-in that has ended.
 */
export function marksFrom(req: NextRequest, signedIn: boolean): Marks {
  const has = (n: string) => !!req.cookies.get(n)?.value;
  return { paid: has("yf_fd"), free: has("yf_il") || has("yf_ff"), was: !signedIn && has("yf_session") };
}

/**
 * 10-02: the customer a not-signed-in browser's yf_who mark names (lib/who-mark.ts), with their address for the board.
 * Looked up at most once every ten minutes per customer; an erased customer is simply not found.
 */
const KNOWN = new Map<number, { email: string | null; at: number }>();
export function knownFrom(req: NextRequest, signedIn: boolean, now = Date.now()): { id: number; email: string } | null {
  if (signedIn) return null;
  const id = whoFrom(req.cookies.get(WHO_COOKIE)?.value);
  if (!id) return null;
  let hit = KNOWN.get(id);
  if (!hit || now - hit.at > 600_000) {
    let email: string | null = null;
    try { email = customerEmailById(id); } catch { /* the board is best-effort */ }
    hit = { email, at: now };
    KNOWN.set(id, hit);
    if (KNOWN.size > 5000) KNOWN.clear();
  }
  return hit.email ? { id, email: hit.email } : null;
}
