import { describe, expect, it } from "vitest";
import { aspectsOf, astroOf, houseOf, PLANETS, signOf, type AstroView } from "@/lib/mingli/astro/chart";
import { dignityOf, insightOf, patternsOf, spreadGlyphs } from "@/lib/mingli/astro/insight";
import { INSIGHT_UI } from "@/lib/mingli/astro/insight-text";

/** a chart from constructed longitudes (10 planets, 太陽…冥王星); equal 30° houses from the ASC when given */
function fake(lons: number[], asc: number | null = null, mc: number | null = null): AstroView {
  const cusps = asc === null ? null : Array.from({ length: 12 }, (_, i) => (asc + i * 30) % 360);
  return {
    planets: PLANETS.map((name, i) => ({ name, lon: lons[i]!, sign: signOf(lons[i]!), deg: Math.floor(lons[i]! % 30), min: 0, retro: false, house: cusps ? houseOf(lons[i]!, cusps) : null, nearCusp: false })),
    node: { lon: 0, sign: "牡羊", house: null }, trueNode: { lon: 0, sign: "牡羊", house: null },
    asc, mc: asc === null ? null : mc ?? (asc + 270) % 360, cusps, houseSystem: cusps ? "whole" : null, aspects: aspectsOf(lons), timeKnown: asc !== null,
  };
}
// spread far apart so nothing makes a pattern by accident: 0, 37, 74, … (37° steps avoid 60/90/120/180 within orbs mostly)
const kinds = (lons: number[]) => patternsOf(lons, null).map((p) => p.kind).sort();

