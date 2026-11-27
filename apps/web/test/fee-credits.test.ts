import { describe, expect, it } from "vitest";
import { feeCreditBalance, liveMoney, saveStripeTxn } from "../src/lib/db";

/**
 * 09-30 (Neil: 「对账那里突然多了个 500USD，这 500USD 是 stripe 费用抵扣券啊，又不是真的 500USD」).
 * Stripe fee credits (balance_type fee_credits) are a coupon against Stripe's own fees — never money.
 */
describe("Stripe fee credits stay out of the books", () => {
  const t0 = Date.UTC(2026, 8, 30, 3);
  it("the funding line and the daily deductions touch neither 到账 nor 平台费", () => {
    saveStripeTxn({ id: "txn_fc_fund", created: t0, type: "fee_credit_funding", currency: "usd", amount: 50000, fee: 0, net: 50000, source: null, payment_intent: null, balance_type: "fee_credits" });
    saveStripeTxn({ id: "txn_fc_use", created: t0 + 86_400_000, type: "stripe_fee", currency: "usd", amount: -123, fee: 0, net: -123, source: null, payment_intent: null, balance_type: "fee_credits" });
    saveStripeTxn({ id: "txn_fc_real_fee", created: t0 + 2 * 86_400_000, type: "stripe_fee", currency: "usd", amount: -50, fee: 0, net: -50, source: null, payment_intent: null, balance_type: "payments" });
    const m = liveMoney(t0 - 1, t0 + 3 * 86_400_000);
    expect(m.feeCredits).toEqual({ issued: 50000, used: 123, n: 2 });
    expect(m.gross).toBe(-50);
    expect(m.net).toBe(-50);
    expect(m.platformFees).toEqual({ n: 1, net: -50 });
  });

  it("the coupon's own balance: issued, used, left", () => {
    const b = feeCreditBalance();
    expect(b.issued).toBeGreaterThanOrEqual(50000);
    expect(b.used).toBeGreaterThanOrEqual(123);
    expect(b.left).toBe(b.issued - b.used);
  });

  it("a row saved without a balance_type is money (the rows synced before the column existed)", () => {
    saveStripeTxn({ id: "txn_fc_old", created: t0 + 3 * 86_400_000, type: "charge", currency: "usd", amount: 999, fee: 60, net: 939, source: null, payment_intent: null });
    const m = liveMoney(t0 + 3 * 86_400_000 - 1, t0 + 3 * 86_400_000 + 1);
    expect(m.gross).toBe(999);
    expect(m.feeCredits.n).toBe(0);
  });
});
