import { describe, expect, it } from "vitest";
import { recordOrder, upsertCustomer, upsertSubscription, db } from "../src/lib/db";
import { upgradeCredit } from "../src/lib/upgrade-credit";
import { buildPerksEmail, buildRecapEmail } from "../src/lib/email";
import { LOCALES } from "../src/lib/locales";
import { priceMinor, firstMonthMinor } from "../src/lib/money";
process.env.UPGRADE_CREDIT = "on"; // 10-24: the credit is off by default; these tests are about how it works when on

const buy = (sid: string, cid: number, email: string, at: number, amount = 299) => {
  recordOrder({ sessionId: sid, customerId: cid, castId: null, tier: "deep", amountCents: amount, currency: "USD", email, status: "paid" });
  db().prepare("UPDATE orders SET created_at = ?, entitlement_kind = 'purchase', payment_state = 'paid' WHERE session_id = ?").run(at, sid);
};

describe("会员体系 09-26", () => {
  it("credits the latest single purchase toward the first month after two in 30 days, once", () => {
    const now = Date.now();
    const cid = upsertCustomer("ms-credit@example.com", "zh");
    buy("cs_ms_1", cid, "ms-credit@example.com", now - 5 * 86_400_000);
    expect(upgradeCredit(cid, "USD", now)).toBeNull(); // one purchase is not a pattern
    buy("cs_ms_2", cid, "ms-credit@example.com", now - 86_400_000, 999);
    const c = upgradeCredit(cid, "USD", now)!;
    expect(c.sessionId).toBe("cs_ms_2");
    expect(c.amountMinor).toBe(Math.min(999, priceMinor("USD", "month")));
    expect(c.count).toBe(2);
    // 10-10 首月同价: never a member — the first invoice is the one-off month's price, the credit comes off that
    expect(c.firstInvoiceMinor).toBe(firstMonthMinor("USD"));
    expect(upgradeCredit(cid, "TWD", now)).toBeNull(); // other currency: no credit
    // subscribing closes it
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_ms", stripeSubscriptionId: "sub_ms_1", status: "canceled", plan: "month", periodStart: now, periodEnd: now + 86_400_000, cancelAtPeriodEnd: false, currency: "usd", amountMinor: 999 });
    expect(upgradeCredit(cid, "USD", now + 1000)).toBeNull();
  });

  it("the review letter and the perks letter render in all nine languages with every figure filled", () => {
    for (const l of LOCALES) {
      const r = buildRecapEmail({ locale: l, date: "2026年10月21日", paid: "US$9.99", days: 6, value: "US$42.87", deep: 4, tarot: 2, qian: 1, report: 1, qa: 9, letters: 20,
        matters: [{ q: "这份合约能签下来吗", status: "next", date: "2026年10月30日" }, { q: "他会联系我吗", status: "answered" }],
        castUrl: "https://yaoflow.com/x/cast", manageUrl: "https://yaoflow.com/x/account#membership", year: { url: "https://yaoflow.com/api/sub/retain?a=year", price: "US$79", pct: 34 } });
      expect(r.html, l).not.toMatch(/\{\w+\}/);
      expect(r.subject, l).not.toMatch(/\{\w+\}/);
      expect(r.html).toContain("US$42.87");
      expect(r.html).toContain("a=year");
      const p = buildPerksEmail({ locale: l, deep: 10, follow: 10, gifts: 5, cap: 15, accountUrl: "https://yaoflow.com/x/account", manageUrl: "https://yaoflow.com/x/account#membership" });
      expect(p.html, l).not.toMatch(/\{\w+\}/);
      expect(p.text).toContain("10");
      expect(p.text).toContain("15");
    }
  });
});
