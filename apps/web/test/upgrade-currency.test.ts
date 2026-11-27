import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";

/**
 * 10-02 (转化率): an upgrade from a FREE light reading (no currency of its own) used to fall to USD — readers in Taipei
 * met US$2.99 on Stripe and 17% paid it. The page's own currency now travels with the tap; without it, the same guess
 * the cast page makes. Stripe is stubbed: what matters is what we would have asked it to charge.
 */
const captured: { currency: string; amountCents: number }[] = [];
vi.mock("../src/lib/stripe", async (orig) => {
  const real = await orig<typeof import("../src/lib/stripe")>();
  return {
    ...real,
    createCheckoutSession: vi.fn(async (i: { currency: string; amountCents: number }) => {
      captured.push({ currency: i.currency, amountCents: i.amountCents });
      return { id: `cs_test_upg_${captured.length}`, url: "https://checkout.stripe.test/x", payment_status: "unpaid", status: "open", metadata: {} };
    }),
  };
});

const { POST: checkout } = await import("../src/app/api/checkout/route");
const { abArms } = await import("../src/lib/ab");

const VALUES: LineValue[] = [7, 8, 9, 8, 7, 8];
let ip = 10;
const post = (body: Record<string, unknown>, headers: Record<string, string> = {}) => checkout(new NextRequest("http://localhost/api/checkout", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${++ip}`, ...headers },
  body: JSON.stringify(body),
}));

/** the f1 arm's free first light reading — a session with no currency of its own */
async function freeLight(email: string): Promise<string> {
  const res = await post({ tier: "one", freeFirst: true, email, question: "這份工作我該不該換", values: VALUES, castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh-hant", currency: "TWD" });
  expect(res.status).toBe(200);
  const url = ((await res.json()) as { url: string }).url;
  return new URL(url).searchParams.get("sid")!;
}

describe("升级深断的币种", () => {
  let prev: string | undefined;
  beforeAll(() => { prev = process.env.PAYWALL; process.env.PAYWALL = "on"; });
  afterAll(() => { process.env.PAYWALL = prev; });

  it("charges what the page sends — NT$75 for a first deep reading in Taipei, not US$2.99", async () => {
    const sid = await freeLight("upg-a@example.com");
    const res = await post({ from: sid, tier: "deep", locale: "zh-hant", timeZone: "Asia/Taipei", currency: "TWD", curSrc: "tz" });
    expect(res.status).toBe(200);
    expect(captured.at(-1)).toEqual({ currency: "twd", amountCents: 7500 });
  });

  it("without a currency from the page, guesses from the device clock the panel sends (as the cast page does)", async () => {
    const sid = await freeLight("upg-b@example.com");
    const res = await post({ from: sid, tier: "deep", locale: "zh-hant", timeZone: "Asia/Hong_Kong" });
    expect(res.status).toBe(200);
    expect(captured.at(-1)).toEqual({ currency: "hkd", amountCents: 1800 });
  });
});

describe("对照测试结束（10-02）", () => {
  it("every browser gets two prices and the one-line preview; the tag says p0v0", () => {
    const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
    const had = { window: g.window, localStorage: g.localStorage };
    g.window = globalThis;
    g.localStorage = { getItem: () => "15", setItem: () => {} }; // 15 = all four old bits set
    try {
      const a = abArms()!;
      expect(a.onePrice).toBe(false);
      expect(a.verdict).toBe(false);
      expect(a.tag).toBe("f1o0p0v0h0x1y0"); // 10-02: x and y joined the tag; 10-05: x ended (x1); 10-08: f/o/h/y ended (f1 o0 h0 y0)
    } finally {
      g.window = had.window;
      g.localStorage = had.localStorage;
    }
  });
});
