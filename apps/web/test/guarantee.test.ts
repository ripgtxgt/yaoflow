import { describe, expect, it } from "vitest";
import { customerHasPaidDeep, db, guaranteeCheck, latestPassOrderSid, markOrderRefunded, recordOrder, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { capSpend } from "../src/lib/caps";

const HOUR = 3_600_000;
const buy = (sid: string, email: string, cid: number | null, at = Date.now(), tier = "deep") => {
  recordOrder({ sessionId: sid, customerId: cid, castId: null, tier, amountCents: 299, currency: "usd", email, status: "paid" });
  db().prepare("UPDATE orders SET created_at = ?, entitlement_kind = 'purchase', payment_state = 'paid' WHERE session_id = ?").run(at, sid);
};

describe("首次付费保证（09-26）", () => {
  it("the first paid order qualifies for 24 hours", () => {
    const cid = upsertCustomer("g-first@example.com", "zh");
    buy("cs_g_first_1", "g-first@example.com", cid);
    const g = guaranteeCheck("cs_g_first_1");
    expect(g.ok).toBe(true);
    buy("cs_g_old_1", "g-old@example.com", null, Date.now() - 25 * HOUR);
    expect(guaranteeCheck("cs_g_old_1")).toEqual({ ok: false, why: "expired" });
  });

  it("a second purchase does not — even under another address known to be theirs", () => {
    const cid = upsertCustomer("g-two@example.com", "zh");
    db().prepare("UPDATE customers SET alt_emails = 'g-two-alt@example.com' WHERE id = ?").run(cid);
    buy("cs_g_two_1", "g-two@example.com", cid, Date.now() - 2 * HOUR);
    buy("cs_g_two_2", "g-two-alt@example.com", null, Date.now() - HOUR);
    expect(guaranteeCheck("cs_g_two_2")).toMatchObject({ ok: false, why: "not_first" });
  });

  it("a case reward already taken closes the guarantee on that reading", () => {
    const cid = upsertCustomer("g-case@example.com", "zh");
    buy("cs_g_case_1", "g-case@example.com", cid);
    db().prepare("INSERT INTO case_rewards (case_sid, customer_id, email, created_at, choice, chosen_at) VALUES (?,?,?,?,?,?)").run("cs_g_case_1", cid, "g-case@example.com", Date.now(), "gift", Date.now());
    expect(guaranteeCheck("cs_g_case_1").ok).toBe(false);
  });

  it("members and anyone who already used it are out", () => {
    const cid = upsertCustomer("g-mem@example.com", "zh");
    const now = Date.now();
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_g", stripeSubscriptionId: "sub_g_mem", status: "active", plan: "month", periodStart: now - 5 * HOUR, periodEnd: now + 700 * HOUR, cancelAtPeriodEnd: false, currency: "usd", amountMinor: 999 });
    db().prepare("UPDATE subscriptions SET created_at = ? WHERE stripe_subscription_id = 'sub_g_mem'").run(now - 5 * HOUR);
    buy("cs_g_mem_1", "g-mem@example.com", cid);
    expect(guaranteeCheck("cs_g_mem_1")).toMatchObject({ ok: false, why: "not_first" });

    const c2 = upsertCustomer("g-used@example.com", "zh");
    buy("cs_g_used_1", "g-used@example.com", c2, now - 3 * HOUR);
    markOrderRefunded("cs_g_used_1", "guarantee");
    buy("cs_g_used_2", "g-used@example.com", c2);
    expect(guaranteeCheck("cs_g_used_2").ok).toBe(false);
    // a guarantee refund spends the first price too
    expect(customerHasPaidDeep(c2)).toBe(true);
  });

  it("10-22 进度表 78 ② (Neil: 「按照你的来」): the first 1-day pass is covered, the other passes are not, and a pass that served more than two pieces is used", () => {
    const now = Date.now();
    const c7 = upsertCustomer("g-pass7@example.com", "zh-hant");
    buy("cs_g_pass7", "g-pass7@example.com", c7, now - HOUR, "pass_7d");
    expect(guaranteeCheck("cs_g_pass7")).toEqual({ ok: false, why: "not_covered" });
    const c1 = upsertCustomer("g-pass1@example.com", "zh-hant");
    buy("cs_g_pass1", "g-pass1@example.com", c1, now - HOUR, "pass_1d");
    expect(guaranteeCheck("cs_g_pass1").ok).toBe(true);
    // two pieces, the same reading reopened, follow-ups and Q&A: still covered
    capSpend(c1, "cast", "cast-a", now - 50 * 60_000); capSpend(c1, "cast", "cast-a", now - 40 * 60_000);
    capSpend(c1, "tarot", "draw-b", now - 30 * 60_000);
    capSpend(c1, "followup", "f1", now - 20 * 60_000); capSpend(c1, "qa", "q1", now - 20 * 60_000);
    expect(guaranteeCheck("cs_g_pass1").ok).toBe(true);
    // a third piece: used, not returned
    capSpend(c1, "report", "chart-c", now - 10 * 60_000);
    expect(guaranteeCheck("cs_g_pass1")).toEqual({ ok: false, why: "over_used", pieces: 3 });
    // a piece spent before the pass was bought does not count against it
    const c2 = upsertCustomer("g-pass1b@example.com", "zh-hant");
    capSpend(c2, "cast", "old-1", now - 3 * HOUR); capSpend(c2, "cast", "old-2", now - 3 * HOUR); capSpend(c2, "cast", "old-3", now - 3 * HOUR);
    buy("cs_g_pass1b", "g-pass1b@example.com", c2, now - HOUR, "pass_1d");
    expect(guaranteeCheck("cs_g_pass1b").ok).toBe(true);
    expect(latestPassOrderSid(c2)).toBe("cs_g_pass1b");
    expect(latestPassOrderSid(c7)).toBeNull();
  });
});
