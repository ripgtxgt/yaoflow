import { type NextRequest, NextResponse } from "next/server";
import { payHop } from "../inapp-pay";
import { customerFromRequest } from "../auth";
import { paywallOn } from "../paywall";
import { createSubUse, recordOps } from "../db";
import { allowance, rightsFor, spendRight, useRight } from "../entitlements";
import { catalogPrice, CATALOG } from "../catalog";
import { markTarotPaid, TAROT_TOKEN_RE, tarotDraw } from "../tarot";
import { ensureTarotPersonal, tarotResultPath } from "../tarot-personal";
import { record } from "../analytics-server";
import type { Locale } from "../locales";
import { checkoutCommon, checkoutFailed, commonMeta, noteOneOffForRecover, recoverLinks, startOneOff, type CheckoutBody } from "../checkout-core";

/**
 * 10-16 进度表 68: 「這幾張牌放在你這件事上」 at the light-reading price (Neil: 不新开塔罗专属价), in the currency the
 * page showed; a member / 通卡 holder gets it as one of theirs (the rights table, under the day's cap).
 *   POST {token, currency, timeZone, tzOffsetMinutes} → {url} · {url, paid: true} · {url, member: true}
 * 10-22 进度表 57: the handler behind both /api/tarot/checkout and /api/checkout/v2 {product: "tarot"}.
 */
export async function handleTarot(req: NextRequest, body: CheckoutBody & { token?: unknown }): Promise<NextResponse> {
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  const token = typeof body.token === "string" && TAROT_TOKEN_RE.test(body.token) ? body.token : null;
  const d = token ? tarotDraw(token) : null;
  if (!token || !d) return NextResponse.json({ error: "no_draw" }, { status: 404 });
  const path = tarotResultPath(token, d.locale);
  if (d.paid_at) return NextResponse.json({ url: path, paid: true });
  const c = await checkoutCommon(req, body, { defaultCurrency: "TWD", localeOf: () => d.locale as Locale });
  const amount = catalogPrice("tarot", c.currency)!;
  const me = customerFromRequest(req);
  if (me) {
    const r = await rightsFor(me.customerId);
    const sub = allowance(r, "one") > 0 ? r.sub : null;
    if (sub) {
      const v = useRight(r, "tarot_reading", { ref: token }); // 10 spreads a Taipei day (the same spread reopened is not counted again)
      if (!v.ok) return NextResponse.json({ error: v.why === "not_allowed" ? "member_only" : v.why }, { status: v.why === "not_allowed" ? 402 : 429 });
      spendRight(r, "tarot_reading", token);
      createSubUse({ subscriptionId: sub.id, customerId: me.customerId, tier: "one", locale: d.locale as Locale, token: `tarot_${token}`, inputJson: JSON.stringify({ tarot: token, spread: d.spread }) });
      markTarotPaid(token, { session: `member:${sub.id}`, email: me.email, currency: c.currency, amountMinor: 0, customerId: me.customerId });
      void ensureTarotPersonal(token).catch(() => null); // 10-17: start writing now, before the page asks
      record({ t: Date.now(), e: "tarot", s: token.slice(-12), locale: d.locale, method: "paid", tier: "member" });
      recordOps("tarot_member", `${d.spread} cust ${me.customerId}`);
      return NextResponse.json({ url: path, member: true });
    }
  }
  try {
    // 10-23 进度表 111 ③: written down for the one reminder letter (when the reader asked for it)
    const cancelTo = `${c.origin}${path}#personal`, successUrl = `${c.origin}${path}?paid={CHECKOUT_SESSION_ID}`;
    const rl = recoverLinks(c, cancelTo);
    const metadata = { tarot: token, spread: String(d.spread), c: "tarot", ...commonMeta(c, me, { tags: false }) };
    const email = me?.email ?? d.email ?? null, productName = CATALOG.tarot.name(c.locale);
    const s = await startOneOff(c, { product: "tarot", kind: "tarot", amountMinor: amount, productName, email, successUrl, cancelUrl: rl.cancelUrl, metadata });
    noteOneOffForRecover(c, { co: rl.co, sessionId: s.id, kind: "tarot", email, amount, productName, metadata, cancelTo, successUrl });
    recordOps("tarot_checkout", `${d.spread} ${c.currency}`);
    return NextResponse.json({ url: payHop(req, s.url, c.locale) });
  } catch (e) {
    checkoutFailed("tarot_checkout", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
