import { describe, expect, it } from "vitest";
import { hexagramByNumber } from "@yaoflow/engine";
import { liuyaoChart, relatedHexagrams, tuanXiang } from "../src/lib/gua-liuyao";

// 10-16 进度表 64: the 64 pages' 六爻 reference, checked against the classical tables
describe("卦页六爻资料", () => {
  it("乾为天：乾宫八纯卦，世六应三，纳甲甲子…壬戌，六亲按金论", () => {
    const c = liuyaoChart(hexagramByNumber(1), "zh-hant");
    expect([c.palace, c.palacePhase, c.category, c.world, c.response]).toEqual(["乾宮", "金", "八純卦（本宮卦）", 6, 3]);
    expect(c.lines.map((x) => x.ganzhi)).toEqual(["甲子", "甲寅", "甲辰", "壬午", "壬申", "壬戌"]);
    expect(c.lines.map((x) => x.relation)).toEqual(["子孫", "妻財", "父母", "官鬼", "兄弟", "父母"]);
    expect(c.lines.map((x) => x.label)).toEqual(["初九", "九二", "九三", "九四", "九五", "上九"]);
    expect(c.lines[5]!.mark).toBe("世");
    expect(c.lines[2]!.mark).toBe("应");
  });
  it("天风姤是乾宫一世卦、地天泰是坤宫三世卦、火地晋是乾宫游魂卦", () => {
    const g = liuyaoChart(hexagramByNumber(44), "zh");
    expect([g.palace, g.category, g.world]).toEqual(["乾宫", "一世卦", 1]);
    const t = liuyaoChart(hexagramByNumber(11), "zh");
    expect([t.palace, t.category, t.world, t.response]).toEqual(["坤宫", "三世卦", 3, 6]);
    expect(liuyaoChart(hexagramByNumber(35), "zh").category).toBe("游魂卦");
    expect(t.lines[0]!.label).toBe("初九");
    expect(t.lines[5]!.label).toBe("上六");
  });
  it("错综互：泰的错卦、综卦都是否，互卦是归妹；乾综还是乾", () => {
    const r = relatedHexagrams(hexagramByNumber(11));
    expect([r.cuo.number, r.zong.number, r.hu.number]).toEqual([12, 12, 54]);
    const q = relatedHexagrams(hexagramByNumber(1));
    expect([q.cuo.number, q.zong.number, q.hu.number]).toEqual([2, 1, 1]);
  });
  it("彖传、象传：64 卦都有，小象每爻一句（乾坤多用九／用六）", () => {
    expect(tuanXiang(1, "zh-hant")!.daxiang).toBe("天行健，君子以自強不息。");
    expect(tuanXiang(1, "zh")!.daxiang).toBe("天行健，君子以自强不息。");
    expect(tuanXiang(1, "zh")!.tuan).toContain("大哉乾元");
    for (let n = 1; n <= 64; n++) {
      const x = tuanXiang(n, "zh-hant")!;
      expect(x.tuan.length).toBeGreaterThan(20);
      expect(x.daxiang.length).toBeGreaterThan(5);
      expect(x.xiaoxiang).toHaveLength(n <= 2 ? 7 : 6);
    }
  });
});

describe("卦页感情、工作长段落", () => {
  it("64 卦繁简都有，长度 270–390 字，没有禁用词", async () => {
    const { loveWork } = await import("../src/lib/gua-liuyao");
    for (let n = 1; n <= 64; n++) for (const l of ["zh-hant", "zh"] as const) {
      const x = loveWork(n, l)!;
      for (const s of [x.love, x.work]) {
        expect(s.length).toBeGreaterThanOrEqual(270);
        expect(s.length).toBeLessThanOrEqual(390);
        expect(s).not.toMatch(/準|准确|靈驗|灵验|AI|神明說|保證|保证|一定會|必定|愛情|爱情/);
      }
    }
    expect(loveWork(1, "en")).toBeNull();
    expect(loveWork(29, "zh")!.love).toContain("坎为水");
  });
});
