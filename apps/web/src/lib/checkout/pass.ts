import { type NextRequest, NextResponse } from "next/server";
import { payHop } from "../inapp-pay";
import { leftUrl, newCo, notePending } from "../recover-offer";
import { customerFromRequest, safeNextPath } from "../auth";
import { ADMIN_COOKIE } from "../admin-auth";
import { featureVisible } from "../features";
import { giftMode, paywallOn } from "../paywall";
import { recordOps } from "../db";
import { rightsFor } from "../entitlements";
import { FIRST_DEEP_COOKIE, stripeCurrency } from "../money";
import { catalogPrice, CATALOG, type CatalogId } from "../catalog";
import { PASS_NAMES, firstPassEligible, latestRunningPass } from "../pass";
import { armPayLogin } from "../pay-login";
import { isTongkaDays, type TongkaDays } from "../tongka";
import { checkoutCommon, checkoutFailed, commonMeta, startOneOff, type CheckoutBody } from "../checkout-core";

/**
 * 09-26 会员单月: start a one-off month. Signed-in only, like the plans — the membership must land on an address we can
 * verify. Not for someone who is already a member (a second month would stack on nothing we can show).
 *
 * 10-22 通卡 (lib/tongka.ts, 进度表 75): the same handler sells the 1 日 / 7 天 / 30 天 passes when the `tongka` switch is
 * visible to this request — `days` picks one. A pass may be bought without an account: Stripe collects the address,
 * the return (/api/pass/sync) signs the paying browser in when the address is new (lib/pay-login.ts rules), and an
 * address that already has an account is asked to sign in by email. A pass bought while one is running queues behind
 * it (lib/pass.ts). `returnTo` is the page to come back to (a path on this site); the account page by default.
 *   POST {days?, locale, currency, timeZone, tzOffsetMinutes, returnTo?, c?, bs?, remind?}
 *   → 200 {url, days, first} · 401 login_required (the old one-off month without the switch) · 409 already_member
 *     (a renewing membership never needs a pass) · 503 paywall_off · 502 checkout_failed
 * 10-22 进度表 57: the handler behind both /api/pass/checkout and /api/checkout/v2 {product: "pass_1" | "pass_7" | "pass_30"}.
 */
export async function handlePass(req: NextRequest, body: CheckoutBody & { days?: unknown }, fixedDays?: TongkaDays): Promise<NextResponse> {
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  const who = customerFromRequest(req);
  const tongka = await featureVisible("tongka", req.cookies.get(ADMIN_COOKIE)?.value);
  if (!who && !tongka) return NextResponse.json({ error: "login_required" }, { status: 401 });
  if (giftMode()) return NextResponse.json({ gift: true });
  const wanted = fixedDays ?? Number(body.days);
  const days: TongkaDays = tongka && isTongkaDays(wanted) ? wanted : 30;
  // 10-22 进度表 56: the rights table (lib/entitlements.ts) — a member has it all already; a 通卡 holder may queue another card
  const r = await rightsFor(who?.customerId);
  if (r.sub && (!tongka || r.standing !== "pass")) return NextResponse.json({ error: "already_member" }, { status: 409 });
  const c = await checkoutCommon(req, body);

  // 10-22 首次 1 日通卡: the account's first pass of any kind (a browser with no account: no first-deep cookie)
  const first = tongka && days === 1 && (who ? firstPassEligible(who.customerId, who.email) : !req.cookies.get(FIRST_DEEP_COOKIE)?.value);
  const product: CatalogId = `pass_${days}`;
  const amount = catalogPrice(product, c.currency, { first })!;
  const productName = tongka ? CATALOG[product].name(c.locale) : (PASS_NAMES[c.locale] ?? PASS_NAMES.en!);

  const back = safeNextPath(body.returnTo) ?? `/${c.locale}/account`;
  const successUrl = `${c.origin}${back}${back.includes("?") ? "&" : "?"}pass={CHECKOUT_SESSION_ID}`;
  const cancelTo = tongka ? `${c.origin}${back}` : `${c.origin}/${c.locale}/account#membership`;
  const running = who ? latestRunningPass(who.customerId) : null;
  const co = newCo();
  const meta = {
    ...commonMeta(c, who),
    days: String(days), ...(first ? { first_pass: "1" } : {}), ...(running ? { after: running.stripe_subscription_id } : {}),
  };
  try {
    const s = await startOneOff(c, { product, kind: "pass", amountMinor: amount, productName, email: who?.email ?? null, successUrl, cancelUrl: leftUrl(c.origin, co, cancelTo), metadata: meta, customerId: who?.customerId ?? null });
    // 10-15 挽回信改版: written down so the one letter can reopen this month at 70 %
    notePending({ co, sessionId: s.id, kind: "pass", email: who?.email ?? null, remind: c.remind, locale: c.locale, currency: stripeCurrency(c.currency), amount,
      product: productName, managed: c.routing.managedPayments !== false, methods: c.routing.methods ?? null, cardHint: !c.routing.plainRegion,
      metadata: { ...commonMeta(c, who, { tags: false }), kind: "pass", days: String(days) }, cancelUrl: cancelTo, successUrl });
    recordOps("pass_checkout", `${days}d ${c.currency}${first ? " first" : ""}${who ? "" : " anon"}`);
    const res = NextResponse.json({ url: payHop(req, s.url, c.locale), days, first });
    // 10-22: a browser with no account is signed in on return when the address is new (lib/pay-login.ts)
    if (!who) armPayLogin(req, res, s.id);
    return res;
  } catch (e) {
    checkoutFailed("pass_checkout", e);
    recordOps("pass_checkout_ctx", `${who ? `cust ${who.customerId}` : "anon"} ${days}d ${c.currency}`);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
