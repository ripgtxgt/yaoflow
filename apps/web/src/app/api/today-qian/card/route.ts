import { NextRequest, NextResponse } from "next/server";
import { handleQianCard } from "@/lib/checkout/card";

export const runtime = "nodejs";

/**
 * 10-14 进度表 50 籤卡 checkout.
 * 10-22 进度表 57: a thin shell — the work is lib/checkout/card.ts, the same handler POST /api/checkout/v2 runs.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  return handleQianCard(req, body);
}
