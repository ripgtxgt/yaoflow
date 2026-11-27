import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

/**
 * 09-27 赠送规则审核 B (Neil: 「A,B,C 一起做吧」): a random first-party cookie per
 * browser, so a gift cannot be claimed on the same device that gave it — the
 * second address someone keeps for themselves still arrives in the same browser.
 * Nothing about the person or their network is in it; it only ever answers
 * "was this the giver's browser?".
 */
export const DEVICE_COOKIE = "yf_dv";
const RE = /^[0-9a-f]{24}$/;

export function deviceOf(req: NextRequest): string | null {
  const v = req.cookies.get(DEVICE_COOKIE)?.value ?? "";
  return RE.test(v) ? v : null;
}

/** The browser's id, minting one when it has none; pass the response to `keepDevice` so it sticks. */
export function deviceFor(req: NextRequest): { id: string; fresh: boolean } {
  const have = deviceOf(req);
  return have ? { id: have, fresh: false } : { id: randomBytes(12).toString("hex"), fresh: true };
}

export function keepDevice<T extends NextResponse>(res: T, d: { id: string; fresh: boolean }): T {
  if (d.fresh) res.cookies.set(DEVICE_COOKIE, d.id, { path: "/", maxAge: 2 * 365 * 86_400, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  return res;
}
