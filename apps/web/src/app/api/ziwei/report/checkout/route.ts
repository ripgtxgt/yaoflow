import { NextRequest, NextResponse } from "next/server";
import { payHop } from "@/lib/inapp-pay";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { alipayPossible, createPassSession, MAINLAND_METHODS } from "@/lib/stripe";
import { paywallOn } from "@/lib/paywall";
import { buyerCountry, managedPaymentsAllowed, plainCheckoutRegion } from "@/lib/geo";
import { recordOps } from "@/lib/db";
import { isCurrency, isMainlandTimeZone, stripeCurrency, ziweiYearMinor, type Currency } from "@/lib/money";
import { hkReader } from "@/lib/register";
import type { Locale } from "@/lib/locales";
import {
  ZW_REPORT_UI, birthFromBody, cleanQuestion, createZiweiReport, ensureZiweiReport, paidZiweiReportFor, ziweiFacts, ziweiReportPath,
} from "@/lib/mingli/ziwei/report";

export const runtime = "nodejs";

/**
 * 10-20 紫微③ 紫微年書 (this 紫微 year or the next, one year per purchase) — one-off for everyone, members included;
 * the same flow as the 八字 年書 checkout (POST /api/bazi/report/checkout).
 *   POST {input: BirthInput, gender, currency, timeZone, tzOffsetMinutes, locale, year, question?}
 *   → 200 {url: <Stripe checkout>, token}  ·  200 {url: <report page>, paid: true} when this signed-in reader already has
 *     that year (a new question is re-asked in it — 同一年只收一次錢)  ·  200 {url, token, tester: true} for a signed-in admin
 *   → 400 {error: "bad_birth", field}  ·  404 {error: "off"}  ·  502 {error: "checkout_failed"}  ·  503 {error: "paywall_off"}
 */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("ziwei-paid", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  let body: { input?: unknown; gender?: unknown; currency?: unknown; timeZone?: unknown; tzOffsetMinutes?: unknown; locale?: unknown; year?: unknown; question?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const birth = birthFromBody(body.input, body.gender);
  if ("error" in birth) return NextResponse.json({ error: "bad_birth", field: birth.error }, { status: 400 });
  if (!birth.n.timeKnown) return NextResponse.json({ error: "bad_birth", field: "time" }, { status: 400 });
  const locale = body.locale === "zh" ? "zh" : "zh-hant";
  let facts;
  try { facts = ziweiFacts(birth.n, birth.gender, "year", Date.now(), Number(body.year) || undefined); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }
  const year = facts.years[0]!;

  const question = cleanQuestion(body.question);
  const me = customerFromRequest(req);
  if (me) {
    const have = paidZiweiReportFor(me.customerId, facts, "year", locale, question);
    if (have) return NextResponse.json({ url: ziweiReportPath(have, locale), paid: true });
  }
  const register = locale === "zh-hant" && hkReader(req.headers) ? "hk" : null;
  if (me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false))) {
    const t = createZiweiReport({ kind: "year", locale, register, customerId: me.customerId, email: me.email, facts, question, paid: { session: `tester:${me.customerId}`, amountMinor: 0 } });
    void ensureZiweiReport(t.token).catch(() => null);
    recordOps("ziwei_report_tester", `year ${year} cust ${me.customerId}`);
    return NextResponse.json({ url: ziweiReportPath(t.token, locale), token: t.token, tester: true });
  }
  const { token } = createZiweiReport({ kind: "year", locale, register, customerId: me?.customerId ?? null, email: me?.email ?? null, facts, question });
  const path = ziweiReportPath(token, locale);

  const currency: Currency = isCurrency(body.currency) ? body.currency : "TWD";
  const amount = ziweiYearMinor(currency);
  const timeZone = typeof body.timeZone === "string" ? body.timeZone : null;
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  let managedPayments: boolean | undefined;
  let country: string | null = null;
  if ((process.env.STRIPE_GEO_ROUTING ?? "on") !== "off") {
    try { country = await buyerCountry(req.headers); managedPayments = managedPaymentsAllowed(country); } catch { /* default */ }
  }
  const tz = Number(body.tzOffsetMinutes);
  if (managedPayments !== false && (isMainlandTimeZone(timeZone, locale as Locale, req.headers.get("accept-language")) || (tz === 480 && !timeZone && currency === "CNY") || currency === "CNY")) managedPayments = false;
  const plainRegion = managedPayments !== false ? plainCheckoutRegion(country, timeZone) : null;
  if (plainRegion) managedPayments = false;
  const methods = managedPayments === false && !plainRegion && alipayPossible(currency) ? MAINLAND_METHODS : undefined;
  try {
    const s = await createPassSession({
      kind: "ziwei",
      amountMinor: amount, currency: stripeCurrency(currency),
      productName: (locale === "zh" ? ZW_REPORT_UI.productNameHans : ZW_REPORT_UI.productName).replace("{y}", String(year)),
      locale: locale as Locale, email: me?.email ?? null, managedPayments, cardHint: !plainRegion, paymentMethodTypes: methods,
      successUrl: `${origin}${path}?paid={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/${locale}/ziwei/chart`,
      metadata: {
        ziwei: token, report: "year", years: String(year), currency, locale, c: "ziwei",
        ...(me ? { cust: String(me.customerId), email: me.email } : {}),
        ...(country ? { country } : {}),
        ...(plainRegion ? { mp_reason: `plain-${plainRegion.toLowerCase()}` } : {}),
      },
    });
    if (!s.url) throw new Error("no url");
    recordOps("ziwei_checkout", `year ${currency}`);
    return NextResponse.json({ url: payHop(req, s.url, locale), token });
  } catch (e) {
    recordOps("ziwei_checkout_fail", `year ${currency}: ${(e instanceof Error ? e.message : "unknown").slice(0, 200)}`);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
