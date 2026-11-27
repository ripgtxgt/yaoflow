import { entitlementFor, flowRightsOf, isCompSubscription, isPassSubscription, tongkaLive } from "./subscription";
import { activeMembership } from "./membership";
import { activeCard } from "./today-qian";
import { capCheck, capSpend, type CapKind, type CapVerdict } from "./caps";
import { MEMBER_FOLLOWUP_LIMIT } from "./sub-plan";
import type { Entitlement } from "./sub-plan";
import type { SubscriptionRow } from "./db";

/**
 * 10-22 进度表 56 — the rights table: who may use what, in one place. Until now 28 files each asked their own question
 * (`activeMembership`, `entitlementFor(...).active && unlimited && !comp`, `accessOf`…) and each spelled out the same
 * cap dance. `rightsFor` reads the account once; `can` answers from the table below; `useRight` runs the fair-use cap
 * for the rights that have one. Behaviour is unchanged — this file says what the routes already did.
 *
 *   standing      what it is
 *   member        a renewing month / year plan (sub_…) — 會員
 *   comp          a complimentary membership (comp_…): every member right, never a cap, never renews
 *   pass          a 通卡 (pass_… with pass_days 1 / 7 / 30; the old 單月會員 counts as 30)
 *   card          a 籤卡 (qian_cards): the daily lot's full reading only — no longer sold from 10-22 (进度表 92); cards
 *                 already bought run to their end
 *
 * 10-22 进度表 92 「通卡看本命，會員看流年」: a 通卡 keeps the 問事 tools and a chart's natal chapters; 今日一籤全文,
 * 你的今天 (and 擇日／黃曆 read against your chart) and the 運勢 chapters are the 會員's. A pass bought before
 * PASS_SPLIT_AT keeps 今日一籤全文 and the 運勢 chapters until it ends (`can` below; lib/subscription flowRightsOf).
 *   none          nobody signed in, or nothing live
 *
 * Server only (reaches the database).
 */
export type Standing = "member" | "comp" | "pass" | "card" | "none";
export type Right =
  | "deep_reading"      // 六爻深斷 through the membership path (lib/subscription redeemSubscription); cap `cast`
  | "member_followups"  // the member-sized follow-up ceiling per reading (30, not 5); cap `followup` per day
  | "tarot_reading"     // 塔羅個人解讀 without paying per spread; cap `tarot`
  | "qian_personal"     // 解籤個人解讀 without paying per lot; cap `qian`
  | "chart_report"      // 八字／紫微／星盤 deep report; cap `report` (3 different charts a day)
  | "chart_qa"          // 命盤問答 (10-24: no free questions — only this right); cap `qa` (20 a day, 60 for a member)
  | "chart_rewrite"     // 深度報告月更 (one rewrite per chart per 30 days) — 會員 only
  | "chart_flow"        // 进度表 92: the 運勢 chapters — 八字 大運／今年, 紫微 大限, 星盤 本月行運 — 會員 only
  | "daily_personal"    // 进度表 92: 你的今天, 黃曆「今天對你」, 擇日 read against your chart — 會員 only
  | "daily_qian_full"   // 今日一籤 full reading — 會員 (and a 籤卡 still running); a 通卡 no longer (进度表 92)
  | "member_letter"     // 會員每日信 / 每月流月信 — 會員 only
  | "bigs_discount"     // 年書／合盤 8 折 — 會員 only (Neil 10-22)
  | "case_reward_self"; // a published case's reward taken as a deep reading for oneself (capped per period elsewhere)

/** the table: a right per standing (none never has any; it is the row left out) */
export const RIGHTS: Record<Right, { member: boolean; comp: boolean; pass: boolean; card: boolean; cap: CapKind | null }> = {
  deep_reading:     { member: true, comp: true, pass: true,  card: false, cap: "cast" },
  member_followups: { member: true, comp: true, pass: true,  card: false, cap: "followup" },
  tarot_reading:    { member: true, comp: true, pass: true,  card: false, cap: "tarot" },
  qian_personal:    { member: true, comp: true, pass: true,  card: false, cap: "qian" },
  chart_report:     { member: true, comp: true, pass: true,  card: false, cap: "report" },
  chart_qa:         { member: true, comp: true, pass: true,  card: false, cap: "qa" },
  chart_rewrite:    { member: true, comp: true, pass: false, card: false, cap: null },
  chart_flow:       { member: true, comp: true, pass: false, card: false, cap: null },
  daily_personal:   { member: true, comp: true, pass: false, card: false, cap: null },
  daily_qian_full:  { member: true, comp: true, pass: false, card: true,  cap: null },
  member_letter:    { member: true, comp: true, pass: false, card: false, cap: null },
  bigs_discount:    { member: true, comp: true, pass: false, card: false, cap: null },
  case_reward_self: { member: true, comp: true, pass: true,  card: false, cap: null },
};

