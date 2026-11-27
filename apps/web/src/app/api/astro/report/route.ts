import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { can, rightsFor, spendRight, useRight } from "@/lib/entitlements";
import { createHash } from "node:crypto";
import { noteRewrite, rewriteNextAt, rewriteSalt } from "@/lib/mingli/rewrite";
import { recordOps } from "@/lib/db";
import { hkReader } from "@/lib/register";
import { isLocale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";
import { astroBirthFromBody, astroFacts, astroReportPath, createAstroReport, ensureAstroReport, astroReport, latestAstroDeepToken } from "@/lib/mingli/astro/report";

export const runtime = "nodejs";

/**
 * 10-20 星盤② 深度報告 — included in membership (same as the 紫微 deep report, POST /api/ziwei/report).
 *   POST {kind: "deep", input: BirthInput (input.houses picks placidus / whole), gender?, locale?: any page language the 星盤 is open in}
 *   → 200 {url, token, created}  ·  401 {error: "login"}  ·  402 {error: "member_only"}
 *   → 400 {error: "bad_kind" | "bad_birth", field?}  ·  404 {error: "off"} while the astro-paid switch hides it from this browser
 * Without an exact birth time the chart is the noon chart (no 上升, no houses) and the report leaves those chapters out.
 * The chart is drawn again here from the birth input; only computed facts are stored. A signed-in admin browser is a
 * tester (session tester:<id>, amount 0). Asking again for the same chart returns the same report.
 */
export async function GET(req: NextRequest) {
  const me = customerFromRequest(req);
  const tester = !!me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false));
  return NextResponse.json({ tester }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await featureVisible("astro-paid", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  const me = customerFromRequest(req);
  if (!me) return NextResponse.json({ error: "login" }, { status: 401 });
  let body: { kind?: unknown; input?: unknown; gender?: unknown; locale?: unknown; rewrite?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  if (body.kind !== "deep") return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  const birth = astroBirthFromBody(body.input, body.gender);
  if ("error" in birth) return NextResponse.json({ error: "bad_birth", field: birth.error }, { status: 400 });

  // 10-22 进度表 56: the rights table (lib/entitlements.ts) — a member or 通卡 holder, under the fair-use cap; an admin browser as a tester
  const r = await rightsFor(me.customerId);
  const sub = r.sub;
  const tester = !can(r, "chart_report") && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false));
  if (!can(r, "chart_report") && !tester) return NextResponse.json({ error: "member_only" }, { status: 402 });

  // 10-30 进度表 128 ④: a page in another language gets the report written in it (while the 星盤 is open in that language)
  const locale = typeof body.locale === "string" && isLocale(body.locale) && serviceOpenIn("xingpan", body.locale) ? body.locale : "zh-hant";
  const register = locale === "zh-hant" && hkReader(req.headers) ? "hk" : null;
  let facts;
  try { facts = astroFacts(birth.n, "deep", Date.now(), undefined, birth.houses); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }
  // 10-22 通卡 fair-use: 3 different charts a Taipei day per account (the same chart is written once and reopened freely)
  if (!tester) {
    const ref = `astro:deep:${createHash("sha1").update(JSON.stringify(facts)).digest("hex").slice(0, 16)}`;
    const v = useRight(r, "chart_report", { ref });
    if (!v.ok) return NextResponse.json({ error: v.why === "not_allowed" ? "member_only" : v.why }, { status: v.why === "not_allowed" ? 402 : 429 });
    spendRight(r, "chart_report", ref);
  }
  const { token, created } = createAstroReport({
    kind: "deep", locale, register, customerId: me.customerId, email: me.email, facts,
    paid: { session: tester ? `tester:${me.customerId}` : `member:${sub?.id ?? "ent"}`, amountMinor: 0 },
  });
  // 10-22 報告月更: a member asks for this chart's deep report written again — once every 30 days
  if (body.rewrite === true && can(r, "chart_rewrite") && !created) {
    const chart = createHash("sha1").update(JSON.stringify(facts.planets.map((p) => [p.name, p.sign, p.deg]))).digest("hex").slice(0, 16);
    const base = astroReport(token);
    const nextAt = rewriteNextAt(me.customerId, "astro", chart, base?.created_at ?? null);
    if (nextAt) { const last = latestAstroDeepToken(me.customerId, locale, facts) ?? token; return NextResponse.json({ url: astroReportPath(last, locale), token: last, created: false, rewritten: false, nextAt }); }
    const re = createAstroReport({ kind: "deep", locale, register, customerId: me.customerId, email: me.email, facts, paid: { session: `member:${sub?.id ?? "ent"}`, amountMinor: 0 }, salt: rewriteSalt() });
    noteRewrite(me.customerId, "astro", chart);
    void ensureAstroReport(re.token).catch(() => null);
    return NextResponse.json({ url: astroReportPath(re.token, locale), token: re.token, created: re.created, rewritten: true });
  }
  // 10-22: 「打開報告」 opens the newest version (a member's monthly rewrite when there is one)
  const open = !created ? latestAstroDeepToken(me.customerId, locale, facts) ?? token : token;
  void ensureAstroReport(open).catch(() => null);
  recordOps("astro_report_member", `deep cust ${me.customerId}${created ? "" : " (again)"}${tester ? " tester" : ""}`);
  return NextResponse.json({ url: astroReportPath(open, locale), token: open, created });
}
