import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { grantByToken, memberCaseBonus, recordOrder, saveCast, saveReading, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { publishCase } from "../src/lib/cases";
import { chooseCaseReward, offerCaseReward, CASE_REWARD_PER_DAY } from "../src/lib/case-reward";
import { redeemCaseLight, redeemGiftCast } from "../src/lib/grants";
import { resolveServerChart } from "../src/lib/reading";
import { entitlementFor } from "../src/lib/subscription";

const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 8, 20, 3);
const SITE = "https://yaoflow.com";

function paidDeep(sid: string, email: string, cid: number) {
  const question = "这份合约能签下来吗";
  const chart = resolveServerChart({ question, values: V, castAtMs: AT, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh", question, topic: "career", values: V, chart });
  saveReading(castId, cid, "deep", "zh", { verdict: { zh: "能签，但要让一步。" }, tendency: { zh: "先紧后松。" }, timing: { zh: "10月4日到8日之间。" }, basis: { zh: "x" }, strategy: { zh: "x" }, caution: { zh: "x" }, next_step: { zh: "x" }, closing: { zh: "x" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 999, currency: "USD", email, status: "paid" });
  expect(publishCase(sid, null, cid).ok).toBe(true);
}

describe("公开卦例回礼（09-26）", () => {
  it("a non-member keeps a light reading for themselves, or gives a full one away", () => {
    const cid = upsertCustomer("cr-guest@example.com", "zh");
    paidDeep("cs_cr_guest_1", "cr-guest@example.com", cid);
    const offer = offerCaseReward("cs_cr_guest_1", SITE, "zh");
    expect(offer).toEqual({ state: "open", member: false });
    const self = chooseCaseReward("cs_cr_guest_1", "self", SITE, "zh");
    expect(self.state === "chosen" && self.choice === "self_light").toBe(true);
    const token = self.state === "chosen" ? self.url!.split("after=")[1]! : "";
    expect(grantByToken(token)?.kind).toBe("case_light");
    // a second tap shows the same thing, never a second reward
    expect(chooseCaseReward("cs_cr_guest_1", "gift", SITE, "zh")).toEqual(self);
    expect(redeemCaseLight(token, { question: "q", values: V }, null, cid, "zh").ok).toBe(true);

    paidDeep("cs_cr_guest_2", "cr-guest@example.com", cid);
    offerCaseReward("cs_cr_guest_2", SITE, "zh");
    const gift = chooseCaseReward("cs_cr_guest_2", "gift", SITE, "zh");
    expect(gift.state === "chosen" && gift.choice === "gift" && gift.url!.includes("/cast?gift=")).toBe(true);
    const gtoken = gift.state === "chosen" ? gift.url!.split("gift=")[1]! : "";
    // still never for the one who made it
    expect(redeemGiftCast(gtoken, "{}", "cr-guest@example.com", null, "zh")).toEqual({ ok: false, error: "self" });
    expect(redeemGiftCast(gtoken, "{}", "cr-friend@example.com", null, "zh").ok).toBe(true);
  });

  it("a member keeps one more full reading this month", async () => {
    const cid = upsertCustomer("cr-member@example.com", "zh");
    const now = Date.now();
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_cr", stripeSubscriptionId: "sub_cr_member", status: "active", plan: "month", periodStart: now - 86_400_000, periodEnd: now + 29 * 86_400_000, cancelAtPeriodEnd: false, currency: "usd", amountMinor: 999 });
    const before = (await entitlementFor(cid)).deepLeft;
    paidDeep("cs_cr_member_1", "cr-member@example.com", cid);
    expect(offerCaseReward("cs_cr_member_1", SITE, "zh")).toEqual({ state: "open", member: true });
    const r = chooseCaseReward("cs_cr_member_1", "self", SITE, "zh");
    expect(r.state === "chosen" && r.choice === "self_deep").toBe(true);
    expect(memberCaseBonus(cid, 0)).toBe(1);
    expect((await entitlementFor(cid)).deepLeft).toBe(before + 1);
  });

  it("three a day per person; the fourth publish earns nothing until tomorrow", () => {
    const cid = upsertCustomer("cr-cap@example.com", "zh");
    for (let i = 0; i < CASE_REWARD_PER_DAY; i++) {
      paidDeep(`cs_cr_cap_${i}`, "cr-cap@example.com", cid);
      expect(offerCaseReward(`cs_cr_cap_${i}`, SITE, "zh").state).toBe("open");
    }
    paidDeep("cs_cr_cap_x", "cr-cap@example.com", cid);
    expect(offerCaseReward("cs_cr_cap_x", SITE, "zh")).toEqual({ state: "none", why: "cap_person" });
    // tomorrow it works again
    expect(offerCaseReward("cs_cr_cap_x", SITE, "zh", Date.now() + 25 * 3_600_000).state).toBe("open");
  });
});

import { caseRewardable } from "../src/lib/case-reward";
describe("公开卦例回礼只给付过代价的解读（09-27）", () => {
  it("free light readings earn nothing back, so they cannot be chained into more free readings", () => {
    for (const s of ["invite_light", "case_light", "revisit_light", "gift", "comp", "joint"]) expect(caseRewardable(s), s).toBe(false);
    for (const s of ["paid", "subscription", "gift_cast", "reward"]) expect(caseRewardable(s), s).toBe(true);
  });
});

import { createGrant, redeemGrant } from "../src/lib/db";
describe("卦例赠送不能来回互送（09-27）", () => {
  it("a case gift cannot go back to whoever gave the reading behind it, and two people swap one at most once a month", () => {
    const A = upsertCustomer("rt-a@example.com", "zh-hant");
    const B = upsertCustomer("rt-b@example.com", "zh-hant");
    upsertCustomer("rt-c@example.com", "zh-hant");
    // A's gift, spent by B on reading gr_rtorig
    createGrant({ token: "a".repeat(35) + "1", kind: "gift_cast", tier: "deep", expiresAt: Date.now() + 86_400_000, fromCustomerId: A, fromSessionId: "cs_rt_a" });
    redeemGrant("a".repeat(35) + "1", "gr_rtorig", "{}", "rt-b@example.com", B);
    // B publishes that reading and gives the case gift
    const t1 = "b".repeat(35) + "1";
    createGrant({ token: t1, kind: "gift_cast", tier: "deep", expiresAt: Date.now() + 86_400_000, fromCustomerId: B, fromSessionId: "case_gr_rtorig" });
    expect(redeemGiftCast(t1, "{}", "rt-a@example.com", null, "zh-hant")).toEqual({ ok: false, error: "returned" });
    expect(redeemGiftCast(t1, "{}", "rt-c@example.com", null, "zh-hant").ok).toBe(true);
    // B's next case gift to the same C inside a month is refused
    const t2 = "c".repeat(35) + "1";
    createGrant({ token: t2, kind: "gift_cast", tier: "deep", expiresAt: Date.now() + 86_400_000, fromCustomerId: B, fromSessionId: "case_gr_other" });
    expect(redeemGiftCast(t2, "{}", "rt-c@example.com", null, "zh-hant")).toEqual({ ok: false, error: "returned" });
  });
});

import { sameDevice } from "../src/lib/grants";
describe("赠送审核 A/B（09-27）", () => {
  it("A: a reading that came from a case's gift earns nothing more; one from a paid reader's gift still does", () => {
    const P = upsertCustomer("ab-p@example.com", "zh");
    createGrant({ token: "d".repeat(35) + "1", kind: "gift_cast", tier: "deep", expiresAt: Date.now() + 86_400_000, fromCustomerId: P, fromSessionId: "cs_ab_paid" });
    redeemGrant("d".repeat(35) + "1", "gr_ab_first", "{}", "ab-f@example.com", null);
    createGrant({ token: "e".repeat(35) + "1", kind: "gift_cast", tier: "deep", expiresAt: Date.now() + 86_400_000, fromCustomerId: P, fromSessionId: "case_cs_ab_paid" });
    redeemGrant("e".repeat(35) + "1", "gr_ab_second", "{}", "ab-g@example.com", null);
    expect(caseRewardable("gift_cast", "gr_ab_first")).toBe(true);
    expect(caseRewardable("gift_cast", "gr_ab_second")).toBe(false);
  });

  it("B: the browser that made a gift, or that holds the reading it came from, cannot spend it", () => {
    const G = upsertCustomer("ab-giver@example.com", "zh");
    const dev1 = "1".repeat(24), dev2 = "2".repeat(24), dev3 = "3".repeat(24);
    // the giver received gr_ab_held in browser dev1 …
    createGrant({ token: "f".repeat(35) + "1", kind: "gift_cast", tier: "deep", expiresAt: Date.now() + 86_400_000, fromCustomerId: null, fromSessionId: "cs_ab_x" });
    expect(redeemGiftCast("f".repeat(35) + "1", "{}", "ab-giver@example.com", G, "zh", dev1).ok).toBe(true);
    // … published it and made the case gift in browser dev2
    const t = "9".repeat(35) + "1";
    createGrant({ token: t, kind: "gift_cast", tier: "deep", expiresAt: Date.now() + 86_400_000, fromCustomerId: G, fromSessionId: `case_gr_${"f".repeat(35)}1`, fromDevice: dev2 });
    expect(sameDevice(grantByToken(t)!, null)).toBe(false);
    expect(redeemGiftCast(t, "{}", "ab-alt@example.com", null, "zh", dev1)).toEqual({ ok: false, error: "device" });
    expect(redeemGiftCast(t, "{}", "ab-alt@example.com", null, "zh", dev2)).toEqual({ ok: false, error: "device" });
    expect(redeemGiftCast(t, "{}", "ab-friend@example.com", null, "zh", dev3).ok).toBe(true);
    expect(grantByToken(t)?.claim_device).toBe(dev3);
  });
});
