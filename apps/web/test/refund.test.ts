import { describe, expect, it } from "vitest";
import {
  addOrderToCustomer, customerHasPaidDeep, fulfilFailures, markOrderDispute, markOrderRefunded, orderByPaymentIntent, orderBySession,
  recordOps, recordOrder, refundStats, salesByCurrency, upsertCustomer,
} from "../src/lib/db";
import { buildRefundEmail } from "../src/lib/email";
import { LOCALES } from "../src/lib/locales";

/**
 * 切正式 ①②③ (09-10): a refund is a row flip that takes the money out of every
 * place it was counted — revenue, the first-deep entitlement, the customer's
 * spend — and never comes back through a later recordOrder.
 */
describe("refunds", () => {
  it("flips a paid order to refunded and unwinds what the sale had granted", () => {
    const cid = upsertCustomer("refund@example.com", "en");
    recordOrder({ sessionId: "cs_rf_1", customerId: cid, castId: null, tier: "deep", amountCents: 1299, currency: "USD", email: "refund@example.com", status: "paid", firstDeep: true, paymentIntent: "pi_rf_1" });
    addOrderToCustomer(cid, 1299);
    expect(customerHasPaidDeep(cid)).toBe(true);
    expect(orderByPaymentIntent("pi_rf_1")?.session_id).toBe("cs_rf_1");
    expect(salesByCurrency(Date.now() - 60_000).orders.some((o) => o.currency === "USD" && o.tier === "deep")).toBe(true);

    const row = markOrderRefunded("cs_rf_1", "technical_failure");
    expect(row?.status).toBe("refunded");
    expect(row?.refund_reason).toBe("technical_failure");
    expect(row?.refunded_at).toBeGreaterThan(0);
    // the first-time price is available again, the sale is out of revenue
    expect(customerHasPaidDeep(cid)).toBe(false);
    expect(salesByCurrency(Date.now() - 60_000).orders.filter((o) => o.currency === "USD" && o.tier === "deep")).toHaveLength(0);
    // a later page load that would re-record the order as paid does not resurrect it
    recordOrder({ sessionId: "cs_rf_1", customerId: cid, castId: null, tier: "deep", amountCents: 1299, currency: "USD", email: "refund@example.com", status: "paid" });
    expect(orderBySession("cs_rf_1")?.status).toBe("refunded");
    // refunding twice is a no-op
    expect(markOrderRefunded("cs_rf_1", "requested")?.refund_reason).toBe("technical_failure");
    const stats = refundStats(Date.now() - 60_000);
    expect(stats.refunds).toBeGreaterThanOrEqual(1);
    expect(stats.refundedCents.find((x) => x.currency === "USD")?.cents).toBeGreaterThanOrEqual(1299);
  });

  it("tracks a chargeback on the order: open flags it, lost is money gone, won restores paid", () => {
    recordOrder({ sessionId: "cs_dp_1", customerId: null, castId: null, tier: "one", amountCents: 499, currency: "EUR", email: null, status: "paid", paymentIntent: "pi_dp_1" });
    markOrderDispute("cs_dp_1", "open");
    expect(orderBySession("cs_dp_1")).toMatchObject({ status: "disputed", dispute: "open" });
    expect(refundStats(0).disputesOpen).toBeGreaterThanOrEqual(1);
    markOrderDispute("cs_dp_1", "won");
    expect(orderBySession("cs_dp_1")).toMatchObject({ status: "paid", dispute: "won" });
    markOrderDispute("cs_dp_1", "lost");
    expect(orderBySession("cs_dp_1")).toMatchObject({ status: "refunded", dispute: "lost", refund_reason: "dispute_lost" });
  });

  it("counts the sweep's failures per session so the third strike can refund", () => {
    recordOps("fulfil_fail", "cs_ff_1 generation_failed:schema_invalid");
    recordOps("fulfil_fail", "cs_ff_1 generation_failed:jargon");
    recordOps("fulfil_fail", "cs_ff_10 another session");
    expect(fulfilFailures("cs_ff_1")).toBe(2);
    expect(fulfilFailures("cs_ff_10")).toBe(1);
    expect(fulfilFailures("cs_ff_2")).toBe(0);
  });

  it("writes the refund notice in every language with the amount and the reason filled in", () => {
    for (const l of LOCALES) {
      const m = buildRefundEmail({ locale: l, amountLabel: "US$12.99", reason: "technical_failure" });
      expect(m.html).toContain("US$12.99");
      expect(m.html).not.toMatch(/\{amount\}|\{reason\}/);
      expect(m.html).toContain("background:#f4f2ec;color:#14151c");
      expect(m.text).toContain("US$12.99");
    }
    expect(buildRefundEmail({ locale: "zh", amountLabel: "¥68", reason: "technical_failure" }).html).toContain("很抱歉");
    expect(buildRefundEmail({ locale: "zh-hant", amountLabel: "NT$320", reason: "duplicate" }).html).toContain("重複");
    expect(buildRefundEmail({ locale: "en", amountLabel: "US$4.99", reason: "requested" }).html).toContain("As you asked");
  });
});

