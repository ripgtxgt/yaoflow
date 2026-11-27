import { describe, expect, it } from "vitest";
import { detectCurrencyWithSource, formatMoney, PRICES, type Currency } from "../src/lib/money";

/**
 * 09-23 (Neil: 「保持含税，检查所有的地区标价，需要交税的都提高价格，然后马来西亚那边的标价也处理一下」).
 * Prices are tax-inclusive now. Where a consumer tax is collected, what we
 * keep after it must not fall below the old pre-tax price.
 */
const OLD: Partial<Record<Currency, [number, number, number]>> = {
  TWD: [6900, 24900, 199000], JPY: [480, 980, 7800], KRW: [3900, 13900, 109000], EUR: [279, 899, 6900],
  GBP: [229, 749, 5900], CAD: [429, 1399, 10900], AUD: [429, 1399, 10900], SGD: [399, 1299, 9900],
  MXN: [4900, 16900, 134900], CHF: [250, 850, 6500],
};
// the rate each is set against (EUR at the common 21%, CAD at Ontario's 13% HST)
const RATE: Partial<Record<Currency, number>> = {
  TWD: 0.05, JPY: 0.10, KRW: 0.10, EUR: 0.21, GBP: 0.20, CAD: 0.13, AUD: 0.10, SGD: 0.09, MXN: 0.16, CHF: 0.081,
};

describe("含税后到手不少于原来的未税价", () => {
  for (const [c, old] of Object.entries(OLD) as [Currency, [number, number, number]][]) {
    it(c, () => {
      const p = PRICES[c];
      const r = RATE[c]!;
      [p.one, p.deep, p.year].forEach((now, i) => expect(now / (1 + r), `${c} ${["one", "deep", "year"][i]}`).toBeGreaterThanOrEqual(old[i]! - 0.5));
    });
  }
  it("不收消费税的币种不动", () => {
    expect(PRICES.HKD).toEqual({ one: 1800, deep: 6800, month: 6800, year: 54800 });
    expect(PRICES.CNY).toEqual({ one: 990, deep: 3800, month: 3800, year: 19800 });
    expect(PRICES.USD).toEqual({ one: 299, deep: 999, month: 999, year: 7900 });
  });
});

describe("马来西亚", () => {
  it("吉隆坡时钟、马来西亚 IP、马来语系统都给令吉", () => {
    expect(detectCurrencyWithSource({ timeZone: "Asia/Kuala_Lumpur", language: "zh-CN" }).currency).toBe("MYR");
    expect(detectCurrencyWithSource({ timeZone: "Asia/Kuching" }).currency).toBe("MYR");
    expect(detectCurrencyWithSource({ edgeCountry: "MY" }).currency).toBe("MYR");
    expect(detectCurrencyWithSource({ language: "ms" }).currency).toBe("MYR");
  });
  it("写成 RM，不管界面是什么语言", () => {
    expect(formatMoney("MYR", 990, "zh")).toBe("RM9.90");
    expect(formatMoney("MYR", 3490, "en")).toBe("RM34.90");
    expect(formatMoney("MYR", 27900, "zh-hant")).toBe("RM279");
    expect(formatMoney("MYR", 990, "fr")).toBe("RM9,90");
  });
});
