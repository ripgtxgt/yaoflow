import { describe, expect, it } from "vitest";
import {
  BRANCHES, dayIndexAt, fullChart, monthBranchFromLongitude, solarLongitude,
  type LineValue,
} from "@yaoflow/engine";
import { hourBranch, questionScale, timingPlan } from "../src/lib/timing";
import { parseTimingDays, absoluteDates, revisitWindow } from "../src/lib/revisit";
import type { DeepReading } from "../src/lib/reading";

// 2026-09-01 14:00 Beijing (UTC+8): 戊寅日, 申月 (白露 is Sep 7)
const CAST_MS = Date.UTC(2026, 8, 1, 6, 0, 0);
const TZ = 480;

const chartOf = (values: LineValue[]) => fullChart({ values, utcMs: CAST_MS, tzOffsetMinutes: TZ });

/** Day branch of an ISO local date at local noon. */
function dayBranchOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const noonUtc = Date.UTC(y, m - 1, d, 12) - TZ * 60_000;
  return BRANCHES[dayIndexAt(noonUtc, TZ) % 12]!;
}
function monthBranchOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const noonUtc = Date.UTC(y, m - 1, d, 12) - TZ * 60_000;
  return monthBranchFromLongitude(solarLongitude(noonUtc));
}

const SAMPLES: LineValue[][] = [
  [7, 8, 7, 8, 7, 8], [9, 8, 8, 7, 7, 6], [8, 8, 8, 9, 7, 7], [6, 7, 9, 8, 8, 7],
  [7, 7, 7, 7, 7, 7], [8, 8, 8, 8, 8, 8], [9, 9, 6, 6, 7, 8], [7, 6, 8, 9, 8, 7],
];

describe("timingPlan — rules run in code, dates are real", () => {
  it("knows today in the caster's timezone", () => {
    const p = timingPlan(chartOf([7, 8, 7, 8, 7, 8]), CAST_MS, TZ, "other");
    expect(p.today).toBe("2026-09-01");
    expect(p.today_label_zh).toContain("9月1日");
    expect(p.today_label_zh).toContain("戊寅日");
  });

  it("every day-level window really falls on the candidate's branch, and lies ahead", () => {
    for (const v of SAMPLES) {
      const p = timingPlan(chartOf(v), CAST_MS, TZ, "career");
      expect(p.candidates.length).toBeGreaterThanOrEqual(2);
      for (const c of p.candidates) {
        expect(c.windows.length).toBeGreaterThan(0);
        for (const w of c.windows) {
          if (c.kind === "day") {
            expect(w.start > p.today).toBe(true);
            // 09-26: a five-day span around the core day; the core day is the one on the branch
            const core = /core (\d{4}-\d{2}-\d{2})/.exec(w.label_en)?.[1] ?? "";
            expect(core >= w.start && core <= w.end).toBe(true);
            expect(dayBranchOf(core)).toBe(c.branch);
          } else {
            // a month window may already be under way (值月 = 本月)
            expect(w.start >= p.today).toBe(true);
            expect(monthBranchOf(w.start)).toBe(c.branch);
            expect(monthBranchOf(w.end)).toBe(c.branch);
            if (w.start > p.today) {
              // the day before a future window is a different month
              const [y, m, d] = w.start.split("-").map(Number) as [number, number, number];
              const prev = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
              expect(monthBranchOf(prev)).not.toBe(c.branch);
            }
          }
        }
      }
    }
  });

  it("applies the classical rule that matches the focal line", () => {
    for (const v of SAMPLES) {
      const p = timingPlan(chartOf(v), CAST_MS, TZ, "money");
      const first = p.candidates.map((c) => c.rule_zh).join("|");
      if (p.focal.void) expect(first).toContain("旬空");
      else if (p.focal.month_clash) expect(first).toContain("月破");
      else if (p.focal.changing) expect(first).toContain("动爻");
      else if (p.focal.day_clash) expect(first).toContain("暗动");
      else expect(first).toContain("安静");
    }
  });

  it("picks the focal line by topic (妻财 for money when it is on the chart)", () => {
    for (const v of SAMPLES) {
      const chart = chartOf(v);
      const hasWealth = chart.lines.some((l) => l.relation === "wealth");
      const p = timingPlan(chart, CAST_MS, TZ, "money");
      if (hasWealth) expect(p.focal.relation).toBe("wealth");
      else expect(p.focal.how_zh).toContain("不上卦");
      const h = timingPlan(chart, CAST_MS, TZ, "health");
      expect(chart.lines[h.focal.pos - 1]!.isWorld).toBe(true);
    }
  });

  it("money words override a 'career' classification for the focal line", () => {
    for (const v of SAMPLES) {
      const chart = chartOf(v);
      if (!chart.lines.some((l) => l.relation === "wealth")) continue;
      const p = timingPlan(chart, CAST_MS, TZ, "career", "客户欠的那笔款什么时候能收回来");
      expect(p.focal.relation).toBe("wealth");
    }
  });

  it("orders candidates by horizon: far matters lead with the month window", () => {
    for (const v of SAMPLES) {
      const p = timingPlan(chartOf(v), CAST_MS, TZ, "career");
      const kinds = p.candidates.map((c) => c.kind);
      if (p.horizon === "months" && kinds.includes("month")) expect(kinds[0]).toBe("month");
      if (p.horizon !== "months") expect(kinds[0]).toBe("day");
    }
  });
});

