import { randomBytes } from "node:crypto";
import {
  caseBySession, caseRewardFor, grantByRedeemSession, caseRewardsSince, caseRewardsSiteSince, createGrant, customerIdByEmail, insertCaseReward,
  recordOps, setCaseRewardChoice, storedReadingForSession, upsertCustomer, type CaseRewardRow, memberCaseSelfSince,
} from "./db";
import { activeMembership } from "./membership";
import { allowanceWindow } from "./subscription";
import { CASE_SELF_DEEP_PER_PERIOD } from "./sub-plan";
import { giftLink, afterLink } from "./grants";
import { record } from "./analytics-server";
import type { Locale } from "./locales";

/**
 * 公开卦例回礼 (Neil 09-26: 「就得让人有动机去做无限解读，解读的成本并不高」).
 *
 * Every reading published as a case earns one reading back, and the owner
 * picks who it is for:
 *   · for someone else → a full (deep) reading, as a 送一卦 link — any owner;
 *   · for themselves   → a member gets one more deep reading this month
 *                        (on top of the ten); anyone else gets a light reading.
 * A reading that itself came as a gift earns one too, so the chain can run on.
 * Guards are against scripts, not people: three a day per person, a site-wide
 * daily ceiling that tells the owner when it is reached, and a gift can still
 * never be opened by the one who made it (lib/grants).
 */
export const CASE_REWARD_PER_DAY = 3;
export const CASE_REWARD_DAYS = 30;
const siteCap = () => Number(process.env.CASE_REWARD_DAILY_CAP ?? 300);
const DAY = 86_400_000;

export type RewardView =
  | { state: "none"; why?: "cap_person" | "cap_site" | "no_owner" | "free_reading" }
  | { state: "open"; member: boolean; selfCapped?: boolean }
  | { state: "chosen"; choice: "self_light" | "self_deep" | "gift"; url: string | null };

function ownerOf(sid: string): { customerId: number | null; email: string | null } {
  const stored = storedReadingForSession(sid);
  const c = caseBySession(sid);
  const email = stored?.email?.toLowerCase() ?? null;
  const customerId = c?.customer_id ?? stored?.customerId ?? (email ? customerIdByEmail(email) : null);
  return { customerId, email };
}

/**
 * 10-02 (Neil: 「2，3 都做吧」): a member has already kept this period's CASE_SELF_DEEP_PER_PERIOD case rewards for
 * themselves — the next one can only go to a friend (one member took 12 in five days; the top-up packs never came up).
 */
export function memberSelfCapped(customerId: number | null | undefined, now = Date.now()): boolean {
  const sub = customerId ? activeMembership(customerId, now) : null;
  if (!sub || !customerId) return false;
  return memberCaseSelfSince(customerId, allowanceWindow(sub, now).since) >= CASE_SELF_DEEP_PER_PERIOD;
}

function view(row: CaseRewardRow | null, site: string, locale: Locale): RewardView {
  if (!row) return { state: "none" };
  if (row.choice) {
    const url = row.grant_token ? (row.choice === "gift" ? giftLink(site, locale, row.grant_token) : afterLink(site, locale, row.grant_token)) : null;
    return { state: "chosen", choice: row.choice, url };
  }
  const member = !!(row.customer_id && activeMembership(row.customer_id));
  return { state: "open", member, ...(member && memberSelfCapped(row.customer_id) ? { selfCapped: true } : {}) };
}

/** Called right after a reading is published: mint the reward once per reading, inside the guards. */
/**
 * 09-27 (Neil: 「这个人发现了一个 bug」): a free light reading could be published for another free light
 * reading, which could be published for another… one reader took five free readings in an hour without
 * ever paying. The reward is for a reading that cost someone something — bought, a membership's, a friend's
 * gifted deep reading, a referral reward — never for the free light readings themselves.
 */
export const NO_CASE_REWARD = new Set(["invite_light", "case_light", "revisit_light", "gift", "comp", "joint", "ref_light"]);

