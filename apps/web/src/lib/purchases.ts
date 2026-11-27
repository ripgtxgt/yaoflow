import { db } from "./db";
import { LIVE_STATUSES } from "./subscription";

/**
 * 10-03: who a person is and what they bought — shared by the learner (lib/nudge.ts), the stage funnel and the group
 * tables (lib/stage-funnel.ts) and the weekly AI review (lib/ai-review.ts).
 *
 * A PERSON is a browser id joined with every browser and customer it was ever filed with (browser_links): Threads' own
 * browser and Safari of one customer are one person. A PURCHASE is a paid reading (an order with money in it, refunded
 * and disputed ones included, our own test orders and test customers left out) or a membership started.
 */

/** a purchase is credited to what the person saw in the 72 hours before it (the learner's reward window) */
export const REWARD_MS = 72 * 3_600_000;
/**
 * 10-06 瘦身 (Neil: 「我们目前的付费话术学习有起作用吗？」→「好，一起做完吧」): when a showing counts as "not paid". Over
 * 10-03..06 all 24 purchases credited to a block came within 17 minutes of it, yet "not paid" waited the full 72 hours
 * while "paid" counted at once — for three days the sampler saw only successes and followed early luck (one version
 * took 67–89% of a slot's showings), and the dashboard showed 80%+ "conversion". A showing now settles after 24 hours;
 * a purchase inside the 72 hours still credits it (the numbers are recomputed from the rows each time).
 */
export const SETTLE_MS = 24 * 3_600_000;

function find(parent: Map<string, string>, x: string): string {
  let r = x;
  while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
  let c = x;
  while (parent.get(c) && parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
  return r;
}

/** One key per person: a browser, joined with every browser and customer it was ever filed with. */
export function personResolver(): (bid: string | null, customerId: number | null) => string | null {
  const parent = new Map<string, string>();
  const add = (x: string) => { if (!parent.has(x)) parent.set(x, x); };
  for (const l of db().prepare("SELECT bid, customer_id FROM browser_links").all() as { bid: string; customer_id: number }[]) {
    const a = `b:${l.bid}`, b = `c:${l.customer_id}`;
    add(a); add(b);
    const ra = find(parent, a), rb = find(parent, b);
    if (ra !== rb) parent.set(ra, rb);
  }
  return (bid, customerId) => {
    if (bid) return parent.has(`b:${bid}`) ? find(parent, `b:${bid}`) : `b:${bid}`;
    if (customerId) return parent.has(`c:${customerId}`) ? find(parent, `c:${customerId}`) : `c:${customerId}`;
    return null;
  };
}

/** One purchase: a paid reading (an order with money in it) or a membership started — what counts as "paid" everywhere here. */
export interface PurchaseRec {
  t: number; kind: "order" | "membership"; sessionId: string | null; tier: string | null; cents: number | null; currency: string | null;
  firstDeep: boolean; state: string | null; plan: string | null; customerId: number | null; bid: string | null;
  /** the instant of the cast the reading was bought for (its saved cast) — finds that very cast in the log */
  castAt: number | null;
}

/**
 * Purchases since `since`, per person (oldest first). An order joins its person by the tab that paid (→ browser id), else
 * by its customer; a membership by its customer.
 */
export function purchaseRecords(since: number, person: ReturnType<typeof personResolver> = personResolver()): Map<string, PurchaseRec[]> {
  const d = db();
  const out = new Map<string, PurchaseRec[]>();
  const push = (k: string | null, p: PurchaseRec) => { if (k) out.set(k, [...(out.get(k) ?? []), p]); };
  for (const o of d.prepare(
    `SELECT o.session_id, o.created_at AS t, o.tier, o.amount_cents AS cents, o.currency, o.first_deep, o.payment_state AS state, o.customer_id, tb.bid, c.cast_at
     FROM orders o LEFT JOIN tab_browsers tb ON tb.s = o.browser_sid LEFT JOIN casts c ON c.id = o.cast_id
     WHERE o.created_at >= ? AND o.payment_state IN ('paid','refunded','disputed') AND COALESCE(o.amount_cents,0) > 0 AND COALESCE(o.test_flag,0) = 0
       AND (o.customer_id IS NULL OR o.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))`,
  ).all(since) as { session_id: string; t: number; tier: string; cents: number | null; currency: string | null; first_deep: number | null; state: string | null; customer_id: number | null; bid: string | null; cast_at: number | null }[]) {
    push(person(o.bid, o.bid ? null : o.customer_id), {
      t: o.t, kind: "order", sessionId: o.session_id, tier: o.tier, cents: o.cents, currency: o.currency, firstDeep: o.first_deep === 1,
      state: o.state, plan: null, customerId: o.customer_id, bid: o.bid, castAt: o.cast_at ?? null,
    });
  }
  // a membership started — monthly, or (10-04) a single month bought outright: both are money for it
  for (const s of d.prepare(
    `SELECT customer_id, created_at AS t, plan FROM subscriptions WHERE created_at >= ? AND (stripe_subscription_id LIKE 'sub_%' OR stripe_subscription_id LIKE 'pass_%')
       AND status NOT IN ('incomplete','incomplete_expired') AND customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)`,
  ).all(since) as { customer_id: number; t: number; plan: string }[]) {
    push(person(null, s.customer_id), { t: s.t, kind: "membership", sessionId: null, tier: null, cents: null, currency: null, firstDeep: false, state: "paid", plan: s.plan, customerId: s.customer_id, bid: null, castAt: null });
  }
  for (const v of out.values()) v.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * 10-04 排除会员 (Neil: 「这页应该要标明和排除会员的吧？」): when each person was a member — every membership of every
 * customer filed under them (monthly, a single month, complimentary). A running one is open-ended; an ended one ran to
 * the end of its last paid period. A member sees no price, so their casts and their extras are not conversions.
 */
export type MemberSpans = Map<string, [number, number][]>;
export function memberSpans(person: ReturnType<typeof personResolver> = personResolver()): MemberSpans {
  const out: MemberSpans = new Map();
  for (const s of db().prepare(
    "SELECT customer_id AS cid, status, created_at AS t, period_end AS pe, updated_at AS up FROM subscriptions WHERE status NOT IN ('incomplete','incomplete_expired')",
  ).all() as { cid: number; status: string; t: number; pe: number | null; up: number }[]) {
    const k = person(null, s.cid);
    if (!k) continue;
    out.set(k, [...(out.get(k) ?? []), [s.t, LIVE_STATUSES.has(s.status) ? Infinity : (s.pe ?? s.up)]]);
  }
  return out;
}
export const memberAt = (spans: MemberSpans, key: string | null | undefined, t: number): boolean =>
  !!key && (spans.get(key) ?? []).some(([a, z]) => a <= t && t < z);
