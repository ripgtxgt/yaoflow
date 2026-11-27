import { describe, expect, it } from "vitest";
import { giftPoolBalance, giftPoolFor, GIFT_POOL_CAP, activeMembership, MEMBER_FOLLOWUP_LIMIT } from "../src/lib/membership";
import { mintPoolGift, redeemGiftCast } from "../src/lib/grants";
import { maybeGrantGiftReward } from "../src/lib/referral";
import { noteGate, NOTE_GAP_MS, NOTE_LIMIT } from "../src/lib/progress";
import { recordOrder, upsertCustomer, upsertSubscription, db } from "../src/lib/db";

/** 09-24 会员与推荐体系重整-0924.md */

const MONTH = 30.44 * 86_400_000;

describe("会员每月 5 张送一卦，可累积，最多 15", () => {
  it("每月加 5，存到 15 为止", () => {
    const t0 = Date.UTC(2026, 8, 1);
    expect(giftPoolBalance(t0, 0, t0 + 1000).available).toBe(5);
    expect(giftPoolBalance(t0, 2, t0 + MONTH + 1000).available).toBe(8);
    expect(giftPoolBalance(t0, 0, t0 + 10 * MONTH).available).toBe(GIFT_POOL_CAP);
    expect(giftPoolBalance(t0, 5, t0 + 1000).available).toBe(0);
  });
});

describe("会员的记一笔进展不限一天一笔", () => {
  it("间隔为 0 时只看 8 笔上限", () => {
    const now = Date.now();
    expect(noteGate([now - 60_000], now, 0).kind).toBe("open");
    expect(noteGate([now - 60_000], now).kind).toBe("wait");
    expect(noteGate(Array.from({ length: NOTE_LIMIT }, () => now - 60_000), now, 0).kind).toBe("limit");
    expect(NOTE_GAP_MS).toBeGreaterThan(0);
    expect(MEMBER_FOLLOWUP_LIMIT).toBe(30); // 09-29 「一件事」
  });
});

describe("送一卦：池子、不能送给自己、朋友付费后送的人得一次深断", () => {
  const giver = upsertCustomer("giver-perks@example.com", "zh-hant");
  const friend = upsertCustomer("friend-perks@example.com", "zh-hant");
  const sub = upsertSubscription({
    customerId: giver, stripeCustomerId: "cus_perks", stripeSubscriptionId: "sub_perks_1", status: "active", plan: "month",
    periodStart: Date.now(), periodEnd: Date.now() + 30 * 86_400_000, cancelAtPeriodEnd: false,
  });

  it("会员有 5 张，送出一张剩 4 张", () => {
    expect(activeMembership(giver)?.id).toBe(sub.id);
    expect(giftPoolFor(giver)?.available).toBe(5);
    mintPoolGift(giver, sub.id, "zh-hant", null);
    expect(giftPoolFor(giver)?.available).toBe(4);
  });

  it("送的人自己不能领，朋友可以", () => {
    const g = mintPoolGift(giver, sub.id, "zh-hant", null);
    expect(redeemGiftCast(g.token, "{}", "giver-perks@example.com", null, "zh-hant")).toEqual({ ok: false, error: "self" });
    expect(redeemGiftCast(g.token, "{}", null, giver, "zh-hant")).toEqual({ ok: false, error: "self" });
    const r = redeemGiftCast(g.token, "{}", "friend-perks@example.com", friend, "zh-hant");
    expect(r.ok).toBe(true);
  });

  it("朋友第一次付费 → 送的人得一次深断；第二次付费不再给", async () => {
    recordOrder({ sessionId: "cs_perks_1", customerId: friend, castId: null, tier: "deep", amountCents: 999, currency: "USD", email: "friend-perks@example.com", status: "paid" });
    expect(await maybeGrantGiftReward({ customerId: friend, email: "friend-perks@example.com", sessionId: "cs_perks_1" })).toBe("granted");
    const row = db().prepare("SELECT referrer_customer_id AS r FROM referrals WHERE referred_customer_id = ?").get(friend) as { r: number };
    expect(row.r).toBe(giver);
    recordOrder({ sessionId: "cs_perks_2", customerId: friend, castId: null, tier: "one", amountCents: 299, currency: "USD", email: "friend-perks@example.com", status: "paid" });
    expect(await maybeGrantGiftReward({ customerId: friend, email: "friend-perks@example.com", sessionId: "cs_perks_2" })).toBe("skipped");
  });
});

describe("首次价只给一次（09-25：同一人换浏览器又拿到首次价）", () => {
  it("an address that paid for a deep reading is known even signed-out; gifts and refunds do not count", async () => {
    const { emailHasPaidDeep, customerHasPaidDeep, recordOrder, upsertCustomer } = await import("../src/lib/db");
    const cid = upsertCustomer("twice@example.com", "zh-hant");
    expect(emailHasPaidDeep("twice@example.com")).toBe(false);
    recordOrder({ sessionId: "gf_twice_gift", customerId: cid, castId: null, tier: "deep", amountCents: 0, currency: "TWD", email: "twice@example.com", status: "gift" });
    expect(emailHasPaidDeep("twice@example.com")).toBe(false); // a gift is not a purchase
    recordOrder({ sessionId: "cs_twice_1", customerId: cid, castId: null, tier: "deep", amountCents: 7245, currency: "twd", email: "twice@example.com", status: "paid" });
    expect(emailHasPaidDeep("Twice@Example.com")).toBe(true);
    expect(customerHasPaidDeep(cid)).toBe(true);
    // the address typed on the cast page (no account) — the same question the checkout route now asks
    recordOrder({ sessionId: "cs_other_1", customerId: null, castId: null, tier: "deep", amountCents: 7245, currency: "twd", email: "noaccount@example.com", status: "paid" });
    expect(emailHasPaidDeep("noaccount@example.com")).toBe(true);
  });
});
