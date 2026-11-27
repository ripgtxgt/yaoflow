import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { inboxMark } from "@/lib/inbound";

export const runtime = "nodejs";

/** 09-29 客服来信: mark a letter handled (or open again), with an optional note. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{20,64}$/i.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  inboxMark(id, form.get("action") !== "reopen", note);
  const url = new URL("/admin/inbox", (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  return NextResponse.redirect(url, { status: 303 });
}
