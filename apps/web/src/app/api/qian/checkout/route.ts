import { NextRequest, NextResponse } from "next/server";
import { handleQianPersonal } from "@/lib/checkout/qian";

export const runtime = "nodejs";

/**
 * 10-12 解籤 · 次路径: the personal reading checkout.
 * 10-22 进度表 57: a thin shell — the work is lib/checkout/qian.ts, the same handler POST /api/checkout/v2 runs.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  return handleQianPersonal(req, body);
}
