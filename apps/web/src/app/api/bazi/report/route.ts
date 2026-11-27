import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { can, rightsFor, spendRight, useRight } from "@/lib/entitlements";
import { createHash } from "node:crypto";
import { noteRewrite, rewriteNextAt, rewriteSalt } from "@/lib/mingli/rewrite";
import { monthNow } from "@/lib/member-letter";
import { recordOps } from "@/lib/db";
import { hkReader } from "@/lib/register";
import { isLocale, type Locale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";
import { baziReportPath, birthFromBody, createReport, ensureBaziReport, factsFromBirth, baziReport, latestDeepToken, paidReportFor } from "@/lib/mingli/bazi/report";

export const runtime = "nodejs";

/** 10-30 进度表 128 ④: the page's language when the product is open in it (the report is written in it), else 繁體 */
function pageLocale(x: unknown, service: "bazi" | "zhengyuan"): Locale {
  if (typeof x === "string" && isLocale(x) && serviceOpenIn(service, x)) return x;
  return x === "zh" ? "zh" : "zh-hant";
}

/**
 * 10-18 八字②③ 深度報告 / 正緣畫像 — included in membership.
 *   POST {kind: "deep" | "love", input: BirthInput, gender, locale?: "zh" | "zh-hant"}
 *   → 200 {url, token, created}  ·  401 {error: "login"}  ·  402 {error: "member_only"}  ·  400 {error: "bad_kind" | "bad_birth", field?}
 *   → 404 {error: "off"} while the bazi-paid switch hides it from this browser
 * The chart is drawn again here from the birth input (nothing the browser computed is trusted); only the computed facts
 * are stored. Asking again for the same chart returns the same report. Writing starts at once.
 */
/** 10-19: is this browser a tester (signed in + admin cookie)? — the panel then says the reports open without paying */
export async function GET(req: NextRequest) {
  const me = customerFromRequest(req);
  const tester = !!me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false));
  return NextResponse.json({ tester }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await featureVisible("bazi-paid", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  const me = customerFromRequest(req);
  if (!me) return NextResponse.json({ error: "login" }, { status: 401 });
  let body: { kind?: unknown; input?: unknown; gender?: unknown; locale?: unknown; partner?: unknown; rewrite?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const kind = body.kind === "deep" || body.kind === "love" ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  const birth = birthFromBody(body.input, body.gender);
  if ("error" in birth) return NextResponse.json({ error: "bad_birth", field: birth.error }, { status: 400 });

  // 10-26 (Neil: 正緣畫像「跟合盤和年書一樣的模式」): no longer covered by a 會員／通卡 — one this reader already has
  // (paid, or written while it was still covered) opens; otherwise the product page sells it
  if (kind === "love") {
    const locale = pageLocale(body.locale, "zhengyuan");
    const partner = body.partner === "same" ? birth.gender : undefined;
    let lf;
    try { lf = factsFromBirth(birth.n, birth.gender, "love", Date.now(), undefined, { partner }); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }
    const have = paidReportFor(me.customerId, lf, "love", locale);
    if (have) { void ensureBaziReport(have).catch(() => null); return NextResponse.json({ url: baziReportPath(have, locale), token: have, created: false }); }
    return NextResponse.json({ error: "buy_zhengyuan", url: `/${locale}/zhengyuan${partner ? "?ta=same" : ""}` }, { status: 402 });
  }
  // 10-22 进度表 56: the rights table (lib/entitlements.ts) — a member or 通卡 holder, under the fair-use cap
  const r = await rightsFor(me.customerId);
  const sub = r.sub;
  // 10-19 (Neil: 授權一下我的帳號，我要測試): a signed-in admin browser opens it as a tester, without a membership
  const tester = !can(r, "chart_report") && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false));
  if (!can(r, "chart_report") && !tester) return NextResponse.json({ error: "member_only" }, { status: 402 });

  const locale = pageLocale(body.locale, "bazi");
  const register = locale === "zh-hant" && hkReader(req.headers) ? "hk" : null;
  let facts;
  // (正緣畫像 left above, 10-26 — only the deep report reaches here)
  try { facts = factsFromBirth(birth.n, birth.gender, kind, Date.now()); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }
  // 10-22 通卡 fair-use: 3 different charts a Taipei day per account (the same chart is written once and reopened freely)
  if (!tester) {
    const ref = `bazi:${kind}:${createHash("sha1").update(JSON.stringify(facts)).digest("hex").slice(0, 16)}`;
    const v = useRight(r, "chart_report", { ref });
    if (!v.ok) return NextResponse.json({ error: v.why === "not_allowed" ? "member_only" : v.why }, { status: v.why === "not_allowed" ? 402 : 429 });
    spendRight(r, "chart_report", ref);
  }
  const { token, created } = createReport({
    kind, locale, register, customerId: me.customerId, email: me.email, facts,
    paid: { session: tester ? `tester:${me.customerId}` : `member:${sub?.id ?? "ent"}`, amountMinor: 0 },
  });
  // 10-22 報告月更 (lib/mingli/rewrite.ts): a member asks for this chart's deep report written again — once every 30 days
  if (body.rewrite === true && kind === "deep" && can(r, "chart_rewrite") && !created) {
    const chart = createHash("sha1").update(facts.pillars.map((p) => p.gz).join()).digest("hex").slice(0, 16);
    const base = baziReport(token);
    const nextAt = rewriteNextAt(me.customerId, "bazi", chart, base?.created_at ?? null);
    if (nextAt) { const last = latestDeepToken(me.customerId, locale, facts) ?? token; return NextResponse.json({ url: baziReportPath(last, locale), token: last, created: false, rewritten: false, nextAt }); }
    const d = new Date(Date.now() + 8 * 3600_000);
    const fresh = { ...facts, asOf: `國曆 ${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月`, month: monthNow(facts) ?? undefined };
    const re = createReport({ kind, locale, register, customerId: me.customerId, email: me.email, facts: fresh, paid: { session: `member:${sub?.id ?? "ent"}`, amountMinor: 0 }, salt: rewriteSalt() });
    noteRewrite(me.customerId, "bazi", chart);
    void ensureBaziReport(re.token).catch(() => null);
    return NextResponse.json({ url: baziReportPath(re.token, locale), token: re.token, created: re.created, rewritten: true });
  }
  // 10-22: 「打開報告」 opens the newest version of this chart's deep report (a member's monthly rewrite when there is one)
  const open = kind === "deep" && !created ? latestDeepToken(me.customerId, locale, facts) ?? token : token;
  void ensureBaziReport(open).catch(() => null);
  recordOps("bazi_report_member", `${kind} cust ${me.customerId}${created ? "" : " (again)"}`);
  return NextResponse.json({ url: baziReportPath(open, locale), token: open, created });
}
