import { describe, expect, it } from "vitest";
import { allowanceGrantsSince, grantAllowance, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { entitlementFor, DEEP_PER_MONTH, LIGHT_FAIR_USE } from "../src/lib/subscription";
import { threadStatus } from "../src/components/ThreadPanel";

const DAY = 86_400_000;

/** 09-30 补额度 (进度表 24): units the owner adds by hand count in the current period only. */
describe("补额度", () => {
  it("a deep grant raises this period's total and left; a light grant lifts the fair-use ceiling", async () => {
    const now = Date.now();
    const cid = upsertCustomer("grant-a@example.com", "zh-hant");
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_grant_a", stripeSubscriptionId: "sub_grant_a", status: "active", plan: "month",
      periodStart: now - 5 * DAY, periodEnd: now + 25 * DAY, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900 });
    const before = await entitlementFor(cid);
    grantAllowance({ customerId: cid, tier: "deep", units: 2, reason: "09-29 轻解读上限误挡期间多用的两次深断" });
    grantAllowance({ customerId: cid, tier: "one", units: 10, reason: "test" });
    const after = await entitlementFor(cid);
    expect(after.deepTotal).toBe(before.deepTotal + 2);
    expect(after.deepLeft).toBe(before.deepLeft + 2);
    expect(after.deepTotal).toBe(DEEP_PER_MONTH + 2);
    expect(after.lightLeft).toBe(LIGHT_FAIR_USE + 10);
    expect(allowanceGrantsSince(cid, "deep", now - 5 * DAY)).toBe(2);
    // a grant from before this period is not this period's
    expect(allowanceGrantsSince(cid, "deep", now + DAY)).toBe(0);
  });

  it("the default light fair-use ceiling is 300 (24 ③)", () => {
    expect(LIGHT_FAIR_USE).toBe(Number(process.env.SUB_LIGHT_FAIR_USE ?? 300));
  });
});

/** 09-30 (进度表 25 ①): the list no longer calls the write-back day 「應期」. */
describe("the thread status line", () => {
  const fmt = (ms: number) => new Date(ms).toISOString().slice(5, 10);
  it("shows the reading's own timing line when there is one, else says when we will ask", () => {
    const due = Date.now() + 5 * DAY;
    expect(threadStatus({ outcome: null, revisit_id: 1, due_at: due, timing_quote: "10月3日到7日之間會有動靜" }, "zh-hant", fmt)).toBe("應期：10月3日到7日之間會有動靜");
    expect(threadStatus({ outcome: null, revisit_id: 1, due_at: due, timing_quote: null }, "zh-hant", fmt)).toBe(`${fmt(due)} 來問你`);
    expect(threadStatus({ outcome: null, revisit_id: 1, due_at: Date.now() - DAY, timing_quote: "x" }, "zh-hant", fmt)).toBe("應期已過，等你回一句");
    const long = "一".repeat(50);
    expect(threadStatus({ outcome: null, revisit_id: 1, due_at: due, timing_quote: long }, "zh", fmt)).toBe(`应期：${"一".repeat(35)}…`);
  });
});
