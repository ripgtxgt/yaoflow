import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { deviceFor, keepDevice } from "@/lib/device";
import { bidOf } from "@/lib/browsers";
import { hkReader } from "@/lib/register";
import { detectRegister } from "@/lib/question-lang";
import { record } from "@/lib/analytics-server";
import { cardById, cardImage, createDraw, dealtOf, normQuestion, refusalOf, tarotDraw, type Spread } from "@/lib/tarot";
import { tarotResultPath } from "@/lib/tarot-personal";
import { cardName } from "@/lib/tarot-text";
import { meaningIn } from "@/lib/tarot-meaning-text";
import { isLocale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HITS = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (HITS.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  HITS.set(ip, list);
  if (HITS.size > 4000) HITS.clear();
  return list.length > 20;
}

/**
 * 10-16 进度表 68 線上塔羅: one matter, one spread. The cards are dealt here (crypto, 50% reversed) and kept under a token;
 * the fan the reader picks from only decides the order they are turned over. The same matter from this browser within
 * 24 hours gets the first spread back (`again`), never a fresh one.
 */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("tarot", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: { question?: unknown; spread?: unknown; locale?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  // 10-29 进度表 128: any language the tarot is open in (the spread is read in it)
  const locale = isLocale(body.locale) && serviceOpenIn("tarot", body.locale) ? body.locale : "zh-hant";
  const spread: Spread = body.spread === 3 ? 3 : 1;
  const question = typeof body.question === "string" ? normQuestion(body.question) : "";
  if ([...question].length < 4) return NextResponse.json({ error: "question_required" }, { status: 400 });
  const refuse = refusalOf(question);
  if (refuse) {
    record({ t: Date.now(), e: "tarot", s: ip.slice(-12), locale, method: `refuse:${refuse}`, path: "/tarot" });
    return NextResponse.json({ error: "refuse", why: refuse }, { status: 422 });
  }
  const me = customerFromRequest(req);
  const dev = deviceFor(req);
  const zh = locale === "zh" || locale === "zh-hant";
  const register = !zh ? null : detectRegister(question) === "yue" ? "yue" : hkReader(req.headers) ? "hk" : null;
  const { token, again } = createDraw({ question, spread, locale, bid: bidOf(req) ?? dev.id, customerId: me?.customerId ?? null, register }); // 10-25: the browser id (yf_bid)
  const d = tarotDraw(token)!;
  record({ t: Date.now(), e: "tarot", s: token.slice(-12), locale, method: again ? "again" : `draw:${d.spread}`, path: "/tarot" });
  // the card names and keywords in the page's language (an `again` spread keeps the language it was drawn in)
  const cards = dealtOf(d).map((x) => {
    const c = cardById(x.id)!;
    const m = meaningIn(x.id, d.locale);
    return { id: x.id, rev: x.rev, name: cardName(x.id, d.locale), en: c.en, img: cardImage(c), keywords: m ? (x.rev ? m.keywords.reversed : m.keywords.upright) : [] };
  });
  return keepDevice(NextResponse.json({ token, url: tarotResultPath(token, d.locale), again, spread: d.spread, question: again ? d.question : undefined, cards }), dev);
}
