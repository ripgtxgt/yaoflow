import { describe, expect, it } from "vitest";
import { ZHOUYI_EN, ZHOUYI_ZH, textsFor } from "../src/texts/index";

describe("zhouyi text tables", () => {
  it("zh: 64 hexagrams, 6 lines each, 用九/用六 only on 1 and 2", () => {
    for (let n = 1; n <= 64; n++) {
      const h = ZHOUYI_ZH[n];
      expect(h, `zh missing ${n}`).toBeTruthy();
      expect(h!.lines).toHaveLength(6);
      expect(h!.judgmentHant.length).toBeGreaterThan(0);
      expect(h!.judgmentHans.length).toBeGreaterThan(0);
      for (const l of h!.lines) {
        expect(l.hant.length).toBeGreaterThan(0);
        expect(l.hans.length).toBeGreaterThan(0);
      }
      if (n === 1 || n === 2) expect(h!.extra).toBeTruthy();
      else expect(h!.extra).toBeUndefined();
    }
  });

  it("en: 64 hexagrams complete, extras only on 1 and 2", () => {
    for (let n = 1; n <= 64; n++) {
      const h = ZHOUYI_EN[n];
      expect(h, `en missing ${n}`).toBeTruthy();
      expect(h!.lines).toHaveLength(6);
      expect(h!.judgment.length).toBeGreaterThan(10);
      for (const l of h!.lines) expect(l.length).toBeGreaterThan(10);
      if (n === 1 || n === 2) expect(h!.extra).toBeTruthy();
      else expect(h!.extra).toBeUndefined();
    }
  });

  it("received-text spot checks (hant)", () => {
    expect(ZHOUYI_ZH[1]!.judgmentHant).toBe("元亨。利貞。");
    expect(ZHOUYI_ZH[1]!.lines[0]!.hant).toBe("潛龍勿用。");
    expect(ZHOUYI_ZH[2]!.lines[0]!.hant).toBe("履霜，堅冰至。");
    expect(ZHOUYI_ZH[2]!.extra!.label).toBe("用六");
    expect(ZHOUYI_ZH[63]!.lines[5]!.hant).toBe("濡其首，厲。");
  });

  it("simplified conversion protects 乾 (乾乾 not 干干)", () => {
    expect(ZHOUYI_ZH[1]!.lines[2]!.hans).toContain("乾乾");
    expect(ZHOUYI_ZH[1]!.lines[2]!.hans).not.toContain("干干");
    // 蛊卦 幹→干 is the correct simplified form
    expect(ZHOUYI_ZH[18]!.lines[0]!.hans).toContain("干父之蛊");
  });

  it("line labels match line polarity semantics on hex 1/2", () => {
    expect(ZHOUYI_ZH[1]!.lines.map((l) => l.label)).toEqual(["初九", "九二", "九三", "九四", "九五", "上九"]);
    expect(ZHOUYI_ZH[2]!.lines.map((l) => l.label)).toEqual(["初六", "六二", "六三", "六四", "六五", "上六"]);
  });

  it("textsFor merges both languages", () => {
    const t = textsFor(31);
    expect(t.zh.judgmentHant.length).toBeGreaterThan(0);
    expect(t.en.judgment).toContain("Influence");
    expect(() => textsFor(65)).toThrow();
  });
});
