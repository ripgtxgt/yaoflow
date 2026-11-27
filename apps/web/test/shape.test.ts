import { describe, expect, it } from "vitest";
import { shapeOffense } from "../src/lib/reading";

/**
 * 六冲/六合 is computed by the engine. The model was caught writing
 * "六冲变六合，先散后合" for 泽雷随→水雷屯, which is neither — the kind of
 * slip a reader who knows the tradition spots instantly. The code check
 * turns that into a rewrite instead of a delivered reading.
 */
describe("六冲/六合 claims must match chart.shape", () => {
  const neither = { primary: null, changed: null };

  it("catches the classic invented '六冲变六合' in every script", () => {
    expect(shapeOffense({ basis: "世爻休囚，六冲变六合，先散后合。" }, neither)).toBe("basis:六冲");
    expect(shapeOffense({ basis: "六合の卦形は事がまとまりにくく" }, neither)).toBe("basis:六合");
    expect(shapeOffense({ basis: "六衝變六合，先散後合" }, neither)).toBe("basis:六衝");
    expect(shapeOffense({ basis: "육충괘가 육합으로 변하니" }, neither)).toBe("basis:육충");
    expect(shapeOffense({ basis: "The changed hexagram is a clash hexagram, so what gathers will scatter." }, neither)).toMatch(/^basis:/);
    expect(shapeOffense({ basis: "a six-clash figure turning into six harmonies" }, neither)).toMatch(/^basis:/);
  });

  it("lets the claim stand when the engine says the shape is real", () => {
    expect(shapeOffense({ basis: "六合の卦形は事がまとまりにくく" }, { primary: "liuhe", changed: null })).toBeNull();
    expect(shapeOffense({ basis: "The changed hexagram is one of clash" }, { primary: null, changed: "liuchong" })).toBeNull();
  });

  it("ignores readings that never mention the relation", () => {
    expect(shapeOffense({ verdict: "此事可成", basis: "用神官鬼旬空，四爻回头生。" }, neither)).toBeNull();
    expect(shapeOffense({ basis: "the Wealth line combines with the day branch" }, neither)).toBeNull();
  });
});
