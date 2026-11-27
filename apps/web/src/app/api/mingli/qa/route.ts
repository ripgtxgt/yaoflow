import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { bidOf } from "@/lib/browsers";
import { recordOps } from "@/lib/db";
import { can, rightsFor, spendRight, useRight } from "@/lib/entitlements";
import { hkReader } from "@/lib/register";
import { birthFromBody } from "@/lib/mingli/bazi/report";
import { astroBirthFromBody } from "@/lib/mingli/astro/report";
import { isLocale } from "@/lib/locales";
import { isForeign } from "@/lib/l10n/core";
import { serviceOpenIn } from "@/lib/services";
import { qaUi } from "@/lib/mingli/qa-text";
import {
  answerQuestion, asksOutcome, chartHashOf, cleanQ, deepReportFor, isQaSystem, qaFacts, qaHistory, saveQa, suggestedQuestions,
} from "@/lib/mingli/qa";

export const runtime = "nodejs";

/**
 * 10-22 命盤問答 (lib/mingli/qa.ts).
 *   POST {system, input, gender, locale, mode: "open"}           → the thread so far, the suggested questions, whether
 *        the reader may ask (covered: a 通卡 or a membership), whether signed in, and the deep report link — no model call
 *   POST {system, input, gender, locale, question}               → one answer, saved to the thread
 *   → 200 {answer, cast, covered, reportUrl}  ·  402 {error: "need_pass", signedIn} (no 通卡／membership on this account)
 *   10-24 (Neil): 命盤問答 is a 通卡／會員 thing — the 3 free questions a day are gone, and not signed in cannot ask
 *   → 429 {error: "cap_day" | "cap_rate"} (a member's / pass holder's fuse)  ·  400 bad_birth / bad_question / bad_system
 * Only the birth input and gender are read (never a name); the server recomputes the facts and stores only the question,
 * the answer and the chart's hash. Follows the chart's own switch (bazi / ziwei / astro).
 */
export async function POST(req: NextRequest) {
  let body: { system?: unknown; input?: unknown; gender?: unknown; locale?: unknown; question?: unknown; mode?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const system = isQaSystem(body.system) ? body.system : null;
  if (!system) return NextResponse.json({ error: "bad_system" }, { status: 400 });
  if (!(await featureVisible(system, req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  const birth = birthFromBody(body.input, body.gender ?? "male");
  if ("error" in birth) return NextResponse.json({ error: "bad_birth", field: birth.error }, { status: 400 });
  if (system === "ziwei" && !birth.n.timeKnown) return NextResponse.json({ error: "bad_birth", field: "time" }, { status: 400 });
  const ab = astroBirthFromBody(body.input, body.gender ?? "male");
  const houses = "error" in ab ? "placidus" : ab.houses;
  // 10-30 进度表 128 ④: a page in another language asks in that language — while that chart is open in it
  const locale = typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "zh-hant";
  if (isForeign(locale) && !serviceOpenIn(system === "astro" ? "xingpan" : system, locale)) return NextResponse.json({ error: "off" }, { status: 404 });
  const register = locale === "zh-hant" && hkReader(req.headers) ? "hk" : null;
  let q;
  try { q = qaFacts(system, birth.n, birth.gender, houses); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }
  const chartHash = chartHashOf(q);
  const me = customerFromRequest(req);
  const who = { customerId: me?.customerId ?? null, bid: bidOf(req) };
  // 10-22 进度表 56: the rights table (lib/entitlements.ts) — a member / 通卡 holder is covered (under the day's cap)
  const rights = await rightsFor(me?.customerId);
  const covered = can(rights, "chart_qa") && rights.unlimited;
  const admin = !covered && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false));
  let reportUrl: string | null = null;
  try { reportUrl = me ? deepReportFor(system, me.customerId, q, locale) : null; } catch { /* a report table not made yet */ }
  const ui = qaUi(locale, system);

  if (body.mode === "open") {
    return NextResponse.json({ history: qaHistory(chartHash, who), suggested: suggestedQuestions(system, chartHash, locale), covered: covered || admin, signedIn: !!me, reportUrl, ui }, { headers: { "Cache-Control": "private, no-store" } });
  }

  // 10-24 (Neil): only a 通卡 or a membership may ask — no free questions, and not signed in cannot ask
  if (!covered && !admin) return NextResponse.json({ error: "need_pass", signedIn: !!me }, { status: 402 });
  const question = cleanQ(body.question);
  if (!question || [...question].length < 4) return NextResponse.json({ error: "bad_question" }, { status: 400 });
  if (covered) {
    const v = useRight(rights, "chart_qa");
    if (!v.ok) return NextResponse.json({ error: v.why === "not_allowed" ? "need_pass" : v.why, signedIn: !!me }, { status: v.why === "not_allowed" ? 402 : 429 });
  }
  const history = qaHistory(chartHash, who);
  const r = await answerQuestion(q, question, history, locale, register);
  if ("error" in r) return NextResponse.json({ error: "failed" }, { status: 502 });
  if (covered) spendRight(rights, "chart_qa");
  const cast = asksOutcome(question);
  const row = saveQa({ customerId: who.customerId, bid: who.bid, system, chartHash, locale, question, answer: r.answer, cast });
  recordOps("mingli_qa", `${system} ${covered ? rights.standing : "admin"}${cast ? " cast" : ""}`);
  return NextResponse.json({ ...row, cast, covered: true, reportUrl });
}
