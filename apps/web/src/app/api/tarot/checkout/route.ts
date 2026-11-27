import { NextRequest, NextResponse } from "next/server";
import { handleTarot } from "@/lib/checkout/tarot";

export const runtime = "nodejs";

/**
 * 10-16 进度表 68 線上塔羅 · personal reading checkout.
 * 10-22 进度表 57: a thin shell — the work is lib/checkout/tarot.ts, the same handler POST /api/checkout/v2 runs.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  return handleTarot(req, body);
}
