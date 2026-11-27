import { NextRequest, NextResponse } from "next/server";
import { paywallOn } from "@/lib/paywall";
import { asLocale } from "@/lib/locales";
import { questionIssue } from "@/lib/question-check";
import { resolveReadingLocale } from "@/lib/question-lang";
import { parseScaleHint, parseTopicHint } from "@/lib/hints";
import { bidOf } from "@/lib/browsers";
import { noteNet } from "@/lib/browser-net";
import { browserSessionOf } from "@/lib/browser-session";
import { customerFromRequest } from "@/lib/auth";
import { logCast, setLogNudge, threadView } from "@/lib/cast-log";
import { nudgeFor } from "@/lib/nudge";
import { repeatState } from "@/lib/repeat-test";
import { record } from "@/lib/analytics-server";
import { refGiftFor } from "@/lib/ref-gift-route";
import type { ReadingInput } from "@/lib/reading";

export const runtime = "nodejs";

/**
 * 10-03 起卦记录: a cast that never asks for the free line — the 一事一占 cap let it through without one — is still
 * written down and filed under its matter (lib/cast-log.ts), and on the 2nd+ cast it still gets the block before the
 * price (lib/nudge.ts). The free line's own route (api/teaser) does the same for every other cast.
 */
const BUCKET = new Map<string, { n: number; t: number }>();
function limited(ip: string, now: number): boolean {
  const b = BUCKET.get(ip);
  if (!b || now - b.t > 10 * 60_000) { BUCKET.set(ip, { n: 1, t: now }); return false; }
  b.n += 1;
  if (BUCKET.size > 5000) BUCKET.clear();
  return b.n > 20;
}

const VALID = new Set([6, 7, 8, 9]);

export async function POST(req: NextRequest) {
  if (!paywallOn()) return NextResponse.json({});
  const now = Date.now();
  if (limited(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local", now)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const question = typeof b.question === "string" ? b.question.trim() : "";
  const values = Array.isArray(b.values) ? b.values : [];
  if (question.length < 2 || question.length > 450 || values.length !== 6 || !values.every((v) => VALID.has(v as number))) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const locale = asLocale(typeof b.locale === "string" ? b.locale : null);
  if (questionIssue(question, locale)) return NextResponse.json({});
  const bid = bidOf(req);
  if (!bid) return NextResponse.json({});
  const readingLocale = resolveReadingLocale(question, locale, b.rl);
  const input: ReadingInput = {
    question,
    values: values as ReadingInput["values"],
    castAtMs: Number(b.castAtMs) || now,
    tzOffsetMinutes: Number(b.tzOffsetMinutes) || 0,
    scaleHint: parseScaleHint(b.scaleHint),
    topicHint: parseTopicHint(b.topicHint),
    // 10-22 分開 (lib/solo.ts): the reader said this cast is a new matter
    ...(b.solo === true ? { solo: true } : {}),
  };
  noteNet(bid, req.headers); // 10-31 进度表 130
  const info = await logCast({ bid, s: browserSessionOf(b), customerId: customerFromRequest(req)?.customerId ?? null, input, locale: readingLocale, capped: b.capped === true, ua: req.headers.get("user-agent"), member: b.member === true, outcomeHint: (b as { outcomeHint?: unknown }).outcomeHint as string | undefined, separate: b.solo === true });
  if (!info) return NextResponse.json({});
  // 10-04: possibly written for this reader (lib/nudge.ts personalBlock), within its budget
  const nudge = b.member === true ? null : await nudgeFor(info, locale).catch(() => null);
  if (nudge && info.row.nudge !== nudge.id) setLogNudge(info.logId, nudge.id);
  // 10-13 同一件事反复问 ② (lib/repeat-test.ts): the 6th cast of a matter in 3 days — the page says 一事一占
  const rep = b.member === true ? null : repeatState(info, bid, { member: false, known: true });
  if (rep?.lock) record({ t: now, e: "repeat_gate", s: browserSessionOf(b) ?? bid.slice(-12), locale, method: "lock", hex: Math.min(64, info.n) });
  return NextResponse.json({ ...refGiftFor(req, b, bid, locale), ...(info.n >= 2 ? { thread: threadView(info, locale) } : {}), ...(nudge ? { nudge } : {}), ...(rep?.lock ? { lock: { n: info.n, inWindow: rep.lock.inWindow, until: rep.lock.until } } : {}) });
}
