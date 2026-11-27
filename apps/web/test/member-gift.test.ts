import { describe, expect, it } from "vitest";
import { createGrant, db, giftNoteFor, memberCaseBonus, memberReferralBonus, setGiftNote, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { entitlementFor, DEEP_PER_MONTH } from "../src/lib/subscription";
import { mintThankYou } from "../src/lib/referral";
import { buildGiftUsedEmail } from "../src/lib/email";
import { cleanGiftNote, MEMBER_GIFT_T } from "../src/lib/dict/member-gift";
import { LOCALES } from "../src/lib/locales";

describe("09-29 会员裂变", () => {
  it("a member's thank-you goes into this period's allowance; a non-member's stays a link", async () => {
    const now = Date.now();
    const member = upsertCustomer("mg-member@example.com", "zh-hant");
    upsertSubscription({
      customerId: member, stripeCustomerId: "cus_mg1", stripeSubscriptionId: "sub_mg1", status: "active", plan: "month",
      periodStart: now - 3 * 86_400_000, periodEnd: now + 27 * 86_400_000, cancelAtPeriodEnd: false,
    });
    const friend = upsertCustomer("mg-friend@example.com", "zh-hant");
    const ty = mintThankYou({ token: "m".repeat(36), from_customer_id: member, claimed_customer_id: friend }, "gr_mg_1", "https://yaoflow.com", "zh-hant");
    expect(ty?.allowance).toBe(true);
    expect(ty?.url).toBe("https://yaoflow.com/zh-hant/cast");
    expect(memberReferralBonus(member, now - 86_400_000)).toBe(1);
    expect(memberCaseBonus(member, now - 86_400_000)).toBe(1);
    const ent = await entitlementFor(member);
    expect(ent.deepTotal).toBe(DEEP_PER_MONTH + 1);
    expect(ent.friendBonus).toBe(1);

    const plain = upsertCustomer("mg-plain@example.com", "zh-hant");
    const friend2 = upsertCustomer("mg-friend2@example.com", "zh-hant");
    const ty2 = mintThankYou({ token: "p".repeat(36), from_customer_id: plain, claimed_customer_id: friend2 }, "gr_mg_2", "https://yaoflow.com", "zh-hant");
    expect(ty2?.allowance).toBe(false);
    expect(ty2?.url).toContain("/cast?reward=");
    expect(memberReferralBonus(plain, now - 86_400_000)).toBe(0);
  });

  it("an unused thank-you from last period carries over once, never twice", async () => {
    const now = Date.now();
    const DAY = 86_400_000;
    const cid = upsertCustomer("mg-carry@example.com", "zh-hant");
    upsertSubscription({
      customerId: cid, stripeCustomerId: "cus_mgc", stripeSubscriptionId: "sub_mgc", status: "active", plan: "month",
      periodStart: now - 2 * DAY, periodEnd: now + 28 * DAY, cancelAtPeriodEnd: false,
    });
    const f1 = upsertCustomer("mg-carry-f1@example.com", "zh-hant");
    const f2 = upsertCustomer("mg-carry-f2@example.com", "zh-hant");
    mintThankYou({ token: "c".repeat(36), from_customer_id: cid, claimed_customer_id: f1 }, "gr_mgc_1", "https://yaoflow.com", "zh-hant");
    mintThankYou({ token: "d".repeat(36), from_customer_id: cid, claimed_customer_id: f2 }, "gr_mgc_2", "https://yaoflow.com", "zh-hant");
    // one earned last period, one two periods back: only the first carries
    db().prepare("UPDATE referrals SET created_at = ? WHERE referred_session_id = 'gr_mgc_1'").run(now - 10 * DAY);
    db().prepare("UPDATE referrals SET created_at = ? WHERE referred_session_id = 'gr_mgc_2'").run(now - 50 * DAY);
    const ent = await entitlementFor(cid);
    expect(ent.deepTotal).toBe(DEEP_PER_MONTH + 1);
    expect(ent.friendBonus).toBe(1);
  });

  it("the letter to a member says it is already in the allowance", () => {
    const m = buildGiftUsedEmail({ locale: "zh-hant", giftUrl: "https://x/a", rewardUrl: "https://x/zh-hant/cast", allowance: true });
    expect(m.text).toContain("已經加進你的帳號");
    expect(m.text).toContain("去起卦");
    const n = buildGiftUsedEmail({ locale: "zh-hant", giftUrl: "https://x/a", rewardUrl: "https://x/r" });
    expect(n.text).not.toContain("本期的額度");
  });

  it("the giver's line: cleaned, kept only while the gift is unspent", () => {
    expect(cleanGiftNote("  hi <b>there</b>\n friend ")).toBe("hi  b there /b  friend".replace(/\s+/g, " "));
    expect(cleanGiftNote("x".repeat(200))!.length).toBe(80);
    expect(cleanGiftNote("   ")).toBeNull();
    const token = "n".repeat(36);
    createGrant({ token, kind: "gift_cast", tier: "deep", expiresAt: Date.now() + 86_400_000, fromCustomerId: null });
    setGiftNote(token, "最近看你為這件事煩，送你一卦。");
    expect(giftNoteFor(token)).toBe("最近看你為這件事煩，送你一卦。");
  });

  it("new copy exists in every language", () => {
    for (const l of LOCALES) {
      const t = (MEMBER_GIFT_T as Record<string, Record<string, string>>)[l]!;
      expect(Object.keys(t).sort(), l).toEqual(Object.keys(MEMBER_GIFT_T.zh).sort());
    }
  });
});
