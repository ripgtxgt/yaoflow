import { describe, expect, it } from "vitest";
import {
  allHexagrams,
  castValues,
  hexagramByNumber,
  hexagramFromBits,
  najiaFor,
  resolveCast,
  tossLine,
} from "../src/index";

/**
 * Regression tests pinned to classical sources:
 * - 纳甲全表:《增删卜易》八宫装卦 / 《京氏易传》
 * - 卦序: 通行本《周易》King Wen sequence
 */

describe("hexagram mapping (King Wen)", () => {
  it("covers all 64 numbers exactly once", () => {
    const nums = allHexagrams().map((h) => h.number);
    expect(nums).toEqual(Array.from({ length: 64 }, (_, i) => i + 1));
  });

  it("classical spot checks", () => {
    // 乾为天 ䷀ = all yang
    expect(hexagramFromBits([1, 1, 1, 1, 1, 1]).number).toBe(1);
    // 坤为地 = all yin
    expect(hexagramFromBits([0, 0, 0, 0, 0, 0]).number).toBe(2);
    // 水雷屯: lower 震(100) upper 坎(010)
    expect(hexagramFromBits([1, 0, 0, 0, 1, 0]).number).toBe(3);
    // 地天泰: lower 乾 upper 坤
    expect(hexagramFromBits([1, 1, 1, 0, 0, 0]).number).toBe(11);
    // 天地否: lower 坤 upper 乾
    expect(hexagramFromBits([0, 0, 0, 1, 1, 1]).number).toBe(12);
    // 火水未济: lower 坎 upper 离
    expect(hexagramFromBits([0, 1, 0, 1, 0, 1]).number).toBe(64);
    // 地雷复: lower 震 upper 坤
    expect(hexagramFromBits([1, 0, 0, 0, 0, 0]).number).toBe(24);
  });

  it("full names follow 为/composite convention", () => {
    expect(hexagramByNumber(1).fullZh).toBe("乾为天");
    expect(hexagramByNumber(3).fullZh).toBe("水雷屯");
    expect(hexagramByNumber(11).fullZh).toBe("地天泰");
    expect(hexagramByNumber(64).fullZh).toBe("火水未济");
  });

  it("unicode symbols align with numbers", () => {
    expect(hexagramByNumber(1).symbol).toBe("䷀");
    expect(hexagramByNumber(64).symbol).toBe("䷿");
  });
});

describe("najia (京房纳甲)", () => {
  it("乾为天 full column: 甲子/甲寅/甲辰/壬午/壬申/壬戌", () => {
    const n = najiaFor("qian", "qian");
    expect(n.map((l) => l.stem + l.branch)).toEqual(["甲子", "甲寅", "甲辰", "壬午", "壬申", "壬戌"]);
    expect(n.map((l) => l.phase)).toEqual(["water", "wood", "earth", "fire", "metal", "earth"]);
  });

  it("坤为地 full column: 乙未/乙巳/乙卯/癸丑/癸亥/癸酉", () => {
    const n = najiaFor("kun", "kun");
    expect(n.map((l) => l.stem + l.branch)).toEqual(["乙未", "乙巳", "乙卯", "癸丑", "癸亥", "癸酉"]);
    expect(n.map((l) => l.phase)).toEqual(["earth", "fire", "wood", "earth", "water", "metal"]);
  });

  it("水雷屯 (震下坎上): 庚子/庚寅/庚辰/戊申/戊戌/戊子", () => {
    const n = najiaFor("zhen", "kan");
    expect(n.map((l) => l.stem + l.branch)).toEqual(["庚子", "庚寅", "庚辰", "戊申", "戊戌", "戊子"]);
  });
});

