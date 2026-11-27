import { describe, expect, it } from "vitest";
import { entitlementFor, redeemSubscription, syncSubscription, isCompSubscription } from "../src/lib/subscription";
import { staleSubscriptions, upsertCustomer, upsertSubscription, db } from "../src/lib/db";
import { activeMembership } from "../src/lib/membership";

describe("赠送会员 comp_（09-24）：不去 Stripe 核对，深断与轻解读不限次", () => {
  const cid = upsertCustomer("comp-test@example.com", "zh-hant");
  const now = Date.now();
  upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: "comp_test_1", status: "active", plan: "year", periodStart: now, periodEnd: now + 365 * 86_400_000, cancelAtPeriodEnd: false, currency: "usd", amountMinor: 0 });
  // an old sync stamp must not send it to Stripe
  db().prepare("UPDATE subscriptions SET synced_at = 0 WHERE stripe_subscription_id = 'comp_test_1'").run();

  it("is a live membership that is never re-read from Stripe", async () => {
    expect(isCompSubscription("comp_test_1")).toBe(true);
    expect(isCompSubscription("sub_123")).toBe(false);
    expect(activeMembership(cid)?.stripe_subscription_id).toBe("comp_test_1");
    expect((await syncSubscription("comp_test_1", cid))?.status).toBe("active");
    expect(staleSubscriptions(0).some((r) => r.stripe_subscription_id === "comp_test_1")).toBe(false);
  });

  it("has no monthly cap on full or light readings", async () => {
    const input = { question: "q", values: [7, 8, 7, 8, 7, 8] as (6 | 7 | 8 | 9)[], castAtMs: now, tzOffsetMinutes: 480, locale: "zh-hant" as const };
    for (let i = 0; i < 12; i++) expect((await redeemSubscription(cid, "deep", { ...input, castAtMs: now + i })).ok).toBe(true); // 12 different casts (09-29: the same cast twice is one unit)
    const e = await entitlementFor(cid);
    expect(e.active).toBe(true);
    expect(e.deepLeft).toBeGreaterThan(1000);
    expect(e.deepTotal - e.deepLeft).toBe(12); // "used" still reads right
    expect(e.lightLeft).toBeGreaterThan(1000);
    expect(e.comp).toBe(true);
    expect(e.cancelAtPeriodEnd).toBe(true); // the account page says "ends on …", never "renews"
  });
});
