import { NextRequest, NextResponse } from "next/server";
import { markSavedCast, savedCastByToken, setSavedTeaser } from "@/lib/db";
import { SAVED_KEEP_MS } from "@/lib/saved-cast";
import { timingHint } from "@/lib/timing-hint";
import { fallbackTeaser, generateTeaser } from "@/lib/teaser";
import { resolveServerChart, type ReadingInput } from "@/lib/reading";
import { asLocale } from "@/lib/locales";
import type { LineValue } from "@yaoflow/engine";

export const runtime = "nodejs";

/**
 * 10-02 存到信箱: the letter's link brings the same figure back to the cast page — question, six lines, instant, and the
 * free line exactly as the letter quoted it (no second model call), with the rules' timing hint counted from today.
 *
 * 10-04 挽回信: the same link brings back an unpaid cast from a reminder letter (origin 'recover'). Such a cast may never
 * have had its free line kept; it is written here once, at the cast's own instant (a cast days old, read at "now",
 * would be a different chart), and kept on the row.
 */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{48}$/.test(t)) return NextResponse.json({ error: "bad_token" }, { status: 400 });
  const row = savedCastByToken(t);
  if (!row || row.created_at < Date.now() - SAVED_KEEP_MS) return NextResponse.json({ error: "not_found" }, { status: 404 });
  markSavedCast(row.id, "opened_at");
  let values: number[] = [];
  try { values = JSON.parse(row.values_json) as number[]; } catch { /* a row we wrote ourselves */ }
  const input = { question: row.question, values: values as LineValue[], castAtMs: row.cast_at, tzOffsetMinutes: row.tz_offset } as ReadingInput;
  // 10-04: the figure is charted at its own instant however old it is, and only windows still ahead of today count
  const timing = values.length === 6 ? timingHint(input, { stored: true, asOf: Date.now() }) : null;
  let teaser = row.teaser;
  if (!teaser && row.origin === "recover" && values.length === 6) {
    const locale = asLocale(row.locale);
    teaser = await generateTeaser(input, locale, undefined, true).catch(() => null);
    if (!teaser) teaser = fallbackTeaser(resolveServerChart(input, true).cast.changingPositions.length === 0, locale);
    setSavedTeaser(row.id, teaser);
  }
  return NextResponse.json(
    { question: row.question, values, castAtMs: row.cast_at, tzOffsetMinutes: row.tz_offset, locale: row.locale, teaser, timing, origin: row.origin ?? "saved" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
