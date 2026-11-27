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
import { baziReportPath, birthFromBody, createReport, ensureBaziReport, factsFromBirth, paidReportFor } from "../mingli/bazi/report";
import { checkoutCommon, checkoutFailed, commonMeta, noteOneOffForRecover, recoverLinks, startOneOff, type CheckoutBody } from "../checkout-core";
import { isLocale, type Locale } from "../locales";
import { isForeign } from "../l10n/core";
import { serviceOpenIn } from "../services";
import { zyText } from "../mingli/bazi/page-ui";

/**
 * 10-26 正緣畫像 sold on its own like 合盤／年書 (Neil: 「跟合盤和年書一樣的模式」; NT$290 / HK$78 / US$9.99 / ¥48) — a
 * one-off for everyone; a 會員 pays 8 折; a 通卡 does not cover it; a signed-in admin browser is a tester and gets it free.
 *   POST {input, gender, partner?: "same", currency, timeZone, tzOffsetMinutes, locale}
 *   → 200 {url: <Stripe checkout>, token} · 200 {url: <畫像>, paid: true} when this signed-in reader already has the
 *     same chart and the same kind of TA (同一份只收一次錢 — also one written while a 通卡／會員 still covered it)
 *   → 200 {url, token, tester: true} for a tester · 400 {error: "bad_birth", field} · 404 {error: "off"}
 *   → 502 {error: "checkout_failed"} · 503 {error: "paywall_off"}
 * The payment rides the bazi one-off path: session kind "bazi", metadata.bazi = the report token → fulfilBaziPayment
 * marks it paid and books the order as tier "bazi_love"; the report page is /bazi/r/<token>. Only the birth input and
 * gender are read (never the name); the server recomputes the chart.
 */
export async function handleZhengyuan(req: NextRequest, body: CheckoutBody & { input?: unknown; gender?: unknown; partner?: unknown }): Promise<NextResponse> {
  if (!(await featureVisible("zhengyuan", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  const birth = birthFromBody(body.input, body.gender);
  if ("error" in birth) return NextResponse.json({ error: "bad_birth", field: birth.error }, { status: 400 });
  // 10-30 进度表 128 ④: any language the 正緣畫像 is open in (the report is written in it)
  const locale: Locale = typeof body.locale === "string" && isLocale(body.locale) && serviceOpenIn("zhengyuan", body.locale) ? body.locale : body.locale === "zh" ? "zh" : "zh-hant";
  const productName = isForeign(locale) ? zyText(locale).productName : CATALOG.zhengyuan.name(locale);
  const partner = body.partner === "same" ? birth.gender : undefined;
  let facts;
  try { facts = factsFromBirth(birth.n, birth.gender, "love", Date.now(), undefined, { partner }); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }

  const me = customerFromRequest(req);
  if (me) {
    const have = paidReportFor(me.customerId, facts, "love", locale);
    if (have) return NextResponse.json({ url: baziReportPath(have, locale), paid: true });
  }
  const register = locale === "zh-hant" && hkReader(req.headers) ? "hk" : null;
  if (me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false))) {
    const t = createReport({ kind: "love", locale, register, customerId: me.customerId, email: me.email, facts, paid: { session: `tester:${me.customerId}`, amountMinor: 0 } });
    void ensureBaziReport(t.token).catch(() => null);
    recordOps("zhengyuan_tester", `cust ${me.customerId}`);
    return NextResponse.json({ url: baziReportPath(t.token, locale), token: t.token, tester: true });
  }
  const { token } = createReport({ kind: "love", locale, register, customerId: me?.customerId ?? null, email: me?.email ?? null, facts });
  const path = baziReportPath(token, locale);

  const c = await checkoutCommon(req, body, { defaultCurrency: "TWD", localeOf: () => locale });
  const memberOff = can(await rightsFor(me?.customerId), "bigs_discount");
  const amount = catalogPrice("zhengyuan", c.currency, { member: memberOff })!;
  try {
    // the one reminder letter, when the reader ticked it (same price; only a 通卡 gets the hour at 70 %)
    const cancelTo = `${c.origin}/${locale}/zhengyuan`, successUrl = `${c.origin}${path}?paid={CHECKOUT_SESSION_ID}`;
    const rl = recoverLinks(c, cancelTo);
    const metadata = { bazi: token, report: "love", c: "zhengyuan", ...(partner ? { partner: "same" } : {}), ...(memberOff ? { member_off: "1" } : {}), ...commonMeta(c, me, { tags: false }) };
    const s = await startOneOff(c, { product: "zhengyuan", kind: "bazi", amountMinor: amount, productName, email: me?.email ?? null, successUrl, cancelUrl: rl.cancelUrl, metadata, customerId: me?.customerId ?? null });
    noteOneOffForRecover(c, { co: rl.co, sessionId: s.id, kind: "bazi", email: me?.email ?? null, amount, productName, metadata, cancelTo, successUrl });
    recordOps("zhengyuan_checkout", `${c.currency}${memberOff ? " member" : ""}`);
    return NextResponse.json({ url: payHop(req, s.url, locale), token });
  } catch (e) {
    checkoutFailed("zhengyuan_checkout", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
