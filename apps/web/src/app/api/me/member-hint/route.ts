import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { WHO_COOKIE, whoFrom } from "@/lib/who-mark";
import { bidOf } from "@/lib/browsers";
import { browserIsMember } from "@/lib/member-hint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 11-10 (lib/member-hint.ts): is this signed-out browser a member's? A yes or no, nothing else. */
export async function GET(req: NextRequest) {
  if (customerFromRequest(req)) return NextResponse.json({ member: false });
  let member = false;
  try { member = browserIsMember(whoFrom(req.cookies.get(WHO_COOKIE)?.value), bidOf(req)); } catch { member = false; }
  return NextResponse.json({ member }, { headers: { "Cache-Control": "private, no-store" } });
}