describe("星盤 看懂這張盤", () => {
  it("elements: weights 太陽 2 · 月亮 2 · planets 1, no angles without a birth time (total 12)", () => {
    // 太陽 牡羊(火) 月亮 金牛(土) 水星 雙子(風) 金星 巨蟹(水), the rest 獅子(火)
    const v = fake([5, 35, 65, 95, 125, 126, 127, 128, 129, 130]);
    const ins = insightOf(v);
    expect(ins.total).toBe(12);
    expect(ins.elements).toEqual({ 火: 8, 土: 2, 風: 1, 水: 1 });
    expect(ins.strongEl).toEqual(["火"]);
    expect(ins.weakEl).toEqual(["風", "水"]);
    expect(ins.modes).toEqual({ 基本: 3, 固定: 8, 變動: 1 });
    expect(ins.hemi).toBeNull();
    expect(ins.ruler).toBeNull();
  });
  it("elements: with a birth time 上升 2 and 天頂 1 join in (total 15)", () => {
    const v = fake([5, 35, 65, 95, 125, 126, 127, 128, 129, 130], 200, 110); // ASC 天秤(風) MC 巨蟹(水)
    const ins = insightOf(v);
    expect(ins.total).toBe(15);
    expect(ins.elements.風).toBe(3);
    expect(ins.elements.水).toBe(2);
  });
  it("patterns: 大三角, T三角, 大十字, 風箏, 上帝之指, 星群 on constructed longitudes", () => {
    // 大三角 太陽 0 · 月亮 120 · 水星 240; others parked out of the way
    expect(kinds([0, 120, 240, 23, 47, 71, 98, 157, 205, 331])).toContain("大三角");
    // T三角: 太陽 0 ☍ 月亮 180, 水星 90
    const t = patternsOf([0, 180, 90, 23, 47, 71, 133, 157, 205, 331], null).find((p) => p.kind === "T三角");
    expect(t?.apex).toBe("水星");
    // 大十字: 0 · 90 · 180 · 270 — listed once, its T三角 not repeated
    const gc = kinds([0, 90, 180, 270, 23, 47, 133, 157, 205, 331]);
    expect(gc.filter((k) => k === "大十字")).toHaveLength(1);
    expect(gc).not.toContain("T三角");
    // 風箏: 大三角 0/120/240 + 金星 at 180 (☍ 太陽, ⚹ 120 and 240); the 大三角 is not listed again
    const kite = patternsOf([0, 120, 240, 180, 23, 47, 98, 157, 205, 331], null);
    expect(kite.find((p) => p.kind === "風箏")?.apex).toBe("金星");
    expect(kite.map((p) => p.kind)).not.toContain("大三角");
    // 上帝之指: 太陽 0 ⚹ 月亮 60, 水星 210 (150° to both)
    const yod = patternsOf([0, 60, 210, 23, 47, 100, 133, 157, 280, 331], null).find((p) => p.kind === "上帝之指");
    expect(yod?.apex).toBe("水星");
    // 上帝之指 orb: 150° legs need ≤ 3°
    expect(kinds([0, 60, 214, 23, 47, 100, 133, 157, 280, 331])).not.toContain("上帝之指");
    // 星群: three in 獅子
    const st = patternsOf([121, 125, 129, 23, 47, 71, 200, 260, 300, 331], null).find((p) => p.kind === "星群星座");
    expect(st?.sign).toBe("獅子");
    expect(st?.planets).toEqual(["太陽", "月亮", "水星"]);
  });
  it("dominant planet: deterministic, with the published scores", () => {
    // ASC 0° 牡羊 (whole-sign houses); 火星 in 牡羊 1st house: 角宮 +3, near ASC +2, 命主星 +3, 入廟 +3
    const lons = [100, 160, 220, 250, 3, 290, 310, 335, 20, 140];
    const a = insightOf(fake(lons, 0, 270)), b = insightOf(fake(lons, 0, 270));
    expect(a.dominant).toEqual(b.dominant);
    expect(a.dominant[0]!.planet).toBe("火星");
    expect(a.dominant[0]!.why.slice(0, 4)).toEqual(["角宮1", "近軸點", "命主星", "入廟"]);
    expect(a.ruler).toEqual({ planet: "火星", co: null, sign: "牡羊", house: 1 });
    expect(a.domSign?.sign).toBe("牡羊"); // 上升 2 + 火星 1 + 1 for the dominant planet's sign
    expect(a.hemi!.east + a.hemi!.west).toBe(10);
    expect(a.hemi!.south + a.hemi!.north).toBe(10);
  });
  it("dignity table", () => {
    expect(dignityOf("太陽", 125)).toBe("入廟");
    expect(dignityOf("太陽", 5)).toBe("旺");
    expect(dignityOf("太陽", 305)).toBe("陷");
    expect(dignityOf("太陽", 185)).toBe("弱");
    expect(dignityOf("冥王星", 215)).toBe("入廟");
    expect(dignityOf("火星", 215)).toBe("入廟");
  });
  it("tightest aspects leave out outer–outer pairs and stop at 5", () => {
    const v = astroOf(Date.UTC(1990, 4, 15, 2, 30), 25.04, 121.56, true);
    const ins = insightOf(v);
    expect(ins.tight.length).toBeLessThanOrEqual(5);
    expect(ins.tight.every((a) => !(["天王星", "海王星", "冥王星"].includes(a.a) && ["天王星", "海王星", "冥王星"].includes(a.b)))).toBe(true);
    for (let i = 1; i < ins.tight.length; i++) expect(ins.tight[i]!.orb).toBeGreaterThanOrEqual(ins.tight[i - 1]!.orb);
  });
  it("wheel glyphs spread across 0° (358° and 2° no longer overlap)", () => {
    const s = spreadGlyphs([358, 2, 100], 8);
    const gap = Math.abs(((s[0]! - s[1]! + 540) % 360) - 180);
    expect(gap).toBeGreaterThanOrEqual(8 - 1e-6);
    expect(s[2]).toBe(100);
    const dense = spreadGlyphs([355, 357, 359, 1, 3, 5, 200, 201, 202, 300], 8);
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) expect(Math.abs(((dense[i]! - dense[j]! + 540) % 360) - 180)).toBeGreaterThanOrEqual(8 - 1e-3);
  });
  it("words: no banned wording", () => {
    const all = Object.values(INSIGHT_UI).join("");
    for (const w of ["準", "AI", "靈驗", "改運", "化解", "轉運", "命中注定", "注定", "一定會"]) expect(all.includes(w)).toBe(false);
  });
});