describe("same-day questions get 时辰, not dates", () => {
  it("maps local hours to the twelve 时辰", () => {
    expect(hourBranch(23)).toBe("子");
    expect(hourBranch(0)).toBe("子");
    expect(hourBranch(1)).toBe("丑");
    expect(hourBranch(13)).toBe("未");
    expect(hourBranch(14)).toBe("未");
    expect(hourBranch(22)).toBe("亥");
  });

  it("reads the question's own time scale", () => {
    expect(questionScale("我现在能睡一个质量很好的午觉吗")).toBe("now");
    expect(questionScale("今晚的饭局去不去")).toBe("now");
    expect(questionScale("Can I nap well right now?")).toBe("now");
    expect(questionScale("明天下午的面试能过吗")).toBe("day");
    expect(questionScale("这周末搬家顺利吗")).toBe("day");
    expect(questionScale("现在的工作要不要换")).toBe("open");
    expect(questionScale("和前任还有可能复合吗")).toBe("open");
    expect(questionScale("我妹夫准备出国去发展，这个事情能不能成？会不会顺利？")).toBe("long");
    expect(questionScale("今年能买到合适的房子吗")).toBe("long");
    expect(questionScale("Should I emigrate to Canada next year?")).toBe("long");
  });

  it("recognises 择时 (when to act) and keeps prediction questions apart", () => {
    expect(questionScale("我的算卦产品大概要在什么时候去做推广呢？")).toBe("choose");
    expect(questionScale("什么时候适合辞职")).toBe("choose");
    expect(questionScale("When should I launch the product?")).toBe("choose");
    expect(questionScale("客户欠的那笔款什么时候能收回来")).toBe("open");
  });

  it("择时 offers favorable months only: focal line in power or fed, never clashed", () => {
    for (const v of SAMPLES) {
      const chart = chartOf(v);
      const p = timingPlan(chart, CAST_MS, TZ, "other", "这个产品什么时候去做推广合适");
      expect(p.question_scale).toBe("choose");
      expect(p.horizon).toBe("months");
      expect(p.candidates.length).toBeGreaterThan(0);
      const focal = chart.lines[p.focal.pos - 1]!;
      for (const c of p.candidates) {
        expect(c.kind).toBe("month");
        expect((BRANCHES.indexOf(c.branch) - BRANCHES.indexOf(focal.branch) + 12) % 12).not.toBe(6);
        expect(c.rule_zh).toContain("择时");
        expect(monthBranchOf(c.windows[0]!.start)).toBe(c.branch);
      }
    }
  });

  it("a declared time frame overrides the wording, for the plan and the revisit alike", () => {
    const chart = chartOf([7, 8, 7, 8, 7, 8]);
    const p = timingPlan(chart, CAST_MS, TZ, "relationship", "和前任还有可能复合吗", "now");
    expect(p.question_scale).toBe("now");
    expect(p.horizon).toBe("days");
    const w = timingPlan(chart, CAST_MS, TZ, "relationship", "我现在能睡个好午觉吗", "weeks");
    expect(w.question_scale).toBe("weeks");
    expect(w.horizon).toBe("weeks");
    expect(w.candidates[0]!.kind).toBe("day");
    const reading = { timing: { zh: "看不出日期", en: "unclear" } } as unknown as DeepReading;
    expect(revisitWindow("deep", reading, "和前任还有可能复合吗", "now").days).toBe(3);
    expect(revisitWindow("deep", reading, "和前任还有可能复合吗", "long").days).toBe(60);
  });

  it("a months-long matter is charted at month granularity whatever the line strength", () => {
    for (const v of SAMPLES) {
      const p = timingPlan(chartOf(v), CAST_MS, TZ, "career", "我妹夫准备出国去发展，能不能成");
      expect(p.question_scale).toBe("long");
      expect(p.horizon).toBe("months");
      expect(p.candidates[0]!.kind).toBe("month");
    }
  });

  it("revisits a months-long matter at the ceiling when no date is parsable, and reads phase words", () => {
    const vague = { timing: { zh: "真正落定要看明年，不必急", en: "Next year" } } as unknown as DeepReading;
    expect(revisitWindow("deep", vague, "妹夫出国发展能成吗").days).toBe(60);
    const from = new Date(2026, 8, 1);
    expect(parseTimingDays("9月中旬会先有眉目，成不成要看明年1月上旬至2月初", from)).toBe(60);
    expect(parseTimingDays("9月中旬会先有眉目", from)).toBe(15);
    expect(parseTimingDays("9月底前见分晓", from)).toBe(28);
  });

  it("offers only upcoming 时辰 windows of today, on the right branch", () => {
    for (const v of SAMPLES) {
      const p = timingPlan(chartOf(v), CAST_MS, TZ, "other", "我现在能睡个好午觉吗");
      expect(p.now_local).toBe("14:00");
      expect(p.now_hour_branch).toBe("未");
      expect(p.question_scale).toBe("now");
      for (const c of p.today_hours) {
        expect(c.kind).toBe("hour");
        for (const w of c.windows) {
          const end = new Date(w.end).getTime();
          expect(end > CAST_MS).toBe(true);
          const startLocalHour = (new Date(w.start).getTime() + TZ * 60_000) % 86_400_000 / 3_600_000;
          expect(hourBranch(Math.floor((startLocalHour + 24) % 24))).toBe(c.branch);
          expect(w.label_zh.startsWith("今天 ")).toBe(true);
        }
      }
    }
  });

  it("late at night, windows already over are not offered", () => {
    const lateMs = Date.UTC(2026, 8, 1, 14, 30, 0); // 22:30 Beijing
    const p = timingPlan(chartOf([7, 8, 7, 8, 7, 8]), lateMs, TZ, "other", "现在");
    expect(p.now_hour_branch).toBe("亥");
    for (const c of p.today_hours) {
      // only 亥 (under way) or 子 (23:00) can still be offered
      expect(["亥", "子"]).toContain(c.branch);
    }
  });

  it("schedules the revisit for a same-day question at the minimum", () => {
    const reading = { timing: { zh: "现在就可以睡，最踏实的是13点到15点", en: "Now is fine" } } as unknown as DeepReading;
    expect(revisitWindow("deep", reading, "我现在能睡个好午觉吗").days).toBe(3);
    expect(revisitWindow("deep", reading, "和前任还有可能复合吗").days).toBe(14);
  });
});

