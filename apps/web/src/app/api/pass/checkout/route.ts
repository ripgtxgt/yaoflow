import { NextRequest, NextResponse } from "next/server";
import { handlePass } from "@/lib/checkout/pass";

export const runtime = "nodejs";

/**
 * 09-26 会员单月 · 10-22 通卡 (1 日 / 7 天 / 30 天) checkout.
 * 10-22 进度表 57: a thin shell — the work is lib/checkout/pass.ts, the same handler POST /api/checkout/v2 runs.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  return handlePass(req, body);
}
