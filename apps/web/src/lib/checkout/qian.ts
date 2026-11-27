import { type NextRequest, NextResponse } from "next/server";
import { payHop } from "../inapp-pay";
import { customerFromRequest } from "../auth";
import { paywallOn } from "../paywall";
import { createSubUse, markQianPaid, qianDrawByToken, recordOps } from "../db";
import { allowance, rightsFor, spendRight, useRight } from "../entitlements";
import { catalogPrice, CATALOG } from "../catalog";
import { QIAN_LOCALE, QIAN_TOKEN_RE, qianResultPath } from "../qian-meta";
import { checkoutCommon, checkoutFailed, commonMeta, noteOneOffForRecover, recoverLinks, startOneOff, type CheckoutBody } from "../checkout-core";

/**
 * 10-12 解籤 · 次路径 (进度表 §四 36 ③): 「這支籤放在我這件事上」 at the light-reading price, in the currency the page
 * showed. A one-off Checkout (kind "qian"); no account needed — Stripe asks for the address the link is sent to.
 * Back on the result page with ?paid=<session>, the reading is written there; the fulfil sweep covers a buyer who
 * never comes back. 10-12 承接 ⑨ (Neil: 「会员现在解籤还要另付 NT$75，这条最要紧」): a member's / 通卡 holder's lot reading
 * is one of theirs (the rights table, under the day's cap).
 * 10-22 进度表 57: the handler behind both /api/qian/checkout and /api/checkout/v2 {product: "qian_personal"}.
 */
export async function handleQianPersonal(req: NextRequest, body: CheckoutBody & { token?: unknown }): Promise<NextResponse> {
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  const token = typeof body.token === "string" && QIAN_TOKEN_RE.test(body.token) ? body.token : null;
  const d = token ? qianDrawByToken(token) : null;
  if (!token || !d) return NextResponse.json({ error: "no_draw" }, { status: 404 });
  if (d.paid_at) return NextResponse.json({ url: qianResultPath(token), paid: true });
  const c = await checkoutCommon(req, body, { defaultCurrency: "TWD", localeOf: () => QIAN_LOCALE });
  const amount = catalogPrice("qian_personal", c.currency)!;
  const me = customerFromRequest(req);
  if (me) {
    const r = await rightsFor(me.customerId);
    const sub = allowance(r, "one") > 0 ? r.sub : null;
    if (sub) {
      const v = useRight(r, "qian_personal", { ref: token }); // 10 lot readings a Taipei day (the same lot reopened is not counted again)
      if (!v.ok) return NextResponse.json({ error: v.why === "not_allowed" ? "member_only" : v.why }, { status: v.why === "not_allowed" ? 402 : 429 });
      spendRight(r, "qian_personal", token);
      createSubUse({ subscriptionId: sub.id, customerId: me.customerId, tier: "one", locale: QIAN_LOCALE, token: `qian_${token}`, inputJson: JSON.stringify({ qian: token, num: d.num }) });
      markQianPaid(token, { session: `member:${sub.id}`, email: me.email, currency: c.currency, amountMinor: 0, customerId: me.customerId });
      recordOps("qian_member", `${d.num} cust ${me.customerId}`);
      return NextResponse.json({ url: qianResultPath(token), member: true });
    }
  }
  try {
    // 10-23 进度表 111 ③: written down for the one reminder letter (when the reader asked for it)
    const cancelTo = `${c.origin}${qianResultPath(token)}#personal`, successUrl = `${c.origin}${qianResultPath(token)}?paid={CHECKOUT_SESSION_ID}`;
    const rl = recoverLinks(c, cancelTo);
    const metadata = { qian: token, num: String(d.num), c: "jieqian", ...commonMeta(c, me, { tags: false }) };
    const email = me?.email ?? d.email ?? null, productName = CATALOG.qian_personal.name(QIAN_LOCALE);
    const s = await startOneOff(c, { product: "qian_personal", kind: "qian", amountMinor: amount, productName, email, successUrl, cancelUrl: rl.cancelUrl, metadata });
    noteOneOffForRecover(c, { co: rl.co, sessionId: s.id, kind: "qian", email, amount, productName, metadata, cancelTo, successUrl });
    recordOps("qian_checkout", `${d.num} ${c.currency}`);
    return NextResponse.json({ url: payHop(req, s.url, c.locale) });
  } catch (e) {
    checkoutFailed("qian_checkout", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
