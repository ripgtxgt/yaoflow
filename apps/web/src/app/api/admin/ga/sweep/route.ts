import { NextRequest, NextResponse } from "next/server";
import { sweepGaPurchases } from "@/lib/ga-mp";
import { gaReports } from "@/lib/ga-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 10-27 Google Analytics, hourly (server cron at :20):
 *   yaoflow-cron.sh api/admin/ga/sweep          # paid orders → GA purchases, refunds → GA refunds; refresh the GA reports
 *   yaoflow-cron.sh "api/admin/ga/sweep?dry=1"  # count only
 * ADMIN_KEY guarded (x-cron-key).
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const mp = await sweepGaPurchases(Date.now(), { dry });
  const rep = dry ? null : await gaReports({ fresh: true }).catch(() => null);
  return NextResponse.json({ mp, reports: rep ? { at: rep.at, n: Object.keys(rep.tables).length, error: rep.error ?? null } : null });
}
