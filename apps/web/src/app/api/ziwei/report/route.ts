import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { can, rightsFor, spendRight, useRight } from "@/lib/entitlements";
import { createHash } from "node:crypto";
import { noteRewrite, rewriteNextAt, rewriteSalt } from "@/lib/mingli/rewrite";
import { recordOps } from "@/lib/db";
import { hkReader } from "@/lib/register";
import { isLocale, type Locale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";
import { birthFromBody, createZiweiReport, ensureZiweiReport, latestZiweiDeepToken, ziweiFacts, ziweiReport, ziweiReportPath } from "@/lib/mingli/ziwei/report";

export const runtime = "nodejs";

/** 10-30 进度表 128 ④: the page's language when the 紫微 is open in it (the report is written in it), else 繁體 */
function pageLocale(x: unknown): Locale {
  if (typeof x === "string" && isLocale(x) && serviceOpenIn("ziwei", x)) return x;
  return x === "zh" ? "zh" : "zh-hant";
}

/**
 * 10-20 紫微② 深度報告 — included in membership (same as the 八字 deep report, POST /api/bazi/report).
 *   POST {kind: "deep", input: BirthInput, gender, locale?: any language the 紫微 is open in (10-30 进度表 128 ④)}
 *   → 200 {url, token, created}  ·  401 {error: "login"}  ·  402 {error: "member_only"}
 *   → 400 {error: "bad_kind" | "bad_birth", field?}  (field "time": a 紫微 chart needs the birth 時辰)
 *   → 404 {error: "off"} while the ziwei-paid switch hides it from this browser
 * The chart is drawn again here from the birth input; only computed facts are stored. A signed-in admin browser is a
 * tester (session tester:<id>, amount 0). Asking again for the same chart returns the same report.
 */
export async function GET(req: NextRequest) {
  const me = customerFromRequest(req);
  const tester = !!me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false));
  return NextResponse.json({ tester }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await featureVisible("ziwei-paid", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  const me = customerFromRequest(req);
  if (!me) return NextResponse.json({ error: "login" }, { status: 401 });
  let body: { kind?: unknown; input?: unknown; gender?: unknown; locale?: unknown; rewrite?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  if (body.kind !== "deep") return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  const birth = birthFromBody(body.input, body.gender);
  if ("error" in birth) return NextResponse.json({ error: "bad_birth", field: birth.error }, { status: 400 });
  if (!birth.n.timeKnown) return NextResponse.json({ error: "bad_birth", field: "time" }, { status: 400 });

  // 10-22 进度表 56: the rights table (lib/entitlements.ts) — a member or 通卡 holder, under the fair-use cap; an admin browser as a tester
  const r = await rightsFor(me.customerId);
  const sub = r.sub;
  const tester = !can(r, "chart_report") && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false));
  if (!can(r, "chart_report") && !tester) return NextResponse.json({ error: "member_only" }, { status: 402 });

  const locale = pageLocale(body.locale);
  const register = locale === "zh-hant" && hkReader(req.headers) ? "hk" : null;
  let facts;
  try { facts = ziweiFacts(birth.n, birth.gender, "deep"); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }
  // 10-22 通卡 fair-use: 3 different charts a Taipei day per account (the same chart is written once and reopened freely)
  if (!tester) {
    const ref = `ziwei:deep:${createHash("sha1").update(JSON.stringify(facts)).digest("hex").slice(0, 16)}`;
    const v = useRight(r, "chart_report", { ref });
    if (!v.ok) return NextResponse.json({ error: v.why === "not_allowed" ? "member_only" : v.why }, { status: v.why === "not_allowed" ? 402 : 429 });
    spendRight(r, "chart_report", ref);
  }
  const { token, created } = createZiweiReport({
    kind: "deep", locale, register, customerId: me.customerId, email: me.email, facts,
    paid: { session: tester ? `tester:${me.customerId}` : `member:${sub?.id ?? "ent"}`, amountMinor: 0 },
  });
  // 10-22 報告月更: a member asks for this chart's deep report written again — once every 30 days
  if (body.rewrite === true && can(r, "chart_rewrite") && !created) {
    const chart = createHash("sha1").update(`${facts.yearStem}${facts.soulBranch}${facts.bodyBranch}${facts.soulStar}`).digest("hex").slice(0, 16);
    const base = ziweiReport(token);
    const nextAt = rewriteNextAt(me.customerId, "ziwei", chart, base?.created_at ?? null);
    if (nextAt) { const last = latestZiweiDeepToken(me.customerId, locale, facts) ?? token; return NextResponse.json({ url: ziweiReportPath(last, locale), token: last, created: false, rewritten: false, nextAt }); }
    const re = createZiweiReport({ kind: "deep", locale, register, customerId: me.customerId, email: me.email, facts, paid: { session: `member:${sub?.id ?? "ent"}`, amountMinor: 0 }, salt: rewriteSalt() });
    noteRewrite(me.customerId, "ziwei", chart);
    void ensureZiweiReport(re.token).catch(() => null);
    return NextResponse.json({ url: ziweiReportPath(re.token, locale), token: re.token, created: re.created, rewritten: true });
  }
  // 10-22: 「打開報告」 opens the newest version (a member's monthly rewrite when there is one)
  const open = !created ? latestZiweiDeepToken(me.customerId, locale, facts) ?? token : token;
  void ensureZiweiReport(open).catch(() => null);
  recordOps("ziwei_report_member", `deep cust ${me.customerId}${created ? "" : " (again)"}${tester ? " tester" : ""}`);
  return NextResponse.json({ url: ziweiReportPath(open, locale), token: open, created });
}
