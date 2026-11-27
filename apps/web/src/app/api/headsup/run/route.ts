import { NextRequest, NextResponse } from "next/server";
import { runDayOf, runHeadsUps } from "@/lib/headsup";
import { letterOn } from "@/lib/letter-switch";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 应期提醒 runner (09-23). The daily cron calls ?mode=week; ?mode=first was
 * the one-time first round. Guarded by ADMIN_KEY like every runner; ?dry=1
 * counts without sending.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  // 09-23: ?mode=day — the short letter on the first named day (its own cron line, after the week run)
  // 10-23 进度表 108: each of the two letters can be turned off in /admin/letters
  if (req.nextUrl.searchParams.get("mode") === "day") return NextResponse.json(!dry && !letterOn("dayof") ? { off: true } : await runDayOf({ dry, pauseMs: 600 }));
  if (!dry && !letterOn("headsup")) return NextResponse.json({ off: true });
  const mode = req.nextUrl.searchParams.get("mode") === "first" ? "first" : "week";
  const r = await runHeadsUps(mode, { dry, pauseMs: 600 });
  return NextResponse.json(r);
}
