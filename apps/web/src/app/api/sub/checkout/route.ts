import { NextRequest, NextResponse } from "next/server";
import { handleSubscription } from "@/lib/checkout/sub";

export const runtime = "nodejs";

/**
 * Start a subscription (會員 month / year).
 * 10-22 进度表 57: a thin shell — the work is lib/checkout/sub.ts, the same handler POST /api/checkout/v2 runs.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  return handleSubscription(req, body);
}
