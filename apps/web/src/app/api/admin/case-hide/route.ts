import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { hideCase } from "@/lib/db";
import { PUBLIC_ID_RE } from "@/lib/cases";

export const runtime = "nodejs";

/** Moderation from the dashboard: take a public case down (ADMIN_KEY in the form). The owner's reading is untouched. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, typeof key === "string" ? key : null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = String(form.get("public_id") ?? "");
  if (!PUBLIC_ID_RE.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  hideCase(id);
  const back = String(form.get("back") ?? "/admin");
  const url = new URL(back, (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  url.searchParams.set("key", key);
  return NextResponse.redirect(url, { status: 303 });
}
