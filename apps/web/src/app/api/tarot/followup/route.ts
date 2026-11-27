import { NextRequest, NextResponse } from "next/server";
import { TAROT_TOKEN_RE, tarotDraw } from "@/lib/tarot";
import { answerTarotFollowup } from "@/lib/tarot-personal";
import { record } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HITS = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (HITS.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  HITS.set(ip, list);
  if (HITS.size > 4000) HITS.clear();
  return list.length > 10;
}

/** 10-16 进度表 68: the one follow-up a paid tarot reading includes (same rules as 解籤's). */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: { token?: unknown; question?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const token = typeof body.token === "string" && TAROT_TOKEN_RE.test(body.token) ? body.token : null;
  const question = typeof body.question === "string" ? body.question.replace(/\s+/g, " ").trim() : "";
  if (!token) return NextResponse.json({ error: "no_draw" }, { status: 404 });
  if ([...question].length < 4) return NextResponse.json({ error: "too_short" }, { status: 400 });
  if ([...question].length > 200) return NextResponse.json({ error: "too_long" }, { status: 400 });
  const r = await answerTarotFollowup(token, question);
  if (r.ok) {
    record({ t: Date.now(), e: "tarot", s: token.slice(-12), locale: tarotDraw(token)?.locale ?? "zh-hant", method: r.followup.cast ? "followup:cast" : "followup" });
    return NextResponse.json({ answer: r.followup.answer, cast: r.followup.cast });
  }
  const status = r.why === "no_draw" ? 404 : r.why === "unpaid" ? 402 : r.why === "used" ? 409 : r.why === "no_reading" ? 425 : 502;
  return NextResponse.json({ error: r.why }, { status });
}
