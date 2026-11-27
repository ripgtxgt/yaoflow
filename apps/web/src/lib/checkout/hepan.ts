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
import { cleanQuestion, createHepanReport, ensureHepanReport, hepanFacts, hepanPeopleFromBody, hepanReportPath, paidHepanReportFor } from "../mingli/hepan/report";
import { INVITE_ID_RE } from "../mingli/hepan/invite-link";
import { inviteFacts } from "../mingli/hepan/invite";
import { checkoutCommon, checkoutFailed, commonMeta, noteOneOffForRecover, recoverLinks, startOneOff, type CheckoutBody } from "../checkout-core";
import { isLocale, type Locale } from "../locales";
import { isForeign } from "../l10n/core";
import { serviceOpenIn } from "../services";
import { hepanT } from "../mingli/hepan/page-ui";

/**
 * 10-20 合盤報告 — one-off for everyone; a 會員 pays 8 折 (Neil 10-22: 只給會員); a signed-in admin browser is a tester
 * and gets it free.
 *   POST {a: {input, gender}, b: {input, gender}, currency, timeZone, tzOffsetMinutes, locale, question?}
 *        or, 10-21, {invite: <id>, …} — the inviter buying from the facts TA's browser had the server compute
 *        (lib/mingli/hepan/invite.ts): no birth travels at all → 404 {error: "no_invite"} when TA has not filled in
 *   → 200 {url: <Stripe checkout>, token} · 200 {url: <report page>, paid: true} when this signed-in reader already has
 *     the same pair (同一對只收一次錢 — a new question is re-asked in it) · 200 {url, token, tester: true} for a tester
 *   → 400 {error: "bad_birth", field} · 404 {error: "off"} · 502 {error: "checkout_failed"} · 503 {error: "paywall_off"}
 * Only the two birth inputs and genders are read (names are never sent); the server recomputes the facts and stores
 * nothing else — never either person's birth date, time, place or name.
 * 10-22 进度表 57: the handler behind both /api/hepan/checkout and /api/checkout/v2 {product: "hepan"}.
 */
export async function handleHepan(req: NextRequest, body: CheckoutBody & { a?: unknown; b?: unknown; invite?: unknown; question?: unknown }): Promise<NextResponse> {
  if (!(await featureVisible("hepan", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  // 10-30 进度表 128 ④: in every language the 合盤 is open in (the report is written in it)
  const locale: Locale = typeof body.locale === "string" && isLocale(body.locale) && serviceOpenIn("hepan", body.locale) ? body.locale : body.locale === "zh" ? "zh" : "zh-hant";
  const invite = typeof body.invite === "string" && INVITE_ID_RE.test(body.invite) ? body.invite : null;
  let facts;
  if (invite) {
    const r = inviteFacts(invite);
    if (!r) return NextResponse.json({ error: "no_invite" }, { status: 404 });
    facts = r.facts;
  } else {
    const people = hepanPeopleFromBody(body.a, body.b);
    if ("error" in people) return NextResponse.json({ error: "bad_birth", field: people.error }, { status: 400 });
    try { facts = hepanFacts(people.a, people.b); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }
  }

  const question = cleanQuestion(body.question);
  const me = customerFromRequest(req);
  if (me) {
    const have = paidHepanReportFor(me.customerId, facts, locale, question);
    if (have) return NextResponse.json({ url: hepanReportPath(have, locale), paid: true });
  }
  const register = locale === "zh-hant" && hkReader(req.headers) ? "hk" : null;
  if (me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false))) {
    const t = createHepanReport({ locale, register, customerId: me.customerId, email: me.email, facts, question, paid: { session: `tester:${me.customerId}`, amountMinor: 0 } });
    void ensureHepanReport(t.token).catch(() => null);
    recordOps("hepan_report_tester", `cust ${me.customerId}`);
    return NextResponse.json({ url: hepanReportPath(t.token, locale), token: t.token, tester: true });
  }
  const { token } = createHepanReport({ locale, register, customerId: me?.customerId ?? null, email: me?.email ?? null, facts, question });
  const path = hepanReportPath(token, locale);

  const c = await checkoutCommon(req, body, { defaultCurrency: "TWD", localeOf: () => locale });
  // 10-22 會員 8 折 (Neil: 只給會員，通卡原價) — the rights table (lib/entitlements.ts)
  const memberOff = can(await rightsFor(me?.customerId), "bigs_discount");
  const amount = catalogPrice("hepan", c.currency, { member: memberOff })!;
  try {
    // 10-23 进度表 111 ③: written down for the one reminder letter (when the reader asked for it)
    const cancelTo = `${c.origin}/${locale}/hepan`, successUrl = `${c.origin}${path}?paid={CHECKOUT_SESSION_ID}`;
    const rl = recoverLinks(c, cancelTo);
    const metadata = { hepan: token, report: "pair", c: invite ? "hepan-invite" : "hepan", ...(memberOff ? { member_off: "1" } : {}), ...commonMeta(c, me, { tags: false }) };
    const email = me?.email ?? null, productName = isForeign(locale) ? hepanT(locale).productName ?? CATALOG.hepan.name(locale) : CATALOG.hepan.name(locale);
    const s = await startOneOff(c, { product: "hepan", kind: "hepan", amountMinor: amount, productName, email, successUrl, cancelUrl: rl.cancelUrl, metadata });
    noteOneOffForRecover(c, { co: rl.co, sessionId: s.id, kind: "hepan", email, amount, productName, metadata, cancelTo, successUrl });
    recordOps("hepan_checkout", `${c.currency}${invite ? " invite" : ""}${memberOff ? " member" : ""}`);
    return NextResponse.json({ url: payHop(req, s.url, locale), token });
  } catch (e) {
    checkoutFailed("hepan_checkout", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
