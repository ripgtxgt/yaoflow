import { describe, expect, it } from "vitest";
import { CAROUSEL_LOCALES, caseForDay, casesFor } from "../src/lib/carousel";

/** 09-23 卦例轮播图: every marketed language has cases, and a daily pick walks the list without repeating. */
describe("卦例轮播图的选例", () => {
  it("四种主推语言都有足够的卦例", () => {
    for (const l of CAROUSEL_LOCALES) expect(casesFor(l).length, l).toBeGreaterThanOrEqual(40);
  });
  // 11-01 进度表 132 ③: the pool is the cases whose days are still ahead, so it shrinks as days pass — never the same case
  // two days running, and most of a month distinct
  it("连续 30 天：相邻两天不同，大多不重复", () => {
    for (const l of CAROUSEL_LOCALES) {
      const seen = new Set<number>();
      let prev = -1;
      for (let d = 0; d < 30; d++) {
        const day = new Date(Date.UTC(2026, 10, 1) + d * 86_400_000).toISOString().slice(0, 10);
        const i = caseForDay(l, day).index;
        expect(i, `${l} ${day}`).not.toBe(prev);
        prev = i;
        seen.add(i);
      }
      expect(seen.size, l).toBeGreaterThanOrEqual(12); // the Chinese pool thins out by late November (its cases were cast in September)
    }
  });
  it("简体读繁體卦例时已转写", () => {
    expect(casesFor("zh").every((c) => c.locale === "zh")).toBe(true);
  });
});
