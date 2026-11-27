import { describe, expect, it } from "vitest";
import { cleanLocation, cleanPath, cleanReferrer, gaBootstrap, gaEventFor } from "../src/lib/ga";

/** 10-27 Google Analytics 4: what leaves for Google is a folded path, channel tags and event names — nothing a reader typed. */
describe("GA: nothing personal leaves", () => {
  it("folds tokens and ids out of paths", () => {
    expect(cleanPath("/zh-hant/reading/ab12cd34ef56gh78")).toBe("/zh-hant/reading/:id");
    expect(cleanPath("/zh/bazi/r/9f8e7d6c5b4a3210ff")).toBe("/zh/bazi/r/:id");
    expect(cleanPath("/zh-hant/matter/2841")).toBe("/zh-hant/matter/:id");
    expect(cleanPath("/zh-hant/gua/12")).toBe("/zh-hant/gua/12");
    expect(cleanPath("/en/zhengyuan")).toBe("/en/zhengyuan");
  });
  it("keeps only the channel parameters", () => {
    expect(cleanLocation("https://yaoflow.com/zh-hant/cast?q=%E4%BB%96%E6%9C%83%E5%9B%9E%E4%BE%86%E5%97%8E&c=threads&utm_source=ig&email=a@b.c&mine=123"))
      .toBe("https://yaoflow.com/zh-hant/cast?c=threads&utm_source=ig");
    expect(cleanReferrer("https://yaoflow.com/zh-hant/reading/ab12cd34ef56gh78?x=1")).toBe("https://yaoflow.com/");
  });
  it("events carry short codes only, and GA's own names where one fits", () => {
    expect(gaEventFor("checkout_start", { tier: "pass1", method: "v2", locale: "zh-hant" })).toEqual({ name: "begin_checkout", params: { detail: "v2", product: "pass1", site_lang: "zh-hant" } });
    expect(gaEventFor("cast_start", { method: "他會回來嗎" })).toEqual({ name: "cast_start", params: {} });
    expect(gaEventFor("page_leave", {})).toBeNull();
    expect(gaEventFor("purchase", {})).toBeNull(); // the server sends purchases (lib/ga-mp.ts)
  });
  it("bootstrap: ads off everywhere, analytics cookies off in the EEA/UK/CH, no automatic page_view", () => {
    const s = gaBootstrap(false);
    expect(s).toContain('ad_storage:"denied"');
    expect(s).toContain('"DE"');
    expect(s).toContain('"GB"');
    expect(s).toContain("send_page_view:false");
    expect(s).toContain("allow_google_signals:false");
    expect(gaBootstrap(true)).toContain("var internal=true");
    // 10-29 React #418: never added to <head> on window load (React may still be hydrating); GaTag loads it after hydration
    expect(s).not.toMatch(/addEventListener\("load"|document\.head\.appendChild/);
    expect(s).toContain("window.__yfGaLoad=load");
  });
});

describe("GA purchases from the server (Measurement Protocol)", async () => {
  const { gaClientId, gaSessionId, mpBody, sweepGaPurchases } = await import("../src/lib/ga-mp");
  it("reads the GA cookies", () => {
    expect(gaClientId("GA1.1.123456789.1730000000")).toBe("123456789.1730000000");
    expect(gaClientId("junk")).toBeNull();
    expect(gaSessionId("GS1.1.1730001111.3.1.1730002222.0.0.0")).toBe("1730001111");
    expect(gaSessionId("GS2.1.s1730001111$o3$g1$t1730002222$j60$l0$h0")).toBe("1730001111");
  });
  it("a purchase carries the money and a hashed id, nothing else", () => {
    const b = mpBody({ session_id: "cs_live_abc", tier: "pass1", amount_cents: 29000, currency: "twd", created_at: 1_730_000_000_000, browser_sid: null, status: "paid", refunded_at: null }, "purchase", null);
    const p = b.events[0]!.params;
    expect(p).toMatchObject({ value: 290, currency: "TWD" });
    expect(p.transaction_id).not.toContain("cs_live");
    expect(b.client_id).toMatch(/^\d+\.\d+$/);
    expect(mpBody({ session_id: "x", tier: "deep", amount_cents: 1100, currency: "JPY", created_at: 1, browser_sid: null, status: "paid", refunded_at: null }, "purchase", null).events[0]!.params.value).toBe(1100);
  });
  it("is off without the secret", async () => {
    delete process.env.GA_MP_SECRET;
    expect((await sweepGaPurchases()).on).toBe(false);
  });
});
