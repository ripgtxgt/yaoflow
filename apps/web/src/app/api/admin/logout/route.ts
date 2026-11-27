import { NextRequest, NextResponse } from "next/server";
// 09-25: behind nginx, req.url is http://localhost:3200 — the browser was sent to localhost (Neil)
const base = (req: NextRequest) => (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
import { ADMIN_COOKIE, ADMIN_COOKIE_OPTIONS } from "@/lib/admin-auth";

export const runtime = "nodejs";

/** The 退出 button (09-18): a plain form can only POST, so sign-out lives here; clears the cookie and lands on the login form. */
export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/admin", base(req)), 303);
  res.cookies.set(ADMIN_COOKIE, "", { ...ADMIN_COOKIE_OPTIONS, maxAge: 0 });
  return res;
}
