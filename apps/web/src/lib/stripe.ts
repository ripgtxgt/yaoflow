/**
 * Minimal Stripe REST client (no SDK dependency).
 * v1 design: no database, no webhook — the Checkout Session IS the order record.
 * Cast data rides in session metadata; the success page retrieves the session
 * server-side and only generates after `payment_status === "paid"`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { LOCALE_META, type Locale } from "./locales";

const API = "https://api.stripe.com/v1";

/**
 * 09-23 (Neil: 「stripe api 有可更新的版本，你要不要去升级一下？」): every request names
 * its API version. Without it, each call used the account default, so pressing
 * 「升级」 in the dashboard would have changed the shape of every live response at
 * once. 2026-08-26.dahlia: non-breaking against 2026-07-29.dahlia (changelog),
 * checked on the live account before switching.
 */
export const STRIPE_VERSION = "2026-08-26.dahlia";

function key(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY is not configured");
  return k;
}

/** application/x-www-form-urlencoded encoder with bracket nesting. */
function form(data: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) p.append(k, String(v));
  }
  return p.toString();
}

export interface CheckoutSession {
  id: string;
  url: string | null;
  mode?: "payment" | "subscription" | "setup";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  status: "open" | "complete" | "expired";
  metadata: Record<string, string>;
  customer_details?: { email?: string | null } | null;
  amount_total?: number | null;
  currency?: string | null;
  /** subscription mode: the created subscription and customer ids */
  subscription?: string | null;
  customer?: string | null;
  /** payment mode: the PaymentIntent id — what a refund is issued against */
  payment_intent?: string | null;
}

export interface StripeRefund { id: string; status: string; amount: number; currency: string; payment_intent: string | null }

/**
 * Refund a one-time payment in full. Stripe's `reason` vocabulary is
 * duplicate | fraudulent | requested_by_customer; ours (technical_failure …)
 * is kept in metadata and on the order row.
 */
export async function createRefund(paymentIntent: string, reason: string, amountMinor?: number): Promise<StripeRefund> {
  if (!/^pi_[a-zA-Z0-9_]+$/.test(paymentIntent)) throw new Error("bad payment intent");
  const stripeReason = reason === "duplicate" ? "duplicate" : "requested_by_customer";
  // 10-23 进度表 107 ②: a part of the payment back (the admin's 「部分退款」); without it, all of it
  if (amountMinor !== undefined && !(Number.isInteger(amountMinor) && amountMinor > 0)) throw new Error("bad refund amount");
  return (await stripePost("/refunds", {
    payment_intent: paymentIntent,
    reason: stripeReason,
    "metadata[yaoflow_reason]": reason,
    ...(amountMinor !== undefined ? { amount: amountMinor } : {}),
  })) as StripeRefund;
}

/**
 * 10-23 进度表 107 ② 存会员费抵扣: money on the customer's Stripe balance, taken off their next invoices (a negative balance
 * transaction is a credit). In the currency of their subscription — Stripe refuses a credit in another one.
 */
export async function createBalanceCredit(stripeCustomerId: string, amountMinor: number, currency: string, description: string): Promise<{ id: string; amount: number; currency: string; ending_balance?: number }> {
  if (!/^cus_[A-Za-z0-9]+$/.test(stripeCustomerId)) throw new Error("not a customer id");
  if (!(Number.isInteger(amountMinor) && amountMinor > 0)) throw new Error("bad credit amount");
  return (await stripePost(`/customers/${stripeCustomerId}/balance_transactions`, {
    amount: -amountMinor, currency: currency.toLowerCase(), description: description.slice(0, 350),
  })) as { id: string; amount: number; currency: string; ending_balance?: number };
}

/**
 * 10-23 进度表 109 ① 优惠码: a coupon for a campaign — a percentage or a fixed amount in one currency, once (a membership:
 * its first invoice), optionally until a date and for so many uses. Which products it is good for is ours to decide
 * (lib/promos.ts) — the line items are priced inline, so Stripe has no product to restrict it to.
 */
export async function createPromoCoupon(i: { code: string; percentOff?: number | null; amountOff?: number | null; currency?: string | null; redeemBy?: number | null; maxRedemptions?: number | null }): Promise<{ id: string; valid?: boolean }> {
  if (!/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(i.code)) throw new Error("bad promo code");
  const off = i.percentOff ? { percent_off: i.percentOff } : i.amountOff && i.currency ? { amount_off: i.amountOff, currency: i.currency.toLowerCase() } : null;
  if (!off) throw new Error("no discount");
  return (await stripePost("/coupons", {
    ...off, duration: "once", name: `YaoFlow ${i.code}`.slice(0, 40), "metadata[yaoflow_promo]": i.code,
    ...(i.redeemBy ? { redeem_by: Math.floor(i.redeemBy / 1000) } : {}),
    ...(i.maxRedemptions ? { max_redemptions: i.maxRedemptions } : {}),
  })) as { id: string; valid?: boolean };
}
/** a coupon as Stripe counts it: how many times it was used, and whether it still works */
export async function getCoupon(id: string): Promise<{ id: string; times_redeemed: number; valid: boolean }> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("bad coupon id");
  return (await stripeGet(`/coupons/${encodeURIComponent(id)}`)) as { id: string; times_redeemed: number; valid: boolean };
}

