import { startsAtMonthlyFee, singlePurchasesSince, subscriptionsCreatedSince } from "./db";
import { activeMembership } from "./membership";
import { firstMonthMinor, isCurrency, priceMinor, type Currency } from "./money";

/**
 * 单买抵首月 (Neil 09-26: 「都做吧」). Someone who has bought single readings
 * twice in 30 days is exactly who membership is for — and they have already
 * paid. Their latest single purchase is credited against the first month
 * (a one-off Stripe coupon, never more than the month itself). Not a
 * discount: money already spent counts toward the plan.
 *
 * Once per purchase, and only until they next subscribe: a subscription
 * created after that purchase closes the credit.
 */
export const CREDIT_WINDOW_MS = 30 * 86_400_000;

/**
 * 10-24 (Neil: 「一个大bug啊，现在不能进行会员的升级进行抵扣了，刚刚有一笔，只付了20HKD」): no credit of any kind on the way
 * into a membership — neither an earlier single purchase (this rule) nor what is left of a running 通卡 (lib/pass.ts
 * passCredit). Off unless UPGRADE_CREDIT=on; with it off the account page, the reading page and the checkout offer none.
 */
export const upgradeCreditOn = (): boolean => process.env.UPGRADE_CREDIT === "on";

export type UpgradeCredit = { sessionId: string; amountMinor: number; currency: Currency; count: number; spentMinor: number; coupon: string | null; /** 10-10 首月同价: what the first invoice comes to before the credit — the one-off month's price for a first-time member, the monthly fee for a returning one */ firstInvoiceMinor: number };

export function upgradeCredit(customerId: number, currency: Currency, now = Date.now()): UpgradeCredit | null {
  if (!upgradeCreditOn()) return null;
  if (activeMembership(customerId)) return null;
  const buys = singlePurchasesSince(customerId, now - CREDIT_WINDOW_MS);
  if (buys.length < 2) return null;
  const last = buys[0]!;
  const cur = (last.currency ?? "").toUpperCase();
  if (!isCurrency(cur) || cur !== currency) return null;
  if (subscriptionsCreatedSince(customerId, last.created_at) > 0) return null;
  const first = startsAtMonthlyFee(customerId) ? priceMinor(currency, "month") : firstMonthMinor(currency);
  const spent = buys.filter((b) => (b.currency ?? "").toUpperCase() === cur).reduce((a, b) => a + b.amount_cents, 0);
  return { sessionId: last.session_id, amountMinor: Math.min(last.amount_cents, first), currency, count: buys.length, spentMinor: spent, coupon: last.credit_coupon, firstInvoiceMinor: first };
}

/** The currency their latest single purchase was made in — the one the credit can apply to. */
export function creditCurrency(customerId: number, now = Date.now()): Currency | null {
  const b = singlePurchasesSince(customerId, now - CREDIT_WINDOW_MS)[0];
  const c = (b?.currency ?? "").toUpperCase();
  return isCurrency(c) ? c : null;
}
