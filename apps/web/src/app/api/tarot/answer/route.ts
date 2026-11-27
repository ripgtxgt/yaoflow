import { NextRequest, NextResponse } from "next/server";
import { ANSWERS, setTarotAnswer, TAROT_TOKEN_RE, tarotDraw, type Answer } from "@/lib/tarot";
import { resetResultsCache } from "@/lib/results-line";
import { tarotResultPath } from "@/lib/tarot-personal";
import { record } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isAnswer = (x: unknown): x is Answer => typeof x === "string" && (ANSWERS as readonly string[]).includes(x);

/**
 * 10-16 进度表 68: the revisit letter's four one-tap answers (GET from the mail, lands back on the result page) and the
 * page's own form (POST). 10-23 进度表 104 ②: the page no longer asks to put the result into 應驗紀錄 (nothing listed it); an
 * answer clears the home page's / /outcomes' figure so it shows at once.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const a = req.nextUrl.searchParams.get("a");
  const d = TAROT_TOKEN_RE.test(token) ? tarotDraw(token) : null;
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  if (!d) return NextResponse.redirect(`${origin}/zh-hant/tarot`, 303);
  // 10-22 进度表 90: a free spread that asked for a revisit may answer it too
  if (isAnswer(a) && (d.paid_at || d.revisit_due)) {
    setTarotAnswer(token, a);
    resetResultsCache();
    record({ t: Date.now(), e: "tarot", s: token.slice(-12), locale: d.locale, method: `answered:${a}`, path: "/tarot/mail" });
  }
  return NextResponse.redirect(`${origin}${tarotResultPath(token, d.locale)}?answered=1#revisit`, 303);
}

export async function POST(req: NextRequest) {
  let body: { token?: unknown; answer?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const token = typeof body.token === "string" && TAROT_TOKEN_RE.test(body.token) ? body.token : null;
  const d = token ? tarotDraw(token) : null;
  if (!token || !d) return NextResponse.json({ error: "no_draw" }, { status: 404 });
  if (!d.paid_at && !d.revisit_due) return NextResponse.json({ error: "unpaid" }, { status: 402 });
  if (!isAnswer(body.answer)) return NextResponse.json({ error: "bad_answer" }, { status: 400 });
  setTarotAnswer(token, body.answer);
  resetResultsCache();
  record({ t: Date.now(), e: "tarot", s: token.slice(-12), locale: d.locale, method: `answered:${body.answer}`, path: "/tarot" });
  return NextResponse.json({ ok: true });
}
