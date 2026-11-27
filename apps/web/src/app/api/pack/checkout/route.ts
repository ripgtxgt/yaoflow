import { NextRequest, NextResponse } from "next/server";
import { handlePack } from "@/lib/checkout/pack";

export const runtime = "nodejs";

/**
 * 09-29 会员增购包 checkout.
 * 10-22 进度表 57: a thin shell — the work is lib/checkout/pack.ts, the same handler POST /api/checkout/v2 runs.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  return handlePack(req, body);
}
