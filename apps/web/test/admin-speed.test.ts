import { describe, expect, it } from "vitest";
import { homeDay } from "../src/lib/clock";
import { mintPoolGift, redeemGiftCast } from "../src/lib/grants";
import { recentReadings, recordOrder, upsertCustomer, upsertSubscription } from "../src/lib/db";

describe("09-24 后台提速 + 送一卦归因", () => {
  it("cached homeDay gives exactly the UTC+8 date, around midnight too", () => {
    const old = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
    const base = Date.UTC(2026, 8, 23, 15, 59, 59, 999); // 23:59:59.999 in UTC+8
    for (const ms of [base, base + 1, base - 86_400_000, Date.UTC(2026, 0, 1), Date.UTC(2025, 11, 31, 16), Date.now()]) {
      expect(homeDay(ms)).toBe(old(ms));
      expect(homeDay(ms)).toBe(old(ms)); // second call from the cache
    }
    for (let i = 0; i < 2000; i++) { const ms = Date.UTC(2026, 0, 1) + Math.floor(Math.random() * 400 * 86_400_000); expect(homeDay(ms)).toBe(old(ms)); }
  });

  it("a claimed 送一卦 reading row says who gave it, even when the friend stayed anonymous", () => {
    const giver = upsertCustomer("giver-attr@example.com", "zh-hant");
    const sub = upsertSubscription({ customerId: giver, stripeCustomerId: "cus_attr", stripeSubscriptionId: "sub_attr_1", status: "active", plan: "month", periodStart: Date.now(), periodEnd: Date.now() + 30 * 86_400_000, cancelAtPeriodEnd: false });
    const g = mintPoolGift(giver, sub.id, "zh-hant", null);
    const r = redeemGiftCast(g.token, "{}", null, null, "zh-hant");
    expect(r.ok).toBe(true);
    const sid = (r as { sid: string }).sid;
    recordOrder({ sessionId: sid, customerId: null, castId: null, tier: "deep", amountCents: 0, currency: null, email: null, status: "gift_cast" });
    const row = recentReadings(0, 50).find((x) => x.session_id === sid)!;
    expect(row.gift_from_id).toBe(giver);
    expect(row.gift_from_email).toBe("giver-attr@example.com");
    expect(row.gift_from_kind).toBe("member");
    expect(recentReadings(0, 50).filter((x) => x.session_id !== sid).every((x) => x.gift_from_id === null)).toBe(true);
  });
});

describe("09-25 账本：提现不是支出", () => {
  it("a payout leaves 到账 alone and is reported apart; stripe_fee stays a platform fee", async () => {
    const { liveMoney, saveStripeTxn } = await import("../src/lib/db");
    const at = Date.UTC(2026, 8, 25);
    saveStripeTxn({ id: "txn_t_charge", created: at, type: "charge", currency: "usd", amount: 1000, fee: 100, net: 900, source: "ch_x", payment_intent: "pi_none_1", stripe_customer: null });
    saveStripeTxn({ id: "txn_t_fee", created: at + 1, type: "stripe_fee", currency: "usd", amount: -50, fee: 0, net: -50, source: null, payment_intent: null, stripe_customer: null });
    saveStripeTxn({ id: "txn_t_payout", created: at + 2, type: "payout", currency: "usd", amount: -600, fee: 0, net: -600, source: "po_x", payment_intent: null, stripe_customer: null });
    const m = liveMoney(at - 1, at + 10);
    expect(m.net).toBe(850);                 // 900 − 50, the payout not subtracted
    expect(m.platformFees).toEqual({ n: 1, net: -50 });
    expect(m.payouts).toEqual({ n: 1, amount: 600 });
    expect(m.memberships.n).toBe(1);         // a charge with no order row reads as a membership invoice
  });
});
