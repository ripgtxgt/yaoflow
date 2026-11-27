import { describe, expect, it } from "vitest";
import { db, expireLocalSubscriptions, subscriptionByStripeId, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { fulfilPass, passIdFor, PASS_DAYS } from "../src/lib/pass";
import { entitlementFor } from "../src/lib/subscription";
import { buildPassNoticeEmail, carriesOn, passNoticeDue, passNoticeToken, runPassNotices, verifyPassNoticeToken } from "../src/lib/pass-notice";
import type { CheckoutSession } from "../src/lib/stripe";

/** 10-14 进度表 §四 42 单月会员到期提醒. */
process.env.REVISIT_SECRET ??= "pass-notice-test-secret";
const DAY = 86_400_000;
const pass = (cid: number, id: string, end: number, status = "active") => upsertSubscription({
  customerId: cid, stripeCustomerId: null, stripeSubscriptionId: id, status, plan: "month",
  periodStart: end - PASS_DAYS * DAY, periodEnd: end, cancelAtPeriodEnd: true, currency: "TWD", amountMinor: 34900,
});

describe("单月会员到期提醒", () => {
  it("is due when the month ends three Taipei days from today — not two, not four", () => {
    const now = Date.UTC(2026, 9, 23, 2); // 10-23 10:00 Taipei
    const row = (end: number) => ({ stripe_subscription_id: "pass_x", status: "active", period_end: end, pass_notice_at: null });
    expect(passNoticeDue(row(Date.UTC(2026, 9, 26, 5)), now)).toBe(true);   // 10-26 13:00 Taipei
    expect(passNoticeDue(row(Date.UTC(2026, 9, 25, 15, 30)), now)).toBe(false); // 10-25 23:30 Taipei
    expect(passNoticeDue(row(Date.UTC(2026, 9, 27, 3)), now)).toBe(false);
    expect(passNoticeDue({ ...row(Date.UTC(2026, 9, 26, 5)), pass_notice_at: now }, now)).toBe(false);
    expect(passNoticeDue({ ...row(Date.UTC(2026, 9, 26, 5)), stripe_subscription_id: "sub_x" }, now)).toBe(false);
  });

  it("the letter: three buttons of one style, the reader's own prices, no auto-charge said plainly", () => {
    const m = buildPassNoticeEmail({ locale: "zh-hant", passId: "pass_abc", end: Date.UTC(2026, 9, 26, 5), currency: "TWD", asked: 3, revisitDates: ["10月29日"] });
    expect(m.subject).toContain("到期");
    const anchors = m.html.match(/<a href="[^"]*api\/pass\/notice[^"]*" style="([^"]*)">/g)!;
    expect(anchors).toHaveLength(3);
    expect(new Set(anchors.map((a) => a.replace(/href="[^"]*"/, ""))).size).toBe(1); // same size, same weight
    expect(m.text).toContain("NT$349");
    expect(m.text).toContain("NT$269");
    expect(m.text).toContain("不用了");
    expect(m.text).toContain("不會自動扣款");
    expect(m.text).toContain("10月29日");
    expect(m.text + m.subject).not.toMatch(/\{\w+\}/);
    const quiet = buildPassNoticeEmail({ locale: "en", passId: "pass_abc", end: Date.UTC(2026, 9, 26, 5), currency: "USD", asked: 0, revisitDates: [] });
    expect(quiet.text).not.toContain("come back on");
  });

  it("each button's link is signed for that button only", () => {
    const t = passNoticeToken("pass_abc", "pass");
    expect(verifyPassNoticeToken("pass_abc", "pass", t)).toBe(true);
    expect(verifyPassNoticeToken("pass_abc", "month", t)).toBe(false);
    expect(verifyPassNoticeToken("pass_other", "pass", t)).toBe(false);
  });

  it("not for someone whose membership carries on by itself", () => {
    const cid = upsertCustomer("pn-carry@example.com", "zh-hant");
    pass(cid, "pass_pn_carry", Date.now() + 3 * DAY);
    expect(carriesOn(cid, "pass_pn_carry")).toBe(false);
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_x", stripeSubscriptionId: "sub_pn_carry", status: "active", plan: "month", periodStart: Date.now(), periodEnd: Date.now() + 30 * DAY, cancelAtPeriodEnd: false });
    expect(carriesOn(cid, "pass_pn_carry")).toBe(true);
  });

  it("one more month waits for this one to end, then takes over with no gap; entitlement stays on the running one", async () => {
    const cid = upsertCustomer("pn-stack@example.com", "zh-hant");
    const end = Date.now() + 3 * DAY;
    pass(cid, "pass_pn_stack_old", end);
    const s: CheckoutSession = {
      id: "cs_test_pn_stack", url: null, mode: "payment", payment_status: "paid", status: "complete",
      metadata: { kind: "pass", email: "pn-stack@example.com", locale: "zh-hant", cust: String(cid), after: "pass_pn_stack_old" },
      customer_details: { email: "pn-stack@example.com" }, amount_total: 34900, currency: "twd", customer: null,
    };
    const r = await fulfilPass(s);
    expect(r.ok).toBe(true);
    const next = subscriptionByStripeId(passIdFor(s.id))!;
    expect(next.status).toBe("scheduled");
    expect(next.period_start).toBe(end);
    expect(next.period_end).toBe(end + PASS_DAYS * DAY);
    expect(carriesOn(cid, "pass_pn_stack_old")).toBe(true); // a second tap buys nothing more
    expect((await entitlementFor(cid)).periodEnd).toBe(end);
    expireLocalSubscriptions(end + 60_000);
    expect(subscriptionByStripeId(passIdFor(s.id))!.status).toBe("active");
    expect(subscriptionByStripeId("pass_pn_stack_old")!.status).toBe("canceled");
  });

  it("the run writes once per pass and skips one that carries on", async () => {
    const now = Date.UTC(2026, 9, 23, 3); // 11:00 Taipei
    const cid = upsertCustomer("pn-run@example.com", "zh-hant");
    pass(cid, "pass_pn_run", Date.UTC(2026, 9, 26, 5));
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_y", stripeSubscriptionId: "sub_pn_run", status: "active", plan: "month", periodStart: now, periodEnd: now + 30 * DAY, cancelAtPeriodEnd: false });
    const r = await runPassNotices(now);
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    expect(subscriptionByStripeId("pass_pn_run")!.pass_notice_at).toBe(now);
    const again = await runPassNotices(now + 3_600_000);
    expect((db().prepare("SELECT COUNT(*) AS n FROM emails WHERE session_id = 'pass-notice:pass_pn_run'").get() as { n: number }).n).toBe(1);
    expect(again.sent).toBe(0);
    // at night nothing goes out
    expect(await runPassNotices(Date.UTC(2026, 9, 23, 15))).toEqual({ sent: 0, failed: 0, skipped: 0 });
  });
});
