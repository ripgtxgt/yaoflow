import { describe, expect, it } from "vitest";
import { toUsdCents } from "../src/lib/live";

/** 09-23: yen and won have no cents — ¥980 used to be counted as 980 cents × rate (≈ US$0.07). */
describe("折美元", () => {
  it("有小数的币种：分 → 分", () => {
    expect(toUsdCents(999, "USD")).toBe(999);
    expect(toUsdCents(26900, "TWD")).toBeGreaterThan(600);
    expect(toUsdCents(26900, "TWD")).toBeLessThan(1100);
  });
  it("日元、韩元没有分", () => {
    expect(toUsdCents(1100, "JPY")).toBeGreaterThan(500);   // ¥1,100 ≈ US$7
    expect(toUsdCents(15400, "KRW")).toBeGreaterThan(800);  // ₩15,400 ≈ US$11
  });
});
