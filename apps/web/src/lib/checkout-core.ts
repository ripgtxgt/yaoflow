import type { NextRequest } from "next/server";
import { uaSegment } from "./ua-brief";
import { buyerCountry, managedPaymentsAllowed, plainCheckoutRegion } from "./geo";
import { alipayPossible, createPassSession, MAINLAND_METHODS, type CheckoutSession } from "./stripe";
import { DEFAULT_CURRENCY, isCurrency, isMainlandTimeZone, stripeCurrency, type Currency } from "./money";
import { asLocale, type Locale } from "./locales";
import { isCampaignTag } from "./campaign";
import { recordOps } from "./db";
import type { CatalogId } from "./catalog";
import { isPromoCode, notePromoUse, promoFor, PROMO_COOKIE } from "./promos";
import { leftUrl, newCo, notePending } from "./recover-offer";

/**
 * 10-22 进度表 57 — the part of a checkout every product repeats, written once: which currency, how the buyer is routed
 * (Managed Payments or our own page, the mainland's Alipay + card), the metadata every session carries (locale, currency,
 * country, the routing reason, the campaign tag, the browser, the device), and the one-off session itself.
 * The product handlers (lib/checkout/*.ts) add only what is theirs: the price from the catalog, the line-item name, where
 * to come back to, and their own metadata. Both the old routes and POST /api/checkout/v2 run the same handlers.
 *
 * Routing rule (the same for every product now; before 10-22 four routes lacked the middle clause):
 *   Managed Payments is off for a mainland clock, for a 简体 page whose clock sits at UTC+8 with no zone name, and for
 *   any yuan amount; TW / HK buyers go to our own page (plainCheckoutRegion); the mainland route names alipay + card.
 */
export interface CheckoutBody {
  locale?: unknown; currency?: unknown; timeZone?: unknown; tzOffsetMinutes?: unknown; c?: unknown; bs?: unknown; remind?: unknown; returnTo?: unknown;
}
export interface Routing { country: string | null; managedPayments: boolean | undefined; plainRegion: string | null; methods: readonly string[] | undefined }
export interface Common {
  locale: Locale; currency: Currency; timeZone: string | null; origin: string; routing: Routing;
  /** the campaign tag and browser session the page sent, when well-formed */
  campaign: string | null; browserSid: string | null; remind: boolean;
  /** device:app from the user agent (10-14 进度表 49) */
  device: string;
  /** 10-23 进度表 109 ①: the promo code a campaign link left in this browser (lib/promos.ts), when well-formed */
  promo: string | null;
}

export async function routingFor(req: NextRequest, i: { locale: Locale; currency: Currency; timeZone: string | null; tzOffsetMinutes: unknown }): Promise<Routing> {
  let managedPayments: boolean | undefined;
  let country: string | null = null;
  if ((process.env.STRIPE_GEO_ROUTING ?? "on") !== "off") {
    try { country = await buyerCountry(req.headers); managedPayments = managedPaymentsAllowed(country); } catch { /* default */ }
  }
  const tz = Number(i.tzOffsetMinutes);
  if (managedPayments !== false && (isMainlandTimeZone(i.timeZone, i.locale, req.headers.get("accept-language")) || (i.locale === "zh" && tz === 480 && !i.timeZone) || i.currency === "CNY")) managedPayments = false; // 10-05: yuan never goes through Managed Payments
  const plainRegion = managedPayments !== false ? plainCheckoutRegion(country, i.timeZone) : null;
  if (plainRegion) managedPayments = false;
  // 10-04 支付宝: a one-off payment on the mainland route names alipay + card (Alipay takes CNY / USD; never a subscription)
  const methods = managedPayments === false && !plainRegion && alipayPossible(i.currency) ? MAINLAND_METHODS : undefined;
  return { country, managedPayments, plainRegion, methods };
}

/** read the body's common fields and work out the routing once */
export async function checkoutCommon(req: NextRequest, body: CheckoutBody, o: { defaultCurrency?: Currency; localeOf?: (x: unknown) => Locale } = {}): Promise<Common> {
  const locale = (o.localeOf ?? asLocale)(body.locale);
  const currency: Currency = isCurrency(body.currency) ? body.currency : (o.defaultCurrency ?? DEFAULT_CURRENCY);
  const timeZone = typeof body.timeZone === "string" ? body.timeZone : null;
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const routing = await routingFor(req, { locale, currency, timeZone, tzOffsetMinutes: body.tzOffsetMinutes });
  const g = uaSegment(req.headers.get("user-agent"));
  return {
    locale, currency, timeZone, origin, routing,
    campaign: isCampaignTag(body.c) ? body.c : null,
    browserSid: typeof body.bs === "string" && /^[a-z0-9]{6,24}$/.test(body.bs) ? body.bs : null,
    remind: body.remind === true,
    device: `${g.device}:${g.app}`,
    promo: (() => { const v = req.cookies.get(PROMO_COOKIE)?.value?.toUpperCase(); return isPromoCode(v) ? v : null; })(),
  };
}

