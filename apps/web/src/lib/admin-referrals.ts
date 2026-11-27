import { readEvents } from "./analytics-server";
import { db } from "./db";

/**
 * What each customer's sharing has brought in, for the customer list (09-18,
 * Neil: the 推荐 column should say how many). A share code is the six line
 * values of the shared cast, so a customer "owns" every code among their
 * casts; a session whose first touch carried one of those codes is theirs.
 *
 *   sessions — visitors who arrived through their codes (window)
 *   casts    — of those, sessions that completed a cast
 *   orders   — readings delivered (orders, any status) via their codes, all time,
 *              not counting their own
 *
 * Two customers who threw the same figure share a code and both get the
 * credit — the same approximation the account page and the reward make.
 */
export interface Brought { sessions: number; casts: number; orders: number }

/**
 * 09-29 Neil（#347 显示「64 人经 TA 的分享」却不在补发名单）: the code-based
 * count above credits everyone who ever threw the same figure, before or after
 * the visit. These are the records that name one person:
 *   gifts / claimed — 送一卦 links made / claimed by a friend
 *   viaRef / viaRefRead — newcomers whose free reading carried this person's share ref / of those, read
 *   rewards / rewardsUsed — thank-you readings earned (any thread, backfill included) / spent
 */
export interface ReferralFacts { gifts: number; claimed: number; viaRef: number; viaRefRead: number; rewards: number; rewardsUsed: number }
const EMPTY: ReferralFacts = { gifts: 0, claimed: 0, viaRef: 0, viaRefRead: 0, rewards: 0, rewardsUsed: 0 };

export function referralFacts(): Map<number, ReferralFacts> {
  const d = db();
  const out = new Map<number, ReferralFacts>();
  const at = (cid: number) => { const f = out.get(cid) ?? { ...EMPTY }; out.set(cid, f); return f; };
  type R = { cid: number; a: number; b: number };
  for (const r of d.prepare(
    `SELECT from_customer_id AS cid, COUNT(*) AS a, SUM(CASE WHEN claimed_customer_id IS NOT NULL OR used_at IS NOT NULL THEN 1 ELSE 0 END) AS b
     FROM grants WHERE kind = 'gift_cast' AND from_customer_id IS NOT NULL GROUP BY 1`,
  ).all() as unknown as R[]) { const f = at(r.cid); f.gifts = r.a; f.claimed = r.b; }
  for (const r of d.prepare(
    `SELECT s.customer_id AS cid, COUNT(*) AS a, SUM(CASE WHEN g.used_at IS NOT NULL THEN 1 ELSE 0 END) AS b
     FROM grants g JOIN share_refs s ON s.ref = g.ref WHERE g.kind = 'invite_light' GROUP BY 1`,
  ).all() as unknown as R[]) { const f = at(r.cid); f.viaRef = r.a; f.viaRefRead = r.b; }
  for (const r of d.prepare(
    `SELECT referrer_customer_id AS cid, COUNT(*) AS a, SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) AS b
     FROM referrals WHERE referrer_customer_id IS NOT NULL GROUP BY 1`,
  ).all() as unknown as R[]) { const f = at(r.cid); f.rewards = r.a; f.rewardsUsed = r.b; }
  return out;
}

export function referralsByCustomer(days = 90): Map<number, Brought> {
  const d = db();
  const owners = new Map<string, Set<number>>();
  for (const r of d.prepare("SELECT customer_id, REPLACE(values_str, ',', '') AS code FROM casts WHERE customer_id IS NOT NULL").all() as { customer_id: number; code: string }[]) {
    if (!owners.has(r.code)) owners.set(r.code, new Set());
    owners.get(r.code)!.add(r.customer_id);
  }
  const out = new Map<number, Brought>();
  const bump = (code: string, k: keyof Brought, self?: number | null) => {
    for (const cid of owners.get(code) ?? []) {
      if (self != null && cid === self) continue;
      const b = out.get(cid) ?? { sessions: 0, casts: 0, orders: 0 };
      b[k] += 1;
      out.set(cid, b);
    }
  };
  if (owners.size) {
    const evs = readEvents(days, { only: ["cast_complete"], orVia: true }); // 10-15: first touches and casts only
    const first = new Map<string, string>();
    for (const e of evs) if (e.via && !first.has(e.s)) first.set(e.s, e.via);
    const cast = new Set(evs.filter((e) => e.e === "cast_complete").map((e) => e.s));
    for (const [s, via] of first) {
      if (!owners.has(via)) continue;
      bump(via, "sessions");
      if (cast.has(s)) bump(via, "casts");
    }
    for (const o of d.prepare("SELECT via, customer_id FROM orders WHERE via IS NOT NULL").all() as { via: string; customer_id: number | null }[]) {
      bump(o.via, "orders", o.customer_id);
    }
  }
  return out;
}
