import { type NextRequest, NextResponse } from "next/server";
import { payHop } from "../inapp-pay";
import { customerFromRequest } from "../auth";
import { ADMIN_COOKIE, isAdmin } from "../admin-auth";
import { featureVisible } from "../features";
import { paywallOn } from "../paywall";
import { recordOps } from "../db";
import { can, rightsFor } from "../entitlements";
import { hkReader } from "../register";
import { catalogPrice, CATALOG } from "../catalog";
import { astroBirthFromBody } from "../mingli/astro/report";
import { birthFromBody } from "../mingli/bazi/report";
import { cleanQuestion, createNianshu, ensureNianshu, nianshuFacts, nianshuPath, nianshuSale, nianshuYears, paidNianshuFor } from "../mingli/nianshu/report";
import { checkoutCommon, checkoutFailed, commonMeta, noteOneOffForRecover, recoverLinks, startOneOff, type CheckoutBody } from "../checkout-core";
import { isLocale, type Locale } from "../locales";
import { serviceOpenIn } from "../services";
import { isForeign } from "../l10n/core";
import { nsForeignText } from "../mingli/nianshu/foreign-text";

/**
 * 10-21 三合一年書 — one year, one-off for everyone; a 會員 pays the lower of the early-bird price and 8 折 (Neil 10-22:
 * 只給會員，早鳥期取低不疊加); a signed-in admin browser is a tester and gets it free.
 *   POST {input, gender, year, currency, timeZone, tzOffsetMinutes, locale, question?}
 *   → 200 {url: <Stripe checkout>, token} · 200 {url: <年書>, paid: true} when this signed-in reader already has that
 *     year (同一年只收一次錢 — a new question is re-asked in it) · 200 {url, token, tester: true} for a tester
 *   → 400 {error: "bad_birth", field} (field "time": a birth time is required) · 400 {error: "bad_year"}
 *   → 404 {error: "off"} · 502 {error: "checkout_failed"} · 503 {error: "paywall_off"}
 * Only the birth input and gender are read (never the name); the server recomputes the three fact sets and stores
 * nothing else.
 * 10-22 进度表 57: the handler behind both /api/nianshu/checkout and /api/checkout/v2 {product: "nianshu"}.
 */
export async function handleNianshu(req: NextRequest, body: CheckoutBody & { input?: unknown; gender?: unknown; year?: unknown; question?: unknown }): Promise<NextResponse> {
  if (!(await featureVisible("nianshu", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  const birth = birthFromBody(body.input, body.gender);
  if ("error" in birth) return NextResponse.json({ error: "bad_birth", field: birth.error }, { status: 400 });
  if (!birth.n.timeKnown) return NextResponse.json({ error: "bad_birth", field: "time" }, { status: 400 });
  const ab = astroBirthFromBody(body.input, body.gender);
  const houses = "error" in ab ? "placidus" : ab.houses;
  const year = Number(body.year);
  const sale = nianshuSale();
  if (!nianshuYears().includes(year)) return NextResponse.json({ error: "bad_year" }, { status: 400 });
  // 10-30 进度表 128 ④-5: any language the 年書 is open in (the book is written in it)
  const locale: Locale = isLocale(body.locale) && serviceOpenIn("nianshu", body.locale) ? body.locale : body.locale === "zh" ? "zh" : "zh-hant";
  let facts;
  try { facts = nianshuFacts(birth.n, birth.gender, houses, year); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }

  const question = cleanQuestion(body.question);
  const me = customerFromRequest(req);
  if (me) {
    const have = paidNianshuFor(me.customerId, facts, locale, question);
    if (have) return NextResponse.json({ url: nianshuPath(have, locale), paid: true });
  }
  const register = locale === "zh-hant" && hkReader(req.headers) ? "hk" : null;
  if (me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false))) {
    const t = createNianshu({ locale, register, customerId: me.customerId, email: me.email, facts, question, paid: { session: `tester:${me.customerId}`, amountMinor: 0 } });
    void ensureNianshu(t.token).catch(() => null);
    recordOps("nianshu_tester", `${year} cust ${me.customerId}`);
    return NextResponse.json({ url: nianshuPath(t.token, locale), token: t.token, tester: true });
  }
  const { token } = createNianshu({ locale, register, customerId: me?.customerId ?? null, email: me?.email ?? null, facts, question });
  const path = nianshuPath(token, locale);

  const c = await checkoutCommon(req, body, { defaultCurrency: "TWD", localeOf: () => locale });
  const memberOff = can(await rightsFor(me?.customerId), "bigs_discount");
  const amount = catalogPrice("nianshu", c.currency, { early: sale.early, member: memberOff })!;
  try {
    // 10-23 进度表 111 ③: written down for the one reminder letter (when the reader asked for it)
    const cancelTo = `${c.origin}/${locale}/nianshu`, successUrl = `${c.origin}${path}?paid={CHECKOUT_SESSION_ID}`;
    const rl = recoverLinks(c, cancelTo);
    const metadata = { nianshu: token, report: "year", years: String(year), c: "nianshu", ...(sale.early ? { early: "1" } : {}), ...(memberOff ? { member_off: "1" } : {}), ...commonMeta(c, me, { tags: false }) };
    const email = me?.email ?? null, productName = (isForeign(locale) ? nsForeignText(locale).ui.productName : CATALOG.nianshu.name(locale)).replace("{y}", String(year));
    const s = await startOneOff(c, { product: "nianshu", kind: "nianshu", amountMinor: amount, productName, email, successUrl, cancelUrl: rl.cancelUrl, metadata });
    noteOneOffForRecover(c, { co: rl.co, sessionId: s.id, kind: "nianshu", email, amount, productName, metadata, cancelTo, successUrl });
    recordOps("nianshu_checkout", `${year} ${c.currency}${sale.early ? " early" : ""}${memberOff ? " member" : ""}`);
    return NextResponse.json({ url: payHop(req, s.url, locale), token });
  } catch (e) {
    checkoutFailed("nianshu_checkout", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
