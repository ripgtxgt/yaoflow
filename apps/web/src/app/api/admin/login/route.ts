import { NextRequest, NextResponse } from "next/server";
// 09-25: behind nginx, req.url is http://localhost:3200 — the browser was sent to localhost (Neil)
const base = (req: NextRequest) => (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
import { ADMIN_COOKIE, ADMIN_COOKIE_OPTIONS, adminToken } from "@/lib/admin-auth";

export const runtime = "nodejs";

/** The dashboard's login form: the key once, then a cookie for a month (09-18). */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const key = form?.get("key");
  const back = String(form?.get("back") ?? "/admin");
  const target = /^\/admin(\/|$|\?)/.test(back) ? back : "/admin";
  if (typeof key !== "string" || !process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return NextResponse.redirect(new URL(`${target}${target.includes("?") ? "&" : "?"}denied=1`, base(req)), 303);
  }
  const token = await adminToken();
  const res = NextResponse.redirect(new URL(target, base(req)), 303);
  if (token) res.cookies.set(ADMIN_COOKIE, token, ADMIN_COOKIE_OPTIONS);
  return res;
}

/** Sign out: clear the cookie. */
export async function DELETE(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/admin", base(req)), 303);
  res.cookies.set(ADMIN_COOKIE, "", { ...ADMIN_COOKIE_OPTIONS, maxAge: 0 });
  return res;
}
