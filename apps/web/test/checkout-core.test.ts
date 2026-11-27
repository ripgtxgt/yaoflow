import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { checkoutCommon, commonMeta, routingFor } from "../src/lib/checkout-core";
import { CATALOG, CATALOG_IDS, type CatalogId } from "../src/lib/catalog";

/** 10-22 进度表 57 — the common part of every checkout, once */
const req = (h: Record<string, string> = {}) => new NextRequest("https://yaoflow.com/api/checkout/v2", { method: "POST", headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", ...h } });

describe("统一结账 · 公共规则 (57)", () => {
  it("routing: mainland clocks, 简体 at UTC+8 without a zone name, and any yuan amount leave Managed Payments; TW / HK go to our own page; the mainland route names alipay", async () => {
    const us = await routingFor(req({ "cf-ipcountry": "US" }), { locale: "en", currency: "USD", timeZone: "America/New_York", tzOffsetMinutes: -240 });
    expect(us.managedPayments).toBe(true); expect(us.plainRegion).toBeNull(); expect(us.methods).toBeUndefined(); expect(us.country).toBe("US");
    const cn = await routingFor(req({ "cf-ipcountry": "US" }), { locale: "zh", currency: "USD", timeZone: "Asia/Shanghai", tzOffsetMinutes: 480 });
    expect(cn.managedPayments).toBe(false); expect(cn.methods).toEqual(expect.arrayContaining(["alipay"]));
    const zh480 = await routingFor(req({ "cf-ipcountry": "US" }), { locale: "zh", currency: "USD", timeZone: null, tzOffsetMinutes: 480 });
    expect(zh480.managedPayments).toBe(false);
    const cny = await routingFor(req({ "cf-ipcountry": "DE" }), { locale: "en", currency: "CNY", timeZone: "Europe/Berlin", tzOffsetMinutes: -120 });
    expect(cny.managedPayments).toBe(false); expect(cny.methods).toEqual(expect.arrayContaining(["alipay"]));
    const tw = await routingFor(req({ "cf-ipcountry": "TW" }), { locale: "zh-hant", currency: "TWD", timeZone: "Asia/Taipei", tzOffsetMinutes: 480 });
    expect(tw.managedPayments).toBe(false); expect(tw.plainRegion).toBe("TW"); expect(tw.methods).toBeUndefined();
    const hkClock = await routingFor(req({}), { locale: "zh-hant", currency: "HKD", timeZone: "Asia/Hong_Kong", tzOffsetMinutes: 480 });
    expect(hkClock.plainRegion).toBe("HK");
  });

  it("the common fields and the metadata every session carries", async () => {
    const c = await checkoutCommon(req({ "cf-ipcountry": "TW" }), { locale: "zh-hant", currency: "TWD", timeZone: "Asia/Taipei", tzOffsetMinutes: 480, c: "threads-1022", bs: "abc123xyz", remind: true });
    expect(c.locale).toBe("zh-hant"); expect(c.currency).toBe("TWD"); expect(c.origin).toMatch(/^https?:\/\//);
    expect(c.campaign).toBe("threads-1022"); expect(c.browserSid).toBe("abc123xyz"); expect(c.remind).toBe(true); expect(c.device).toMatch(/:/);
    const m = commonMeta(c, { email: "a@example.com", customerId: 7 });
    expect(m).toMatchObject({ email: "a@example.com", cust: "7", locale: "zh-hant", currency: "TWD", country: "TW", mp_reason: "plain-tw", c: "threads-1022", bs: "abc123xyz", remind: "1" });
    const bare = commonMeta(c, null, { tags: false });
    expect(bare).toEqual({ locale: "zh-hant", currency: "TWD", country: "TW", mp_reason: "plain-tw" });
    // an unknown currency or locale falls back, never throws
    const d = await checkoutCommon(req(), { locale: "xx", currency: "ABC" });
    expect(d.locale).toBe("zh"); expect(d.currency).toBe("USD"); expect(d.campaign).toBeNull(); expect(d.browserSid).toBeNull();
    const e = await checkoutCommon(req(), { locale: "zh" }, { defaultCurrency: "TWD" });
    expect(e.currency).toBe("TWD");
  });

  it("every product the entrance sells is a catalog row with a price; what it refuses has none or is the cast page's own", () => {
    const sold: CatalogId[] = ["pass_1", "pass_7", "pass_30", "tarot", "qian_personal", "qian_card", "hepan", "nianshu", "zhengyuan", "name_baby", "name_rename", "month", "year", "pack_l", "pack_s"];
    for (const id of sold) expect(CATALOG[id].price).not.toBeNull();
    const rest = CATALOG_IDS.filter((id) => !sold.includes(id));
    expect(rest.sort()).toEqual(["astro_deep", "bazi_deep", "deep", "one", "ziwei_deep"]);
    for (const id of rest) expect(CATALOG[id].kind === "included" || CATALOG[id].path === "/cast").toBe(true);
  });
});
