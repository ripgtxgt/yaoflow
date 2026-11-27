import { describe, expect, it } from "vitest";
import {
  hexagramByNumber, palaceOf, relationsFor, spiritsForDay,
} from "../src/index";

describe("八宫 palace table", () => {
  it("covers all 64 hexagrams", () => {
    for (let n = 1; n <= 64; n++) expect(palaceOf(n).palace).toBeTruthy();
  });

  it("乾宫八卦: 乾姤遁否观剥晋大有", () => {
    const expected: Array<[number, string, number]> = [
      [1, "pure", 6], [44, "one", 1], [33, "two", 2], [12, "three", 3],
      [20, "four", 4], [23, "five", 5], [35, "youhun", 4], [14, "guihun", 3],
    ];
    for (const [num, cat, world] of expected) {
      const p = palaceOf(num);
      expect(p.palace).toBe("qian");
      expect(p.category).toBe(cat);
      expect(p.world).toBe(world);
      expect(p.response).toBe(world > 3 ? world - 3 : world + 3);
    }
  });

  it("游魂/归魂 spot checks across palaces", () => {
    expect(palaceOf(7)).toMatchObject({ palace: "kan", category: "guihun", world: 3 });   // 地水师
    expect(palaceOf(17)).toMatchObject({ palace: "zhen", category: "guihun" });           // 泽雷随
    expect(palaceOf(5)).toMatchObject({ palace: "kun", category: "youhun", world: 4 });   // 水天需
    expect(palaceOf(36)).toMatchObject({ palace: "kan", category: "youhun" });            // 地火明夷
    expect(palaceOf(61)).toMatchObject({ palace: "gen", category: "youhun" });            // 风泽中孚
    expect(palaceOf(54)).toMatchObject({ palace: "dui", category: "guihun" });            // 雷泽归妹
    expect(palaceOf(18)).toMatchObject({ palace: "xun", category: "guihun" });            // 山风蛊
    expect(palaceOf(8)).toMatchObject({ palace: "kun", category: "guihun" });             // 水地比
  });

  it("六亲: 乾为天 = 子孙/妻财/父母/官鬼/兄弟/父母", () => {
    const h = hexagramByNumber(1);
    expect(relationsFor(1, h.lower, h.upper)).toEqual([
      "child", "wealth", "parent", "officer", "sibling", "parent",
    ]);
  });

  it("六亲: 地天泰(坤宫) = 妻财/官鬼/兄弟/兄弟/妻财/子孙", () => {
    const h = hexagramByNumber(11);
    expect(relationsFor(11, h.lower, h.upper)).toEqual([
      "wealth", "officer", "sibling", "sibling", "wealth", "child",
    ]);
  });

  it("六神起例（六兽歌）", () => {
    expect(spiritsForDay("甲")).toEqual(["qinglong", "zhuque", "gouchen", "tengshe", "baihu", "xuanwu"]);
    expect(spiritsForDay("己")).toEqual(["tengshe", "baihu", "xuanwu", "qinglong", "zhuque", "gouchen"]);
    expect(spiritsForDay("庚")).toEqual(["baihu", "xuanwu", "qinglong", "zhuque", "gouchen", "tengshe"]);
    expect(spiritsForDay("癸")[0]).toBe("xuanwu");
  });
});
