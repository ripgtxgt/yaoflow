import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { browsersOfCustomer } from "@/lib/browsers";
import { eraseBrowserCasts } from "@/lib/cast-log";

export const runtime = "nodejs";

/**
 * 10-03 起卦记录: 「删除这个浏览器的起卦记录」 on a person's trail — for a reader who asks us to forget their casts
 * (an anonymous reader has no account to erase). A customer's id (c<id>) takes every browser filed under them.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const target = String(form.get("target") ?? "");
  const cm = /^c(\d{1,9})$/.exec(target);
  if (!cm && !/^[0-9a-f]{16}$/.test(target)) return NextResponse.json({ error: "bad_target" }, { status: 400 });
  const bids = cm ? browsersOfCustomer(Number(cm[1])).map((b) => b.bid) : [target];
  let n = 0;
  for (const b of bids) n += eraseBrowserCasts(b);
  const url = new URL(`/admin/people/${target}`, (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  if (key) url.searchParams.set("key", key);
  url.searchParams.set("erased", String(n));
  url.hash = "matters";
  return NextResponse.redirect(url, { status: 303 });
}
