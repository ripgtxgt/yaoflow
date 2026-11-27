import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { markCasePosted } from "@/lib/db";
import { PUBLIC_ID_RE } from "@/lib/cases";

export const runtime = "nodejs";

/** 09-26: Neil posted this case's draft to Threads — take it off the draft list. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = String(form.get("public_id") ?? "");
  if (!PUBLIC_ID_RE.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  markCasePosted(id);
  const back = String(form.get("back") ?? "/admin");
  const url = new URL(back.startsWith("/") ? back : "/admin", (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  return NextResponse.redirect(url, { status: 303 });
}
