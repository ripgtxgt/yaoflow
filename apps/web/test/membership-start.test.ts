import { describe, expect, it } from "vitest";
import { membershipChargesForCustomer, recordOrder, setOrderCreditCoupon, upsertCustomer, upsertSubscription } from "../src/lib/db";

/**
 * 10-13 (Neil, 客户 #1951 的后台：「这个是bug吧，怎么可能是收费0呢」): a one-off month (pass_) is paid in full at checkout
 * (A$19.99 — Stripe's amount_total is the row's amount_minor), but in the half hour before the Stripe ledger sync its row
 * read A$0 · 首月未收费: the start fallback treated a pass like a grant. And a pass's checkout never applies the
 * single-purchase credit, so no pass row may claim one.
 */
describe("membership start rows: a one-off month is paid at checkout", () => {
  const now = Date.now();
  const sub = (cid: number, sid: string, amount: number) => upsertSubscription({
    customerId: cid, stripeCustomerId: `cus_${sid.slice(0, 14)}`, stripeSubscriptionId: sid, status: "active", plan: "month",
    periodStart: now, periodEnd: now + 30 * 86_400_000, cancelAtPeriodEnd: sid.startsWith("pass_"), currency: "AUD", amountMinor: amount,
  });
  const startOf = (cid: number) => membershipChargesForCustomer(cid).find((r) => r.start);

  it("#1951: a pass before the ledger sync is 'charged, not synced yet' — never unpaid", () => {
    const cid = upsertCustomer("pass1951@example.com", "zh-hant");
    sub(cid, "pass_t1951aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 1999);
    const s = startOf(cid);
    expect(s?.pass).toBe(true);
    expect(s?.start?.comp).toBe(false);
    expect(s?.start?.credit).toBeNull();
    expect(s?.start?.pending).toBe(true);
    expect(s?.planAmount).toBe(1999);
  });

  it("a pass claims no credit, even after a single purchase that minted a credit coupon", () => {
    const cid = upsertCustomer("passcredit@example.com", "zh-hant");
    recordOrder({ sessionId: "cs_test_passcredit", customerId: cid, castId: null, tier: "deep", amountCents: 479, currency: "aud", email: "passcredit@example.com", status: "paid" });
    setOrderCreditCoupon("cs_test_passcredit", "coupon_test_pass");
    sub(cid, "pass_tcreditbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 1999);
    const s = startOf(cid);
    expect(s?.start?.credit).toBeNull();
    expect(s?.start?.pending).toBe(true);
  });

  it("unchanged: a recurring month after a credited single purchase still shows the credit and still owes the rest", () => {
    const cid = upsertCustomer("subcredit@example.com", "zh-hant");
    recordOrder({ sessionId: "cs_test_subcredit", customerId: cid, castId: null, tier: "deep", amountCents: 479, currency: "aud", email: "subcredit@example.com", status: "paid" });
    setOrderCreditCoupon("cs_test_subcredit", "coupon_test_sub");
    sub(cid, "sub_tcredit", 1999);
    const s = startOf(cid);
    expect(s?.pass).toBe(false);
    expect(s?.start?.credit?.cents).toBe(479);
    expect(s?.start?.pending).toBe(true);
  });

  it("unchanged: a grant (comp_) owes nothing", () => {
    const cid = upsertCustomer("comp1951@example.com", "zh-hant");
    sub(cid, "comp_tgrant", 1999);
    const s = startOf(cid);
    expect(s?.start?.comp).toBe(true);
    expect(s?.start?.pending).toBe(false);
  });
});
