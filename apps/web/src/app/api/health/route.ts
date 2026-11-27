import { NextResponse } from "next/server";
import { opsSummary } from "@/lib/db";
import { allProvidersDown, providersDown } from "@/lib/llm";
import { generationsInFlight } from "@/lib/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness + a few honest signals, for an external monitor (UptimeRobot keyword
 * check on `"ok":true`) and for a quick look by hand. No secrets, no customer
 * data. `ok` is false when the daily crons have gone quiet or generation is
 * failing repeatedly — the two failures nobody would otherwise notice.
 */
export async function GET() {
  const started = Date.now();
  try {
    const ops = opsSummary();
    const now = Date.now();
    const stale = (t: number | null, hours: number) => t === null || now - t > hours * 3_600_000;
    const problems: string[] = [];
    // "failing now", not "failed today": three failures in 3h with no reading delivered since (09-15)
    if (ops.genDown) problems.push(`gen_down_3h=${ops.genFail3h}`);
    // one host down is routine (the chain covers it); every host down is the alert
    if (allProvidersDown()) problems.push("llm_all_down");
    if (stale(ops.lastRevisitRun, 30)) problems.push("revisit_cron_silent");
    if (stale(ops.lastFulfillRun, 1)) problems.push("fulfill_cron_silent"); // runs every 10 min
    // 503 when unhealthy: a plain HTTP/HEAD monitor (UptimeRobot's default,
    // which sends no body to keyword-match) then alerts on status code alone.
    return NextResponse.json({
      ok: problems.length === 0,
      problems,
      genFail24h: ops.genFail24h,
      genFail3h: ops.genFail3h,
      llmDown: providersDown(),
      generating: generationsInFlight(),
      lastGenOk: ops.lastGenOk,
      genRetry24h: ops.genRetry24h,
      lastRevisitRun: ops.lastRevisitRun,
      lastFulfillRun: ops.lastFulfillRun,
      dbMs: Date.now() - started,
    }, { status: problems.length === 0 ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, problems: ["db_error"], detail: e instanceof Error ? e.message : "unknown" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
