import { NextRequest, NextResponse } from "next/server";
import { payHop } from "@/lib/inapp-pay";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { alipayPossible, createPassSession, MAINLAND_METHODS } from "@/lib/stripe";
import { paywallOn } from "@/lib/paywall";
import { buyerCountry, managedPaymentsAllowed, plainCheckoutRegion } from "@/lib/geo";
import { recordOps } from "@/lib/db";
import { baziYearMinor, isCurrency, isMainlandTimeZone, stripeCurrency, type Currency } from "@/lib/money";
import { hkReader } from "@/lib/register";
import type { Locale } from "@/lib/locales";
import { REPORT_UI, baziReportPath, birthFromBody, cleanQuestion, createReport, ensureBaziReport, factsFromBirth, paidReportFor } from "@/lib/mingli/bazi/report";

export const runtime = "nodejs";

/**
 * 10-18 八字④ 流年報告 (this 八字 year and the next) — a one-off purchase for everyone, members included.
 *   POST {input: BirthInput, gender, currency, timeZone, tzOffsetMinutes, locale, year, question?}
 *   question (10-19 年書, optional): the buyer's own question, ≤ 200 characters, stored on the report row only (never in
 *   the Stripe metadata); the report then has an eighth chapter answering it.
 *   → 200 {url: <Stripe checkout>, token}  ·  200 {url: <report page>, paid: true} when this signed-in reader already has it
 *   → 400 {error: "bad_birth", field}  ·  404 {error: "off"}  ·  502 {error: "checkout_failed"}  ·  503 {error: "paywall_off"}
 * An unpaid report row is made now (computed facts only); payment returns to the report page with ?paid=<session>,
 * which marks it paid and starts the writing; the fulfil sweep does the same for a buyer who never came back.
 * Same currency and region routing as the tarot checkout.
 */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("bazi-paid", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  let body: { input?: unknown; gender?: unknown; currency?: unknown; timeZone?: unknown; tzOffsetMinutes?: unknown; locale?: unknown; year?: unknown; question?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const birth = birthFromBody(body.input, body.gender);
  if ("error" in birth) return NextResponse.json({ error: "bad_birth", field: birth.error }, { status: 400 });
  const locale = body.locale === "zh" ? "zh" : "zh-hant";
  let facts;
  try { facts = factsFromBirth(birth.n, birth.gender, "year", Date.now(), Number(body.year) || undefined); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }

  const question = cleanQuestion(body.question);
  const me = customerFromRequest(req);
  if (me) {
    const have = paidReportFor(me.customerId, facts, "year", locale, question);
    if (have) return NextResponse.json({ url: baziReportPath(have, locale), paid: true });
  }
  const register = locale === "zh-hant" && hkReader(req.headers) ? "hk" : null;
  // 10-19 (Neil: 授權一下我的帳號，我要測試): a signed-in admin browser gets it without paying, marked tester:<id>
  if (me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false))) {
    const t = createReport({ kind: "year", locale, register, customerId: me.customerId, email: me.email, facts, question, paid: { session: `tester:${me.customerId}`, amountMinor: 0 } });
    void ensureBaziReport(t.token).catch(() => null);
    recordOps("bazi_report_tester", `year ${facts.years[0]?.year} cust ${me.customerId}`);
    return NextResponse.json({ url: baziReportPath(t.token, locale), token: t.token, tester: true });
  }
  const { token } = createReport({ kind: "year", locale, register, customerId: me?.customerId ?? null, email: me?.email ?? null, facts, question });
  const path = baziReportPath(token, locale);

  const currency: Currency = isCurrency(body.currency) ? body.currency : "TWD";
  const amount = baziYearMinor(currency);
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
      kind: "bazi",
      amountMinor: amount, currency: stripeCurrency(currency),
      productName: (locale === "zh" ? REPORT_UI.productNameHans : REPORT_UI.productName).replace("{y}", String(facts.years[0]?.year ?? "")),
      locale: locale as Locale, email: me?.email ?? null, managedPayments, cardHint: !plainRegion, paymentMethodTypes: methods,
      successUrl: `${origin}${path}?paid={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/${locale}/bazi/chart`,
      metadata: {
        bazi: token, report: "year", years: facts.years.map((y) => y.year).join(","), currency, locale, c: "bazi",
        ...(me ? { cust: String(me.customerId), email: me.email } : {}),
        ...(country ? { country } : {}),
        ...(plainRegion ? { mp_reason: `plain-${plainRegion.toLowerCase()}` } : {}),
      },
    });
    if (!s.url) throw new Error("no url");
    recordOps("bazi_checkout", `year ${currency}`);
    return NextResponse.json({ url: payHop(req, s.url, locale), token });
  } catch (e) {
    recordOps("bazi_checkout_fail", `year ${currency}: ${(e instanceof Error ? e.message : "unknown").slice(0, 200)}`);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
