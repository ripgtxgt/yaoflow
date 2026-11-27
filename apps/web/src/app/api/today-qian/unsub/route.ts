import { NextRequest, NextResponse } from "next/server";
import { unsubValid } from "@/lib/unsub";
import { db } from "@/lib/db";
import { setPrefs } from "@/lib/today-qian";

export const runtime = "nodejs";

/** 10-14 进度表 50: one click in the morning letter stops it (the lot itself stays on the page). */
async function handle(req: NextRequest) {
  const u = (req.nextUrl.searchParams.get("u") ?? "").trim().toLowerCase();
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const l = req.nextUrl.searchParams.get("l") === "zh" ? "zh" : "zh-hant";
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  if (!u || !unsubValid(`tq:${u}`, t)) return NextResponse.redirect(`${site}/${l}/today-qian?mail=bad`, 303);
  const r = db().prepare("SELECT id FROM customers WHERE lower(email) = ?").get(u) as { id: number } | undefined;
  if (r) setPrefs(`c:${r.id}`, { mail: false });
  return NextResponse.redirect(`${site}/${l}/today-qian?mail=off`, 303);
}
export const GET = handle;
export const POST = handle; // RFC 8058 one-click
