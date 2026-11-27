import { describe, expect, it } from "vitest";
import { consumeLoginToken, createLoginToken, customersForLaunch, recordEmail, setMarketingConsent, upsertCustomer } from "../src/lib/db";
import { buildLaunchEmail } from "../src/lib/email";
import { unsubToken, unsubUrl, unsubValid } from "../src/lib/unsub";
import { LOCALES } from "../src/lib/locales";

/**
 * §14 ③ (09-10): launch mail goes only to people who ticked the box, once,
 * and every copy carries a one-click unsubscribe that needs no login.
 */
describe("launch mail and consent", () => {
  it("the sign-in box is applied only when the link is redeemed", () => {
    createLoginToken({ email: "Box@Example.com", tokenHash: "h".repeat(64), locale: "ja", nextPath: null, ttlMs: 60_000, notify: true });
    const t = consumeLoginToken("h".repeat(64));
    expect(t?.notify).toBe(true);
    expect(t?.email).toBe("box@example.com");
    createLoginToken({ email: "plain@example.com", tokenHash: "p".repeat(64), locale: "en", nextPath: null, ttlMs: 60_000 });
    expect(consumeLoginToken("p".repeat(64))?.notify).toBe(false);
  });

  it("lists opted-in customers who have not had this mail, and forgets them once it was sent", () => {
    const a = upsertCustomer("yes1@example.com", "zh");
    upsertCustomer("no@example.com", "en");
    setMarketingConsent("yes1@example.com", true);
    const before = customersForLaunch("launch-1", 100).map((c) => c.id);
    expect(before).toContain(a);
    expect(customersForLaunch("launch-1", 100).map((c) => c.email)).not.toContain("no@example.com");
    recordEmail(`launch:${a}`, "launch-1", "yes1@example.com", "sent", "id");
    expect(customersForLaunch("launch-1", 100).map((c) => c.id)).not.toContain(a);
    // a failed send does not count as delivered
    const b = upsertCustomer("yes2@example.com", "fr");
    setMarketingConsent("yes2@example.com", true);
    recordEmail(`launch:${b}`, "launch-1", "yes2@example.com", "failed", "boom");
    expect(customersForLaunch("launch-1", 100).map((c) => c.id)).toContain(b);
    // unsubscribing removes them
    setMarketingConsent("yes2@example.com", false);
    expect(customersForLaunch("launch-1", 100).map((c) => c.id)).not.toContain(b);
  });

  it("signs the unsubscribe link so it cannot be forged for someone else", () => {
    process.env.UNSUB_SECRET = "test-secret";
    const url = unsubUrl("https://yaoflow.com", "Some.One@Example.com", "de");
    expect(url).toContain("/api/unsub?e=some.one%40example.com&t=");
    expect(unsubValid("some.one@example.com", unsubToken("some.one@example.com"))).toBe(true);
    expect(unsubValid("other@example.com", unsubToken("some.one@example.com"))).toBe(false);
    expect(unsubValid("some.one@example.com", "0".repeat(32))).toBe(false);
  });

  it("renders the launch mail in every locale with the price and the links in place", () => {
    for (const l of LOCALES) {
      const m = buildLaunchEmail({ locale: l, priceLabel: "US$2.99", accountUrl: "https://yaoflow.com/x/account", castUrl: "https://yaoflow.com/x/cast", unsubUrl: "https://yaoflow.com/api/unsub?e=a&t=b" });
      expect(m.html).toContain("US$2.99");
      expect(m.html).not.toMatch(/\{price\}/);
      expect(m.html).toContain("/api/unsub?e=a&amp;t=b");
      expect(m.html).toContain("background:#f4f2ec;color:#14151c");
    }
    expect(buildLaunchEmail({ locale: "zh-hant", priceLabel: "NT$99", accountUrl: "a", castUrl: "c", unsubUrl: "u" }).subject).toContain("現在");
    expect(buildLaunchEmail({ locale: "ja", priceLabel: "¥480", accountUrl: "a", castUrl: "c", unsubUrl: "u" }).subject).toContain("購入");
  });
});

/** 09-21, before the first real send: price in the reader's own currency, and only people who had a deep reading are told so. */
describe("launch mail #1 per reader (09-21)", () => {
  it("carries each reader's latest currency and whether they had a deep reading; says the right sentence", async () => {
    const { upsertCustomer, setMarketingConsent, recordOrder, customersForLaunch: forLaunch, markOwnOrdersAsTest } = await import("../src/lib/db");
    const tw = upsertCustomer("tw-launch-0921@example.org", "zh-hant");
    const uk = upsertCustomer("uk-launch-0921@example.org", "en");
    const own = upsertCustomer("me-launch-0921@linedo.io", "zh");
    for (const e of ["tw-launch-0921@example.org", "uk-launch-0921@example.org", "me-launch-0921@linedo.io"]) setMarketingConsent(e, true);
    recordOrder({ sessionId: "gf_twlaunch0921", customerId: tw, castId: null, tier: "deep", amountCents: 0, currency: "TWD", email: "tw-launch-0921@example.org", status: "gift", via: null, firstDeep: true, paymentIntent: null });
    recordOrder({ sessionId: "gf_uklaunch0921", customerId: uk, castId: null, tier: "one", amountCents: 0, currency: "GBP", email: "uk-launch-0921@example.org", status: "gift", via: null, firstDeep: false, paymentIntent: null });
    markOwnOrdersAsTest(["*@linedo.io"]);
    const rows = forLaunch("launch-test-0921", 1000);
    expect(rows.find((r) => r.id === tw)).toMatchObject({ currency: "TWD", had_deep: 1 });
    expect(rows.find((r) => r.id === uk)).toMatchObject({ currency: "GBP", had_deep: 0 });
    expect(rows.find((r) => r.id === own)).toBeUndefined();
    // already paid → not told that paying is now possible
    recordOrder({ sessionId: "cs_live_uklaunch0921", customerId: uk, castId: null, tier: "deep", amountCents: 229, currency: "GBP", email: "uk-launch-0921@example.org", status: "paid", via: null, firstDeep: true, paymentIntent: "pi_k" });
    expect(forLaunch("launch-test-0921", 1000).find((r) => r.id === uk)).toBeUndefined();
    const yes = buildLaunchEmail({ locale: "zh-hant", priceLabel: "NT$69", accountUrl: "a", castUrl: "c", unsubUrl: "u", hadDeep: true });
    const no = buildLaunchEmail({ locale: "zh-hant", priceLabel: "NT$69", accountUrl: "a", castUrl: "c", unsubUrl: "u", hadDeep: false });
    // 10-17: both say the first full reading is at the early price, without saying why
    expect(yes.text).toContain("你的第一份深斷按 NT$69");
    expect(no.text).toContain("你的第一份深斷按 NT$69");
    expect(no.text).not.toContain("已經領過");
    expect(no.text).toContain("NT$69");
    expect(buildLaunchEmail({ locale: "en", priceLabel: "£2.29", accountUrl: "a", castUrl: "c", unsubUrl: "u", hadDeep: false }).text).toContain("£2.29");
  });
});
