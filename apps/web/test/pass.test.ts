import { describe, expect, it } from "vitest";
import { activeSubscriptionAmounts, expireLocalSubscriptions, markOrderRefunded, paidInLastDay, recordOrder, subscriptionByStripeId, subsEndingSoon, upsertCustomer } from "../src/lib/db";
import { firstPassEligible, fulfilPass, latestRunningPass, passIdFor, PASS_DAYS, rowPassDays } from "../src/lib/pass";
import { entitlementFor, tongkaLive } from "../src/lib/subscription";
import { capCheck, capSpend, DAY_CAPS, RATE_PER_MIN } from "../src/lib/caps";
import { memberDiscountMinor, TONGKA_PRICES, tongkaMinor } from "../src/lib/money";
import { PASS_PRICES, PRICES, CURRENCIES } from "../src/lib/money";
import type { CheckoutSession } from "../src/lib/stripe";

process.env.TONGKA_MODEL = "on"; // 10-22 通卡: this file asserts the pass model

const session = (id: string, email: string, cust: number | null, paid = true): CheckoutSession => ({
  id, url: null, mode: "payment", payment_status: paid ? "paid" : "unpaid", status: "complete",
  metadata: { kind: "pass", email, locale: "zh-hant", ...(cust ? { cust: String(cust) } : {}) },
  customer_details: { email }, amount_total: 29900, currency: "twd", customer: "cus_pass_test",
});

