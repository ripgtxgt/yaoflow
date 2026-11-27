import { latestSubscription, poolGiftsInUse, type SubscriptionRow } from "./db";
import { inPause, LIVE_STATUSES, renewPerks } from "./subscription";

/**
 * 会员权益 (09-24, 会员与推荐体系重整-0924.md). Read from our own mirror — no
 * Stripe call — so the reading page and the follow-up route can ask on every
 * request.
 *
 *   M1  a member's deep reading takes 10 follow-ups, not 5: all 21 member deep
 *       readings in the first days hit the 5-question wall, against 53% of
 *       single-purchase ones.
 *   M3  five 送一卦 a month, banked up to 15. A link that expires unclaimed
 *       returns to the pool; only live or claimed links count against it.
 *   M4  a member's 记一笔进展 is not paced to one a day (the eight-note limit stays).
 */

// 09-26: the two numbers the cast page also prints live in sub-plan (client-safe); re-exported here
export { MEMBER_FOLLOWUP_LIMIT, GIFT_POOL_PER_MONTH } from "./sub-plan";
import { GIFT_POOL_PER_MONTH } from "./sub-plan";
export const GIFT_POOL_CAP = 15;
const MONTH = 30.44 * 86_400_000;

/** The live membership behind this customer, or null (canceled, lapsed, paused). */
export function activeMembership(customerId: number | null | undefined, now = Date.now()): SubscriptionRow | null {
  if (!customerId) return null;
  const sub = latestSubscription(customerId);
  if (!sub || !LIVE_STATUSES.has(sub.status)) return null;
  if (sub.period_end && sub.period_end < now - 3 * 86_400_000) return null;
  if (inPause(sub, now)) return null;
  return sub;
}

/** The pool's arithmetic, kept pure for the tests. */
export function giftPoolBalance(memberSince: number, inUse: number, now = Date.now()): { earned: number; available: number } {
  const months = Math.max(1, Math.floor((now - memberSince) / MONTH) + 1);
  const earned = months * GIFT_POOL_PER_MONTH;
  return { earned, available: Math.max(0, Math.min(GIFT_POOL_CAP, earned - inUse)) };
}

export function giftPoolFor(customerId: number, now = Date.now()): { sub: SubscriptionRow; available: number; renewOff?: boolean } | null {
  const sub = activeMembership(customerId, now);
  if (!sub) return null;
  // 09-30 续订专属: the monthly gifts belong to a membership that renews; links already sent stay good
  if (!renewPerks(sub)) return { sub, available: 0, renewOff: true };
  const { available } = giftPoolBalance(sub.created_at, poolGiftsInUse(customerId, sub.created_at, now), now);
  return { sub, available };
}
