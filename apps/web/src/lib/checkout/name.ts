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
import { birthFromBody } from "../mingli/bazi/report";
import { chartFromBirth } from "../mingli/bazi/today";
import type { BirthInput } from "../mingli/birth/normalize";
import { createNameReport, ensureNameReport, nameFacts, nameReportPath, paidNameReportFor } from "../mingli/name/report";
import { checkoutCommon, checkoutFailed, commonMeta, startOneOff, type CheckoutBody } from "../checkout-core";

/**
 * 10-29 进度表 122 姓名學 — 寶寶取名參考／改名參考, one-off like 合盤 (會員 8 折; a 通卡 does not cover it; a signed-in
 * admin browser is a tester and gets it free).
 *   POST {kind: "baby"|"rename", surname, style: "m"|"f"|"n", current? (rename), avoid?, due? (baby on a 預產期),
 *         input, gender, currency, timeZone, tzOffsetMinutes, locale}
 *   → 200 {url, token} · 200 {url, paid: true} (the same facts already bought) · 200 {url, token, tester: true}
 *   → 400 {error: "bad_birth"|"surname"|"current"} · 404 {error: "off"} · 502 checkout_failed · 503 paywall_off
 * No 挽回信 for this one (the recover letters know the older kinds only). Only the computed chart (喜用) is kept, never the birth.
 */
export async function handleName(req: NextRequest, body: CheckoutBody & Record<string, unknown>): Promise<NextResponse> {
  if (!(await featureVisible("name-paid", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  const birth = birthFromBody(body.input, body.gender);
  if ("error" in birth) return NextResponse.json({ error: "bad_birth", field: birth.error }, { status: 400 });
  const chart = chartFromBirth(body.input as BirthInput, birth.gender);
  if (!chart) return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 });
  const facts = nameFacts({ kind: body.kind, surname: body.surname, style: body.style, due: body.due, avoid: body.avoid, current: body.current }, chart);
  if ("error" in facts) return NextResponse.json({ error: facts.error }, { status: 400 });
  const locale = body.locale === "zh" ? "zh" : "zh-hant";
  const product = facts.kind === "rename" ? "name_rename" : "name_baby";

  const me = customerFromRequest(req);
  if (me) {
    const have = paidNameReportFor(me.customerId, facts, locale);
    if (have) return NextResponse.json({ url: nameReportPath(have, locale), paid: true });
  }
  const register = locale === "zh-hant" && hkReader(req.headers) ? "hk" : null;
  if (me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false))) {
    const t = createNameReport({ locale, register, customerId: me.customerId, email: me.email, facts, paid: { session: `tester:${me.customerId}`, amountMinor: 0 } });
    void ensureNameReport(t.token).catch(() => null);
    recordOps("name_tester", `${facts.kind} cust ${me.customerId}`);
    return NextResponse.json({ url: nameReportPath(t.token, locale), token: t.token, tester: true });
  }
  const { token } = createNameReport({ locale, register, customerId: me?.customerId ?? null, email: me?.email ?? null, facts });
  const path = nameReportPath(token, locale);

  const c = await checkoutCommon(req, body, { defaultCurrency: "TWD", localeOf: () => locale });
  const memberOff = can(await rightsFor(me?.customerId), "bigs_discount");
  const amount = catalogPrice(product, c.currency, { member: memberOff })!;
  try {
    const cancelTo = `${c.origin}/${locale}/name`, successUrl = `${c.origin}${path}?paid={CHECKOUT_SESSION_ID}`;
    const metadata = { name: token, report: facts.kind, c: "name", ...(memberOff ? { member_off: "1" } : {}), ...commonMeta(c, me, { tags: false }) };
    const s = await startOneOff(c, { product, kind: "name", amountMinor: amount, productName: CATALOG[product].name(locale), email: me?.email ?? null, successUrl, cancelUrl: cancelTo, metadata, customerId: me?.customerId ?? null });
    recordOps("name_checkout", `${facts.kind} ${c.currency}${memberOff ? " member" : ""}`);
    return NextResponse.json({ url: payHop(req, s.url, locale), token });
  } catch (e) {
    checkoutFailed("name_checkout", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
