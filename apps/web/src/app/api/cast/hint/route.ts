import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bidOf } from "@/lib/browsers";
import { cleanOutcomeHint } from "@/lib/cast-log";

export const runtime = "nodejs";

/**
 * 10-14 进度表 46: 「怎樣算有結果？」 typed (or changed) after the coins were already thrown — written onto that cast's
 * row of this browser. Private like the question; an empty line clears it.
 */
export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const bid = bidOf(req);
  const at = Number(b.castAtMs);
  if (!bid || !Number.isFinite(at)) return NextResponse.json({});
  const hint = cleanOutcomeHint(b.outcomeHint);
  db().prepare("UPDATE cast_log SET outcome_hint = ? WHERE bid = ? AND at = ?").run(hint, bid, at);
  return NextResponse.json({ ok: true });
}
