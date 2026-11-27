import { type NextRequest, NextResponse } from "next/server";
import { payHop } from "../inapp-pay";
import { leftUrl, newCo, notePending } from "../recover-offer";
import { PLANS, yearlyOn, type Plan } from "../subscription";
import { asLocale } from "../locales";
import { customerFromRequest } from "../auth";
import { createCreditCoupon, createSubscriptionSession } from "../stripe";
import { creditCurrency, upgradeCredit } from "../upgrade-credit";
import { passCredit } from "../pass";
import { forgetStripeCustomer, latestSubscription, recordOps, setOrderCreditCoupon, startsAtMonthlyFee } from "../db";
import { giftMode, paywallOn } from "../paywall";
import { DEFAULT_CURRENCY, firstMonthExtraMinor, firstMonthMinor, formatMoney, isCurrency, priceMinor, stripeCurrency, type Currency } from "../money";
import { firstT } from "../dict/first-month";
import { CATALOG } from "../catalog";
import { commonMeta, routingFor, type CheckoutBody, type Common } from "../checkout-core";
import { uaSegment } from "../ua-brief";
import { isCampaignTag } from "../campaign";
import { isPromoCode, notePromoUse, promoFor, PROMO_COOKIE } from "../promos";

/**
 * Start a subscription (會員 month / year). Requires a signed-in account: the subscription must belong to an email we
 * can verify, so the entitlement follows the person, not a browser. Managed Payments routing mirrors the one-time
 * checkout (lib/checkout-core.ts).
 *   09-26 单买抵首月: two single purchases in 30 days — the latest one counts toward the first month (a credit coupon)
 *   10-10 首月同价: a first-time member's first month costs the one-off month's price; the monthly fee from the second
 *   10-22 升級會員差額折抵 (lib/pass.ts passCredit): what is left of a running 通卡 comes off the first invoice
 * 10-22 进度表 57: the handler behind both /api/sub/checkout and /api/checkout/v2 {product: "month" | "year"}.
 */
