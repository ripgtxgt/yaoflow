import { NextRequest, NextResponse } from "next/server";
import { listCheckoutSessions } from "@/lib/stripe";
import { planSeq } from "@/lib/recover-seq";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 10-12 挽回信序列 — a look at the plan, from the server only (counts, never an address):
 *   yaoflow-cron.sh api/admin/recover-seq     # how many letters are due now, which steps, and why the rest are not
 * The letters themselves go from the fulfil cron, once an hour (lib/recover-seq.ts runSeq).
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sessions = await listCheckoutSessions(Math.floor(Date.now() / 1000) - 6 * 86_400);
  const plan = planSeq(sessions);
  const steps: Record<string, number> = {};
  for (const x of plan.due) steps[`${x.kind}-${x.step}`] = (steps[`${x.kind}-${x.step}`] ?? 0) + 1;
  return NextResponse.json({ sessions: sessions.length, ticked: sessions.filter((s) => s.metadata?.remind === "1").length, due: plan.due.length, steps, skipped: plan.skipped });
}
