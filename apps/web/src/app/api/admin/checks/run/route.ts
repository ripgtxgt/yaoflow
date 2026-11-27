import { NextRequest, NextResponse } from "next/server";
import { runDueChecks } from "@/lib/ops-checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 10-23 定时核对 (lib/ops-checks.ts) — the server cron, once an hour:
 *   yaoflow-cron.sh api/admin/checks/run                   # run what is due; result kept, mailed to the owner once
 *   yaoflow-cron.sh "api/admin/checks/run?dry=1"           # run every check now; keep nothing, send nothing
 *   yaoflow-cron.sh "api/admin/checks/run?only=<id>"       # run that one now (kept and mailed like a due run)
 * ADMIN_KEY guarded (x-cron-key).
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const ran = await runDueChecks(Date.now(), { dry: sp.get("dry") === "1", only: sp.get("only") });
  return NextResponse.json({ ran });
}
