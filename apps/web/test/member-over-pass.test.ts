import { describe, expect, it } from "vitest";
import { db, latestSubscription, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { activeMembership } from "../src/lib/membership";

/** 11-10 (#3639): a member who still holds a live 通卡 is a member, whichever row was written last. */
describe("a renewing membership comes before a live pass", () => {
  it("picks the membership even when the pass row is newer", () => {
    const cid = upsertCustomer("member-over-pass@example.com", "zh-hant");
    const now = Date.now();
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_mop", stripeSubscriptionId: "sub_mop_1", status: "active", plan: "month", periodStart: now - 3600_000, periodEnd: now + 29 * 86_400_000, cancelAtPeriodEnd: false });
    upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: "pass_mop_1", status: "active", plan: "month", periodStart: now - 600_000, periodEnd: now + 86_400_000, cancelAtPeriodEnd: false, passDays: 1 });
    db().prepare("UPDATE subscriptions SET updated_at = ? WHERE stripe_subscription_id = 'pass_mop_1'").run(now + 1000);
    expect(latestSubscription(cid)!.stripe_subscription_id).toBe("sub_mop_1");
    expect(activeMembership(cid, now)!.stripe_subscription_id).toBe("sub_mop_1");
    // the membership ends: the pass is what is left
    db().prepare("UPDATE subscriptions SET status = 'canceled' WHERE stripe_subscription_id = 'sub_mop_1'").run();
    expect(latestSubscription(cid)!.stripe_subscription_id).toBe("pass_mop_1");
  });
});
