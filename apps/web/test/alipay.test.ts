import { afterEach, describe, expect, it, vi } from "vitest";
import { THREAD_T } from "../src/lib/dict/thread";
import { LOCALES } from "../src/lib/locales";

/**
 * 10-04 支付宝 (Neil: 「我在 stripe 里面看到可以用支付宝付款了，为什么我刚才试了，却没有显示支付宝呢」): the account takes
 * Alipay (CNY / USD), but Stripe, left to pick the methods itself, showed a mainland buyer's CNY session card + Link
 * only. The mainland route now names alipay + card on every one-time checkout; subscriptions (which Alipay cannot
 * renew) and TW / HK stay as they were.
 */
afterEach(() => vi.unstubAllGlobals());

function capture(): { bodies: URLSearchParams[] } {
  const out = { bodies: [] as URLSearchParams[] };
  process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: { body?: string }) => {
    out.bodies.push(new URLSearchParams(init?.body ?? ""));
    return new Response(JSON.stringify({ id: "cs_x", url: "https://x" }), { status: 200 });
  }));
  return out;
}
const types = (b: URLSearchParams | undefined) => [...(b?.entries() ?? [])].filter(([k]) => /^payment_method_types\[\d+\]$/.test(k)).map(([, v]) => v);

describe("支付宝：大陆路线明确指定付款方式", () => {
  it("alipayPossible: CNY and USD only — the account's Alipay refuses TWD / HKD", async () => {
    const { alipayPossible, MAINLAND_METHODS } = await import("../src/lib/stripe");
    expect(alipayPossible("cny")).toBe(true);
    expect(alipayPossible("USD")).toBe(true);
    expect(alipayPossible("twd")).toBe(false);
    expect(alipayPossible("hkd")).toBe(false);
    expect([...MAINLAND_METHODS]).toEqual(["alipay", "card"]);
  });

  it("a one-time session names the methods when asked, and leaves them to Stripe's config when not", async () => {
    const c = capture();
    const { createCheckoutSession, createPassSession } = await import("../src/lib/stripe");
    await createCheckoutSession({ amountCents: 990, currency: "cny", productName: "x", successUrl: "https://s", cancelUrl: "https://c", metadata: {}, managedPayments: false, locale: "zh", paymentMethodTypes: ["alipay", "card"] });
    expect(types(c.bodies[0])).toEqual(["alipay", "card"]);
    // the hint above the pay button points to Alipay first — and (10-09) says what to do when Alipay itself refuses
    expect(c.bodies[0]?.get("custom_text[submit][message]")).toContain("支付宝");
    expect(c.bodies[0]?.get("custom_text[submit][message]")).toContain("支付宝显示付款失败");
    expect(c.bodies[0]?.get("custom_text[submit][message]")!.length).toBeLessThan(1200); // Stripe's limit
    await createCheckoutSession({ amountCents: 7500, currency: "twd", productName: "x", successUrl: "https://s", cancelUrl: "https://c", metadata: {}, managedPayments: false, locale: "zh-hant" });
    expect(types(c.bodies[1])).toEqual([]);
    expect(c.bodies[1]?.get("custom_text[submit][message]")).not.toContain("支付寶");
    // the single month / a pack: the same
    await createPassSession({ amountMinor: 3800, currency: "cny", productName: "x", locale: "zh", email: "a@b.c", successUrl: "https://s", cancelUrl: "https://c", metadata: {}, managedPayments: false, paymentMethodTypes: ["alipay", "card"] });
    expect(types(c.bodies[2])).toEqual(["alipay", "card"]);
    expect(c.bodies[2]?.get("mode")).toBe("payment");
  });

  it("the mainland note now says Alipay is accepted, in every language, and keeps the old wording for other currencies", () => {
    for (const l of LOCALES) {
      const t = (THREAD_T as unknown as Record<string, Record<string, string>>)[l]!;
      for (const k of ["cnPayTitleAli", "cnPayBodyAli", "cnPayGoAli", "cnPayTitle", "cnPayBody", "cnPayGo"]) expect(t[k]!.length, `${l}.${k}`).toBeGreaterThan(2);
      expect(t.cnPayBodyAli!, `${l}.cnPayBodyAli`).toMatch(/Alipay|支付宝|支付寶/);
    }
  });

  it("10-09: back from a checkout where Alipay refused, every language says nothing was charged and what to try", () => {
    const charged: Record<string, RegExp> = { zh: /不会扣款/, "zh-hant": /不會扣款/, en: /nothing was charged/, ja: /請求はされていません/, ko: /청구되지 않았어요/, fr: /rien n'a été débité/, de: /nichts abgebucht/, es: /no se cobró nada/, pt: /nada foi cobrado/ };
    for (const l of LOCALES) {
      const line = (THREAD_T as unknown as Record<string, Record<string, string>>)[l]!.payBackAlipay!;
      expect(line, l).toMatch(/Alipay|支付宝|支付寶/);
      expect(line, l).toMatch(charged[l]!);
      expect(line, l).toMatch(/Visa/);
      expect(line, l).not.toMatch(/UnionPay|银联|銀聯|은련/); // mainland UnionPay cards are the ones the risk check stops
    }
  });
});
