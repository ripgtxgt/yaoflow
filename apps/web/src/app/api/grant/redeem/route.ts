import { serverCheckEmail } from "@/lib/email-mx";
import { markCustomer } from "@/lib/browsers";
import { browserSessionOf } from "@/lib/browser-session";
import { customerEmailById, upsertCustomer } from "@/lib/db";
import { parseSituation } from "@/lib/situation";
import { NextRequest, NextResponse } from "next/server";
import { asLocale } from "@/lib/locales";
import { questionIssue } from "@/lib/question-check";
import { resolveReadingLocale } from "@/lib/question-lang";
import { readCastExtras } from "@/lib/cast-extras";
import type { LineValue } from "@yaoflow/engine";
import { customerFromRequest } from "@/lib/auth";
import { parseScaleHint, parseTopicHint } from "@/lib/hints";
import { redeemCaseLight, redeemGiftCast, redeemRevisitLight, TOKEN_RE } from "@/lib/grants";
import { grantByToken, setGrantClaimDevice } from "@/lib/db";
import { deviceFor, keepDevice } from "@/lib/device";
import type { ReadingInput } from "@/lib/reading";

export const runtime = "nodejs";

const VALID_VALUES = new Set([6, 7, 8, 9]);

/**
 * Spend a friend's gift on this cast. Mirrors /api/reward/redeem: the reading
 * page treats `gr_<token>` like a paid session, so generation, email,
 * revisit and the customer record are the ordinary path. Burns on first use.
 */
export async function POST(req: NextRequest) {
  let body: Partial<ReadingInput> & { token?: string; locale?: string; email?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "bad_token" }, { status: 400 });
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const values = Array.isArray(body.values) ? body.values : [];
  if (question.length < 2 || question.length > 450) return NextResponse.json({ error: "bad_question" }, { status: 400 });
  if (questionIssue(question, asLocale(body.locale))) return NextResponse.json({ error: "bad_question" }, { status: 400 }); // 09-20: not a matter
  if (values.length !== 6 || !values.every((v) => VALID_VALUES.has(v as number))) return NextResponse.json({ error: "bad_values" }, { status: 400 });

  const locale = asLocale(body.locale);
  // `locale` stays the page (the delivery URL); the reading itself follows the
  // language the question was typed in — see lib/question-lang (09-17)
  const readingLocale = resolveReadingLocale(typeof body.question === "string" ? body.question : "", locale, (body as { rl?: unknown }).rl);
  const me = customerFromRequest(req);
  const typedRaw = typeof body.email === "string" ? body.email.trim() : "";
  let typed = "";
  if (!me && typedRaw) { // 09-26 邮箱校对
    const checked = await serverCheckEmail(typedRaw);
    if (!checked.ok) return NextResponse.json({ error: checked.error, suggestion: checked.suggestion }, { status: 400 });
    typed = checked.email;
  }
  // 09-26 (Neil: 「所有客户看解读都必须要填邮箱」): a reading the owner earned themselves (revisit / case) goes to the owner's address
  const g0 = grantByToken(token);
  const ownerEmail = g0 && (g0.kind === "revisit_light" || g0.kind === "case_light" || g0.kind === "ref_light") && g0.from_customer_id ? customerEmailById(g0.from_customer_id) : null;
  const email = me?.email ?? (typed || ownerEmail || null);
  const input: ReadingInput & { locale: string; bs?: string } = {
    question, values: values as LineValue[],
    castAtMs: Number(body.castAtMs) || Date.now(),
    tzOffsetMinutes: Number(body.tzOffsetMinutes) || 0,
    scaleHint: parseScaleHint(body.scaleHint), topicHint: parseTopicHint(body.topicHint), situation: parseSituation((body as { situation?: unknown }).situation),
    locale: readingLocale,
    ...readCastExtras(body, typeof body.question === "string" ? body.question : "", readingLocale, req.headers),
    ...(browserSessionOf(body) ? { bs: browserSessionOf(body) } : {}),
  };
  // 09-21 回访奖励: the same door also spends an aftermath link (revisit_light) — a light reading with the earlier call riding along
  const kind = grantByToken(token)?.kind;
  const dev = deviceFor(req);
  // 09-24: a friend's gift is a deep reading with a timing window — it needs somewhere to go (and a person to credit the giver for)
  if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });
  const r = kind === "revisit_light"
    ? redeemRevisitLight(token, input, email, me?.customerId ?? null, locale)
    : kind === "case_light" || kind === "ref_light"
    ? redeemCaseLight(token, input, email, me?.customerId ?? null, locale)
    : redeemGiftCast(token, JSON.stringify(input), email, me?.customerId ?? null, locale, dev.fresh ? null : dev.id);
  if (!r.ok) {
    const status = r.error === "unknown_token" ? 404 : r.error === "expired" ? 410 : r.error === "self" || r.error === "returned" || r.error === "device" ? 403 : 409;
    return keepDevice(NextResponse.json({ error: r.error }, { status }), dev);
  }
  // 09-27 赠送审核 B: this browser now holds the reading — a gift later made from it cannot be spent here
  setGrantClaimDevice(token, dev.id);
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  // 10-02: the board knows whose browser this is (yf_who)
  return keepDevice(markCustomer(req, NextResponse.json({ url: `${origin}/${locale}/reading?sid=${r.sid}&fresh=1` }), me?.customerId ?? upsertCustomer(email, locale), kind ?? "grant"), dev);
}