/**
 * 09-21, Neil: 「退款之后，还可以再看到链接，还可以进行追问」 — and the customers
 * page added a NT$ and a ¥ as if they were dollars. Money is counted per currency,
 * our own test orders leave the numbers, and a refunded order reads as refunded.
 */
describe("money after refunds (09-21)", () => {
  it("counts revenue per settlement currency, paid orders only, test runs out", async () => {
    const { revenueByCurrency, spendByCustomer, markOwnOrdersAsTest, recordOrder: rec, orderBySession: bySid } = await import("../src/lib/db");
    const cid = upsertCustomer("buyer-0921@example.org", "zh-hant");
    rec({ sessionId: "cs_live_twd_0921", customerId: cid, castId: null, tier: "deep", amountCents: 7245, currency: "twd", email: "buyer-0921@example.org", status: "paid", via: null, firstDeep: true, paymentIntent: "pi_a" });
    rec({ sessionId: "cs_live_cny_0921", customerId: cid, castId: null, tier: "one", amountCents: 990, currency: "cny", email: "buyer-0921@example.org", status: "paid", via: null, firstDeep: false, paymentIntent: "pi_b" });
    rec({ sessionId: "cs_test_own_0921", customerId: null, castId: null, tier: "deep", amountCents: 999, currency: "usd", email: "someone@example.org", status: "paid", via: null, firstDeep: false, paymentIntent: "pi_c" });
    rec({ sessionId: "cs_live_own_0921", customerId: null, castId: null, tier: "deep", amountCents: 3800, currency: "cny", email: "ripgtxgt@gmail.com", status: "paid", via: null, firstDeep: false, paymentIntent: "pi_d" });
    expect(markOwnOrdersAsTest(["ripgtxgt@gmail.com", "*@linedo.io"])).toBe(2);
    expect(bySid("cs_test_own_0921")?.test_flag).toBe(1);
    expect(bySid("cs_live_own_0921")?.test_flag).toBe(1);
    const rev = Object.fromEntries(revenueByCurrency().map((r) => [r.currency, r.cents]));
    expect(rev.TWD).toBe(7245);
    expect(rev.CNY).toBe(990);   // the ¥38 we bought ourselves is out
    expect(rev.USD).toBeUndefined();
    expect(spendByCustomer().get(cid)).toEqual([{ currency: "TWD", cents: 7245 }, { currency: "CNY", cents: 990 }]);
  });
});

