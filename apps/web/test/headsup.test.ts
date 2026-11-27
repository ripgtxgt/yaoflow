import { describe, expect, it } from "vitest";
import { HEADSUP_T } from "../src/lib/dict/headsup";
import { dueThisWeek, nextNamedDate } from "../src/lib/headsup";

/** 09-23 应期提醒: before the window, once per window, never on a reading they just got. */
const DAY = 86_400_000;
const now = new Date(2026, 8, 23, 10).getTime(); // 2026-09-23 local
const row = (o: Partial<{ quote: string; castAt: number; created: number; due: number; foretold: number | null }> = {}) => ({
  timing_quote: o.quote ?? "先看9月28日前後，真正明朗要到10月11日。",
  cast_at: o.castAt ?? now - 10 * DAY,
  created_at: o.created ?? now - 10 * DAY,
  due_at: o.due ?? now + 20 * DAY,
  foretold_at: o.foretold ?? null,
});

describe("应期提醒的时机", () => {
  it("取文中还没过的最近一个日子", () => {
    expect(nextNamedDate(row(), now)!.getDate()).toBe(28);
    expect(nextNamedDate(row({ quote: "9月20日已過，下一個是10月11日" }), now)!.getMonth()).toBe(9);
  });
  it("七天内有日子就发，太远不发", () => {
    expect(dueThisWeek(row(), now)).toBe(true);
    expect(dueThisWeek(row({ quote: "要到11月8日到12月6日" }), now)).toBe(false);
  });
  it("刚买两天内的不打扰；发过的不再发", () => {
    expect(dueThisWeek(row({ created: now - DAY }), now)).toBe(false);
    expect(dueThisWeek(row({ foretold: now - DAY }), now)).toBe(false);
  });
  it("写不出日期的：窗口一周内结束才提醒", () => {
    expect(dueThisWeek(row({ quote: "兩三週之內", due: now + 5 * DAY }), now)).toBe(true);
    expect(dueThisWeek(row({ quote: "兩三週之內", due: now + 15 * DAY }), now)).toBe(false);
  });
});

describe("九种语言一样", () => {
  it("键与占位符一致", () => {
    const base = HEADSUP_T.zh as Record<string, string>;
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const l of ["zh", "zh-hant", "en", "ja", "ko", "fr", "de", "es", "pt"] as const) {
      const t = (HEADSUP_T as Record<string, Record<string, string>>)[l]!;
      expect(Object.keys(t).sort(), l).toEqual(Object.keys(base).sort());
      for (const k of Object.keys(base)) expect(ph(t[k]!), `${l}.${k}`).toBe(ph(base[k]!));
    }
  });
});
