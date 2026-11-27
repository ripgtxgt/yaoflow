import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";

/**
 * 10-23 进度表 101 (Neil: 「目前是不是还有一次深断的价格在啊」): once the 通卡 is open to everyone, no single light or full
 * reading is sold. /api/checkout answers a tier without a pass with 410 {error: "retired", pass: true} (the cast page then
 * shows the pass panel); a pass on the same cast still opens Stripe; while the 通卡 is only in preview, a reader who does
 * not see it still buys the old way. Stripe is stubbed: what matters is what we ask it for.
 */
const captured: { metadata: Record<string, string> }[] = [];
vi.mock("../src/lib/stripe", async (orig) => {
  const real = await orig<typeof import("../src/lib/stripe")>();
  return {
    ...real,
    createCheckoutSession: vi.fn(async (i: { metadata: Record<string, string> }) => {
      captured.push({ metadata: i.metadata });
      return { id: `cs_test_retired_${captured.length}`, url: "https://checkout.stripe.test/x", payment_status: "unpaid", status: "open", metadata: {} };
    }),
  };
});

const { POST: checkout } = await import("../src/app/api/checkout/route");
const { setFeature } = await import("../src/lib/features");
const { db } = await import("../src/lib/db");

const VALUES: LineValue[] = [7, 8, 9, 8, 7, 8];
let ip = 60;
const post = (body: Record<string, unknown>) => checkout(new NextRequest("http://localhost/api/checkout", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${++ip}`, "cf-ipcountry": "TW", "accept-language": "zh-TW,zh;q=0.9" },
  body: JSON.stringify(body),
}));
const cast = (over: Record<string, unknown> = {}) => ({ question: "這次面試能過嗎", values: VALUES, castAtMs: Date.now(), tzOffsetMinutes: 480, timeZone: "Asia/Taipei", locale: "zh-hant", currency: "TWD", ...over });

let prev: Record<string, string | undefined> = {};
beforeAll(() => {
  prev = { PAYWALL: process.env.PAYWALL, STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY, STRIPE_GEO_ROUTING: process.env.STRIPE_GEO_ROUTING };
  process.env.PAYWALL = "on"; process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy"; process.env.STRIPE_GEO_ROUTING = "on";
});
afterAll(() => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("通卡開放後不再單賣", () => {
  it("a full or light reading without a pass is refused — 410, and the page is told to show the pass", async () => {
    setFeature("tongka", "on");
    const before = captured.length;
    for (const tier of ["deep", "one"] as const) {
      const res = await post({ tier, ...cast() });
      expect(res.status, tier).toBe(410);
      expect(await res.json(), tier).toEqual({ error: "retired", pass: true });
    }
    expect(captured.length).toBe(before); // Stripe never asked
    const n = (db().prepare("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'single_retired'").get() as { n: number }).n;
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it("the same cast with a 1-day pass goes to Stripe as the pass, at the first-pass price", async () => {
    setFeature("tongka", "on");
    const res = await post({ tier: "deep", pass: 1, ...cast() }); // no address, no cookie: a first pass
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pass: 1, firstPass: true });
    expect(captured.at(-1)!.metadata).toMatchObject({ kind: "pass", days: "1", first_pass: "1" });
  });

  it("while the 通卡 is only in preview, a reader who does not see it still buys the old way", async () => {
    setFeature("tongka", "preview");
    const res = await post({ tier: "deep", ...cast() });
    expect(res.status).toBe(200);
    expect(captured.at(-1)!.metadata.kind).not.toBe("pass");
    setFeature("tongka", "on");
  });
});
