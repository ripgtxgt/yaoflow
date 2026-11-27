import { describe, expect, it } from "vitest";
import { db, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { upgradeCredit, upgradeCreditOn } from "../src/lib/upgrade-credit";
import { passCredit } from "../src/lib/pass";

/** 10-24 (Neil: 「现在不能进行会员的升级进行抵扣了，刚刚有一笔，只付了20HKD」): no credit into a membership by default */
describe("升级会员不再抵扣", () => {
  it("neither earlier single purchases nor a running pass take anything off the first month", () => {
    delete process.env.UPGRADE_CREDIT;
    expect(upgradeCreditOn()).toBe(false);
    const cid = upsertCustomer("nocredit1024@example.com", "zh-hant");
    const now = Date.now();
    for (const [i, amt] of [6800, 1800].entries())
      db().prepare("INSERT INTO orders (session_id, customer_id, created_at, tier, amount_cents, currency, email, status, entitlement_kind, payment_state) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .run(`pi_nocredit1024_${i}`, cid, now - (i + 1) * 86_400_000, "deep", amt, "hkd", "nocredit1024@example.com", "paid", "purchase", "paid");
    upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: "pass_nocredit1024", status: "active", plan: "month", periodStart: now - 86_400_000, periodEnd: now + 20 * 86_400_000, cancelAtPeriodEnd: true, currency: "hkd", amountMinor: 8800, passDays: 30 });
    expect(upgradeCredit(cid, "HKD")).toBeNull();
    expect(passCredit(cid, "HKD")).toBeNull();
  });
});