/** the metadata every session carries; a product adds its own on top */
export function commonMeta(c: Common, who: { email: string; customerId: number } | null, o: { tags?: boolean } = {}): Record<string, string> {
  return {
    ...(who ? { email: who.email, cust: String(who.customerId) } : {}),
    locale: c.locale, currency: c.currency,
    ...(c.routing.country ? { country: c.routing.country } : {}),
    ...(c.routing.plainRegion ? { mp_reason: `plain-${c.routing.plainRegion.toLowerCase()}` } : {}),
    ...(o.tags === false ? {} : { ...(c.campaign ? { c: c.campaign } : {}), ...(c.browserSid ? { bs: c.browserSid } : {}), dv: c.device, ...(c.remind ? { remind: "1" } : {}) }),
  };
}

export type SessionKind = NonNullable<Parameters<typeof createPassSession>[0]["kind"]>;

/** one one-off session, routed as above; throws when Stripe gives no page */
export async function startOneOff(c: Common, i: {
  product: CatalogId; kind: SessionKind; amountMinor: number; productName: string; email: string | null;
  successUrl: string; cancelUrl: string; metadata: Record<string, string>;
  /** who is buying, for the promo report */
  customerId?: number | null;
}): Promise<CheckoutSession & { url: string }> {
  // 10-23 进度表 109 ①: a campaign's promo, when it is good for this product (never on a first 1-day pass — already at its first price)
  const pr = promoFor(c.promo, i.product, c.currency, { first: i.metadata.first_pass === "1" });
  const make = (couponId: string | null) => createPassSession({
    kind: i.kind, amountMinor: i.amountMinor, currency: stripeCurrency(c.currency), productName: i.productName,
    locale: c.locale, email: i.email, managedPayments: c.routing.managedPayments, cardHint: !c.routing.plainRegion, paymentMethodTypes: c.routing.methods,
    successUrl: i.successUrl, cancelUrl: i.cancelUrl, metadata: couponId && pr.ok ? { ...i.metadata, promo: pr.promo.code } : i.metadata, couponId,
  });
  let s: CheckoutSession;
  if (pr.ok) {
    try {
      s = await make(pr.promo.stripe_coupon_id);
      notePromoUse({ sessionId: s.id, code: pr.promo.code, product: i.product, currency: c.currency, customerId: i.customerId ?? null });
    } catch (e) {
      // a coupon Stripe will not take must never block the sale itself
      recordOps("promo_coupon_refused", `${pr.promo.code} ${i.product}: ${(e instanceof Error ? e.message : "?").slice(0, 160)}`);
      s = await make(null);
    }
  } else s = await make(null);
  if (!s.url) throw new Error("no url");
  return s as CheckoutSession & { url: string };
}

/**
 * 10-23 进度表 111 ③: a one-off product (塔羅、解籤、合盤、年書) is written down for the one reminder letter, as a pass is —
 * the letter only goes to someone who ticked 「沒付完時寄信提醒我」 (lib/recover-offer.ts runRecoverOffers). For these the
 * letter reminds at the same price; only a 通卡 gets the hour at 70 % (进度表 113).
 * `cancelTo` is where 「返回」 lands; the session's own cancel link passes through /api/recover/left first.
 */
export function recoverLinks(c: Common, cancelTo: string): { co: string; cancelUrl: string } {
  const co = newCo();
  return { co, cancelUrl: leftUrl(c.origin, co, cancelTo) };
}
export function noteOneOffForRecover(c: Common, i: { co: string; sessionId: string; kind: "tarot" | "qian" | "hepan" | "nianshu" | "bazi"; email: string | null; amount: number; productName: string; metadata: Record<string, string>; cancelTo: string; successUrl: string }): void {
  notePending({
    co: i.co, sessionId: i.sessionId, kind: i.kind, email: i.email, remind: c.remind, locale: c.locale, currency: stripeCurrency(c.currency), amount: i.amount,
    product: i.productName, managed: c.routing.managedPayments !== false, methods: c.routing.methods ?? null, cardHint: !c.routing.plainRegion,
    metadata: i.metadata, cancelUrl: i.cancelTo, successUrl: i.successUrl,
  });
}

/** the failure line every checkout writes */
export const checkoutFailed = (what: string, e: unknown): void => recordOps(`${what}_fail`, (e instanceof Error ? e.message : "unknown").slice(0, 220));
