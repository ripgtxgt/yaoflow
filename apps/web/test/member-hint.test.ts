import { describe, expect, it } from "vitest";
import { upsertCustomer, upsertSubscription } from "../src/lib/db";
import { linkBrowser } from "../src/lib/browsers";
import { browserIsMember } from "../src/lib/member-hint";

/** 11-10: a signed-out browser known to be a member's is told to sign in instead of being sold a pass. */
describe("is this browser a member's", () => {
  it("by the who-mark or a linked customer; a pass holder is not a member", () => {
    const now = Date.now();
    const m = upsertCustomer("hint-member@example.com", "zh-hant");
    upsertSubscription({ customerId: m, stripeCustomerId: "cus_hint", stripeSubscriptionId: "sub_hint_1", status: "active", plan: "month", periodStart: now - 86_400_000, periodEnd: now + 29 * 86_400_000, cancelAtPeriodEnd: false });
    const p = upsertCustomer("hint-pass@example.com", "zh-hant");
    upsertSubscription({ customerId: p, stripeCustomerId: null, stripeSubscriptionId: "pass_hint_1", status: "active", plan: "month", periodStart: now - 3600_000, periodEnd: now + 3600_000, cancelAtPeriodEnd: false, passDays: 1 });
    expect(browserIsMember(m, null, now)).toBe(true);
    expect(browserIsMember(p, null, now)).toBe(false);
    expect(browserIsMember(null, null, now)).toBe(false);
    linkBrowser("abcdef0123456789", m, "login");
    expect(browserIsMember(null, "abcdef0123456789", now)).toBe(true);
    expect(browserIsMember(null, "0000000000000000", now)).toBe(false);
  });
});
