import { NextRequest, NextResponse } from "next/server";
import { mendCandidates, runReportMend } from "@/lib/mingli/report-mend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 10-22 (客服核对): the server's own cron (every 10 minutes, five past — never alongside the fulfil sweep) finishes
 * one paid report whose writing stopped half way, and sends the letter it is owed. lib/mingli/report-mend.ts.
 * Guarded by ADMIN_KEY like every cron door; ?dry=1 lists what would be mended.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (req.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({ due: mendCandidates().map((p) => ({ sys: p.sys, token: p.token.slice(0, 8), status: p.status, rounds: p.rounds })) });
  }
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const done = await runReportMend(site);
  return NextResponse.json({ ok: true, mended: done.map((r) => ({ ...r, token: r.token.slice(0, 8) })) });
}
