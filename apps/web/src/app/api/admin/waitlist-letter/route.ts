import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { sendWaitlistLetter } from "@/lib/waitlist-letter";

export const runtime = "nodejs";

/** 10-22 进度表 38: the owner's button on /admin/waitlist — the one letter to the 「2027 年卦」 list, once per address */
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = await req.formData().catch(() => null);
  if (f?.get("confirm") !== "yes") return NextResponse.json({ error: "confirm" }, { status: 400 });
  const r = await sendWaitlistLetter();
  // 10-23: the site's own address — behind nginx req.url is http://localhost:3201 (see /api/admin/limits)
  return NextResponse.redirect(new URL(`/admin/waitlist?sent=${r.sent}&failed=${r.failed}&skipped=${r.skipped}`, (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "")), 303);
}
