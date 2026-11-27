import { NextRequest, NextResponse } from "next/server";
import { writePromoStats } from "@/lib/promo-stats";
import { recordOps } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 11-01 T-014 ②: the promotion runs' numbers file — the server cron at 00:10 台北 (16:10 UTC):
 *   yaoflow-cron.sh api/admin/promo-stats/run          # yesterday (and on Mondays the week) → ~/yaoflow-data/promo-stats/
 *   yaoflow-cron.sh "api/admin/promo-stats/run?at=<ms>" # as if run at that moment (to fill a missed day)
 * Aggregates only. ADMIN_KEY guarded (x-cron-key).
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const at = Number(req.nextUrl.searchParams.get("at"));
  try {
    const files = writePromoStats(Number.isFinite(at) && at > 0 ? at : Date.now());
    return NextResponse.json({ files: files.map((f) => f.split("/").slice(-2).join("/")) });
  } catch (e) {
    recordOps("promo_stats_fail", e instanceof Error ? e.message.slice(0, 160) : "?");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
