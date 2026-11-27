import { describe, expect, it } from "vitest";
import {
  calendarContextAt, clashes, combines, dayIndexAt, fullChart,
  monthPillarAt, solarLongitude, strengthOf, voidBranches, yearPillarAt,
} from "../src/index";

const BJT = 480; // UTC+8

describe("day pillar (anchor: 1949-10-01 甲子日)", () => {
  it("1949-10-01 noon Beijing = 甲子 (index 0)", () => {
    expect(dayIndexAt(Date.UTC(1949, 9, 1, 4), BJT)).toBe(0);
  });

  it("2000-01-01 noon Beijing = 戊午 (index 54), 旬空 子丑", () => {
    const idx = dayIndexAt(Date.UTC(2000, 0, 1, 4), BJT);
    expect(idx).toBe(54);
    expect(voidBranches(idx)).toEqual(["子", "丑"]);
  });

  it("23:30 belongs to next day under zi23, same day under midnight", () => {
    const utc = Date.UTC(2000, 0, 1, 15, 30); // 2000-01-01 23:30 Beijing
    expect(dayIndexAt(utc, BJT)).toBe(55); // 己未
    expect(dayIndexAt(utc, BJT, { dayBoundary: "midnight" })).toBe(54);
  });

  it("旬空 formula: 甲子旬空戌亥", () => {
    expect(voidBranches(0)).toEqual(["戌", "亥"]);
    expect(voidBranches(10)).toEqual(["申", "酉"]); // 甲戌旬
    expect(voidBranches(50)).toEqual(["子", "丑"]); // 甲寅旬
  });
});

describe("solar longitude & solar terms", () => {
  it("2024 春分 (03-20 03:06Z): λ ≈ 0° later that day", () => {
    const l = solarLongitude(Date.UTC(2024, 2, 20, 12));
    expect(l).toBeLessThan(1.5);
  });

  it("2024 夏至 (06-20 20:51Z): λ ≈ 90°", () => {
    const l = solarLongitude(Date.UTC(2024, 5, 20, 22));
    expect(Math.abs(l - 90)).toBeLessThan(0.5);
  });

  it("2024 立春 (02-04 08:27Z) month/year boundary", () => {
    // after 立春 → 甲辰年 丙寅月
    const after = Date.UTC(2024, 1, 4, 12);
    expect(yearPillarAt(after)).toEqual({ stem: "甲", branch: "辰" });
    expect(monthPillarAt(after)).toEqual({ stem: "丙", branch: "寅" });
    // before 立春 → 癸卯年 乙丑月
    const before = Date.UTC(2024, 1, 4, 0);
    expect(yearPillarAt(before)).toEqual({ stem: "癸", branch: "卯" });
    expect(monthPillarAt(before)).toEqual({ stem: "乙", branch: "丑" });
  });

  it("2023-12-25: 癸卯年 甲子月", () => {
    const t = Date.UTC(2023, 11, 25, 12);
    expect(yearPillarAt(t)).toEqual({ stem: "癸", branch: "卯" });
    expect(monthPillarAt(t)).toEqual({ stem: "甲", branch: "子" });
  });
});

describe("旺相休囚死 & branch relations", () => {
  it("寅月: 木旺 火相 水休 金囚 土死", () => {
    expect(strengthOf("wood", "寅")).toBe("wang");
    expect(strengthOf("fire", "寅")).toBe("xiang");
    expect(strengthOf("water", "寅")).toBe("xiu");
    expect(strengthOf("metal", "寅")).toBe("qiu");
    expect(strengthOf("earth", "寅")).toBe("si");
  });

  it("丑月(土): 土旺 金相 火休 木囚 水死", () => {
    expect(strengthOf("earth", "丑")).toBe("wang");
    expect(strengthOf("metal", "丑")).toBe("xiang");
    expect(strengthOf("fire", "丑")).toBe("xiu");
    expect(strengthOf("wood", "丑")).toBe("qiu");
    expect(strengthOf("water", "丑")).toBe("si");
  });

  it("六冲/六合", () => {
    expect(clashes("子", "午")).toBe(true);
    expect(clashes("辰", "戌")).toBe(true);
    expect(clashes("子", "丑")).toBe(false);
    expect(combines("子", "丑")).toBe(true);
    expect(combines("午", "未")).toBe(true);
    expect(combines("寅", "亥")).toBe(true);
    expect(combines("子", "午")).toBe(false);
  });
});

describe("fullChart integration", () => {
  it("乾为天 static, 2000-01-01 noon Beijing", () => {
    const c = fullChart({
      values: [7, 7, 7, 7, 7, 7],
      utcMs: Date.UTC(2000, 0, 1, 4),
      tzOffsetMinutes: BJT,
    });
    expect(c.palace).toMatchObject({ palace: "qian", world: 6, response: 3 });
    expect(c.calendar.day).toEqual({ stem: "戊", branch: "午" });
    expect(c.calendar.year).toEqual({ stem: "己", branch: "卯" });
    expect(c.calendar.month).toEqual({ stem: "丙", branch: "子" });

    const l1 = c.lines[0]!;
    expect(l1.stem + l1.branch).toBe("甲子");
    expect(l1.relation).toBe("child");
    expect(l1.spirit).toBe("gouchen"); // 戊日起勾陈
    expect(l1.isVoid).toBe(true); // 戊午日旬空子丑
    expect(l1.dayClash).toBe(true); // 子午冲
    expect(l1.strength).toBe("wang"); // 子月水旺

    const l6 = c.lines[5]!;
    expect(l6.isWorld).toBe(true);
    expect(l6.relation).toBe("parent");
    expect(l6.strength).toBe("qiu"); // 子月土囚(克令者囚)
    expect(c.lines[2]!.isResponse).toBe(true);
  });
});
