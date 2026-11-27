import { describe, expect, it } from "vitest";
import { huangliDay, term } from "../../src/lib/mingli/calendar/day";
import { overview, termPage, termPageNames, yijiInfo } from "../../src/lib/mingli/calendar/content";
import { MATTER_LIST, zeriDays } from "../../src/lib/mingli/calendar/zeri";
import TERMS from "../../src/data/mingli/terms.json";

/** 10-17 进度表 69 黃曆 · 70 擇日 */
const BANNED = /靈驗|保證|AI|神明說|改運|化解|大師|大凶|血光|破財/;

describe("黃曆", () => {
  it("one known day", () => {
    const d = huangliDay(2026, 10, 17);
    expect(d.gz.day).toBe("甲子");
    expect(d.lunar.month).toBe("九月");
    expect(d.chong.zodiac).toBe("马");
    expect(d.sha).toBe("南");
    expect(d.yi).toContain("纳采");
    expect(term("纳采")).toBe("納采");
    expect(d.hours).toHaveLength(12);
  });

  it("two years of days render, every word has Traditional wording and a plain meaning", () => {
    const T = TERMS as Record<string, unknown>;
    let t = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 730; i++, t += 86_400_000) {
      const x = new Date(t);
      const d = huangliDay(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
      for (const k of [...d.yi, ...d.ji]) {
        expect(T[k], k).toBeTruthy();
        expect(yijiInfo(k, "zh-hant").plain, k).toBeTruthy();
      }
      for (const g of d.gods) expect(T[g.name], g.name).toBeTruthy();
      const o = overview(d, "zh-hant");
      expect(o).not.toMatch(/[{}]/);
      expect(BANNED.test(o)).toBe(false);
    }
  });

  it("the days the libraries are known to trip on still render", () => {
    expect(huangliDay(2026, 3, 5).gz.day).toMatch(/^.{2}$/);
    expect(huangliDay(2026, 1, 2).term.name).toBeTruthy();
  });

  it("30 term pages", () => {
    expect(termPageNames().length).toBe(30);
    expect(termPage("移徙")?.key).toBe("移徙");
  });
});

describe("擇日", () => {
  it("every matter finds a day in Nov and in Dec 2026, and none is a 破 day", () => {
    for (const m of MATTER_LIST) {
      for (const from of ["2026-11-01", "2026-12-01"]) {
        const r = zeriDays(m, from, 30, "zh-hant");
        expect(r.days.length, `${m.slug} ${from}`).toBeGreaterThan(0);
        for (const d of r.days) {
          const [y, mo, da] = d.ymd.split("-").map(Number) as [number, number, number];
          const h = huangliDay(y, mo, da);
          expect(h.duty).not.toBe("破");
          expect(h.ji.some((k) => m.ji.includes(k))).toBe(false);
        }
      }
    }
  });
});
