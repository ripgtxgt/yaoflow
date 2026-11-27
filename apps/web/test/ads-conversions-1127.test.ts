import { describe, expect, it } from "vitest";
import { adsClickAllowed, clickFromSearch, parseClickCookie } from "../src/lib/ads-click";

/** 11-27 T-007: Google Ads 付费转化——只记点击编号，按标签页会话对上订单，CSV 只列已付款且有点击的单 */
describe("ads click cookie", () => {
  const now = 1_764_000_000_000;
  it("keeps gclid first, then gbraid / wbraid, and only well-formed ids", () => {
    expect(clickFromSearch(new URLSearchParams("c=ads-love&gclid=Cj0KCQiA_abc-123&gbraid=0AAAAAxyz123"), now)).toBe(`gclid.Cj0KCQiA_abc-123.${now / 1000}`);
    expect(clickFromSearch(new URLSearchParams("gbraid=0AAAAAxyz123"), now)).toMatch(/^gbraid\.0AAAAAxyz123\./);
    expect(clickFromSearch(new URLSearchParams("gclid=<script>"), now)).toBeNull();
    expect(clickFromSearch(new URLSearchParams("c=ads-love"), now)).toBeNull();
    expect(parseClickCookie(`gclid.Cj0KCQiA_abc-123.${now / 1000}`)).toEqual({ kind: "gclid", id: "Cj0KCQiA_abc-123", at: now });
    expect(parseClickCookie("junk")).toBeNull();
  });
  it("is never kept for EEA / UK / CH", () => {
    expect(adsClickAllowed("TW")).toBe(true);
    expect(adsClickAllowed(null)).toBe(true);
    expect(adsClickAllowed("de")).toBe(false);
    expect(adsClickAllowed("GB")).toBe(false);
  });
});

describe("ads conversions CSV", async () => {
  const { noteAdsClick, adsConversionsCsv, adsTime } = await import("../src/lib/ads-conversions");
  const { recordOrder } = await import("../src/lib/db");
  it("lists a paid order once per click, with value, currency and a hashed order id", () => {
    const now = Date.now();
    const click = `gclid.Cj0KCQiAtestclick01.${Math.floor((now - 3_600_000) / 1000)}`;
    expect(noteAdsClick("tabaaa111", click, "TW", now)).toBe(true);
    expect(noteAdsClick("tabbbb222", click, "FR", now)).toBe(false); // EEA
    expect(noteAdsClick("tabcccc333", "gclid.Cj0KCQiAtestclick02.1000000000", "TW", now)).toBe(false); // older than 90 days
    recordOrder({ sessionId: "cs_live_ads1", customerId: null, castId: null, tier: "pass_1d", amountCents: 7500, currency: "TWD", email: null, status: "paid", browserSid: "tabaaa111", edgeCountry: "TW" });
    recordOrder({ sessionId: "cs_live_ads2", customerId: null, castId: null, tier: "pass_1d", amountCents: 7500, currency: "TWD", email: null, status: "paid", browserSid: "tabzzz999", edgeCountry: "TW" }); // no click
    recordOrder({ sessionId: "cs_live_ads3", customerId: null, castId: null, tier: "pass_1d", amountCents: 7500, currency: "TWD", email: null, status: "refunded", browserSid: "tabaaa111", edgeCountry: "TW" });
    const { csv, rows } = adsConversionsCsv("YaoFlow Purchase");
    expect(rows).toBe(1);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Google Click ID,GBRAID,WBRAID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID");
    const cells = lines[1]!.split(",");
    expect(cells.slice(0, 4)).toEqual(["Cj0KCQiAtestclick01", "", "", "YaoFlow Purchase"]);
    expect(cells[5]).toBe("75");
    expect(cells[6]).toBe("TWD");
    expect(cells[7]).toMatch(/^[0-9a-f]{20}$/);
    expect(csv).not.toContain("cs_live");
    expect(adsTime(Date.UTC(2026, 10, 15, 5, 4, 3))).toBe("2026-11-15 05:04:03+00:00");
  });
});
