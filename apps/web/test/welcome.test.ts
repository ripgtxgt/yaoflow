import { describe, expect, it } from "vitest";
import { buildWelcomeEmail } from "../src/lib/email";
import { WELCOME_EMAIL_T } from "../src/lib/dict/email";
import { isNewlyLive } from "../src/lib/welcome";
import { claimWelcome, upsertCustomer, upsertSubscription, type SubscriptionRow } from "../src/lib/db";
import { LOCALES } from "../src/lib/locales";

describe("会员欢迎信（09-25）", () => {
  it("nine languages, every figure from the caller, placeholders all filled", () => {
    for (const l of LOCALES) {
      expect(WELCOME_EMAIL_T[l], l).toBeTruthy();
      const m = buildWelcomeEmail({ locale: l, plan: "year", renews: "2027年9月25日", price: "US$79", deepPerMonth: 10, followups: 10, giftsPerMonth: 5, giftCap: 15, castUrl: "https://yaoflow.com/x/cast", manageUrl: "https://yaoflow.com/x/account#membership" });
      expect(m.html, l).not.toMatch(/\{(n|N|cap)\}/);
      expect(m.text, l).not.toMatch(/\{(n|N|cap)\}/);
      expect(m.html).toContain("US$79");
      expect(m.html).toContain("2027年9月25日");
      expect(m.html).toContain("/x/cast");
      expect(m.html).toContain("#membership");
      expect(m.text).toMatch(/10/); // deep readings / follow-ups
      expect(m.text).toMatch(/15/); // gift cap
      expect(m.html).toContain(WELCOME_EMAIL_T[l]!.planYear);
    }
    const zh = buildWelcomeEmail({ locale: "zh", plan: "month", renews: "2026年10月25日", price: "CN¥38", deepPerMonth: 10, followups: 10, giftsPerMonth: 5, giftCap: 15, castUrl: "c", manageUrl: "m" });
    expect(zh.subject).toBe("欢迎成为 YaoFlow 会员");
    expect(zh.html).toContain("月付会员");
    expect(zh.html).toContain("每月 10 次深断");
    expect(zh.html).toContain("最多存 15 张");
  });

  it("goes out once per subscription: only when it turns live, and only to the first path that claims it", () => {
    const mk = (status: string): SubscriptionRow => ({ id: 1, customer_id: 1, stripe_customer_id: null, stripe_subscription_id: "sub_w", status, plan: "month", period_start: 0, period_end: 0, cancel_at_period_end: 0, created_at: 0, updated_at: 0, synced_at: 0, currency: "usd", amount_minor: 999 } as SubscriptionRow);
    expect(isNewlyLive(null, mk("active"))).toBe(true);
    expect(isNewlyLive(mk("incomplete"), mk("active"))).toBe(true);
    expect(isNewlyLive(mk("active"), mk("active"))).toBe(false);   // a renewal / re-sync
    expect(isNewlyLive(null, mk("incomplete"))).toBe(false);
    expect(isNewlyLive(mk("active"), mk("canceled"))).toBe(false);
    const cid = upsertCustomer("welcome-test@example.com", "zh");
    const row = upsertSubscription({ customerId: cid, stripeCustomerId: "cus_w", stripeSubscriptionId: "sub_welcome_1", status: "active", plan: "month", periodStart: Date.now(), periodEnd: Date.now() + 30 * 86_400_000, cancelAtPeriodEnd: false });
    expect(claimWelcome(row.id)).toBe(true);
    expect(claimWelcome(row.id)).toBe(false);
  });
});

describe("收据（09-25）", () => {
  it("the delivery mail carries the amount and Stripe's receipt link in every language; gifts carry none", async () => {
    const { buildReadingEmail } = await import("../src/lib/email");
    for (const l of LOCALES) {
      const m = buildReadingEmail({ locale: l, tier: "deep", question: "q", values: [7, 8, 7, 8, 7, 8], hexName: "H", changedName: null, headline: "h", url: "https://yaoflow.com/x/reading?sid=1", receipt: { amount: "NT$249", url: "https://pay.stripe.com/receipts/abc" } });
      expect(m.html, l).toContain("NT$249");
      expect(m.html, l).toContain("https://pay.stripe.com/receipts/abc");
      expect(m.text, l).toContain("https://pay.stripe.com/receipts/abc");
      expect(m.html, l).not.toContain("{amount}");
    }
    const g = buildReadingEmail({ locale: "zh", tier: "deep", question: "q", values: [7, 8, 7, 8, 7, 8], hexName: "H", changedName: null, headline: "h", url: "u", receipt: null });
    expect(g.html).not.toContain("收据");
  });
  it("paymentsForCustomer lists money orders only, with the receipt once it is known", async () => {
    const { paymentsForCustomer, recordOrder, saveReceiptUrl, upsertCustomer } = await import("../src/lib/db");
    const cid = upsertCustomer("pay-list@example.com", "zh");
    recordOrder({ sessionId: "cs_pl_1", customerId: cid, castId: null, tier: "deep", amountCents: 24900, currency: "twd", email: "pay-list@example.com", status: "paid", paymentIntent: "pi_pl_1" });
    recordOrder({ sessionId: "gf_pl_2", customerId: cid, castId: null, tier: "deep", amountCents: 0, currency: "twd", email: "pay-list@example.com", status: "gift" });
    recordOrder({ sessionId: "cs_pl_3", customerId: null, castId: null, tier: "one", amountCents: 6900, currency: "twd", email: "Pay-List@example.com", status: "paid" });
    saveReceiptUrl("cs_pl_1", "https://pay.stripe.com/receipts/r1");
    saveReceiptUrl("cs_pl_1", "https://pay.stripe.com/receipts/other"); // first one wins
    const rows = paymentsForCustomer(cid, "pay-list@example.com");
    expect(rows.map((r) => r.session_id).sort()).toEqual(["cs_pl_1", "cs_pl_3"]);
    expect(rows.find((r) => r.session_id === "cs_pl_1")?.receipt_url).toBe("https://pay.stripe.com/receipts/r1");
  });
});