describe("会员单月（09-26）", () => {
  it("every currency's month-pass costs more than a month of subscription", () => {
    for (const c of CURRENCIES) expect(PASS_PRICES[c]).toBeGreaterThan(PRICES[c].month);
  });

  it("a paid pass is a 30-day membership with the usual caps, recorded once", async () => {
    const cid = upsertCustomer("pass-a@example.com", "zh-hant");
    const s = session("cs_test_pass_a", "pass-a@example.com", cid);
    expect((await fulfilPass(session("cs_test_pass_u", "pass-a@example.com", cid, false))).ok).toBe(false);
    const r = await fulfilPass(s);
    expect(r.ok && r.created).toBe(true);
    const again = await fulfilPass(s);
    expect(again.ok && !again.created).toBe(true);
    const ent = await entitlementFor(cid);
    expect(ent.active).toBe(true);
    expect(ent.pass).toBe(true);
    expect(ent.cancelAtPeriodEnd).toBe(true);
    // 10-22 通卡: with the model live there is no monthly allowance (the fair-use caps are the limit); off → the old caps
    if (tongkaLive()) { expect(ent.unlimited).toBe(true); expect(ent.deepLeft).toBeGreaterThan(100); expect(ent.member).toBe(false); expect(ent.passDays).toBe(30); }
    else { expect(ent.deepLeft).toBe(ent.deepTotal); expect(ent.deepLeft).toBeLessThan(100); }
    expect(ent.periodEnd! - Date.now()).toBeGreaterThan((PASS_DAYS - 1) * 86_400_000);
    // not recurring revenue, and never a "why did you cancel" letter
    expect(subsEndingSoon(40 * 86_400_000).some((x) => x.stripe_subscription_id === passIdFor(s.id))).toBe(false);
    expect(activeSubscriptionAmounts().some((x) => x.amount_minor === 29900 && x.currency === "TWD" && x.plan === "month")).toBe(false);
  });

  it("closes itself after its end", async () => {
    const cid = upsertCustomer("pass-b@example.com", "zh-hant");
    await fulfilPass(session("cs_test_pass_b", "pass-b@example.com", cid), Date.now() - 31 * 86_400_000);
    expect(expireLocalSubscriptions()).toBeGreaterThanOrEqual(1);
    expect((await entitlementFor(cid)).active).toBe(false);
  });

  it("knows the second paid question of the day, by account or by browser", () => {
    const cid = upsertCustomer("pass-c@example.com", "zh");
    expect(paidInLastDay(cid, "bsnothere1")).toBe(false);
    recordOrder({ sessionId: "cs_pass_c_1", customerId: cid, castId: null, tier: "one", amountCents: 7500, currency: "twd", email: "pass-c@example.com", status: "paid", browserSid: "bspassc01" });
    expect(paidInLastDay(cid, null)).toBe(true);
    expect(paidInLastDay(null, "bspassc01")).toBe(true);
  });

  // 10-22 通卡 (进度表 75)
  it("1 日 / 7 天 passes: the row keeps its days and ends accordingly; a second pass queues behind the running one; an orders row is kept", async () => {
    const cid = upsertCustomer("tongka-a@example.com", "zh-hant");
    const one = { ...session("cs_test_tk_1", "tongka-a@example.com", cid), metadata: { kind: "pass", email: "tongka-a@example.com", locale: "zh-hant", cust: String(cid), days: "1", first_pass: "1" }, amount_total: 7500 };
    const t0 = Date.now();
    const r1 = await fulfilPass(one, t0);
    expect(r1.ok && r1.created).toBe(true);
    if (!r1.ok) return;
    expect(rowPassDays(r1.row)).toBe(1);
    expect(r1.row.period_end).toBe(t0 + 86_400_000);
    expect(latestRunningPass(cid, t0 + 1000)?.stripe_subscription_id).toBe(passIdFor("cs_test_tk_1"));
    const seven = { ...session("cs_test_tk_7", "tongka-a@example.com", cid), metadata: { kind: "pass", email: "tongka-a@example.com", locale: "zh-hant", cust: String(cid), days: "7" }, amount_total: 19900 };
    const r7 = await fulfilPass(seven, t0 + 3600_000);
    expect(r7.ok && r7.created).toBe(true);
    if (!r7.ok) return;
    expect(r7.row.status).toBe("scheduled");
    expect(r7.row.period_start).toBe(t0 + 86_400_000);
    expect(r7.row.period_end).toBe(t0 + 8 * 86_400_000);
    expect(firstPassEligible(cid, null)).toBe(false);
    expect(firstPassEligible(upsertCustomer("tongka-fresh@example.com", "zh"), null)).toBe(true);
    // 10-22 进度表 78: a refund of the pass's order closes the pass itself — nothing left to use after the money goes back
    expect(latestRunningPass(cid, t0 + 2000)?.stripe_subscription_id).toBe(passIdFor("cs_test_tk_1"));
    markOrderRefunded("cs_test_tk_1", "guarantee", t0 + 2000);
    expect(subscriptionByStripeId(passIdFor("cs_test_tk_1"))?.status).toBe("canceled");
    expect(subscriptionByStripeId(passIdFor("cs_test_tk_1"))?.period_end).toBe(t0 + 2000);
    expect(latestRunningPass(cid, t0 + 3000)?.stripe_subscription_id).not.toBe(passIdFor("cs_test_tk_1"));
  });

  it("prices: 1 日 NT$99 (first 75) / 7 天 199 / 30 天 349; member 8 折 rounds to the market step", () => {
    expect(tongkaMinor("TWD", 1)).toBe(9900);
    expect(tongkaMinor("TWD", 1, true)).toBe(7500);
    expect(tongkaMinor("TWD", 7)).toBe(19900);
    expect(tongkaMinor("TWD", 30)).toBe(34900);
    expect([tongkaMinor("HKD", 1), tongkaMinor("HKD", 7), tongkaMinor("HKD", 30)]).toEqual([2500, 5200, 8800]);
    expect([tongkaMinor("USD", 1), tongkaMinor("USD", 7), tongkaMinor("USD", 30)]).toEqual([399, 799, 1299]);
    for (const c of CURRENCIES) expect(TONGKA_PRICES[1][c]).toBeLessThan(TONGKA_PRICES[7][c]);
    for (const c of CURRENCIES) expect(TONGKA_PRICES[7][c]).toBeLessThan(TONGKA_PRICES[30][c]);
    expect(memberDiscountMinor("TWD", 119000)).toBe(95000);
    expect(memberDiscountMinor("TWD", 49000)).toBe(39000);
    expect(memberDiscountMinor("HKD", 29800)).toBe(23800);
    expect(memberDiscountMinor("USD", 3699)).toBe(2959);
  });

  it("fair-use caps: a day's cap per kind, the same ref not counted twice, a rate per minute", () => {
    const cid = upsertCustomer("tongka-caps@example.com", "zh-hant");
    const now = Date.UTC(2026, 9, 22, 2); // 10:00 Taipei
    for (let i = 0; i < DAY_CAPS.tarot; i++) {
      expect(capCheck(cid, "tarot", { ref: `t${i}`, now: now + i * 20_000 }).ok).toBe(true);
      capSpend(cid, "tarot", `t${i}`, now + i * 20_000);
    }
    const v = capCheck(cid, "tarot", { ref: "t-new", now: now + 3600_000 });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.why).toBe("day");
    expect(capCheck(cid, "tarot", { ref: "t3", now: now + 3600_000 }).ok).toBe(true); // reopening one of today's
    expect(capCheck(cid, "tarot", { ref: "t-new", now: now + 16 * 3600_000 }).ok).toBe(true); // the next Taipei day
    const cid2 = upsertCustomer("tongka-rate@example.com", "zh-hant");
    for (let i = 0; i < RATE_PER_MIN; i++) capSpend(cid2, "cast", `c${i}`, now + i * 1000);
    const r = capCheck(cid2, "cast", { now: now + 10_000 });
    expect(!r.ok && r.why).toBe("rate");
    expect(capCheck(cid2, "cast", { now: now + 70_000 }).ok).toBe(true);
  });
});