describe("najia vs 《卜筮正宗·纳甲装卦歌》(books/卜筮正宗 全八卦书证)", () => {
  // 歌诀原文：乾金甲子外壬午 / 坎水戊寅外戊申 / 艮土丙辰外丙戌 / 震木庚子外庚午
  //          巽木辛丑外辛未 / 离火己卯外己酉 / 坤土乙未外癸丑 / 兑金丁巳外丁亥
  const cases = [
    { key: "qian", inner: ["子", "寅", "辰"], outer: ["午", "申", "戌"], innerStem: "甲", outerStem: "壬" },
    { key: "kan",  inner: ["寅", "辰", "午"], outer: ["申", "戌", "子"], innerStem: "戊", outerStem: "戊" },
    { key: "gen",  inner: ["辰", "午", "申"], outer: ["戌", "子", "寅"], innerStem: "丙", outerStem: "丙" },
    { key: "zhen", inner: ["子", "寅", "辰"], outer: ["午", "申", "戌"], innerStem: "庚", outerStem: "庚" },
    { key: "xun",  inner: ["丑", "亥", "酉"], outer: ["未", "巳", "卯"], innerStem: "辛", outerStem: "辛" },
    { key: "li",   inner: ["卯", "丑", "亥"], outer: ["酉", "未", "巳"], innerStem: "己", outerStem: "己" },
    { key: "kun",  inner: ["未", "巳", "卯"], outer: ["丑", "亥", "酉"], innerStem: "乙", outerStem: "癸" },
    { key: "dui",  inner: ["巳", "卯", "丑"], outer: ["亥", "酉", "未"], innerStem: "丁", outerStem: "丁" },
  ] as const;

  for (const c of cases) {
    it(`${c.key}: 内${c.innerStem}${c.inner.join("")} 外${c.outerStem}${c.outer.join("")}`, () => {
      const asInner = najiaFor(c.key, "qian").slice(0, 3);
      expect(asInner.map((l) => l.stem)).toEqual([c.innerStem, c.innerStem, c.innerStem]);
      expect(asInner.map((l) => l.branch)).toEqual([...c.inner]);
      const asOuter = najiaFor("qian", c.key).slice(3);
      expect(asOuter.map((l) => l.stem)).toEqual([c.outerStem, c.outerStem, c.outerStem]);
      expect(asOuter.map((l) => l.branch)).toEqual([...c.outer]);
    });
  }
});

describe("cast resolution", () => {
  it("static cast has no changed hexagram", () => {
    const r = resolveCast([7, 7, 7, 7, 7, 7]);
    expect(r.primary.number).toBe(1);
    expect(r.changed).toBeNull();
    expect(r.changingPositions).toEqual([]);
  });

  it("乾初爻动 → 天风姤 (44)", () => {
    const r = resolveCast([9, 7, 7, 7, 7, 7]);
    expect(r.primary.number).toBe(1);
    expect(r.changingPositions).toEqual([1]);
    expect(r.changed?.number).toBe(44);
  });

  it("坤上爻动 → 山地剥 (23)", () => {
    const r = resolveCast([8, 8, 8, 8, 8, 6]);
    expect(r.primary.number).toBe(2);
    expect(r.changed?.number).toBe(23);
  });

  it("determinism: same values, same result", () => {
    const a = resolveCast([6, 7, 8, 9, 7, 8]);
    const b = resolveCast([6, 7, 8, 9, 7, 8]);
    expect(a.primary.number).toBe(b.primary.number);
    expect(a.changed?.number).toBe(b.changed?.number);
    expect(a.najia).toEqual(b.najia);
  });

  it("rejects bad input", () => {
    expect(() => resolveCast([7, 7, 7])).toThrow();
    expect(() => resolveCast([5, 7, 7, 7, 7, 7] as never)).toThrow();
  });
});

describe("coin toss distribution", () => {
  it("only produces 6/7/8/9 and roughly matches 1:3:3:1", () => {
    let seed = 42;
    const rng = () => {
      // deterministic LCG for reproducible test
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const counts = { 6: 0, 7: 0, 8: 0, 9: 0 };
    const N = 80000;
    for (let i = 0; i < N; i++) counts[tossLine(rng)]++;
    expect(counts[6] / N).toBeGreaterThan(0.1);
    expect(counts[6] / N).toBeLessThan(0.15);
    expect(counts[7] / N).toBeGreaterThan(0.34);
    expect(counts[7] / N).toBeLessThan(0.41);
    // full cast sanity
    const values = castValues(rng);
    expect(values).toHaveLength(6);
  });
});
