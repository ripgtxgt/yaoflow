import { NextRequest, NextResponse } from "next/server";
import { homeDay } from "@/lib/clock";
import { PILES } from "@/lib/daily";
import { dailyStats, dailyVote } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 09-26 今天的三卦: a pick or a one-tap reaction, keyed by the anonymous
 * browser-session tag the page already sends with every event (no id, no IP
 * kept) — and back comes what everyone else did with this pile today.
 */
export async function POST(req: NextRequest) {
  let body: { pile?: unknown; bs?: unknown; reaction?: unknown; day?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const pile = Number(body.pile);
  const bs = typeof body.bs === "string" && /^[a-z0-9]{6,24}$/.test(body.bs) ? body.bs : null;
  const day = homeDay(Date.now());
  if (!(PILES as readonly number[]).includes(pile) || !bs) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  if (typeof body.day === "string" && body.day !== day) return NextResponse.json({ error: "stale_day", day }, { status: 409 });
  const reaction = body.reaction === "hit" || body.reaction === "miss" ? body.reaction : null;
  dailyVote(day, bs, pile, reaction);
  return NextResponse.json(dailyStats(day, pile), { headers: { "Cache-Control": "no-store" } });
}
