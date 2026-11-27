import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { deletePhoto, readPhoto } from "@/lib/qian-photo-store";
import { recordOps } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 10-14 拍照找籤留存: one kept photo, to the owner only (GET ?id=), or its deletion (POST id). */
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, null))) return new NextResponse("forbidden", { status: 403 });
  const buf = readPhoto(req.nextUrl.searchParams.get("id") ?? "");
  if (!buf) return new NextResponse("not found", { status: 404 });
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, null))) return new NextResponse("forbidden", { status: 403 });
  const form = await req.formData().catch(() => null);
  const id = String(form?.get("id") ?? "");
  const ok = deletePhoto(id);
  if (ok) recordOps("qian_photo_delete", id.slice(0, 12));
  return NextResponse.redirect(new URL(`/admin/qian/photos${ok ? "?deleted=1" : ""}`, (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "")), { status: 303 });
}