/** The checkout session a PaymentIntent belongs to — for webhooks that only name the charge. */
export async function sessionForPaymentIntent(paymentIntent: string): Promise<CheckoutSession | null> {
  if (!/^pi_[a-zA-Z0-9_]+$/.test(paymentIntent)) return null;
  const r = (await stripeGet(`/checkout/sessions?payment_intent=${encodeURIComponent(paymentIntent)}&limit=1`)) as { data: CheckoutSession[] };
  return r.data[0] ?? null;
}

/**
 * EU/UK 14-day withdrawal: digital content delivered at once may waive it only
 * with the buyer's express consent and acknowledgement (Consumer Rights
 * Directive art. 16(m) / UK CCR reg. 37). Stripe Checkout shows a required
 * "I agree to the Terms" box when the account has a terms-of-service URL in
 * its public details, and the acceptance text below spells the waiver out.
 * CHECKOUT_TOS_CONSENT=1 turns it on once Neil has set that URL — without it
 * Stripe rejects the session.
 */
const TOS_ACCEPTANCE: Record<Locale, string> = {
  zh: "我同意 YaoFlow 的条款，并要求立即交付这份数字内容；我知悉交付开始后即失去 14 天撤回权。",
  "zh-hant": "我同意 YaoFlow 的條款，並要求立即交付這份數位內容；我知悉交付開始後即失去 14 天撤回權。",
  en: "I agree to YaoFlow's Terms and ask for this digital content to be delivered immediately; I understand that I lose the 14-day right of withdrawal once delivery begins.",
  ja: "YaoFlow の利用規約に同意し、このデジタルコンテンツの即時提供を求めます。提供開始後は 14 日間の撤回権を失うことを了解しています。",
  ko: "YaoFlow 약관에 동의하며 이 디지털 콘텐츠의 즉시 전달을 요청합니다. 전달이 시작되면 14일 철회권을 잃는다는 점을 이해합니다.",
  fr: "J'accepte les conditions de YaoFlow et demande la fourniture immédiate de ce contenu numérique\u202f; je reconnais perdre mon droit de rétractation de 14 jours dès le début de la fourniture.",
  de: "Ich stimme den Bedingungen von YaoFlow zu und stimme ausdrücklich zu, dass mit der Bereitstellung dieses digitalen Inhalts sofort begonnen wird; mir ist bekannt, dass ich mit Beginn der Bereitstellung mein 14-tägiges Widerrufsrecht verliere.",
  es: "Acepto los términos de YaoFlow y solicito la entrega inmediata de este contenido digital; entiendo que pierdo el derecho de desistimiento de 14 días una vez iniciada la entrega.",
  pt: "Aceito os termos do YaoFlow e peço a entrega imediata deste conteúdo digital; compreendo que perco o direito de arrependimento de 14 dias assim que a entrega começa.",
};

/**
 * 09-22: Stripe now rejects `custom_text` outright when Managed Payments is on
 * ("custom_text cannot be used with Managed Payments, which is enabled by
 * default on your account"). Every TW/HK checkout was 400-ing on the first
 * attempt and only succeeding through the fallback that turns Managed Payments
 * OFF — which quietly moved the tax liability from Stripe back onto us. The
 * consent checkbox itself is still accepted, so we keep that (Stripe renders
 * its own wording) and drop only our custom sentence. The same sentence is
 * shown on our side of the checkout button, and the 14-day withdrawal clause
 * lives in the Terms it links to.
 */
function consentFields(locale: Locale | "auto" | undefined, managedPayments?: boolean): Record<string, string> {
  // 09-26 (Neil: 「好，做吧」): the required box on Stripe's page was one more step on a page most people
  // left without typing anything. The same consent is given on our side, in the line right under the pay
  // buttons (payConsent: "By paying you agree to the Terms and ask for immediate delivery…"), which is
  // where CRD Art.16(m) needs it. CHECKOUT_TOS_CONSENT=force brings Stripe's box back.
  if (process.env.CHECKOUT_TOS_CONSENT !== "force") return {};
  const l: Locale = locale && locale !== "auto" ? locale : "en";
  const base: Record<string, string> = { "consent_collection[terms_of_service]": "required" };
  if (managedPayments === false) base["custom_text[terms_of_service_acceptance][message]"] = TOS_ACCEPTANCE[l];
  return base;
}

/**
 * 09-23: the one card-network payment we have seen from a mainland card (UnionPay debit, ¥9.90) was
 * blocked by Stripe's own risk check as "highest risk" — never sent to the bank. The buyer saw only
 * 「卡被拒绝」, wandered for two minutes and left. Until Alipay / WeChat Pay are approved, the mainland
 * channel (Managed Payments off — the only place Stripe lets us add text) says what to do, right above
 * the pay button. Honest about the one thing we know: a blocked attempt charges nothing.
 */
