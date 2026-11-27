import { NextRequest, NextResponse } from "next/server";
import { markCustomer } from "@/lib/browsers";
import { browserSessionOf } from "@/lib/browser-session";
import { isFallbackTeaser } from "@/lib/teaser";
import { recordOps } from "@/lib/db";
import { threadPrior } from "@/lib/matter-thread";
import { parseOdds, parseSituation } from "@/lib/situation";
import { asLocale } from "@/lib/locales";
import { questionIssue } from "@/lib/question-check";
import { resolveReadingLocale } from "@/lib/question-lang";
import { readCastExtras } from "@/lib/cast-extras";
import type { LineValue } from "@yaoflow/engine";
import { customerFromRequest } from "@/lib/auth";
import { parseScaleHint, parseTopicHint } from "@/lib/hints";
import type { ReadingInput, Tier } from "@/lib/reading";
import { isPassSubscription, redeemSubscription } from "@/lib/subscription";
import { activeMembership } from "@/lib/membership";

export const runtime = "nodejs";

const VALID_VALUES = new Set([6, 7, 8, 9]);

/**
 * A subscriber asks for a reading: spend one allowance unit and hand back the
 * reading URL. `sub_<token>` then behaves like a paid session everywhere —
 * generation, email, revisit, follow-ups — see paid-store.
 */
export async function POST(req: NextRequest) {
  const c = customerFromRequest(req);
  if (!c) return NextResponse.json({ error: "login_required" }, { status: 401 });

  let body: Partial<ReadingInput> & { tier?: unknown; locale?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const tier: Tier = body.tier === "deep" ? "deep" : "one";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const values = Array.isArray(body.values) ? body.values : [];
  if (question.length < 2 || question.length > 450) return NextResponse.json({ error: "bad_question" }, { status: 400 });
  if (questionIssue(question, asLocale(body.locale))) return NextResponse.json({ error: "bad_question" }, { status: 400 }); // 09-20: not a matter
  if (values.length !== 6 || !values.every((v) => VALID_VALUES.has(v as number))) {
    return NextResponse.json({ error: "bad_values" }, { status: 400 });
  }
  const locale = asLocale(body.locale);
  // `locale` stays the page (the delivery URL); the reading itself follows the
  // language the question was typed in — see lib/question-lang (09-17)
  const readingLocale = resolveReadingLocale(typeof body.question === "string" ? body.question : "", locale, (body as { rl?: unknown }).rl);
  const teaserRaw = (body as { teaser?: unknown }).teaser;
  const teaserClean = typeof teaserRaw === "string" && teaserRaw.trim().length >= 6 ? teaserRaw.replace(/\s+/g, " ").trim().slice(0, 200) : null;
  const teaser = isFallbackTeaser(teaserClean) ? null : teaserClean;
  const input: ReadingInput & { locale: typeof locale; bs?: string } = {
    question,
    values: values as LineValue[],
    castAtMs: Number(body.castAtMs) || Date.now(),
    tzOffsetMinutes: Number(body.tzOffsetMinutes) || 0,
    scaleHint: parseScaleHint(body.scaleHint),
    topicHint: parseTopicHint(body.topicHint),
    situation: parseSituation((body as { situation?: unknown }).situation),
    ...(parseOdds((body as { teaserOdds?: unknown }).teaserOdds) ? { teaserOdds: parseOdds((body as { teaserOdds?: unknown }).teaserOdds) } : {}),
    // 09-30 (进度表 25 ⑤, #838: 「免費預覽與輕解讀走向相反」): the paid path has bound the reading's opening line to the
    // preview since 09-22; a member's redeem dropped it, so a member's light reading was a second, independent
    // call on the same chart — on an ambiguous chart the two could lean opposite ways. Same binding here now.
    ...(teaser ? { teaser } : {}),
    locale: readingLocale,
    ...readCastExtras(body, typeof body.question === "string" ? body.question : "", readingLocale, req.headers),
    ...(browserSessionOf(body) ? { bs: browserSessionOf(body) } : {}),
  };
  // 09-26 同一件事的连续性: members cast most often, and across devices — the server finds the last reading on this matter
  if (!input.prior) {
    const tp = threadPrior(c.customerId, question, input.topicHint);
    if (tp) { input.prior = tp; recordOps("thread_prior", "member"); }
  }
  const r = await redeemSubscription(c.customerId, tier, input);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === "no_subscription" ? 402 : 429 });
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  // 10-24: the loading screen names a 通卡 as a pass (`via=pass`), not a membership
  const via = isPassSubscription(activeMembership(c.customerId)?.stripe_subscription_id) ? "&via=pass" : "";
  return markCustomer(req, NextResponse.json({ url: `${origin}/${locale}/reading?sid=${r.sid}&fresh=1${via}` }), c.customerId, "member"); // 10-02/03
}
