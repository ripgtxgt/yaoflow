import { describe, expect, it } from "vitest";
import { fullChart, hexagramShape, najiaFor, type LineValue } from "../src/index";

// a fixed instant so 旬空/月破 flags are deterministic: 2026-09-01 14:00 Beijing
const AT = { utcMs: Date.UTC(2026, 8, 1, 6), tzOffsetMinutes: 480 };
const chart = (values: LineValue[]) => fullChart({ values, ...AT });

describe("动变关系 — computed from the najia columns", () => {
  it("乾之姤 初爻: 甲子水 → 辛丑土 is 回头克 + 化合 (土克水, 子丑合)", () => {
    const c = chart([9, 7, 7, 7, 7, 7]);
    expect(c.cast.changed?.fullZh).toBe("天风姤");
    const ch = c.changes[0]!;
    expect(ch.position).toBe(1);
    expect(ch.from.branch).toBe("子");
    expect(ch.to.branch).toBe("丑");
    expect(ch.kinds).toContain("huitou_ke");
    expect(ch.kinds).toContain("he");
    expect(ch.kinds).not.toContain("huitou_sheng");
    expect(ch.zh).toContain("回头克");
  });

  it("坎之比 二爻: 戊辰土 → 乙巳火 is 回头生 (火生土)", () => {
    const c = chart([8, 9, 8, 8, 7, 8]);
    expect(c.cast.changed?.fullZh).toBe("水地比");
    const ch = c.changes[0]!;
    expect(ch.from.branch).toBe("辰");
    expect(ch.to.branch).toBe("巳");
    expect(ch.kinds).toContain("huitou_sheng");
    expect(ch.kinds).not.toContain("xie");
  });

  it("震下二爻 庚寅木 → 丁卯木 is 进神; the reverse 卯→寅 is 退神", () => {
    const jin = chart([7, 6, 8, 7, 8, 8]); // 震为雷, line 2 moves → lower 兑
    const j = jin.changes[0]!;
    expect(j.from.branch).toBe("寅");
    expect(j.to.branch).toBe("卯");
    expect(j.kinds).toContain("jin");
    const tui = chart([7, 9, 8, 7, 7, 8]); // 兑为泽, line 2 moves → lower 震
    const t = tui.changes[0]!;
    expect(t.from.branch).toBe("卯");
    expect(t.to.branch).toBe("寅");
    expect(t.kinds).toContain("tui");
  });

  it("乾上两爻动化震: 壬申→庚申, 壬戌→庚戌 are 伏吟", () => {
    const c = chart([7, 7, 7, 7, 9, 9]);
    expect(c.cast.changed?.fullZh).toBe("雷天大壮");
    expect(c.changes).toHaveLength(2);
    for (const x of c.changes) {
      expect(x.from.branch).toBe(x.to.branch);
      expect(x.kinds).toContain("fuyin");
      expect(x.kinds).not.toContain("jin");
    }
    // 申 happens to be void on this day: the flag rides along, the 伏吟 stays
    expect(c.changes[0]!.kinds).toContain("kong");
  });

  it("离之噬嗑 三爻: 己亥水 → 庚辰土 is 回头克 and 入墓 (辰为水墓)", () => {
    const c = chart([7, 8, 9, 7, 8, 7]);
    expect(c.cast.changed?.fullZh).toBe("火雷噬嗑");
    const ch = c.changes[0]!;
    expect(ch.from.branch).toBe("亥");
    expect(ch.to.branch).toBe("辰");
    expect(ch.kinds).toContain("huitou_ke");
    expect(ch.kinds).toContain("mu");
  });

  it("本爻生变爻 is 化泄: 坎初爻 戊寅木 → 丁巳火", () => {
    const c = chart([6, 7, 8, 8, 7, 8]); // 坎为水, line 1 moves → lower 兑
    const ch = c.changes[0]!;
    expect(ch.from.branch).toBe("寅");
    expect(ch.to.branch).toBe("巳");
    expect(ch.kinds).toContain("xie");
  });

  it("nothing moving → no changes; the payload text names the relation in plain 卦理", () => {
    expect(chart([7, 8, 7, 8, 7, 8]).changes).toEqual([]);
    const c = chart([9, 7, 7, 7, 7, 7]);
    expect(c.changes[0]!.zh).toMatch(/^初爻.+甲?子水动 → 化丑土/);
    expect(c.changes[0]!.en).toMatch(/Line 1 .+ moves → 丑 earth/);
  });
});

describe("六冲 / 六合 shape", () => {
  it("乾为天 is 六冲, 地天泰 is 六合, 水火既济 is neither", () => {
    expect(hexagramShape(najiaFor("qian", "qian"))).toBe("liuchong");
    expect(hexagramShape(najiaFor("qian", "kun"))).toBe("liuhe");
    expect(hexagramShape(najiaFor("li", "kan"))).toBeNull();
    const c = chart([7, 7, 7, 7, 9, 9]);
    expect(c.shape.primary).toBe("liuchong");
  });
});
