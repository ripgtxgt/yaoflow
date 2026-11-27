import { NextRequest, NextResponse } from "next/server";
import { upsertCustomer } from "@/lib/db";
import { markCustomer } from "@/lib/browsers";
import { browserSessionOf } from "@/lib/browser-session";
import { serverCheckEmail } from "@/lib/email-mx";
import { parseSituation } from "@/lib/situation";
import { asLocale } from "@/lib/locales";
import { resolveReadingLocale } from "@/lib/question-lang";
import type { LineValue } from "@yaoflow/engine";
import { customerFromRequest } from "@/lib/auth";
import { parseScaleHint, parseTopicHint } from "@/lib/hints";
import { TOKEN_RE } from "@/lib/grants";
import { pairInfo, redeemPair } from "@/lib/pairs";
import { notifyPairAnswered } from "@/lib/joint";
import type { ReadingInput } from "@/lib/reading";

export const runtime = "nodejs";

const VALID_VALUES = new Set([6, 7, 8, 9]);

/**
 * The invitee's cast on the shared matter. The question IS the framing —
 * the client cannot substitute its own — and the reading is delivered on
 * `gr_<token>` exactly like a gift. The inviter is told by email that the
 * other side has cast.
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
  const info = pairInfo(token);
  if (!info) return NextResponse.json({ error: "unknown_token" }, { status: 404 });
  const values = Array.isArray(body.values) ? body.values : [];
  if (values.length !== 6 || !values.every((v) => VALID_VALUES.has(v as number))) return NextResponse.json({ error: "bad_values" }, { status: 400 });

  const locale = asLocale(body.locale);
  // the joint reading follows the language the shared framing was written in —
  // the cast page detects on that same text, so the two agree (09-17)
  const readingLocale = resolveReadingLocale(info.framing, locale, (body as { rl?: unknown }).rl);
  const me = customerFromRequest(req);
  // 09-26 (Neil: 「所有客户看解读都必须要填邮箱」): the invitee's reading goes to an address — checked like every other
  let email = me?.email ?? null;
  if (!email) {
    const checked = await serverCheckEmail(typeof body.email === "string" ? body.email : "");
    if (!checked.ok) return NextResponse.json({ error: checked.error === "bad_email" && !body.email ? "email_required" : checked.error }, { status: 400 });
    email = checked.email;
  }
  const input: ReadingInput & { locale: string; bs?: string } = {
    question: info.framing, values: values as LineValue[],
    castAtMs: Number(body.castAtMs) || Date.now(),
    tzOffsetMinutes: Number(body.tzOffsetMinutes) || 0,
    scaleHint: parseScaleHint(body.scaleHint), topicHint: parseTopicHint(info.topic), situation: parseSituation((body as { situation?: unknown }).situation),
    locale: readingLocale,
    ...(browserSessionOf(body) ? { bs: browserSessionOf(body) } : {}),
  };
  const r = redeemPair(token, JSON.stringify(input), email, me?.customerId ?? null, readingLocale);
  if (!r.ok) {
    const status = r.error === "unknown_token" ? 404 : r.error === "expired" || r.error === "dissolved" ? 410 : r.error === "self" ? 403 : 409;
    return NextResponse.json({ error: r.error }, { status });
  }
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  // the inviter hears about it (best effort; never blocks delivery)
  void notifyPairAnswered(r.pair, origin).catch(() => undefined);
  return markCustomer(req, NextResponse.json({ url: `${origin}/${locale}/reading?sid=${r.sid}&fresh=1` }), me?.customerId ?? upsertCustomer(email, readingLocale), "pair"); // 10-02/03
}