describe("parseTimingDays — absolute dates from timing v2", () => {
  const from = new Date(2026, 8, 1); // Sep 1 2026 local

  it("reads a named date, not '12日' as twelve days", () => {
    expect(parseTimingDays("9月12日前后（乙未日，11天后）见分晓", from)).toBe(12);
  });
  it("takes the END of a dated range, capped by the revisit ceiling", () => {
    expect(parseTimingDays("10月8日到11月7日这一个月里，偏后半段", from)).toBe(60);
    expect(parseTimingDays("9月12日–9月24日之间", from)).toBe(24);
  });
  it("handles English month names and ISO dates", () => {
    expect(parseTimingDays("around Sep 12, give or take a day", from)).toBe(12);
    expect(parseTimingDays("between 2026-09-10 and 2026-09-20", from)).toBe(20);
  });
  it("rolls a past-looking date into next year", () => {
    const dec = new Date(2026, 11, 20);
    expect(absoluteDates("1月5日前后", dec)[0]!.getFullYear()).toBe(2027);
    expect(parseTimingDays("1月5日前后", dec)).toBe(17);
  });
  it("reads Chinese-numeral dates the model sometimes writes", () => {
    expect(parseTimingDays("九月九日或十四日前后会有动静", from)).toBe(9);
    expect(parseTimingDays("全款要到明年三月六日至四月四日之间", from)).toBe(60);
    expect(parseTimingDays("十一月二十三日前后见分晓", from)).toBe(60);
    expect(absoluteDates("十月初五前后", from)[0]!.getDate()).toBe(5);
    expect(absoluteDates("一个月一次的例会", from)).toEqual([]);
  });

  it("still falls back to relative phrasing when no date is named", () => {
    expect(parseTimingDays("两周内见分晓", from)).toBe(14);
    expect(parseTimingDays("农历九、十月前后", from)).toBeNull();
  });
});
