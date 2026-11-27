import { type NextRequest, NextResponse } from "next/server";
import { payHop } from "../inapp-pay";
import { customerFromRequest } from "../auth";
import { paywallOn } from "../paywall";
import { recordOps } from "../db";
import { entitlementFor, tongkaLive } from "../subscription";
import { packName } from "../pack";
import type { Currency } from "../money";
import { checkoutCommon, checkoutFailed, commonMeta, startOneOff, type CheckoutBody } from "../checkout-core";

/**
 * 09-29 会员增购包: a signed-in member buys 15 more full readings. Charged in the membership's own currency; refused past
 * 2 packs this period or with more than 5 bought readings still unspent (the balance would pass 20).
 * 10-02: or the small pack of 5 (`size: "small"`); a large pack may take in this period's single extras and small
 * packs (lib/pack-quote.ts). The price is the server's own quote; a page showing an older one is told to refresh.
 * 10-22 通卡: not sold once the model is live (packBuyable is false, so no quote exists) — 410 gone.
 * 10-22 进度表 57: the handler behind both /api/pack/checkout and /api/checkout/v2 {product: "pack_l" | "pack_s"}.
 */
export async function handlePack(req: NextRequest, body: CheckoutBody & { size?: unknown; expect?: unknown }, fixedSize?: "small" | "large"): Promise<NextResponse> {
  if (!paywallOn()) return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  const c = customerFromRequest(req);
  if (!c) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const ent = await entitlementFor(c.customerId);
  if (!ent.active || ent.comp) return NextResponse.json({ error: "not_member" }, { status: 403 });
  const size = (fixedSize ?? body.size) === "small" ? "small" : "large";
  const quote = ent.packQuotes?.[size] ?? null;
  if (!quote) return NextResponse.json({ error: tongkaLive() ? "gone" : "pack_limit" }, { status: tongkaLive() ? 410 : 409 });
  // the page priced it a moment ago — if a single or a pack has landed since, its button is out of date
  if (typeof body.expect === "number" && body.expect !== quote.minor) return NextResponse.json({ error: "quote_changed", quote }, { status: 409 });
  const common = await checkoutCommon(req, { ...body, currency: quote.currency as Currency });
  try {
    const s = await startOneOff(common, {
      product: size === "small" ? "pack_s" : "pack_l", kind: "pack", amountMinor: quote.minor, productName: packName(common.locale, quote), email: c.email,
      successUrl: `${common.origin}/${common.locale}/account?pack={CHECKOUT_SESSION_ID}`, cancelUrl: `${common.origin}/${common.locale}/account#membership`,
      metadata: {
        ...commonMeta(common, c, { tags: false }), units: String(quote.units), size: quote.size,
        ...(quote.creditUnits > 0 ? { credit_minor: String(quote.creditMinor), credit_units: String(quote.creditUnits), credit_singles: String(quote.creditSingles) } : {}),
      },
    });
    return NextResponse.json({ url: payHop(req, s.url, common.locale) });
  } catch (e) {
    checkoutFailed("pack_checkout", e);
    recordOps("pack_checkout_ctx", `cust ${c.customerId} ${size} ${quote.currency}`);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