const CARD_HINT: Partial<Record<Locale, string>> = {
  zh: "中国大陆的银联卡偶尔会被支付风控拦下（显示「卡被拒绝」），这种情况不会扣款。遇到时换一张 Visa 或万事达卡再试即可。",
  "zh-hant": "中國大陸的銀聯卡偶爾會被支付風控攔下（顯示「卡被拒絕」），這種情況不會扣款。遇到時換一張 Visa 或萬事達卡再試即可。",
  en: "Mainland China UnionPay cards are sometimes stopped by the payment risk check (shown as “card declined”); nothing is charged. If that happens, try a Visa or Mastercard.",
};
// 10-04 支付宝: on a page that offers Alipay, the hint points there first
// 10-09 (Neil: 「做第1个吧」): and says what to do when Alipay itself refuses — it gives no reason (one reader, three
// tries on 10-09); nothing is charged, and another source inside Alipay or a Visa / Mastercard usually goes through
const ALIPAY_HINT: Partial<Record<Locale, string>> = {
  zh: "大陆用户请直接选支付宝付款。付款被拒绝不会扣款：用卡被拒可以改用支付宝；支付宝显示付款失败，可以在支付宝里换余额或储蓄卡再试，或改用 Visa、万事达卡。",
  "zh-hant": "大陸用戶請直接選支付寶付款。付款被拒絕不會扣款：用卡被拒可以改用支付寶；支付寶顯示付款失敗，可以在支付寶裡換餘額或儲蓄卡再試，或改用 Visa、萬事達卡。",
  en: "Alipay is accepted here — mainland China buyers, choose Alipay. A declined payment charges nothing: if a card is declined, use Alipay; if Alipay says the payment failed, pick your balance or a debit card inside Alipay, or pay with a Visa or Mastercard.",
};
function cardHintFields(locale: Locale | "auto" | undefined, managed: boolean, hint = true, alipay = false): Record<string, string> {
  if (managed || !hint) return {};
  const l: Locale = locale && locale !== "auto" ? locale : "zh";
  const table = alipay ? ALIPAY_HINT : CARD_HINT;
  return { "custom_text[submit][message]": table[l] ?? table.en! };
}

/**
 * 10-04 支付宝 (Neil: 「我在 stripe 里面看到可以用支付宝付款了，为什么我刚才试了，却没有显示支付宝呢」): left to its
 * own judgement, Stripe showed a mainland buyer's CNY session only card + Link — it decides wallets by the network
 * it sees, and mainland buyers mostly arrive through proxies. The mainland route now names its methods. Alipay is
 * one-time only (never on a subscription) and takes CNY or USD on this account (TWD / HKD are refused).
 */
export const ALIPAY_CURRENCIES = new Set(["cny", "usd"]);
export const alipayPossible = (currency: string): boolean => ALIPAY_CURRENCIES.has(currency.toLowerCase());
export const MAINLAND_METHODS = ["alipay", "card"] as const;
function methodFields(types: readonly string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  (types ?? []).forEach((t, i) => { out[`payment_method_types[${i}]`] = t; });
  return out;
}

export interface CreateSessionInput {
  productName: string;
  amountCents: number;
  currency?: string;
  successUrl: string;
  cancelUrl: string;
  /** Site locale; mapped to Stripe's own checkout locale codes (zh-TW, pt-BR…). */
  locale?: Locale | "auto";
  metadata: Record<string, string>;
  /**
   * Per-buyer override of Managed Payments. Undefined keeps the env default.
   * Set false for buyers in countries Managed Payments cannot serve.
   */
  managedPayments?: boolean;
  /** 09-25: the address the buyer gave us before Stripe — prefilled so the receipt and the order share it */
  customerEmail?: string | null;
  /** 09-26: the UnionPay hint is for the mainland route only; a TW/HK plain checkout does not need it */
  cardHint?: boolean;
  /** 10-04: name the payment methods instead of leaving them to Stripe's guess (the mainland route: alipay + card) */
  paymentMethodTypes?: readonly string[];
  /** 10-23 进度表 109 ①: a campaign's coupon (lib/promos.ts) — taken off on Stripe's page and its receipt */
  couponId?: string | null;
}

