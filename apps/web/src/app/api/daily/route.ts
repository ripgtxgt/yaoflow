import { NextRequest, NextResponse } from "next/server";
import { asLocale } from "@/lib/locales";
import { homeDay } from "@/lib/clock";
import { PILES, dailyRead, type Pile } from "@/lib/daily";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** a pile a minute is plenty for a curious visitor (09-21) */
const HITS = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (HITS.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  HITS.set(ip, list);
  if (HITS.size > 4000) HITS.clear();
  return list.length > 30;
}

/**
 * 大众一卦 (09-21, A2): the words for one of today's three public charts,
 * written the first time anyone in this language picks it and cached for the
 * day. Only today's day key is served — the page derives the figures from it,
 * so an old day would render words against a chart nobody can see.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const q = req.nextUrl.searchParams;
  const pile = Number(q.get("pile"));
  const locale = asLocale(q.get("locale"));
  const today = homeDay(Date.now());
  const day = q.get("day") ?? today;
  if (!(PILES as readonly number[]).includes(pile)) return NextResponse.json({ error: "bad_pile" }, { status: 400 });
  if (day !== today) return NextResponse.json({ error: "stale_day", day: today }, { status: 409 });

  const read = await dailyRead(day, locale, pile as Pile);
  if (!read) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  return NextResponse.json({ note: read.note, watch: read.watch }, { headers: { "Cache-Control": "no-store" } });
}
