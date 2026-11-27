import { NextRequest, NextResponse } from "next/server";
import { db, recordOps } from "@/lib/db";
import { letterUnsubValid, setMemberLetterOff } from "@/lib/member-letter";

export const runtime = "nodejs";

/** 10-22 會員每日信: one click at the bottom of the letter stops it (the membership itself is untouched). */
async function handle(req: NextRequest) {
  const u = (req.nextUrl.searchParams.get("e") ?? "").trim().toLowerCase();
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const l = req.nextUrl.searchParams.get("l") === "zh" ? "zh" : "zh-hant";
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  if (!u || !letterUnsubValid(u, t)) return NextResponse.redirect(`${site}/${l}/account?letter=bad#membership`, 303);
  const r = db().prepare("SELECT id FROM customers WHERE lower(email) = ?").get(u) as { id: number } | undefined;
  if (r) { setMemberLetterOff(r.id, true); recordOps("member_letter_off", `#${r.id}`); }
  return NextResponse.redirect(`${site}/${l}/account?letter=off#membership`, 303);
}
export const GET = handle;
export const POST = handle; // RFC 8058 one-click
