import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { isPromoSurface, setPromoPick } from "@/lib/promo";

export const runtime = "nodejs";

/** 10-22 进度表 58 ②: the owner's pick for a 「也可以試試」 strip, from /admin/features (form: surface, id[]) */
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = await req.formData().catch(() => null);
  const surface = f?.get("surface");
  if (!isPromoSurface(surface)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const ids = (f?.getAll("id") ?? []).filter((x): x is string => typeof x === "string");
  setPromoPick(surface, ids);
  // 10-23: the site's own address — behind nginx req.url is http://localhost:3201 (see /api/admin/limits)
  return NextResponse.redirect(new URL("/admin/features?promo=1#promo", (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "")), 303);
}
