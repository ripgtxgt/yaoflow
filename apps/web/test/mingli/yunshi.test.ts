import { describe, expect, it } from "vitest";
import { BRANCHES, C, relationOf, signOfBirth, SIGNS, yunshiFor, _test } from "@/lib/mingli/yunshi/zodiac";
import { huangliDay } from "@/lib/mingli/calendar/day";

const B = (s: string) => BRANCHES.indexOf(s as (typeof BRANCHES)[number]);
const rel = (a: string, b: string) => relationOf(B(a), B(b));
const ymd = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

describe("每日運勢 relation table", () => {
  it("follows the standard tables and priority", () => {
    expect(rel("子", "午")).toBe("chong");
    expect(rel("寅", "申")).toBe("chong"); // 沖 before 刑
    expect(rel("子", "卯")).toBe("xing");
    expect(rel("寅", "巳")).toBe("xing"); // 刑 before 害
    expect(rel("丑", "戌")).toBe("xing");
    expect(rel("辰", "辰")).toBe("xing"); // 自刑
    expect(rel("子", "子")).toBe("same");
    expect(rel("子", "未")).toBe("hai");
    expect(rel("子", "酉")).toBe("po");
    expect(rel("巳", "申")).toBe("xing"); // 刑 before 破、六合
    expect(rel("寅", "亥")).toBe("po"); // 破 before 六合
    expect(rel("子", "丑")).toBe("liuhe");
    expect(rel("子", "辰")).toBe("sanhe");
    expect(rel("子", "寅")).toBe("ping");
  });
  it("is symmetric over all 144 pairs", () => {
    for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) expect(relationOf(a, b)).toBe(relationOf(b, a));
  });
});

describe("每日運勢 days", () => {
  it("day branch matches the almanac", () => {
    for (let n = 20_000; n < 20_030; n++) {
      const [y, m, d] = ymd(n).split("-").map(Number) as [number, number, number];
      expect(BRANCHES[_test.branchOfDay(_test.dayNo(y, m, d))]).toBe(huangliDay(y, m, d).gz.day[1]);
    }
  });
  it("no sign sees the same line twice within 30 days", () => {
    const start = _test.dayNo(2026, 10, 1);
    for (let s = 0; s < 12; s++) for (let off = 0; off < 800; off += 13) {
      const seen = new Set<string>();
      for (let i = 0; i < 30; i++) {
        const y = yunshiFor(s, ymd(start + off + i))!;
        expect(seen.has(y.line)).toBe(false);
        seen.add(y.line);
      }
    }
  });
  it("no two signs share a line on the same day", () => {
    const start = _test.dayNo(2026, 1, 1);
    for (let i = 0; i < 800; i++) {
      const lines = SIGNS.map((_, s) => yunshiFor(s, ymd(start + i))!.line);
      expect(new Set(lines).size).toBe(12);
    }
  });
  it("content counts and banned words", () => {
    for (const r of Object.values(C.relations)) expect(r.length).toBeGreaterThanOrEqual(15);
    expect(C.relations.ping.length).toBeGreaterThanOrEqual(36); // 平 comes round up to 6 times in 12 days
    expect(Object.keys(C.zodiac)).toEqual([...SIGNS]);
    const all = JSON.stringify(C);
    expect(all).not.toMatch(/[準准]|大吉|大凶|犯太歲|血光|破財|這裡|AI|靈驗/);
  });
});

describe("每日運勢 sign by 立春", () => {
  it("turns at 立春", () => {
    // 2026 立春 = 02-04
    expect(SIGNS[signOfBirth(2026, 2, 3)]).toBe("snake");
    expect(SIGNS[signOfBirth(2026, 2, 4)]).toBe("horse");
    expect(SIGNS[signOfBirth(2026, 2, 17)]).toBe("horse"); // 春節
    expect(SIGNS[signOfBirth(1998, 6, 1)]).toBe("tiger");
  });
});
