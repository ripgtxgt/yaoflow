import { describe, expect, it } from "vitest";
import { CURRENCIES, PASS_PRICES, priceMinor } from "../src/lib/money";
import { yearlyOn } from "../src/lib/subscription";

describe("会员调整（09-27）", () => {
  it("单月会员 NT$349，各币种都约为月付的 1.3 倍，订阅始终更划算", () => {
    expect(PASS_PRICES.TWD).toBe(34900);
    for (const c of CURRENCIES) {
      const r = PASS_PRICES[c] / priceMinor(c, "month");
      expect(r, c).toBeGreaterThan(1.2);
      expect(r, c).toBeLessThan(1.4);
    }
  });
  it("年付默认下架，SUB_YEARLY=on 才重新上架", () => {
    delete process.env.SUB_YEARLY;
    expect(yearlyOn()).toBe(false);
    process.env.SUB_YEARLY = "on";
    expect(yearlyOn()).toBe(true);
    delete process.env.SUB_YEARLY;
  });
});
