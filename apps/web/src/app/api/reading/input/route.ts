import { NextRequest, NextResponse } from "next/server";
import { verifyPaidSession } from "@/lib/paid-store";

export const runtime = "nodejs";

/**
 * The cast behind a delivered reading, for the cast page's `?from=<sid>` door
 * (09-17): a reader who got the light reading can ask for the master reading
 * of the SAME figure without casting again — the six lines, the question and
 * the original instant come back exactly, so the chart is identical and the
 * one-matter gate has nothing to say. The session id is the credential.
 */
export async function GET(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get("sid") ?? "";
  if (!/^[A-Za-z0-9_\-]{8,120}$/.test(sid)) return NextResponse.json({ error: "bad_sid" }, { status: 400 });
  const rec = await verifyPaidSession(sid).catch(() => null);
  if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const i = rec.input;
  return NextResponse.json(
    {
      tier: rec.tier,
      locale: rec.locale,
      question: i.question,
      values: i.values,
      castAtMs: i.castAtMs,
      tzOffsetMinutes: i.tzOffsetMinutes,
      ...(i.scaleHint ? { scaleHint: i.scaleHint } : {}),
      ...(i.topicHint ? { topicHint: i.topicHint } : {}),
      ...(i.situation ? { situation: i.situation } : {}),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
