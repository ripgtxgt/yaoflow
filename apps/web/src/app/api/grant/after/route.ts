import { NextRequest, NextResponse } from "next/server";
import { afterContext, TOKEN_RE } from "@/lib/grants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 回访奖励 (09-21): what the cast page shows a reader holding a "what comes
 * next" link — the matter and the call it follows, and whether the link is
 * still open. The question is the reader's own, so it is theirs to see.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "bad_token" }, { status: 400 });
  const ctx = afterContext(token);
  if (!ctx) return NextResponse.json({ error: "unknown_token" }, { status: 404 });
  return NextResponse.json({ ...ctx, sid: ctx.state === "used" ? `gr_${token}` : null }, { headers: { "Cache-Control": "no-store" } });
}
