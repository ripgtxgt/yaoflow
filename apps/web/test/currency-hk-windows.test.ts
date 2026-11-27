import { describe, expect, it } from "vitest";
import { detectCurrencyWithSource, isMainlandTimeZone, traditionalRegion } from "../src/lib/money";

/**
 * 09-23 (Neil: 「为什么最近两笔付款又乱收币种呢？」). Windows has no Hong Kong
 * zone — "(UTC+08:00) Beijing, Chongqing, Hong Kong, Urumqi" reports
 * Asia/Shanghai. roytam19970717 (billing HK, reading 繁體, exit IP JP) was
 * charged CNY for it, three times.
 */
describe("Windows 上的香港时钟", () => {
  it("roytam 的真实信号：上海时钟 + 繁體 + 日本 IP → 港币，不是人民币也不是日元", () => {
    const d = detectCurrencyWithSource({ timeZone: "Asia/Shanghai", uiLocale: "zh-Hant", language: "zh-TW", edgeCountry: "JP" });
    // Taiwan's PCs report Asia/Taipei; a China clock with a zh-TW pack is a Hong Kong PC
    expect(d.currency).toBe("HKD");
    expect(detectCurrencyWithSource({ timeZone: "Asia/Shanghai", uiLocale: "zh-Hant", language: "en-US", edgeCountry: "JP" }).currency).toBe("HKD");
    expect(detectCurrencyWithSource({ timeZone: "Asia/Shanghai", uiLocale: "zh-Hant", language: "zh-HK", edgeCountry: "JP" }).currency).toBe("HKD");
  });
  it("真正的大陆读者照旧：简体界面、或系统语言是 zh-CN（哪怕看繁體）", () => {
    expect(detectCurrencyWithSource({ timeZone: "Asia/Shanghai", uiLocale: "zh-CN", language: "zh-CN", edgeCountry: "SG" }).currency).toBe("CNY");
    expect(detectCurrencyWithSource({ timeZone: "Asia/Shanghai", uiLocale: "zh-Hant", language: "zh-CN", edgeCountry: "JP" }).currency).toBe("CNY");
    expect(detectCurrencyWithSource({ timeZone: "Asia/Shanghai", uiLocale: "en-US", language: "en-US" }).currency).toBe("CNY");
  });
  it("大陆判定（关掉代收、提示翻墙）也跟着改", () => {
    expect(isMainlandTimeZone("Asia/Shanghai", "zh-hant", "en-US")).toBe(false);
    expect(isMainlandTimeZone("Asia/Shanghai", "zh", "zh-CN")).toBe(true);
    expect(isMainlandTimeZone("Asia/Shanghai")).toBe(true);
    expect(isMainlandTimeZone("Asia/Hong_Kong", "zh", "zh-CN")).toBe(false);
  });
  it("手选的币种永远优先", () => {
    expect(detectCurrencyWithSource({ chosen: "JPY", timeZone: "Asia/Shanghai", uiLocale: "zh-Hant" })).toEqual({ currency: "JPY", source: "chosen" });
  });
  it("语言标签的几种写法", () => {
    expect(traditionalRegion("zh-Hant-TW")).toBe("HK");
    expect(traditionalRegion("zh-MO")).toBe("MO");
    expect(traditionalRegion("zh-hant")).toBe("HK");
    expect(traditionalRegion("zh-Hans-HK")).toBeNull();
    expect(traditionalRegion("ja-JP")).toBeNull();
  });
});
