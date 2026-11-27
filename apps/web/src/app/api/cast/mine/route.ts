import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { timingHint } from "@/lib/timing-hint";
import { fallbackTeaser, generateTeaser } from "@/lib/teaser";
import { resolveServerChart, type ReadingInput } from "@/lib/reading";
import { asLocale } from "@/lib/locales";
import type { LineValue } from "@yaoflow/engine";

export const runtime = "nodejs";

/**
 * 10-26 (Neil: 「用户是不能从我的里面去打开之前的卦吗？」): a cast kept in 「我的」 without a reading (the free line only)
 * opens back on the cast page — question, six lines, its own instant, and the free line it was given (or one written now,
 * at the cast's own instant, and kept). Same shape as /api/cast/saved. Only the owner's own cast.
 */
export async function GET(req: NextRequest) {
  const me = customerFromRequest(req);
  if (!me) return NextResponse.json({ error: "need_login" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const c = db().prepare("SELECT id, question, values_str, cast_at, tz_offset, locale FROM casts WHERE id = ? AND customer_id = ?")
    .get(id, me.customerId) as { id: number; question: string; values_str: string; cast_at: number; tz_offset: number; locale: string } | undefined;
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const values = c.values_str.split(",").map(Number) as LineValue[];
  if (values.length !== 6) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const input = { question: c.question, values, castAtMs: c.cast_at, tzOffsetMinutes: c.tz_offset } as ReadingInput;
  const timing = timingHint(input, { stored: true, asOf: Date.now() });
  // the free line it was given, from the log of a browser this account signed in on
  const log = db().prepare(
    `SELECT l.id, l.teaser FROM cast_log l JOIN browser_links b ON b.bid = l.bid AND b.customer_id = ?
     WHERE l.at = ? AND l.values_str = ? ORDER BY (l.teaser IS NULL), l.id DESC LIMIT 1`,
  ).get(me.customerId, c.cast_at, values.join("")) as { id: number; teaser: string | null } | undefined;
  let teaser = log?.teaser ?? null;
  if (!teaser) {
    const locale = asLocale(c.locale);
    teaser = await generateTeaser(input, locale, undefined, true).catch(() => null);
    if (!teaser) teaser = fallbackTeaser(resolveServerChart(input, true).cast.changingPositions.length === 0, locale);
    if (log) db().prepare("UPDATE cast_log SET teaser = ? WHERE id = ? AND teaser IS NULL").run(teaser, log.id);
  }
  return NextResponse.json(
    { question: c.question, values, castAtMs: c.cast_at, tzOffsetMinutes: c.tz_offset, locale: c.locale, teaser, timing, origin: "mine" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
