import { describe, expect, it } from "vitest";
import { insightOf } from "@/lib/mingli/bazi/insight";

describe("八字 看懂這張盤", () => {
  it("五行能量 matches the competitor's numbers for 己巳 癸酉 己丑 庚午", () => {
    const i = insightOf(["己巳", "癸酉", "己丑", "庚午"], "male");
    expect(i.energy).toEqual({ 木: 0, 火: 2, 土: 3.8, 金: 2.8, 水: 1.5 });
    expect(i.total).toBe(10.1);
    expect(i.tens["比肩"]).toBe(2.5);
    expect(i.tens["劫财"]).toBe(0.3);
    expect(i.geju).toMatchObject({ name: "食神格", shown: false, stem: "辛" });
    expect(i.shensha.find((g) => g.key === "charm")?.names).toContain("桃花");
    expect(i.links.some((l) => l.row === "branch" && l.label === "相害")).toBe(true);
  });
  it("格局 takes the hidden stem that shows on the stems", () => {
    // 1990-01-01 00:00: 己巳 丙子 丙寅 戊子 — 子 holds only 癸 → 正官格
    expect(insightOf(["己巳", "丙子", "丙寅", "戊子"], "male").geju).toMatchObject({ name: "正官格", shown: false });
    // three pillars work too
    expect(insightOf(["己巳", "丙子", "丙寅"], "female").energy).toBeDefined();
  });
});
