import { afterEach, describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)

import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";
import { createGift, customerHasPaidDeep, giftByToken, giftsByEmailSince, recordOrder, salesByCurrency, upsertCustomer } from "../src/lib/db";
import { verifyPaidSession } from "../src/lib/paid-store";
import { giftEmailRequired, giftMode, paywallMode, paywallOn } from "../src/lib/paywall";
import { computeStats } from "../src/lib/analytics-server";
import { POST as checkout } from "../src/app/api/checkout/route";

const VALUES: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 9, 4, 2);

describe("假门赠送 — the painted door (PAYWALL=gift)", () => {
  it("is a third position of the switch: prices on, free generation closed, no checkout", () => {
    const prev = process.env.PAYWALL;
    process.env.PAYWALL = "gift";
    expect(paywallMode()).toBe("gift");
    expect(paywallOn()).toBe(true);
    expect(giftMode()).toBe(true);
    process.env.PAYWALL = "on";
    expect(giftMode()).toBe(false);
    expect(paywallOn()).toBe(true);
    process.env.PAYWALL = "off";
    expect(paywallOn()).toBe(false);
    process.env.PAYWALL = prev;
  });

  it("a gf_ session looks like a paid one downstream, with the price the button showed and nothing charged", async () => {
    createGift({
      token: "a".repeat(36), tier: "deep", locale: "de", currency: "EUR", amountShown: 279, firstDeep: true,
      email: "gift@example.com", customerId: null, via: "787878",
      inputJson: JSON.stringify({ question: "Soll ich das Angebot annehmen?", values: VALUES, castAtMs: AT, tzOffsetMinutes: 120, locale: "de" }),
    });
    const rec = await verifyPaidSession("gf_" + "a".repeat(36));
    expect(rec).not.toBeNull();
    expect(rec!.gift).toBe(true);
    expect(rec!.tier).toBe("deep");
    expect(rec!.locale).toBe("de");
    expect(rec!.email).toBe("gift@example.com");
    expect(rec!.amountCents).toBe(0);
    expect(rec!.amountShown).toBe(279);
    expect(rec!.firstDeep).toBe(true);
    expect(rec!.currency).toBe("EUR");
    expect(rec!.via).toBe("787878");
    expect(rec!.input.values).toEqual(VALUES);
    expect(rec!.input.castAtMs).toBe(AT);
    // a made-up token is nothing
    expect(await verifyPaidSession("gf_" + "b".repeat(36))).toBeNull();
    expect(giftByToken("nope")).toBeNull();
  });

  it("carries the Cantonese register and last time's call through to the prompt (09-18: both were dropped, every 粵語 gift came back in standard Chinese)", async () => {
    const prior = { question: "佢會唔會返嚟", at: AT - 3_600_000, hex: "澤風大過", call: "唔係而家。" };
    createGift({
      token: "d".repeat(36), tier: "deep", locale: "zh-hant", currency: "HKD", amountShown: 6800, firstDeep: false,
      email: "hk@example.com", customerId: null, via: null,
      inputJson: JSON.stringify({ question: "依家份工好辛苦好想轉工，但出面市道都唔好", values: VALUES, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh-hant", register: "yue", prior, junk: "never" }),
    });
    const rec = await verifyPaidSession("gf_" + "d".repeat(36));
    expect(rec!.input.register).toBe("yue");
    expect(rec!.input.prior).toEqual(prior);
    expect((rec!.input as unknown as Record<string, unknown>).junk).toBeUndefined();   // still a whitelist
    // a malformed prior is dropped rather than fed to the model
    createGift({
      token: "e".repeat(36), tier: "deep", locale: "zh-hant", currency: "HKD", amountShown: 6800, firstDeep: false,
      email: null, customerId: null, via: null,
      inputJson: JSON.stringify({ question: "x", values: VALUES, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh-hant", register: "nope", prior: { question: 1 } }),
    });
    const bad = await verifyPaidSession("gf_" + "e".repeat(36));
    expect(bad!.input.register).toBeUndefined();
    expect(bad!.input.prior).toBeUndefined();
  });

  it("a signed-in claimant is delivered to the account's address without typing it", async () => {
    const cid = upsertCustomer("member@example.com", "ja");
    createGift({
      token: "c".repeat(36), tier: "one", locale: "ja", currency: "JPY", amountShown: 480, firstDeep: false,
      email: null, customerId: cid, via: null,
      inputJson: JSON.stringify({ question: "転職すべきか", values: VALUES, castAtMs: AT, tzOffsetMinutes: 540, locale: "ja" }),
    });
    const rec = await verifyPaidSession("gf_" + "c".repeat(36));
    expect(rec?.email).toBe("member@example.com");
    expect(rec?.customerId).toBe(cid);
    expect(rec?.tier).toBe("one");
  });

  it("gifted deep readings keep the first-time price for later and show up as gifts, never as sales", () => {
    const cid = upsertCustomer("door@example.com", "zh");
    expect(customerHasPaidDeep(cid)).toBe(false);
    recordOrder({ sessionId: "gf_" + "d".repeat(36), customerId: cid, castId: null, tier: "deep", amountCents: 0, currency: "CNY", email: "door@example.com", status: "gift", firstDeep: true });
    recordOrder({ sessionId: "gf_" + "e".repeat(36), customerId: null, castId: null, tier: "one", amountCents: 0, currency: "CNY", email: null, status: "gift" });
    // 总方案 §14 ②: whoever walked through the painted door still gets the first-time price once real payments open
    expect(customerHasPaidDeep(cid)).toBe(false);
    const sales = salesByCurrency(Date.now() - 60_000);
    const cny = sales.gifts.filter((g) => g.currency === "CNY");
    expect(cny.find((g) => g.tier === "deep")).toMatchObject({ n: 1, first: 1, withEmail: 1 });
    expect(cny.find((g) => g.tier === "one")).toMatchObject({ n: 1, first: 0, withEmail: 0 });
    // the paid column stays empty — a gift is not revenue
    expect(sales.orders.filter((o) => o.currency === "CNY")).toHaveLength(0);
    // only a real payment spends the first-time price
    recordOrder({ sessionId: "cs_paid_" + "d".repeat(30), customerId: cid, castId: null, tier: "deep", amountCents: 1299, currency: "CNY", email: "door@example.com", status: "paid" });
    expect(customerHasPaidDeep(cid)).toBe(true);
  });

  it("counts claims per address for the daily brake", () => {
    for (let i = 0; i < 3; i++) {
      createGift({
        token: `f${i}`.padEnd(36, "f"), tier: "deep", locale: "en", currency: "USD", amountShown: 299, firstDeep: true,
        email: "greedy@example.com", customerId: null, via: null,
        inputJson: JSON.stringify({ question: "again?", values: VALUES, castAtMs: AT, tzOffsetMinutes: 0, locale: "en" }),
      });
    }
    expect(giftsByEmailSince("greedy@example.com", Date.now() - 86_400_000)).toBe(3);
    expect(giftsByEmailSince("someone@example.com", Date.now() - 86_400_000)).toBe(0);
  });

  describe("the claim panel insists on an address for the deep reading (NEXT_PUBLIC_GIFT_EMAIL, 09-15)", () => {
    const saved = { PAYWALL: process.env.PAYWALL, GIFT: process.env.NEXT_PUBLIC_GIFT_EMAIL };
    afterEach(() => {
      process.env.PAYWALL = saved.PAYWALL;
      if (saved.GIFT === undefined) delete process.env.NEXT_PUBLIC_GIFT_EMAIL; else process.env.NEXT_PUBLIC_GIFT_EMAIL = saved.GIFT;
    });

    it("is off unless the switch is set; `deep` spares the light reading, `all` spares nothing", () => {
      delete process.env.NEXT_PUBLIC_GIFT_EMAIL;
      expect(giftEmailRequired("deep")).toBe(false);
      process.env.NEXT_PUBLIC_GIFT_EMAIL = "deep";
      expect(giftEmailRequired("deep")).toBe(true);
      expect(giftEmailRequired("one")).toBe(false);
      process.env.NEXT_PUBLIC_GIFT_EMAIL = "all";
      expect(giftEmailRequired("one")).toBe(true);
    });

    it("the door itself refuses a deep claim without an address, and still grants a light one", async () => {
      process.env.PAYWALL = "gift";
      process.env.NEXT_PUBLIC_GIFT_EMAIL = "deep";
      const post = (extra: Record<string, unknown>) => checkout(new NextRequest("http://localhost/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ question: "要不要接这个 offer", values: VALUES, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh", currency: "CNY", ...extra }),
      }));
      let res = await post({ tier: "deep" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "email_required" });
      res = await post({ tier: "deep", email: "Door@Example.com " });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { url: string }).url).toContain("sid=gf_");
      expect(giftsByEmailSince("door@example.com", Date.now() - 60_000)).toBe(1);
      res = await post({ tier: "one" });
      expect(res.status).toBe(200);
    });
  });

  it("the dashboard tells gifts and plan taps apart from purchases", () => {
    const t = Date.now();
    const s = computeStats([
      { t, e: "page_view", s: "s1", cur: "EUR" },
      { t, e: "cast_complete", s: "s1", cur: "EUR" },
      { t, e: "reading_click", s: "s1", tier: "deep", cur: "EUR" },
      { t, e: "gift_claim", s: "s1", tier: "deep", cur: "EUR", method: "email" },
      { t, e: "gift", s: "gf1", tier: "deep", cur: "EUR" },
      { t, e: "sub_intent", s: "s1", tier: "month", cur: "EUR" },
    ]);
    expect(s.funnel.purchase).toBe(0);
    expect(s.funnel.giftClaims).toBe(1);
    expect(s.funnel.gifts).toBe(1);
    expect(s.funnel.subIntents).toBe(1);
    expect(s.rates.intent).toBe(100);
    expect(s.byCurrency.find((c) => c.cur === "EUR")).toMatchObject({ clicksDeep: 1, checkout: 0, subIntents: 1 });
  });

  it("files a session under the promotion link's ?c= tag, first touch, for the whole tab", () => {
    const t = Date.now();
    const s = computeStats([
      { t, e: "page_view", s: "a", c: "xhs" },
      { t, e: "cast_complete", s: "a" },          // later events carry the tag implicitly
      { t, e: "reading_click", s: "a", tier: "deep" },
      { t, e: "gift_claim", s: "a", tier: "deep", method: "skip" },
      { t, e: "page_view", s: "b", c: "reddit" },
      { t, e: "page_view", s: "c" },               // untagged
      { t, e: "cast_complete", s: "c" },
    ]);
    expect(s.byChannel.find((r) => r.c === "xhs")).toMatchObject({ sessions: 1, casts: 1, clicks: 1, claims: 1 });
    expect(s.byChannel.find((r) => r.c === "reddit")).toMatchObject({ sessions: 1, casts: 0 });
    expect(s.byChannel.find((r) => r.c === "—")).toMatchObject({ sessions: 1, casts: 1 });
    // the untagged bucket sorts last
    expect(s.byChannel[s.byChannel.length - 1]!.c).toBe("—");
  });
});