/** 09-21 evening, Neil: 「这个数据也改一下啊」 — 付费 62 / 退款 4 on the overview were mostly us. */
describe("test orders leave the overview (09-21)", () => {
  it("refundStats skips refunds of test orders; testOrderSessionTails hands the funnel their session tails", async () => {
    const { refundStats: rs, testOrderSessionTails, markOwnOrdersAsTest, recordOrder: rec, markOrderRefunded: refund } = await import("../src/lib/db");
    const t0 = Date.now();
    rec({ sessionId: "cs_test_rf_own_0921xx", customerId: null, castId: null, tier: "one", amountCents: 990, currency: "cny", email: "ripgtxgt@gmail.com", status: "paid", via: null, firstDeep: false, paymentIntent: "pi_e" });
    rec({ sessionId: "cs_live_rf_real_0921yy", customerId: null, castId: null, tier: "one", amountCents: 299, currency: "usd", email: "reader-0921@example.org", status: "paid", via: null, firstDeep: false, paymentIntent: "pi_f" });
    refund("cs_test_rf_own_0921xx", "requested", t0);
    refund("cs_live_rf_real_0921yy", "requested", t0);
    markOwnOrdersAsTest(["ripgtxgt@gmail.com"]);
    const s = rs(t0 - 1);
    expect(s.refunds).toBe(1);
    expect(s.refundedCents).toEqual([{ currency: "USD", cents: 299 }]);
    const tails = testOrderSessionTails();
    expect(tails.has("cs_test_rf_own_0921xx".slice(-12))).toBe(true);
    expect(tails.has("cs_live_rf_real_0921yy".slice(-12))).toBe(false);
    const { realOrderSessionTails, isRealDeliveryEvent } = await import("../src/lib/db");
    const real = realOrderSessionTails();
    expect(isRealDeliveryEvent({ e: "purchase", s: "cs_live_rf_real_0921yy".slice(-12) }, real)).toBe(true);
    expect(isRealDeliveryEvent({ e: "purchase", s: "cs_test_rf_own_0921xx".slice(-12) }, real)).toBe(false);
    expect(isRealDeliveryEvent({ e: "purchase", s: "deleted_e2e_" }, real)).toBe(false); // a session we deleted
    expect(isRealDeliveryEvent({ e: "cast_complete", s: "anything_at_" }, real)).toBe(true);
  });
});

/** 09-21 night, Neil: 「面板上面还有很多测试的付款和复购的统计，你没有统一清零吗？」 */
describe("our own customers leave every panel (09-21)", () => {
  it("marks the customer row too, and stats / repeat buyers / paid_orders count the rest", async () => {
    const { markOwnOrdersAsTest, recordOrder: rec, stats: st, listCustomers, subscriptionStats } = await import("../src/lib/db");
    const own = upsertCustomer("neil-0921@linedo.io", "zh");
    const real = upsertCustomer("repeat-0921@example.org", "en");
    rec({ sessionId: "cs_live_own_a_0921", customerId: own, castId: null, tier: "deep", amountCents: 999, currency: "usd", email: null, status: "paid", via: null, firstDeep: false, paymentIntent: "pi_g" });
    rec({ sessionId: "cs_live_own_b_0921", customerId: own, castId: null, tier: "one", amountCents: 299, currency: "usd", email: null, status: "paid", via: null, firstDeep: false, paymentIntent: "pi_h" });
    rec({ sessionId: "cs_live_rep_a_0921", customerId: real, castId: null, tier: "one", amountCents: 299, currency: "usd", email: "repeat-0921@example.org", status: "paid", via: null, firstDeep: false, paymentIntent: "pi_i" });
    rec({ sessionId: "cs_live_rep_b_0921", customerId: real, castId: null, tier: "deep", amountCents: 999, currency: "usd", email: "repeat-0921@example.org", status: "paid", via: null, firstDeep: false, paymentIntent: "pi_j" });
    const before = st();
    // orders without an email still get flagged through the customer row
    expect(markOwnOrdersAsTest(["*@linedo.io"])).toBeGreaterThanOrEqual(2);
    const rows = listCustomers(1000);
    expect(rows.find((c) => c.id === own)).toMatchObject({ test_flag: 1, paid_orders: 0 });
    expect(rows.find((c) => c.id === real)).toMatchObject({ paid_orders: 2 });
    const after = st();
    expect(after.testCustomers).toBeGreaterThanOrEqual(1);
    expect(after.customers).toBe(before.customers - 1);
    expect(after.repeatBuyers).toBeGreaterThanOrEqual(1);
    expect(subscriptionStats().active).toBeGreaterThanOrEqual(0);
  });
});
