import { NextRequest, NextResponse } from "next/server";
import { payHop } from "@/lib/inapp-pay";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { alipayPossible, createPassSession, MAINLAND_METHODS } from "@/lib/stripe";
import { paywallOn } from "@/lib/paywall";
import { buyerCountry, managedPaymentsAllowed, plainCheckoutRegion } from "@/lib/geo";
import { recordOps } from "@/lib/db";
import { astroYearMinor, isCurrency, isMainlandTimeZone, stripeCurrency, type Currency } from "@/lib/money";
import { hkReader } from "@/lib/register";
import type { Locale } from "@/lib/locales";
import {
  AS_REPORT_UI, astroBirthFromBody, astroFacts, astroReportPath, cleanQuestion, createAstroReport, ensureAstroReport, paidAstroReportFor,
} from "@/lib/mingli/astro/report";

export const runtime = "nodejs";

/**
 * 10-20 星盤③ 星盤年報 (this calendar year or the next, one year per purchase) — one-off for everyone, members included;
 * the same flow as the 紫微年書 checkout (POST /api/ziwei/report/checkout).
 *   POST {input: BirthInput, gender?, currency, timeZone, tzOffsetMinutes, locale, year, question?}
 *   → 200 {url: <Stripe checkout>, token}  ·  200 {url: <report page>, paid: true} when this signed-in reader already has
 *     that year (a new question is re-asked in it — 同一年只收一次錢)  ·  200 {url, token, tester: true} for a signed-in admin
 *   → 400 {error: "bad_birth", field}  ·  404 {error: "off"}  ·  502 {error: "checkout_failed"}  ·  503 {error: "paywall_off"}
 */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("astro-paid", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  let body: { input?: unknown; gender?: unknown; currency?: unknown; timeZone?: unknown; tzOffsetMinutes?: unknown; locale?: unknown; year?: unknown; question?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const birth = astroBirthFromBody(body.input, body.gender);
  if ("error" in birth) return NextResponse.json({ error: "bad_birth", field: birth.error }, { status: 400 });
  const locale = body.locale === "zh" ? "zh" : "zh-hant";
  let facts;
  try { facts = astroFacts(birth.n, "year", Date.now(), Number(body.year) || undefined, birth.houses); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }
  const year = facts.years[0]!;

  const question = cleanQuestion(body.question);
  const me = customerFromRequest(req);
  if (me) {
    const have = paidAstroReportFor(me.customerId, facts, "year", locale, question);
    if (have) return NextResponse.json({ url: astroReportPath(have, locale), paid: true });
  }
  const register = locale === "zh-hant" && hkReader(req.headers) ? "hk" : null;
  if (me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false))) {
    const t = createAstroReport({ kind: "year", locale, register, customerId: me.customerId, email: me.email, facts, question, paid: { session: `tester:${me.customerId}`, amountMinor: 0 } });
    void ensureAstroReport(t.token).catch(() => null);
    recordOps("astro_report_tester", `year ${year} cust ${me.customerId}`);
    return NextResponse.json({ url: astroReportPath(t.token, locale), token: t.token, tester: true });
  }
  const { token } = createAstroReport({ kind: "year", locale, register, customerId: me?.customerId ?? null, email: me?.email ?? null, facts, question });
  const path = astroReportPath(token, locale);

  const currency: Currency = isCurrency(body.currency) ? body.currency : "TWD";
  const amount = astroYearMinor(currency);
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
      kind: "astro",
      amountMinor: amount, currency: stripeCurrency(currency),
      productName: (locale === "zh" ? AS_REPORT_UI.productNameHans : AS_REPORT_UI.productName).replace("{y}", String(year)),
      locale: locale as Locale, email: me?.email ?? null, managedPayments, cardHint: !plainRegion, paymentMethodTypes: methods,
      successUrl: `${origin}${path}?paid={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/${locale}/xingpan/chart`,
      metadata: {
        astro: token, report: "year", years: String(year), currency, locale, c: "astro",
        ...(me ? { cust: String(me.customerId), email: me.email } : {}),
        ...(country ? { country } : {}),
        ...(plainRegion ? { mp_reason: `plain-${plainRegion.toLowerCase()}` } : {}),
      },
    });
    if (!s.url) throw new Error("no url");
    recordOps("astro_checkout", `year ${currency}`);
    return NextResponse.json({ url: payHop(req, s.url, locale), token });
  } catch (e) {
    recordOps("astro_checkout_fail", `year ${currency}: ${(e instanceof Error ? e.message : "unknown").slice(0, 200)}`);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
