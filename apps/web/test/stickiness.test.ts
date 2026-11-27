import { describe, expect, it } from "vitest";
import { THREAD_T } from "../src/lib/dict/thread";
import { visitorCohorts, customerCohorts, cohortTotals, heavyShare } from "../src/lib/retention";
import { groupMatters } from "../src/lib/matters";
import { noteGate, NOTE_GAP_MS, NOTE_LIMIT } from "../src/lib/progress";
import { dayOfDue } from "../src/lib/headsup";
import type { TrackedEvent } from "../src/lib/analytics-server";

/** 09-23 粘性 (用户粘性数据分析-0923.md) */

describe("九种语言一样", () => {
  it("键与占位符一致", () => {
    const base = THREAD_T.zh as Record<string, string>;
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const l of ["zh", "zh-hant", "en", "ja", "ko", "fr", "de", "es", "pt"] as const) {
      const t = (THREAD_T as Record<string, Record<string, string>>)[l]!;
      expect(Object.keys(t).sort()).toEqual(Object.keys(base).sort());
      for (const k of Object.keys(base)) expect(ph(t[k]!), `${l}.${k}`).toBe(ph(base[k]!));
    }
  });
});

const ev = (td: string, fd: string, pd?: string): TrackedEvent => ({ t: 0, e: "visit_day", s: "x", td, fd, ...(pd ? { pd } : {}) });

describe("回访率：只有日期，没有编号", () => {
  const evs = [
    ev("2026-09-23", "2026-09-23"), ev("2026-09-23", "2026-09-23"), ev("2026-09-23", "2026-09-23"), ev("2026-09-23", "2026-09-23"),
    ev("2026-09-24", "2026-09-23", "2026-09-23"),                 // A back next day (first return)
    ev("2026-09-26", "2026-09-23", "2026-09-24"),                 // A again — not a first return
    ev("2026-09-28", "2026-09-23", "2026-09-23"),                 // B first back on day 5
    ev("2026-10-20", "2026-09-23", "2026-09-23"),                 // C first back on day 27
    ev("2026-09-24", "2026-09-10", "2026-09-20"),                 // a cohort from before the dates were kept: no n, dropped
  ];
  it("按首访日分组，次日 / 7 天 / 30 天", () => {
    const rows = visitorCohorts(evs, "2026-10-25");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ day: "2026-09-23", n: 4, d1: 1, w7: 2, w30: 3 });
  });
  it("没满天数的组不计入总数", () => {
    const young = visitorCohorts(evs, "2026-09-26");
    const t = cohortTotals(young);
    expect(t.d1).toEqual([1, 4]);
    expect(t.w7).toEqual([0, 0]);
  });
});

describe("留了邮箱的客户：起卦的日子", () => {
  it("第一天起，看之后", () => {
    const days = new Map([[1, ["2026-09-16", "2026-09-16", "2026-09-17"]], [2, ["2026-09-16"]], [3, ["2026-09-16", "2026-09-30"]]]);
    const [r] = customerCohorts(days, "2026-10-30");
    expect(r).toMatchObject({ day: "2026-09-16", n: 3, d1: 1, w7: 1, w30: 2 });
  });
  it("高频用户占解读", () => {
    const h = heavyShare([24, 21, 1, 1, 2, 1]);
    expect(h.heavy).toBe(2);
    expect(Math.round(h.share * 100)).toBe(90);
  });
});

describe("这件事：同一件事归到一起", () => {
  const D = 86_400_000;
  const c = (id: number, q: string, d: number) => ({ id, question: q, locale: "zh-hant", created_at: Date.UTC(2026, 8, 16) + d * D });
  it("换了说法、换了称呼，仍是一件事；无关的另成一件", () => {
    const g = groupMatters([
      c(1, "鄧樹仁偶爾還會想起雞女嗎", 0),
      c(2, "猴男還會不會想起雞女", 1),
      c(3, "鄧樹仁偶爾還會想起Holly嗎", 2),
      c(4, "下個月的面試能不能過", 2),
    ]);
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.some((y) => y.id === 1))!.map((y) => y.id).sort()).toEqual([1, 2, 3]);
  });
  it("隔得太久的不再算同一件", () => {
    const g = groupMatters([c(1, "他還會不會回來找我", 0), c(2, "他還會不會回來找我", 60)]);
    expect(g).toHaveLength(2);
  });
});

describe("记一笔进展的节奏", () => {
  const now = 1_000_000_000_000;
  it("一天一笔、一卦最多几笔", () => {
    expect(noteGate([], now).kind).toBe("open");
    expect(noteGate([now - 3_600_000], now)).toEqual({ kind: "wait", nextAt: now - 3_600_000 + NOTE_GAP_MS });
    expect(noteGate([now - NOTE_GAP_MS - 1], now).kind).toBe("open");
    expect(noteGate(Array.from({ length: NOTE_LIMIT }, (_, i) => now - (i + 2) * NOTE_GAP_MS), now).kind).toBe("limit");
  });
});

describe("应期当天那封", () => {
  const now = new Date(2026, 8, 28, 9).getTime();
  const row = (quote: string, created = now - 5 * 86_400_000) => ({ timing_quote: quote, cast_at: created, created_at: created });
  it("第一个日子就是今天才发", () => {
    expect(dayOfDue(row("先看9月28日前後，真正明朗要到10月11日。"), now)).toBe("today");
    expect(dayOfDue(row("要到10月11日到10月20日"), now)).toBe("later");
    expect(dayOfDue(row("9月25日前後會有眉目，10月11日明朗"), now)).toBe("past");
    expect(dayOfDue(row("兩三週之內"), now)).toBe("none");
  });
  it("昨天才买的，今天不打扰", () => {
    expect(dayOfDue(row("先看9月28日前後", now - 3_600_000), now)).toBe("past");
  });
});
