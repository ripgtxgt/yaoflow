import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";

/**
 * 10-05 (Stripe Workbench review): a mainland reader behind a Polish VPN exit — Simplified page, device clock
 * Europe/Warsaw, paying in yuan — was sent to the Managed Payments page, which refused "China is not currently
 * supported"; they only got through on the second try via the escape hatch. Yuan is never sold through Managed
 * Payments, so the currency alone now takes the mainland route: Managed Payments off, Alipay + card named.
 */
const captured: { currency: string; managedPayments?: boolean; paymentMethodTypes?: string[]; metadata: Record<string, string> }[] = [];
vi.mock("../src/lib/stripe", async (orig) => {
  const real = await orig<typeof import("../src/lib/stripe")>();
  return {
    ...real,
    createCheckoutSession: vi.fn(async (i: { currency: string; managedPayments?: boolean; paymentMethodTypes?: string[]; metadata: Record<string, string> }) => {
      captured.push({ currency: i.currency, managedPayments: i.managedPayments, paymentMethodTypes: i.paymentMethodTypes, metadata: i.metadata });
      return { id: `cs_test_cny_${captured.length}`, url: "https://checkout.stripe.test/x", payment_status: "unpaid", status: "open", metadata: {} };
    }),
  };
});

const { POST: checkout } = await import("../src/app/api/checkout/route");

const VALUES: LineValue[] = [7, 8, 9, 8, 7, 8];
let ip = 40;
const post = (body: Record<string, unknown>, headers: Record<string, string> = {}) => checkout(new NextRequest("http://localhost/api/checkout", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${++ip}`, "cf-ipcountry": "PL", "accept-language": "zh-CN,zh;q=0.9", ...headers },
  body: JSON.stringify(body),
}));

let prev: Record<string, string | undefined> = {};
beforeAll(() => {
  prev = { PAYWALL: process.env.PAYWALL, STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY, STRIPE_GEO_ROUTING: process.env.STRIPE_GEO_ROUTING };
  process.env.PAYWALL = "on"; process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy"; process.env.STRIPE_GEO_ROUTING = "on";
});
afterAll(() => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("人民币结账不走 Managed Payments", () => {
  it("a yuan buyer behind a European exit with a European clock still gets the mainland route", async () => {
    const res = await post({ tier: "deep", question: "这次面试能过吗", values: VALUES, castAtMs: Date.now(), tzOffsetMinutes: 120, timeZone: "Europe/Warsaw", locale: "zh", currency: "CNY" });
    expect(res.status).toBe(200);
    const c = captured.at(-1)!;
    expect(c.currency).toBe("cny");
    expect(c.managedPayments).toBe(false);
    expect(c.paymentMethodTypes).toEqual(["alipay", "card"]);
    expect(c.metadata.mp_reason).toBe("cny");
    expect(c.metadata.methods).toBe("alipay+card");
    // 10-09: the page is told the session offers Alipay, so a reader sent back unpaid hears what to do when Alipay refused
    expect(await res.json()).toMatchObject({ alipay: true });
  });

  it("the same buyer paying in another currency is routed as before (Managed Payments on, Stripe picks the methods)", async () => {
    const res = await post({ tier: "deep", question: "这次面试能过吗", values: VALUES, castAtMs: Date.now(), tzOffsetMinutes: 120, timeZone: "Europe/Warsaw", locale: "zh", currency: "EUR" });
    expect(res.status).toBe(200);
    const c = captured.at(-1)!;
    expect(c.currency).toBe("eur");
    expect(c.managedPayments).not.toBe(false);
    expect(c.paymentMethodTypes).toBeUndefined();
    expect(c.metadata.mp_reason).toBe("default");
    expect(await res.json()).not.toHaveProperty("alipay");
  });
});
