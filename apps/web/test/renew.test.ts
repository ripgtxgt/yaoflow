import { describe, expect, it } from "vitest";
import { buildRenewEmail } from "../src/lib/email";
import { RENEW_T } from "../src/lib/dict/renew";
import { claimRenewNotice, db, subsRenewingSoon, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { RENEW_NOTICE_FROM_MS, RENEW_NOTICE_TO_MS } from "../src/lib/retain";
import { LOCALES } from "../src/lib/locales";

const DAY = 86_400_000;

describe("年付续费预告（09-25 合规：自动续费法要求提前告知）", () => {
  it("nine languages, date and price filled, manage link present, no unsubscribe (service notice)", () => {
    for (const l of LOCALES) {
      expect(RENEW_T[l], l).toBeTruthy();
      const m = buildRenewEmail({ locale: l, date: "2027年9月25日", price: "US$79", manageUrl: "https://yaoflow.com/x/account#membership" });
      expect(m.html, l).not.toMatch(/\{(date|price)\}/);
      expect(m.subject, l).not.toMatch(/\{(date|price)\}/);
      expect(m.html).toContain("US$79");
      expect(m.html).toContain("2027年9月25日");
      expect(m.html).toContain("#membership");
      expect(m.html.toLowerCase()).not.toContain("unsubscribe");
    }
  });

  it("picks yearly, uncancelled, Stripe-billed rows inside the 15–30 day window, once per period", () => {
    const now = Date.now();
    const mk = (tag: string, plan: "year" | "month", days: number, cancel = false, comp = false) => {
      const cid = upsertCustomer(`renew-${tag}@example.com`, "en");
      return upsertSubscription({ customerId: cid, stripeCustomerId: comp ? null : "cus_r", stripeSubscriptionId: `${comp ? "comp_" : "sub_"}renew_${tag}`, status: "active", plan, periodStart: now - 300 * DAY, periodEnd: now + days * DAY, cancelAtPeriodEnd: cancel, currency: "usd", amountMinor: 7900 });
    };
    const due = mk("due", "year", 25);
    mk("late", "year", 10);        // inside the last 15 days: too late to be advance notice
    mk("early", "year", 45);       // not yet
    mk("cancelled", "year", 25, true);
    mk("monthly", "month", 25);
    mk("comp", "year", 25, false, true);
    const ids = subsRenewingSoon(RENEW_NOTICE_FROM_MS, RENEW_NOTICE_TO_MS, now).map((r) => r.stripe_subscription_id).filter((s) => s.includes("renew_"));
    expect(ids).toEqual(["sub_renew_due"]);
    expect(claimRenewNotice(due.id, now)).toBe(true);
    expect(claimRenewNotice(due.id, now)).toBe(false);
    expect(subsRenewingSoon(RENEW_NOTICE_FROM_MS, RENEW_NOTICE_TO_MS, now).some((r) => r.id === due.id)).toBe(false);
    // Stripe moves period_end after the renewal → the next period's notice is due again
    upsertSubscription({ customerId: due.customer_id, stripeCustomerId: "cus_r", stripeSubscriptionId: "sub_renew_due", status: "active", plan: "year", periodStart: now + 25 * DAY, periodEnd: now + 390 * DAY, cancelAtPeriodEnd: false, currency: "usd", amountMinor: 7900 });
    expect((db().prepare("SELECT renew_notice_at AS v FROM subscriptions WHERE id = ?").get(due.id) as { v: number | null }).v).toBeNull();
  });
});