export async function handleSubscription(req: NextRequest, body: CheckoutBody & { plan?: unknown; noMp?: unknown }, fixedPlan?: Plan): Promise<NextResponse> {
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  const c = customerFromRequest(req);
  if (!c) return NextResponse.json({ error: "login_required" }, { status: 401 });
  // the painted door: the tap on a plan is the intent (tracked client-side as sub_intent); no subscription opens during the promotion test
  if (giftMode()) return NextResponse.json({ gift: true });
  const wanted = fixedPlan ?? body.plan;
  if (wanted === "year" && !yearlyOn()) return NextResponse.json({ error: "yearly_off" }, { status: 410 });
  const plan: Plan = wanted === "year" ? "year" : "month";
  const locale = asLocale(body.locale);
  let currency: Currency = isCurrency(body.currency) ? body.currency : DEFAULT_CURRENCY;
  // 09-26 (review): the credit is promised in the currency of their last single purchase — charge the month in that one
  if (plan === "month") { const cc = creditCurrency(c.customerId); if (cc && cc !== currency && upgradeCredit(c.customerId, cc)) currency = cc; }
  const timeZone = typeof body.timeZone === "string" ? body.timeZone : null;
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const routing = await routingFor(req, { locale, currency, timeZone, tzOffsetMinutes: body.tzOffsetMinutes });
  let managedPayments = routing.managedPayments;
  if (body.noMp === true) managedPayments = false;
  const g = uaSegment(req.headers.get("user-agent"));
  const promoCode = (() => { const v = req.cookies.get(PROMO_COOKIE)?.value?.toUpperCase(); return isPromoCode(v) ? v : null; })();
  const common: Common = { locale, currency, timeZone, origin, routing: { ...routing, managedPayments }, campaign: isCampaignTag(body.c) ? body.c : null, browserSid: typeof body.bs === "string" && /^[a-z0-9]{6,24}$/.test(body.bs) ? body.bs : null, remind: body.remind === true, device: `${g.device}:${g.app}`, promo: promoCode };

  const existing = latestSubscription(c.customerId);
  // 09-23 (Neil's screenshot: CN¥38 開通 → 「生成失敗了」): the account's last subscription pointed at a Stripe customer
  // that no longer exists (sandbox era), and every tap died on "No such customer".
  let stripeCustomerId = existing?.stripe_customer_id ?? null;
  let couponId: string | null = null;
  let passCredited: string | null = null;
  let passCreditMinor = 0, passCreditCur = ""; // 10-23 进度表 111 ③: so the welcome letter can say how much the pass took off
  if (plan === "month") {
    const credit = upgradeCredit(c.customerId, currency);
    if (credit) {
      try {
        couponId = credit.coupon ?? await createCreditCoupon(credit.amountMinor, credit.currency, credit.sessionId);
        if (!credit.coupon) setOrderCreditCoupon(credit.sessionId, couponId);
      } catch (e) {
        recordOps("sub_credit_fail", `cust ${c.customerId}: ${e instanceof Error ? e.message.slice(0, 160) : "?"}`);
      }
    }
    if (!couponId) {
      const pc = passCredit(c.customerId, currency);
      if (pc) {
        try { couponId = await createCreditCoupon(pc.amountMinor, pc.currency, pc.passId); passCredited = pc.passId; passCreditMinor = pc.amountMinor; passCreditCur = pc.currency; recordOps("pass_credit_offer", `cust ${c.customerId} ${pc.currency} ${pc.amountMinor} (${pc.daysLeft}d left)`); }
        catch (e) { recordOps("sub_credit_fail", `pass cust ${c.customerId}: ${e instanceof Error ? e.message.slice(0, 160) : "?"}`); }
      }
    }
  }
  // 10-23 进度表 109 ①: a campaign's promo on the first invoice — only when no credit is already riding there (one discount per checkout)
  let promoUsed: string | null = null;
  if (!couponId) {
    const pr = promoFor(promoCode, plan, currency);
    if (pr.ok) { couponId = pr.promo.stripe_coupon_id; promoUsed = pr.promo.code; }
  }
  const firstMonth = plan === "month" && !startsAtMonthlyFee(c.customerId) && firstMonthExtraMinor(currency) > 0;
  const firstMonthExtra = firstMonth
    ? { amountMinor: firstMonthExtraMinor(currency), name: firstT(locale, "stripeName", { first: formatMoney(currency, firstMonthMinor(currency), locale), month: formatMoney(currency, priceMinor(currency, "month"), locale) }) }
    : null;
  const productName = CATALOG[plan].name(locale);
  const successUrl = `${origin}/${locale}/account?sub={CHECKOUT_SESSION_ID}`, cancelTo = `${origin}/${locale}/account?sub=cancel`;
  const co = newCo();
  const make = (mp: boolean | undefined) => createSubscriptionSession({
    productName, amountCents: priceMinor(currency, plan), currency: stripeCurrency(currency), interval: PLANS[plan].interval,
    customerEmail: c.email, stripeCustomerId, successUrl, cancelUrl: leftUrl(origin, co, cancelTo), locale,
    managedPayments: mp, cardHint: !routing.plainRegion, couponId, firstMonthExtra,
    metadata: { ...commonMeta(common, { email: c.email, customerId: c.customerId }), plan, ...(firstMonth ? { first_month: "1" } : {}), ...(passCredited ? { pass_credit: passCredited, pass_credit_minor: String(passCreditMinor), pass_credit_cur: passCreditCur } : {}), ...(promoUsed && couponId ? { promo: promoUsed } : {}) },
  });

  try {
    const session = await make(managedPayments).catch(async (e: unknown) => {
      // a vanished customer: start clean with the account's email rather than fail the member forever
      if (stripeCustomerId && e instanceof Error && /No such customer/i.test(e.message)) {
        forgetStripeCustomer(stripeCustomerId);
        stripeCustomerId = null;
        return make(managedPayments);
      }
      throw e;
    });
    if (!session.url) throw new Error("no checkout url");
    if (promoUsed && couponId) notePromoUse({ sessionId: session.id, code: promoUsed, product: plan, currency, customerId: c.customerId });
    // 10-15 挽回信改版: written down so the one letter can reopen this checkout with the first payment at 70 %
    notePending({ co, sessionId: session.id, kind: plan === "year" ? "year" : "month", email: c.email, remind: common.remind, locale, currency: stripeCurrency(currency),
      amount: priceMinor(currency, plan) + (firstMonthExtra?.amountMinor ?? 0), product: productName, managed: managedPayments !== false, cardHint: !routing.plainRegion,
      metadata: { email: c.email, locale, plan, currency, ...(firstMonth ? { first_month: "1" } : {}), ...(routing.country ? { country: routing.country } : {}), _extra: String(firstMonthExtra?.amountMinor ?? 0), _extraName: firstMonthExtra?.name ?? "", _scus: stripeCustomerId ?? "" },
      cancelUrl: cancelTo, successUrl });
    return NextResponse.json({ url: payHop(req, session.url, locale) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    // a stale or already-used credit coupon must never block the membership itself
    if (couponId && /coupon|discount/i.test(msg)) {
      couponId = null;
      try { const retry = await make(managedPayments); if (retry.url) return NextResponse.json({ url: payHop(req, retry.url, locale) }); } catch { /* fall through */ }
    }
    // Managed Payments may refuse the buyer's country or the subscription mode itself — sell anyway, plain Stripe
    if (managedPayments !== false && /not currently supported|managed_payments|subscription/i.test(msg)) {
      try { const retry = await make(false); if (retry.url) return NextResponse.json({ url: payHop(req, retry.url, locale) }); } catch { /* fall through */ }
    }
    recordOps("sub_checkout_fail", `cust ${c.customerId} ${currency} ${plan} mp=${managedPayments}: ${msg.slice(0, 200)}`); // 09-23: this failed silently
    return NextResponse.json({ error: "checkout_failed", detail: msg }, { status: 502 });
  }
}
