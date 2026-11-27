import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 09-23 (Neil chose tax-inclusive pricing): the number on our page is the
 * number on Stripe's page. Before, NT$69 became NT$72.45 at payment.
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

describe("含税定价", () => {
  it("单次购买：税含在标价里", async () => {
    const c = capture();
    const { createCheckoutSession } = await import("../src/lib/stripe");
    await createCheckoutSession({
      amountCents: 6900, currency: "twd", productName: "x", successUrl: "https://s", cancelUrl: "https://c", metadata: {},
    });
    expect(c.bodies[0]?.get("line_items[0][price_data][tax_behavior]")).toBe("inclusive");
    expect(c.bodies[0]?.get("line_items[0][price_data][unit_amount]")).toBe("6900");
  });
  it("会员：税含在标价里", async () => {
    const c = capture();
    const { createSubscriptionSession } = await import("../src/lib/stripe");
    await createSubscriptionSession({
      productName: "x", amountCents: 24900, currency: "twd", interval: "month", customerEmail: "a@b.c",
      successUrl: "https://s", cancelUrl: "https://c", metadata: {},
    });
    expect(c.bodies[0]?.get("line_items[0][price_data][tax_behavior]")).toBe("inclusive");
  });
});