export async function createCheckoutSession(input: CreateSessionInput): Promise<CheckoutSession> {
  /**
   * Managed Payments makes Stripe the merchant of record and handles global tax,
   * but its own coverage excludes some buyer countries (mainland China among them:
   * checkout fails with "China is not currently supported").
   * Set STRIPE_MANAGED_PAYMENTS=off to sell to those buyers — you then owe the
   * tax handling yourself (enable Stripe Tax separately if you need it).
   */
  const envDefault = (process.env.STRIPE_MANAGED_PAYMENTS ?? "on") !== "off";
  // a per-buyer decision (geo routing) wins over the env default
  const managed = input.managedPayments ?? envDefault;

  /**
   * With Managed Payments off, Stripe Tax computes the correct tax per buyer
   * location (filing remains ours). Prices are treated as tax-exclusive by
   * default; STRIPE_TAX=off disables it entirely.
   */
  const stripeTax = !managed && (process.env.STRIPE_TAX ?? "on") !== "off";

  const body: Record<string, string | number> = {
    mode: "payment",
    ...(managed ? {} : { "managed_payments[enabled]": "false" }),
    ...(stripeTax
      ? {
          "automatic_tax[enabled]": "true",
          // needed for Tax to determine the buyer's location
          billing_address_collection: "auto",
        }
      : {}),
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": input.currency ?? "usd",
    "line_items[0][price_data][unit_amount]": input.amountCents,
    // 09-23 (Neil chose it): the price on our page is the price they pay.
    // Tax is carved out of it, not added on top — NT$69 used to become
    // NT$72.45 on Stripe's page, and Taiwan requires consumer prices to include tax.
    "line_items[0][price_data][tax_behavior]": "inclusive",
    "line_items[0][price_data][product_data][name]": input.productName,
    // 商品税务分类码：Managed Payments 必填，Stripe Tax 也依赖它判断税率
    ...(managed || stripeTax
      ? { "line_items[0][price_data][product_data][tax_code]": process.env.STRIPE_TAX_CODE ?? "txcd_10000000" }
      : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    locale: input.locale && input.locale !== "auto" ? LOCALE_META[input.locale].stripe : "auto",
    ...consentFields(input.locale, managed),
    ...cardHintFields(input.locale, managed, input.cardHint ?? true, !!input.paymentMethodTypes?.includes("alipay")),
    ...methodFields(input.paymentMethodTypes),
    ...(input.couponId ? { "discounts[0][coupon]": input.couponId } : {}),
  };
  for (const [k, v] of Object.entries(input.metadata)) {
    body[`metadata[${k}]`] = v.slice(0, 490); // stripe metadata value limit 500
  }
  const res = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`, "Stripe-Version": STRIPE_VERSION,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`stripe create session ${res.status}: ${t.slice(0, 300)}`);
  }
  return (await res.json()) as CheckoutSession;
}

/**
 * 09-26 会员单月: one payment, 30 days of membership, no subscription object. A
 * Stripe customer is created so the charge can be traced back to the member
 * (the finance page matches membership payments by customer).
 */
export async function createPassSession(input: {
  /** 10-12: optional — a lot's personal reading is bought without an account; Stripe asks for the address */
  amountMinor: number; currency: string; productName: string; locale: Locale; email?: string | null;
  successUrl: string; cancelUrl: string; managedPayments?: boolean; cardHint?: boolean; metadata: Record<string, string>;
  /** 09-29: the same one-off checkout also sells a member's extra pack; 10-12: and a lot's personal reading (解籤) */
  kind?: "pass" | "pack" | "qian" | "qiancard" | "tarot" | "bazi" | "ziwei" | "astro" | "hepan" | "nianshu" | "name";
  /** 10-04: the mainland route names its methods (alipay + card) */
  paymentMethodTypes?: readonly string[];
  /** 10-23 进度表 109 ①: a campaign's coupon (lib/promos.ts) */
  couponId?: string | null;
}): Promise<CheckoutSession> {
  const envDefault = (process.env.STRIPE_MANAGED_PAYMENTS ?? "on") !== "off";
  const managed = input.managedPayments ?? envDefault;
  const body: Record<string, string | number> = {
    mode: "payment",
    ...(managed ? {} : { "managed_payments[enabled]": "false" }),
    ...(input.couponId ? { "discounts[0][coupon]": input.couponId } : {}),
    customer_creation: "always",
    ...(input.email ? { customer_email: input.email } : {}),
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": input.currency,
    "line_items[0][price_data][unit_amount]": input.amountMinor,
    "line_items[0][price_data][tax_behavior]": "inclusive",
    "line_items[0][price_data][product_data][name]": input.productName,
    ...(managed ? { "line_items[0][price_data][product_data][tax_code]": process.env.STRIPE_TAX_CODE ?? "txcd_10000000" } : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    locale: LOCALE_META[input.locale].stripe,
    ...consentFields(input.locale, managed),
    ...cardHintFields(input.locale, managed, input.cardHint ?? true, !!input.paymentMethodTypes?.includes("alipay")),
    ...methodFields(input.paymentMethodTypes),
  };
  for (const [k, v] of Object.entries({ ...input.metadata, kind: input.kind ?? "pass" })) body[`metadata[${k}]`] = v.slice(0, 490);
  return (await stripePost("/checkout/sessions", body)) as CheckoutSession;
}

/* ---------------- 09-26 钱包直付 (Apple Pay / Google Pay on our own page) ---------------- */

/** The publishable key — public by design, read at request time so it can be set without a rebuild. */
export const publishableKey = (): string | null => {
  // WALLET_PAY=on is the switch: the key alone is not enough, the domain must be registered for Apple / Google Pay first
  if ((process.env.WALLET_PAY ?? "off") !== "on") return null;
  const k = process.env.STRIPE_PUBLISHABLE_KEY ?? "";
  return /^pk_(live|test)_[A-Za-z0-9]+$/.test(k) ? k : null;
};

export interface WalletIntent { id: string; client_secret: string; status: string }

/**
 * A PaymentIntent for the wallet sheet on our page. Only for buyers who are
 * off Managed Payments anyway (Taiwan / Hong Kong — lib/geo plainCheckoutRegion):
 * the same metadata as a Checkout session, so fulfilment reads it the same way.
 */
export async function createWalletIntent(i: { amountMinor: number; currency: string; email: string | null; description: string; metadata: Record<string, string> }): Promise<WalletIntent> {
  const body: Record<string, string | number> = {
    amount: i.amountMinor,
    currency: i.currency,
    "automatic_payment_methods[enabled]": "true",
    description: i.description.slice(0, 200),
    ...(i.email ? { receipt_email: i.email } : {}),
  };
  for (const [k, v] of Object.entries({ ...i.metadata, kind: "wallet" })) body[`metadata[${k}]`] = v.slice(0, 490);
  return (await stripePost("/payment_intents", body)) as WalletIntent;
}

export interface PaymentIntentFull {
  id: string; status: string; amount_received: number; currency: string; created: number;
  receipt_email?: string | null; metadata: Record<string, string>;
  latest_charge?: { billing_details?: { email?: string | null } | null } | string | null;
}

export async function getPaymentIntent(id: string): Promise<PaymentIntentFull> {
  if (!/^pi_[a-zA-Z0-9]+$/.test(id)) throw new Error("bad payment intent id");
  return (await stripeGet(`/payment_intents/${id}?expand[]=latest_charge`)) as PaymentIntentFull;
}

/** Recent wallet payments that succeeded — for the fulfil cron's safety net. */
export async function recentWalletIntents(sinceSec: number): Promise<PaymentIntentFull[]> {
  const j = (await stripeGet(`/payment_intents?limit=30&created[gte]=${sinceSec}&expand[]=data.latest_charge`)) as { data?: PaymentIntentFull[] };
  return (j.data ?? []).filter((p) => p.status === "succeeded" && p.metadata?.kind === "wallet");
}

export const walletEmailOf = (p: PaymentIntentFull): string | null =>
  (p.latest_charge && typeof p.latest_charge === "object" ? p.latest_charge.billing_details?.email : null) ?? p.receipt_email ?? null;

/** 10-04 挽回信: every Checkout Session since `sinceSec`, newest first (Stripe's own order), paged 100 at a time. */
export interface ListedSession extends CheckoutSession { created: number; customer_email?: string | null; locale?: string | null }
export async function listCheckoutSessions(sinceSec: number, maxPages = 60): Promise<ListedSession[]> {
  const out: ListedSession[] = [];
  let after: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const j = (await stripeGet(`/checkout/sessions?limit=100&created[gte]=${sinceSec}${after ? `&starting_after=${after}` : ""}`)) as { data?: ListedSession[]; has_more?: boolean };
    const data = j.data ?? [];
    out.push(...data);
    if (!j.has_more || !data.length) break;
    after = data[data.length - 1]!.id;
  }
  return out;
}

export async function getCheckoutSession(id: string): Promise<CheckoutSession> {
  if (!/^cs_[a-zA-Z0-9_]+$/.test(id)) throw new Error("bad session id");
  // 09-23: an old sandbox link (cs_test_…) opened after going live asked Stripe and got a 404 in its error log;
  // a live key can never see a test session, and vice versa
  if (id.startsWith("cs_test_") !== key().startsWith("sk_test_")) throw new Error("stripe get session 404: other mode");
  const res = await fetch(`${API}/checkout/sessions/${id}`, {
    headers: { Authorization: `Bearer ${key()}`, "Stripe-Version": STRIPE_VERSION },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`stripe get session ${res.status}: ${t.slice(0, 300)}`);
  }
  return (await res.json()) as CheckoutSession;
}

/* ---------------- subscriptions (Stripe Billing) ---------------- */

async function stripePost(path: string, body: Record<string, string | number | undefined>): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Stripe-Version": STRIPE_VERSION, "Content-Type": "application/x-www-form-urlencoded" },
    body: form(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`stripe ${path} ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

async function stripeGet(path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key()}`, "Stripe-Version": STRIPE_VERSION },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`stripe ${path} ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

export interface SubscriptionCheckoutInput {
  productName: string;
  /** Stripe minor units in `currency` (cents; whole yen/won) */
  amountCents: number;
  /** lowercase ISO code; the subscription renews in this currency */
  currency?: string;
  interval: "month" | "year";
  customerEmail: string;
  /** reuse the Stripe customer when we already have one, so the portal shows one history */
  stripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
  locale?: Locale | "auto";
  metadata: Record<string, string>;
  managedPayments?: boolean;
  /** 09-26: see CreateSessionInput.cardHint */
  cardHint?: boolean;
  /**
   * 改年付 (09-23): the first charge waits until this moment (unix seconds) —
   * the day their monthly plan runs out — so switching never bills twice.
   * Probed live under Managed Payments: accepted, 0 due today.
   */
  billingCycleAnchor?: number;
  /** 09-26 单买抵首月: a one-off coupon crediting a single purchase against the first month */
  couponId?: string | null;
  /**
   * 10-10 首月同价: a one-time line on the first invoice only (the one-off month's price minus the monthly fee), named so
   * Stripe's page reads "first month … then {month}/month". Absent for returning members.
   */
  firstMonthExtra?: { amountMinor: number; name: string } | null;
}

/** 09-26: a single-use coupon worth one single purchase, off the first membership invoice only. */
export async function createCreditCoupon(amountMinor: number, currency: string, orderSid: string): Promise<string> {
  const c = (await stripePost("/coupons", {
    amount_off: amountMinor, currency: currency.toLowerCase(), duration: "once", max_redemptions: 1,
    name: "YaoFlow credit", "metadata[order]": orderSid.slice(0, 200),
  })) as { id: string };
  return c.id;
}

/**
 * A recurring price is created inline (price_data with `recurring`), so no
 * dashboard product setup is needed — the same posture as the one-time flow.
 */
export async function createSubscriptionSession(input: SubscriptionCheckoutInput): Promise<CheckoutSession> {
  const envDefault = (process.env.STRIPE_MANAGED_PAYMENTS ?? "on") !== "off";
  const managed = input.managedPayments ?? envDefault;
  const stripeTax = !managed && (process.env.STRIPE_TAX ?? "on") !== "off";
  const body: Record<string, string | number> = {
    mode: "subscription",
    ...(managed ? {} : { "managed_payments[enabled]": "false" }),
    ...(stripeTax ? { "automatic_tax[enabled]": "true", billing_address_collection: "auto" } : {}),
    ...(input.stripeCustomerId ? { customer: input.stripeCustomerId } : { customer_email: input.customerEmail }),
    // 09-23: automatic tax on an EXISTING customer needs an address on that customer, or Stripe
    // refuses the session — let Checkout write the one the buyer types back onto it
    ...(input.stripeCustomerId && stripeTax ? { "customer_update[address]": "auto", "customer_update[name]": "auto" } : {}),
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": input.currency ?? "usd",
    "line_items[0][price_data][unit_amount]": input.amountCents,
    // 09-23 (Neil chose it): the price on our page is the price they pay.
    // Tax is carved out of it, not added on top — NT$69 used to become
    // NT$72.45 on Stripe's page, and Taiwan requires consumer prices to include tax.
    "line_items[0][price_data][tax_behavior]": "inclusive",
    "line_items[0][price_data][recurring][interval]": input.interval,
    "line_items[0][price_data][product_data][name]": input.productName,
    ...(managed || stripeTax
      ? { "line_items[0][price_data][product_data][tax_code]": process.env.STRIPE_TAX_CODE ?? "txcd_10000000" }
      : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    locale: input.locale && input.locale !== "auto" ? LOCALE_META[input.locale].stripe : "auto",
    ...consentFields(input.locale, managed),
    ...cardHintFields(input.locale, managed, input.cardHint ?? true),
    ...(input.billingCycleAnchor
      ? { "subscription_data[billing_cycle_anchor]": input.billingCycleAnchor, "subscription_data[proration_behavior]": "none" }
      : {}),
    ...(input.couponId ? { "discounts[0][coupon]": input.couponId } : {}),
    // 10-10 首月同价: Checkout puts a one-time price on the subscription's first invoice and never again
    ...(input.firstMonthExtra && input.firstMonthExtra.amountMinor > 0
      ? {
        "line_items[1][quantity]": 1,
        "line_items[1][price_data][currency]": input.currency ?? "usd",
        "line_items[1][price_data][unit_amount]": input.firstMonthExtra.amountMinor,
        "line_items[1][price_data][tax_behavior]": "inclusive",
        "line_items[1][price_data][product_data][name]": input.firstMonthExtra.name.slice(0, 250),
        ...(managed || stripeTax ? { "line_items[1][price_data][product_data][tax_code]": process.env.STRIPE_TAX_CODE ?? "txcd_10000000" } : {}),
      }
      : {}),
  };
  for (const [k, v] of Object.entries(input.metadata)) {
    body[`metadata[${k}]`] = v.slice(0, 490);
    body[`subscription_data[metadata][${k}]`] = v.slice(0, 490);
  }
  return (await stripePost("/checkout/sessions", body)) as CheckoutSession;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: "active" | "trialing" | "past_due" | "unpaid" | "canceled" | "incomplete" | "incomplete_expired" | "paused";
  cancel_at_period_end: boolean;
  /**
   * 09-23: Stripe schedules a cancellation in TWO ways, and the dashboard
   * prints 「取消日期」 for both. `cancel_at_period_end` is the flag; `cancel_at`
   * is a timestamp. We only read the flag, so kiki0931611144's cancellation
   * (cancel_at = 10-22 22:22, flag false) arrived by webhook, was mirrored as
   * an ordinary update, and raised no alert at all — the first real
   * cancellation and we said nothing.
   */
  cancel_at?: number | null;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
  /** what they picked in the portal when cancelling (09-23: the portal now asks) */
  cancellation_details?: { feedback?: string | null; comment?: string | null; reason?: string | null } | null;
  /** 暂停一个月: set while invoices are being voided */
  pause_collection?: { behavior?: string; resumes_at?: number | null } | null;
  items?: { data: { price?: { recurring?: { interval?: string }; currency?: string; unit_amount?: number | null }; current_period_start?: number; current_period_end?: number }[] };
}

export async function getSubscription(id: string): Promise<StripeSubscription> {
  if (!/^sub_[a-zA-Z0-9]+$/.test(id)) throw new Error("bad subscription id");
  return (await stripeGet(`/subscriptions/${id}`)) as StripeSubscription;
}

/**
 * Change a live subscription (09-23, 挽回): undo a scheduled cancellation, or
 * pause collection for a month. An empty string unsets a field in Stripe's API.
 */
export async function updateSubscription(id: string, body: Record<string, string | number>): Promise<StripeSubscription> {
  if (!/^sub_[a-zA-Z0-9]+$/.test(id)) throw new Error("bad subscription id");
  return (await stripePost(`/subscriptions/${id}`, body)) as StripeSubscription;
}

/**
 * 10-23 (Neil: a member who disputed the year's charge and won it back still read 「会员 · 年付」 to 2027, and could not be
 * deleted): end a subscription NOW — no proration credit, no final invoice. No money moves either way; the access ends.
 */
export async function cancelSubscriptionNow(id: string): Promise<StripeSubscription> {
  if (!/^sub_[a-zA-Z0-9]+$/.test(id)) throw new Error("bad subscription id");
  const res = await fetch(`${API}/subscriptions/${id}?invoice_now=false&prorate=false`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key()}`, "Stripe-Version": STRIPE_VERSION },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`stripe /subscriptions/${id} ${res.status}: ${t.slice(0, 300)}`);
  }
  return (await res.json()) as StripeSubscription;
}

/** The customer's self-service page (change card, cancel, invoices). Needs the portal enabled once in the dashboard. */
export async function createPortalSession(stripeCustomerId: string, returnUrl: string, locale?: Locale, cancelSubscription?: string): Promise<{ url: string }> {
  if (!/^cus_[a-zA-Z0-9]+$/.test(stripeCustomerId)) throw new Error("bad customer id");
  if (cancelSubscription && !/^sub_[a-zA-Z0-9]+$/.test(cancelSubscription)) throw new Error("bad subscription id");
  return (await stripePost("/billing_portal/sessions", {
    customer: stripeCustomerId,
    return_url: returnUrl,
    ...(locale ? { locale: LOCALE_META[locale].stripe } : {}),
    // 09-30 续订专属: from our own "before you cancel" page, straight to Stripe's cancel confirmation (it still asks why)
    ...(cancelSubscription ? {
      "flow_data[type]": "subscription_cancel",
      "flow_data[subscription_cancel][subscription]": cancelSubscription,
      "flow_data[after_completion][type]": "redirect",
      "flow_data[after_completion][redirect][return_url]": returnUrl,
    } : {}),
  })) as { url: string };
}

/**
 * Verify a Stripe webhook signature (Stripe-Signature: t=…,v1=…): HMAC-SHA256
 * over `${t}.${payload}` with the endpoint secret, within a 5-minute window.
 */
export function verifyWebhookSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=") as [string, string]));
  const t = parts.t;
  const v1 = header.split(",").map((kv) => kv.trim()).filter((kv) => kv.startsWith("v1=")).map((kv) => kv.slice(3));
  if (!t || v1.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return v1.some((sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

/* ---------------- 收据与发票 (09-25) ---------------- */

const RECEIPT_CACHE = new Map<string, string | null>();

/** Stripe's hosted receipt for a one-off payment (latest charge of the payment intent). Best-effort, cached, never throws. */
export async function receiptUrlFor(paymentIntent: string | null | undefined): Promise<string | null> {
  if (!paymentIntent || !/^pi_[A-Za-z0-9]+$/.test(paymentIntent)) return null;
  if (RECEIPT_CACHE.has(paymentIntent)) return RECEIPT_CACHE.get(paymentIntent)!;
  try {
    const pi = (await stripeGet(`/payment_intents/${paymentIntent}?expand[]=latest_charge`)) as { latest_charge?: { receipt_url?: string | null } | null } | null;
    const url = pi?.latest_charge?.receipt_url ?? null;
    if (url) RECEIPT_CACHE.set(paymentIntent, url);
    return url;
  } catch {
    return null;
  }
}

export interface InvoiceLink { id: string; created: number; total: number; currency: string; status: string; hosted: string | null; pdf: string | null }

/** A customer's Stripe invoices (memberships), newest first. Best-effort, never throws. */
export async function invoicesFor(stripeCustomerId: string | null | undefined, limit = 12): Promise<InvoiceLink[]> {
  if (!stripeCustomerId || !/^cus_[A-Za-z0-9]+$/.test(stripeCustomerId)) return [];
  try {
    const j = (await stripeGet(`/invoices?customer=${stripeCustomerId}&limit=${limit}`)) as { data?: Record<string, unknown>[] } | null;
    return (j?.data ?? [])
      .filter((i) => i.status === "paid" || i.status === "open")
      .map((i) => ({
        id: String(i.id), created: Number(i.created) * 1000, total: Number(i.total) || 0, currency: String(i.currency ?? "usd"),
        status: String(i.status), hosted: typeof i.hosted_invoice_url === "string" ? i.hosted_invoice_url : null, pdf: typeof i.invoice_pdf === "string" ? i.invoice_pdf : null,
      }));
  } catch {
    return [];
  }
}

/* ---------------- 10-23 进度表 111 / 110: what the membership letters say about money — read-only ---------------- */

export interface OpenBill { id: string; created: number; amountDue: number; currency: string; hosted: string | null; nextAttempt: number | null; attempts: number }

/**
 * The renewal bill Stripe could not collect: its pay page (where another card can be used), what is due, when Stripe
 * tries again. Read-only; null when there is none or on any error — the letter then points at the account page.
 */
export async function openBillFor(subscriptionId: string): Promise<OpenBill | null> {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return null;
  try {
    const j = (await stripeGet(`/invoices?subscription=${subscriptionId}&status=open&limit=1`)) as { data?: Record<string, unknown>[] } | null;
    const i = j?.data?.[0];
    if (!i) return null;
    return {
      id: String(i.id), created: Number(i.created) * 1000, amountDue: Number(i.amount_due) || 0, currency: String(i.currency ?? ""),
      hosted: typeof i.hosted_invoice_url === "string" ? i.hosted_invoice_url : null,
      nextAttempt: typeof i.next_payment_attempt === "number" ? i.next_payment_attempt * 1000 : null,
      attempts: Number(i.attempt_count) || 0,
    };
  } catch {
    return null;
  }
}

/** 10-24 续费成功信: the renewal bill of the period that began at `periodStart` (ms) */
export interface RenewalBill { id: string; total: number; paid: number; currency: string; at: number; hosted: string | null }
/**
 * 10-24 (Neil: 「然后续费为什么没有发邮件呢」): the `subscription_cycle` bill Stripe made when this period began — paid (with
 * what the card was charged and when), still on its way (Stripe charges about an hour after the period starts; a failed
 * charge stays open while it retries), or none (voided, never made). Throws on a Stripe error — the caller tries again.
 */
export async function renewalBillFor(subscriptionId: string, periodStart: number): Promise<{ state: "paid"; bill: RenewalBill } | { state: "pending" } | { state: "none" }> {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return { state: "none" };
  const j = (await stripeGet(`/invoices?subscription=${subscriptionId}&limit=5`)) as { data?: Record<string, unknown>[] } | null;
  for (const i of j?.data ?? []) {
    if (i.billing_reason !== "subscription_cycle") continue;
    const created = Number(i.created) * 1000;
    if (!Number.isFinite(created) || Math.abs(created - periodStart) > 2 * 86_400_000) continue;
    if (i.status === "paid") {
      const paidAt = (i.status_transitions as { paid_at?: number | null } | undefined)?.paid_at;
      return { state: "paid", bill: {
        id: String(i.id), total: Number(i.total) || 0, paid: Number(i.amount_paid) || 0, currency: String(i.currency ?? ""),
        at: typeof paidAt === "number" ? paidAt * 1000 : created, hosted: typeof i.hosted_invoice_url === "string" ? i.hosted_invoice_url : null,
      } };
    }
    return i.status === "draft" || i.status === "open" ? { state: "pending" } : { state: "none" };
  }
  return { state: "none" };
}

/**
 * The subscription's next bill as Stripe would make it now — the total and what is left to pay once the customer's
 * balance is taken off. A preview: nothing is created or charged. Null on any error (the letter then works it out from
 * the plan's price and the balance).
 */
export async function nextBillPreview(subscriptionId: string): Promise<{ total: number; due: number; currency: string } | null> {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return null;
  try {
    const i = (await stripePost("/invoices/create_preview", { subscription: subscriptionId })) as Record<string, unknown>;
    if (typeof i?.total !== "number" || typeof i?.amount_due !== "number") return null;
    return { total: i.total, due: i.amount_due, currency: String(i.currency ?? "") };
  } catch {
    return null;
  }
}

/* ---------------- 10-23 定时核对 (lib/ops-checks.ts): read-only ---------------- */

/** What one invoice billed, what the customer balance took off it, what was due and paid. */
export interface InvoiceAmounts {
  id: string; created: number; status: string; billingReason: string | null; currency: string;
  total: number; startingBalance: number; amountDue: number; amountPaid: number;
}

/** A subscription's invoices made since `sinceSec`, newest first. Read-only; throws on a Stripe error. */
export async function subscriptionInvoicesSince(subscriptionId: string, sinceSec: number): Promise<InvoiceAmounts[]> {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return [];
  const j = (await stripeGet(`/invoices?subscription=${subscriptionId}&created[gte]=${Math.floor(sinceSec)}&limit=10`)) as { data?: Record<string, unknown>[] } | null;
  return (j?.data ?? []).map((i) => ({
    id: String(i.id), created: Number(i.created) * 1000, status: String(i.status ?? ""),
    billingReason: typeof i.billing_reason === "string" ? i.billing_reason : null, currency: String(i.currency ?? ""),
    total: Number(i.total) || 0, startingBalance: Number(i.starting_balance) || 0, amountDue: Number(i.amount_due) || 0, amountPaid: Number(i.amount_paid) || 0,
  }));
}

/** The customer's credit balance (negative = credit we owe them), in the customer's currency. Read-only. */
export async function customerBalance(stripeCustomerId: string): Promise<{ balance: number; currency: string | null }> {
  if (!/^cus_[A-Za-z0-9]+$/.test(stripeCustomerId)) throw new Error("not a customer id");
  const c = (await stripeGet(`/customers/${stripeCustomerId}`)) as { balance?: number; currency?: string | null };
  return { balance: Number(c.balance) || 0, currency: c.currency ?? null };
}

/* ---------------- 10-14 进度表 49 结账失败原因看板: read-only lists ---------------- */

/** Every object of a list endpoint created since `sinceSec` (newest first, 100 a page). Read-only. */
export async function stripeListSince<T extends { id: string }>(path: string, sinceSec: number, maxPages = 60): Promise<T[]> {
  const out: T[] = [];
  let after: string | null = null;
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 0; page < maxPages; page++) {
    const j = (await stripeGet(`${path}${sep}limit=100&created[gte]=${sinceSec}${after ? `&starting_after=${after}` : ""}`)) as { data?: T[]; has_more?: boolean };
    const data = j.data ?? [];
    out.push(...data);
    if (!j.has_more || !data.length) break;
    after = data[data.length - 1]!.id;
  }
  return out;
}

export interface ChargeLite {
  id: string; created: number; status: string; payment_intent: string | null; failure_code: string | null;
  outcome?: { reason?: string | null; type?: string | null } | null; livemode?: boolean;
  payment_method_details?: { type?: string; card?: { wallet?: { type?: string } | null; three_d_secure?: { result?: string | null } | null } | null } | null;
}
export interface IntentLite {
  id: string; created: number; status: string; livemode?: boolean; currency: string; amount: number; metadata: Record<string, string>;
  last_payment_error?: { code?: string | null; decline_code?: string | null; type?: string | null } | null;
  next_action?: unknown; receipt_email?: string | null;
}
