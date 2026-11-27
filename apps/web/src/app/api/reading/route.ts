import { NextRequest, NextResponse } from "next/server";
import { fileCast } from "@/lib/matter-assign";
import { parseOdds, parseSituation } from "@/lib/situation";
import { ipTag } from "@/lib/ip-tag";
import { asLocale } from "@/lib/locales";
import { questionIssue } from "@/lib/question-check";
import { resolveReadingLocale } from "@/lib/question-lang";
import { readCastExtras } from "@/lib/cast-extras";
import { toHans } from "@/lib/hant";
import type { LineValue } from "@yaoflow/engine";
import { castExists, recordOps, saveCast, saveReading } from "@/lib/db";
import { generateReading } from "@/lib/generate";
import { paywallOn } from "@/lib/paywall";
import { resolveServerChart, type ReadingInput, type Tier } from "@/lib/reading";
import { classifyTopic } from "@/lib/topic";
import { parseScaleHint, parseTopicHint } from "@/lib/hints";
import { customerFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Naive per-instance rate limit for the free beta: 12 generations / 10 min / IP. */
const BUCKET = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const b = BUCKET.get(ip);
  if (!b || now - b.t > 10 * 60_000) {
    BUCKET.set(ip, { n: 1, t: now });
    return false;
  }
  b.n += 1;
  return b.n > 12;
}

const VALID_VALUES = new Set([6, 7, 8, 9]);

/**
 * Global daily cap on free generations (per instance, UTC day). Per-IP limits
 * do nothing against a rotating-IP script; this bounds the worst case to a
 * known model bill. FREE_DAILY_CAP env overrides; default 300.
 */
let dayKey = "";
let dayCount = 0;
function overDailyCap(): boolean {
  const k = new Date().toISOString().slice(0, 10);
  if (k !== dayKey) { dayKey = k; dayCount = 0; }
  dayCount += 1;
  return dayCount > Number(process.env.FREE_DAILY_CAP ?? 300);
}

export async function POST(req: NextRequest) {
  // when the paywall is live, free generation closes — paid flow goes through /api/checkout + /reading?sid=
  if (paywallOn()) {
    return NextResponse.json({ error: "payment_required" }, { status: 402 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  if (overDailyCap()) {
    recordOps("free_cap_hit", ipTag(ip));
    return NextResponse.json({ error: "busy" }, { status: 503 });
  }

  let body: Partial<ReadingInput> & { tier?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const tier: Tier = body.tier === "deep" ? "deep" : "one";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const values = Array.isArray(body.values) ? body.values : [];
  if (question.length < 2 || question.length > 500) {
    return NextResponse.json({ error: "bad_question" }, { status: 400 });
  }
  // 09-20: a sigh is not a matter — the page refuses these too; this is the backstop
  if (questionIssue(question, asLocale((body as { locale?: unknown }).locale))) {
    return NextResponse.json({ error: "bad_question" }, { status: 400 });
  }
  if (values.length !== 6 || !values.every((v) => VALID_VALUES.has(v as number))) {
    return NextResponse.json({ error: "bad_values" }, { status: 400 });
  }

  try {
    const input: ReadingInput = {
      question,
      values: values as LineValue[],
      castAtMs: Number(body.castAtMs),
      tzOffsetMinutes: Number(body.tzOffsetMinutes),
      scaleHint: parseScaleHint((body as { scaleHint?: unknown }).scaleHint),
      topicHint: parseTopicHint((body as { topicHint?: unknown }).topicHint),
      situation: parseSituation((body as { situation?: unknown }).situation),
    ...(parseOdds((body as { teaserOdds?: unknown }).teaserOdds) ? { teaserOdds: parseOdds((body as { teaserOdds?: unknown }).teaserOdds) } : {}),
    };
    // the reading follows the language the question was written in (09-17)
    const loc = resolveReadingLocale(input.question, asLocale((body as { locale?: unknown }).locale), (body as { rl?: unknown }).rl);
    Object.assign(input, readCastExtras(body, input.question, loc, req.headers));   // Cantonese register / what they were told last time (09-18)
    const reading = await generateReading(tier, input, false, loc);

    // Free-beta persistence: everything a customer generates is kept
    // (Privacy Policy §4) — anonymous here (no email until payment), but the
    // cast, reading and follow-ups must not evaporate with the tab.
    let castId: number | null =
      typeof (body as { castId?: unknown }).castId === "number" &&
      castExists((body as { castId: number }).castId)
        ? (body as { castId: number }).castId // second tier on the same cast reuses the row
        : null;
    try {
      const owner = customerFromRequest(req)?.customerId ?? null; // a signed-in visitor keeps even free casts in their account
      if (castId === null) {
        const chart = resolveServerChart(input);
        castId = saveCast({
          customerId: owner,
          castAtMs: input.castAtMs,
          tzOffsetMinutes: input.tzOffsetMinutes,
          locale: loc,
          question,
          topic: input.topicHint ?? classifyTopic(toHans(question)),
          values: input.values,
          chart: chart as unknown as Record<string, unknown>,
          tzName: typeof (body as { timeZone?: unknown }).timeZone === "string" ? (body as { timeZone: string }).timeZone : null,
        });
        fileCast(castId, null, owner, question, input.topicHint ?? classifyTopic(toHans(question)), loc, input.solo); // 09-29 「一件事」 · 10-22 分開
      }
      if (castId !== null) saveReading(castId, owner, tier, loc, reading);
    } catch {
      /* persistence must never block a reading */
    }

    return NextResponse.json({ tier, reading, castId });
  } catch (e) {
    return NextResponse.json(
      { error: "generation_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