export interface Rights {
  customerId: number | null;
  standing: Standing;
  /** the live membership / pass row, when there is one */
  sub: SubscriptionRow | null;
  /** the full entitlement (allowances, pack, renewal…) — null when nothing is live or nobody is signed in */
  ent: Entitlement | null;
  passDays: 1 | 7 | 30 | null;
  periodEnd: number | null;
  /** the 通卡 model is live: no monthly allowance, only the fair-use caps */
  unlimited: boolean;
}

const NONE: Rights = { customerId: null, standing: "none", sub: null, ent: null, passDays: null, periodEnd: null, unlimited: false };

/** the standing of a live row */
export function standingOf(sub: Pick<SubscriptionRow, "stripe_subscription_id"> | null): Exclude<Standing, "card" | "none"> | null {
  if (!sub) return null;
  if (isCompSubscription(sub.stripe_subscription_id)) return "comp";
  if (isPassSubscription(sub.stripe_subscription_id)) return "pass";
  return "member";
}

/** read the account once (one Stripe re-sync at most, as entitlementFor does); null customer → none */
export async function rightsFor(customerId: number | null | undefined, now = Date.now()): Promise<Rights> {
  if (!customerId) return NONE;
  const ent = await entitlementFor(customerId).catch(() => null);
  const sub = activeMembership(customerId, now);
  const live = !!ent?.active && !!sub;
  const standing: Standing = live ? standingOf(sub)! : activeCard(customerId, now) ? "card" : "none";
  return {
    customerId, standing, sub: live ? sub : null, ent,
    passDays: live && standing === "pass" ? (ent?.passDays ?? 30) : null,
    periodEnd: live ? sub!.period_end : null,
    unlimited: live && tongkaLive(),
  };
}

/** 10-22 进度表 92: what a pass bought before the split keeps until it ends (it had them when it was bought) */
export const PASS_KEEPS_BEFORE_SPLIT: readonly Right[] = ["daily_qian_full", "chart_flow"];

/** the table's answer */
export function can(r: Rights, right: Right): boolean {
  if (r.standing === "none") return false;
  if (r.standing === "pass" && PASS_KEEPS_BEFORE_SPLIT.includes(right) && flowRightsOf(r.sub)) return true;
  return RIGHTS[right][r.standing];
}

/** the right's fair-use cap applies: a live member or pass holder under the 通卡 model — never a complimentary account */
export const capped = (r: Rights, right: Right): boolean => r.unlimited && r.standing !== "comp" && RIGHTS[right].cap !== null;

export type UseVerdict = { ok: true; cap: CapVerdict | null } | { ok: false; why: "not_allowed" | "cap_day" | "cap_rate" };

/**
 * May this account use the right now — the table, then the day's cap (the same ref is not counted twice: a chart
 * reopened, a lot reread). `spend` after the work is done; a verdict is not a reservation.
 */
export function useRight(r: Rights, right: Right, opt: { ref?: string | null; now?: number } = {}): UseVerdict {
  if (!can(r, right)) return { ok: false, why: "not_allowed" };
  if (!capped(r, right)) return { ok: true, cap: null };
  const v = capCheck(r.customerId!, RIGHTS[right].cap!, { member: r.standing === "member", ref: opt.ref ?? null, now: opt.now });
  if (!v.ok) return { ok: false, why: v.why === "rate" ? "cap_rate" : "cap_day" };
  return { ok: true, cap: v };
}
export function spendRight(r: Rights, right: Right, ref: string | null = null, now = Date.now()): void {
  if (capped(r, right)) capSpend(r.customerId!, RIGHTS[right].cap!, ref, now);
}

/** the monthly allowance of the older model (before 通卡): units left for a light / deep reading; Infinity once the model is live */
export function allowance(r: Rights, unit: "one" | "deep"): number {
  if (!r.ent?.active || !r.sub) return 0;
  if (r.unlimited) return Infinity;
  return unit === "one" ? r.ent.lightLeft : r.ent.deepLeft;
}

/** numbers the pages print, per standing */
export const followupLimitFor = (r: Rights, single: number): number => (can(r, "member_followups") ? MEMBER_FOLLOWUP_LIMIT : single);

/** the rights a standing has — the account page's and /services' "what you get" list */
export const rightsOf = (standing: Standing): Right[] => (Object.keys(RIGHTS) as Right[]).filter((k) => standing !== "none" && RIGHTS[k][standing]);
