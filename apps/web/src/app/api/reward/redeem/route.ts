import { NextRequest, NextResponse } from "next/server";
import { markCustomer } from "@/lib/browsers";
import { browserSessionOf } from "@/lib/browser-session";
import { parseOdds, parseSituation } from "@/lib/situation";
import { asLocale } from "@/lib/locales";
import { questionIssue } from "@/lib/question-check";
import { resolveReadingLocale } from "@/lib/question-lang";
import { readCastExtras } from "@/lib/cast-extras";
import type { LineValue } from "@yaoflow/engine";
import { redeemReferral, referralByToken } from "@/lib/db";
import { parseScaleHint, parseTopicHint } from "@/lib/hints";
import type { ReadingInput } from "@/lib/reading";

export const runtime = "nodejs";

const VALID_VALUES = new Set([6, 7, 8, 9]);

/**
 * Spend a referral reward on this cast. Returns the reading URL; the reading
 * page then treats `rw_<token>` exactly like a paid Stripe session (see
 * paid-store), so generation, email, revisit and the customer record are the
 * ordinary paid path. The token burns on first use.
 */
export async function POST(req: NextRequest) {
  let body: Partial<ReadingInput> & { token?: string; locale?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[0-9a-f]{36}$/.test(token)) return NextResponse.json({ error: "bad_token" }, { status: 400 });

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const values = Array.isArray(body.values) ? body.values : [];
  if (question.length < 2 || question.length > 450) return NextResponse.json({ error: "bad_question" }, { status: 400 });
  if (questionIssue(question, asLocale(body.locale))) return NextResponse.json({ error: "bad_question" }, { status: 400 }); // 09-20: not a matter
  if (values.length !== 6 || !values.every((v) => VALID_VALUES.has(v as number))) {
    return NextResponse.json({ error: "bad_values" }, { status: 400 });
  }

  const ref = referralByToken(token);
  if (!ref) return NextResponse.json({ error: "unknown_token" }, { status: 404 });
  if (ref.used_at) return NextResponse.json({ error: "already_used" }, { status: 409 });
  if (ref.expires_at < Date.now()) return NextResponse.json({ error: "expired" }, { status: 410 });

  const locale = asLocale(body.locale);
  // `locale` stays the page (the delivery URL); the reading itself follows the
  // language the question was typed in — see lib/question-lang (09-17)
  const readingLocale = resolveReadingLocale(typeof body.question === "string" ? body.question : "", locale, (body as { rl?: unknown }).rl);
  const input: ReadingInput & { locale: string; bs?: string } = {
    question,
    values: values as LineValue[],
    castAtMs: Number(body.castAtMs) || Date.now(),
    tzOffsetMinutes: Number(body.tzOffsetMinutes) || 0,
    scaleHint: parseScaleHint(body.scaleHint),
    topicHint: parseTopicHint(body.topicHint),
    situation: parseSituation((body as { situation?: unknown }).situation),
    ...(parseOdds((body as { teaserOdds?: unknown }).teaserOdds) ? { teaserOdds: parseOdds((body as { teaserOdds?: unknown }).teaserOdds) } : {}),
    locale: readingLocale,
    ...readCastExtras(body, typeof body.question === "string" ? body.question : "", readingLocale, req.headers),
    ...(browserSessionOf(body) ? { bs: browserSessionOf(body) } : {}),
  };
  const sid = `rw_${token}`;
  if (!redeemReferral(token, sid, JSON.stringify(input))) {
    return NextResponse.json({ error: "already_used" }, { status: 409 });
  }
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  return markCustomer(req, NextResponse.json({ url: `${origin}/${locale}/reading?sid=${sid}&fresh=1` }), ref.referrer_customer_id, "reward"); // 10-02/03
}