/**
 * 09-27 赠送审核 (Neil: 「A,B,C 一起做吧」):
 *   A — a deep reading that came from a published case's gift earns no further reward. The friend of a
 *       paying reader may still publish theirs and pass one on; the one after that is where it stops, so a
 *       paid reading carries at most two free generations, however many addresses anyone keeps.
 *   C — a 合参 invitee's reading (joint) earns none either: the invite itself was the gift.
 * Pass the session id wherever it is known; the status alone cannot see A.
 */
export function caseRewardable(status: string | null | undefined, sid?: string | null): boolean {
  if (!status || NO_CASE_REWARD.has(status)) return false;
  if (status === "gift_cast" && sid?.startsWith("gr_")) {
    const g = grantByRedeemSession(sid);
    if (g?.from_session_id?.startsWith("case_")) return false;
  }
  return true;
}

export function offerCaseReward(sid: string, site: string, locale: Locale, now = Date.now()): RewardView {
  const existing = caseRewardFor(sid);
  if (existing) return view(existing, site, locale);
  const stored = storedReadingForSession(sid);
  if (!stored || stored.status === "refunded" || stored.status === "disputed") return { state: "none" };
  if (!caseRewardable(stored.status, sid)) return { state: "none", why: "free_reading" };
  const { customerId, email } = ownerOf(sid);
  if (!customerId && !email) return { state: "none", why: "no_owner" };
  if (caseRewardsSince(customerId, email, now - DAY) >= CASE_REWARD_PER_DAY) return { state: "none", why: "cap_person" };
  if (caseRewardsSiteSince(now - DAY) >= siteCap()) {
    recordOps("case_reward_cap_hit", `site cap ${siteCap()} reached`);
    return { state: "none", why: "cap_site" };
  }
  const row = insertCaseReward({ caseSid: sid, customerId, email }, now);
  record({ t: now, e: "case_reward", s: sid.slice(-12), locale, tier: stored.tier, path: "/reading", method: "offered" });
  return view(row, site, locale);
}

export function caseRewardView(sid: string, site: string, locale: Locale): RewardView {
  return view(caseRewardFor(sid), site, locale);
}

/** The owner's pick. Idempotent: a second tap shows what the first one made. */
export function chooseCaseReward(sid: string, who: "self" | "gift", site: string, locale: Locale, fromDevice: string | null = null): RewardView {
  const row = caseRewardFor(sid);
  if (!row) return { state: "none" };
  if (row.choice) return view(row, site, locale);
  const expiresAt = Date.now() + CASE_REWARD_DAYS * DAY;
  if (who === "gift") {
    const token = randomBytes(18).toString("hex");
    // 09-26 (review): the giver must be known, or the self-redeem guard cannot see them
    const giver = row.customer_id ?? (row.email ? upsertCustomer(row.email) : null);
    createGrant({ token, kind: "gift_cast", tier: "deep", expiresAt, fromSessionId: `case_${sid}`.slice(0, 200), fromCustomerId: giver, locale, fromDevice });
    setCaseRewardChoice(row.id, "gift", token);
    record({ t: Date.now(), e: "gift_sent", s: sid.slice(-12), locale, tier: "deep", path: "/reading", method: "case" });
  } else if (row.customer_id && activeMembership(row.customer_id)) {
    // 10-02: past this period's cap the reward stays open — the panel then offers only "give it to a friend"
    if (memberSelfCapped(row.customer_id)) return view(row, site, locale);
    setCaseRewardChoice(row.id, "self_deep", null);
  } else {
    const token = randomBytes(18).toString("hex");
    createGrant({ token, kind: "case_light", tier: "one", expiresAt, fromSessionId: sid, fromCustomerId: row.customer_id, locale });
    setCaseRewardChoice(row.id, "self_light", token);
  }
  record({ t: Date.now(), e: "case_reward", s: sid.slice(-12), locale, path: "/reading", method: who });
  return view(caseRewardFor(sid), site, locale);
}
