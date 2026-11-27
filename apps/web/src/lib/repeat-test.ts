import { createHash } from "node:crypto";
import { db } from "./db";

/**
 * 10-13 同一件事反复问 (Neil, on a reader who cast 25 times on one matter, saw the free line 8 times and never tapped a
 * price: 「其实我是想把这部分人的付费率提升」→ 「1，2，3全做吧」). Matters asked 4+ times are 233 of the non-members' matters
 * but 51% of their casts; those asked 10+ times paid in 8 of 55. Three changes, for half the browsers (the other half is
 * the comparison), decided by a hash of the browser id — the same answer every time:
 *
 *   ① from the 4th cast of a matter, the block before the price offers reading all the casts together (n4-merge — the
 *     full reading, at the first-time price for someone who never had one) instead of the membership (n4-member);
 *   ② from the 6th cast of a matter within 3 days, no new answer: the page says 一事一占 and offers that reading;
 *   ③ from the 3rd cast of a matter, the free line asks for an address first (not for someone we already know).
 *
 * REPEAT_TEST=off ends it (everyone back to the old flow).
 */
export const REPEAT_ARM_SHARE = 0.5;
export const LOCK_AT = 6;
export const LOCK_WINDOW_MS = 3 * 86_400_000;
export const EMAIL_GATE_AT = 3;

export const repeatTestOn = (): boolean => (process.env.REPEAT_TEST ?? "on") !== "off";

export function inRepeatArm(bid: string | null | undefined): boolean {
  if (!bid || !repeatTestOn()) return false;
  const h = createHash("sha256").update(`rp1:${bid}`).digest();
  return h.readUInt16BE(0) / 65536 < REPEAT_ARM_SHARE;
}

/** Casts filed under one matter since `since` (this one included once it is written). */
export function threadCastsSince(threadId: number, since: number): number {
  return ((db().prepare("SELECT COUNT(*) AS v FROM cast_log WHERE thread_id = ? AND created_at >= ?").get(threadId, since) as { v: number } | undefined)?.v) ?? 0;
}

/** 10-14 (Neil: 「可以做第4条」): when the lock lifts — the oldest cast of the window plus the window; the page says "put it down until then". */
export function lockLiftsAt(threadId: number, now = Date.now()): number {
  const oldest = (db().prepare("SELECT MIN(created_at) AS v FROM cast_log WHERE thread_id = ? AND created_at >= ?").get(threadId, now - LOCK_WINDOW_MS) as { v: number | null } | undefined)?.v;
  return (oldest ?? now) + LOCK_WINDOW_MS;
}

export interface RepeatState { lock: { n: number; inWindow: number; until: number } | null; emailGate: boolean }

/** What this cast gets under the test. `known`: signed in, or the browser is already filed under a customer. */
export function repeatState(info: { n: number; threadId: number }, bid: string | null, opts: { member: boolean; known: boolean }, now = Date.now()): RepeatState {
  const none: RepeatState = { lock: null, emailGate: false };
  if (opts.member || !inRepeatArm(bid)) return none;
  if (info.n >= LOCK_AT) {
    const inWindow = threadCastsSince(info.threadId, now - LOCK_WINDOW_MS);
    if (inWindow >= LOCK_AT) return { lock: { n: info.n, inWindow, until: lockLiftsAt(info.threadId, now) }, emailGate: false };
  }
  return { lock: null, emailGate: info.n >= EMAIL_GATE_AT && !opts.known };
}

/** When the test started: matters whose 4th cast came after this are compared. */
export const REPEAT_TEST_SINCE = Date.parse("2026-10-13T07:40:00Z");

export interface ArmRow { matters: number; casts: number; paid: number; emailGiven: number; locked: number }

/**
 * The comparison (non-members): matters that reached their 4th cast after the test began, by arm — how many ended with a
 * paid reading, how many left an address at the gate, how many hit the lock. Paid = any cast of the matter paid for.
 */
export function repeatTestStats(): { arm: ArmRow; ctl: ArmRow } {
  const rows = db().prepare(
    `SELECT bid, thread_id, COUNT(*) AS n, MAX(paid_sid IS NOT NULL) AS paid
     FROM cast_log WHERE thread_id IS NOT NULL AND COALESCE(member, 0) = 0
     GROUP BY bid, thread_id HAVING n >= 4 AND MAX(created_at) >= ?`,
  ).all(REPEAT_TEST_SINCE) as { bid: string; thread_id: number; n: number; paid: number }[];
  const blank = (): ArmRow => ({ matters: 0, casts: 0, paid: 0, emailGiven: 0, locked: 0 });
  const out = { arm: blank(), ctl: blank() };
  for (const r of rows) {
    const g = inRepeatArm(r.bid) ? out.arm : out.ctl;
    g.matters += 1; g.casts += r.n; if (r.paid) g.paid += 1;
  }
  return out;
}
