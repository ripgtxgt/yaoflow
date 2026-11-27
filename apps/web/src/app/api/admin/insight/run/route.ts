import { NextRequest, NextResponse } from "next/server";
import { runInsight } from "@/lib/daily-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 10-26 daily 運營摘要 (lib/daily-insight.ts) — the server cron at 08:05 Taipei (00:05 UTC):
 *   yaoflow-cron.sh api/admin/insight/run            # build yesterday's, mail it to the owner once
 *   yaoflow-cron.sh "api/admin/insight/run?dry=1"    # build and keep it, mail nothing
 * ADMIN_KEY guarded (x-cron-key).
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await runInsight(Date.now(), { dry: req.nextUrl.searchParams.get("dry") === "1" }));
}
