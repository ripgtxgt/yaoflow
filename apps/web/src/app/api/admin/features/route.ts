import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { isFeature, setFeature } from "@/lib/features";
import { recordOps } from "@/lib/db";

export const runtime = "nodejs";

/** 10-15 功能开关: preview (only the admin's browser) → on (everyone) → off, from /admin/features. */
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = await req.formData().catch(() => null);
  const name = f?.get("name"), state = f?.get("state");
  if (!isFeature(name) || (state !== "preview" && state !== "on" && state !== "off")) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  setFeature(name, state);
  recordOps("feature_switch", `${name} → ${state}`);
  // 10-23: the site's own address — behind nginx req.url is http://localhost:3201 (see /api/admin/limits)
  return NextResponse.redirect(new URL("/admin/features?ok=1", (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "")), 303);
}
