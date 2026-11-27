import { NextRequest, NextResponse } from "next/server";
import { sweepCardFps } from "@/lib/card-fp";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * 10-07 首次付费保证补洞 — fill in the payment method identifiers of past orders now instead of 30 per cron run:
 *   yaoflow-cron.sh "api/admin/card-fp?limit=600"
 * Counts only (looked / found / none / failed) — never an identifier, an address or an order id.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const limit = Math.max(1, Math.min(2000, Number(req.nextUrl.searchParams.get("limit") ?? 300) || 300));
  const r = await sweepCardFps(limit, 540_000, 150);
  return NextResponse.json(r);
}
