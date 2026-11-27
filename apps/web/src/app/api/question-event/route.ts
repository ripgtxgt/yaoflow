import { NextRequest, NextResponse } from "next/server";
import { publicEventFacts } from "@/lib/public-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 11-05 进度表 140: POST { question, tz } → { status, date, result? } | {} — asked by the cast page once typing stops, so a
 * question about a match already played says so before the coins (lib/public-event.ts does the sorting, the search and
 * the checks; one search per event per day). Only public events ever leave for the search; anything else returns {}.
 */
const BUCKET = new Map<string, { n: number; t: number }>();
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const b = BUCKET.get(ip);
  if (!b || now - b.t > 10 * 60_000) BUCKET.set(ip, { n: 1, t: now }); else if (++b.n > 12) return NextResponse.json({});
  if (BUCKET.size > 5000) BUCKET.clear();
  const body = (await req.json().catch(() => null)) as { question?: unknown; tz?: unknown } | null;
  const q = typeof body?.question === "string" ? body.question.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  if (q.length < 6) return NextResponse.json({});
  const tz = typeof body?.tz === "number" && Math.abs(body.tz) <= 840 ? body.tz : 480;
  const today = new Date(now + tz * 60_000).toISOString().slice(0, 10);
  const f = await publicEventFacts(q, today).catch(() => null);
  if (!f) return NextResponse.json({});
  return NextResponse.json({ status: f.status, date: f.date, ...(f.result ? { result: f.result } : {}) });
}
