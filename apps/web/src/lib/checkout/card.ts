import { type NextRequest, NextResponse } from "next/server";
import { payHop } from "../inapp-pay";
import { featureVisible } from "../features";
import { ADMIN_COOKIE } from "../admin-auth";
import { customerFromRequest } from "../auth";
import { giftMode, paywallOn } from "../paywall";
import { accessOf } from "../today-qian";
import { catalogPrice, CATALOG, sellable } from "../catalog";
import { checkoutCommon, checkoutFailed, commonMeta, startOneOff, type CheckoutBody } from "../checkout-core";

/**
 * 10-14 进度表 50 籤卡: 30 days of the full 今日一籤, paid once, never renewed (NT$59). Signed in, like the one-off month —
 * the card must land on an account. A member needs none (the lot is part of the membership).
 * 10-22 进度表 57: the handler behind both /api/today-qian/card and /api/checkout/v2 {product: "qian_card"}.
 */
export async function handleQianCard(req: NextRequest, body: CheckoutBody): Promise<NextResponse> {
  if (!(await featureVisible("today-qian", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "not_found" }, { status: 404 }); // 10-15 功能开关
  // 10-22 进度表 92: the 籤卡 is no longer sold — 今日一籤 in full belongs to the membership; cards already bought run to their end
  if (!sellable(CATALOG.qian_card, true)) return NextResponse.json({ error: "retired" }, { status: 410 });
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  const who = customerFromRequest(req);
  if (!who) return NextResponse.json({ error: "login_required" }, { status: 401 });
  if (giftMode()) return NextResponse.json({ gift: true });
  if (accessOf(who.customerId) === "member") return NextResponse.json({ error: "already_member" }, { status: 409 });
  const c = await checkoutCommon(req, body);
  const page = c.locale === "zh" ? "zh" : "zh-hant";
  try {
    const s = await startOneOff(c, {
      product: "qian_card", kind: "qiancard", amountMinor: catalogPrice("qian_card", c.currency)!, productName: CATALOG.qian_card.name(page), email: who.email,
      successUrl: `${c.origin}/${page}/today-qian?card={CHECKOUT_SESSION_ID}`, cancelUrl: `${c.origin}/${page}/today-qian#card`,
      metadata: commonMeta(c, who),
    });
    return NextResponse.json({ url: payHop(req, s.url, c.locale) });
  } catch (e) {
    checkoutFailed("qian_card_checkout", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
