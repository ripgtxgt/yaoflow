import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { buildUserPayload, chartGuard, guardOpeningOffense, resolveServerChart, resolveTiming, timingOffense } from "../src/lib/reading";
import { oddsFor } from "../src/lib/generate";
import { revisitAsk } from "../src/lib/revisit-ask";

/**
 * 10-13 应验校准 (Neil: 「可以，三处都改吧」): 回访里判「会成」的 15 条只中 3 条。
 * ① 重凶信号（旬空/月破/化回头克/六冲）在动卦上也封顶 ② 应期最小到天 ③ 看不见的问题不发「應了沒」。
 */
const at = Date.UTC(2026, 9, 13, 3);
const base = { question: "這次面試會不會錄取", castAtMs: at, tzOffsetMinutes: 480 };
const all: LineValue[][] = [];
for (let n = 0; n < 4096; n++) all.push([0, 1, 2, 3, 4, 5].map((i) => ([6, 7, 8, 9] as LineValue[])[(n >> (i * 2)) & 3]!));
const find = (pred: (g: ReturnType<typeof chartGuard>, moving: boolean) => boolean) => {
  for (const values of all) {
    const input = { ...base, values };
    const chart = resolveServerChart(input, true);
    const g = chartGuard(chart, resolveTiming(input, chart, true));
    if (pred(g, chart.cast.changingPositions.length > 0)) return { input, chart, g: g! };
  }
  throw new Error("no chart found");
};

describe("① 重凶信号封顶（动卦也算）", () => {
  it("a moving chart whose focal line turns back on itself leans no, and says why", () => {
    const { input, chart, g } = find((g, m) => m && !!g?.signals.includes("huitou_ke"));
    expect(g.level).toBe("against");
    expect(g.rule_zh).toContain("回头克");
    const p = JSON.parse(buildUserPayload(input.question, chart, resolveTiming(input, chart, true))) as { guard?: { level: string } };
    expect(p.guard?.level).toBe("against");
    expect(oddsFor("strong", chart, input, true)).toBe("hard");
    expect(oddsFor("even", chart, input, true)).toBe("hard");
    expect(oddsFor("very_hard", chart, input, true)).toBe("very_hard");
  });
  it("one signal caps a moving chart at even — never strong or good", () => {
    const { input, chart } = find((g, m) => m && g?.level === "cap");
    expect(oddsFor("strong", chart, input, true)).toBe("even");
    expect(oddsFor("good", chart, input, true)).toBe("even");
    expect(oddsFor("hard", chart, input, true)).toBe("hard");
  });
  it("no signal, no guard: the payload carries nothing and odds pass through", () => {
    const { input, chart } = find((g, m) => m && g === null);
    expect(buildUserPayload(input.question, chart, resolveTiming(input, chart, true))).not.toContain('"guard"');
    expect(oddsFor("strong", chart, input, true)).toBe("strong");
  });
  it("六冲变六合 (先散后合) is not a signal", () => {
    for (const values of all.slice(0, 600)) {
      const input = { ...base, values };
      const chart = resolveServerChart(input, true);
      if (chart.shape.primary === "liuchong" && chart.shape.changed === "liuhe")
        expect(chartGuard(chart, resolveTiming(input, chart, true))?.signals ?? []).not.toContain("liuchong");
    }
  });
});

describe("① 判语开头不许先许诺", () => {
  it("an opening that promises the outcome is a rewrite under a guard; a hard or conditional opening is fine", () => {
    expect(guardOpeningOffense("他會再聯繫你，但不會照你想的那樣回來。")).toBeTruthy();
    expect(guardOpeningOffense("這一辭，走得成，但不會走得乾淨。")).toBeTruthy();
    expect(guardOpeningOffense("這段冷淡，短期內不會自己回暖。")).toBeNull();
    expect(guardOpeningOffense("要他先開口，才有機會。")).toBeNull();
    expect(guardOpeningOffense("難，至少這一輪不會。")).toBeNull();
  });
});

describe("② 应期最小到天", () => {
  it("the payload hands the model no hour windows", () => {
    const input = { ...base, question: "今天晚上他會不會回我訊息", values: [8, 7, 9, 8, 7, 8] as LineValue[] };
    const chart = resolveServerChart(input, true);
    const s = buildUserPayload(input.question, chart, resolveTiming(input, chart, true));
    expect(s).not.toContain("today_hours");
    expect(s).not.toContain("now_hour_branch");
    expect(s).not.toContain('"kind":"hour"');
  });
  it("a clock time or a part of the day in timing is a rewrite; a day window is fine", () => {
    for (const t of ["今晚9點前後會有消息，最晚10月15日", "最踏實的是13点到15点這一段，10月15日", "明天下午會有回音，10月14日", "午時最可能，10月14日"])
      expect(timingOffense({ timing: t }, "zh-hant")).toMatch(/^clock:/);
    expect(timingOffense({ timing: "Most likely tonight, around 9 pm on October 14" }, "en")).toMatch(/^clock:/);
    expect(timingOffense({ timing: "今天不太會，10月15日到19日這段多留意；到19日還沒動靜，這一輪就先當作沒有。" }, "zh-hant")).toBeNull();
    // 「X月A日到B日」 is one window too (10-13 21:23: a paid reading failed on exactly this)
    expect(timingOffense({ timing: "10月15日到19日這段多留意，先兆在10月13日。" }, "zh-hant")).toBeNull();
    // a span is one window: a main window and one later backup fit
    expect(timingOffense({ timing: "10月11日到10月15日這段先看；沒動靜就看10月17日到10月21日，到21日還沒有就放下。" }, "zh-hant")).toBeNull();
    // 10-31 进度表 129 ②: no likeliest day picked out of the window
    expect(timingOffense({ timing: "10月15日到19日之間，10月17日前後最可能；先兆在10月13日。" }, "zh-hant")).toMatch(/^peak:/);
    expect(timingOffense({ timing: "10月11日到10月15日之間，10月13日前後；沒動靜就看10月17日到10月21日。" }, "zh-hant")).toBe("peak:日前後");
  });
});

describe("③ 看不见的问题不发「應了沒」", () => {
  it("what another person does or holds in private is asked about signals", () => {
    expect(revisitAsk("他最近是不是在跟別人約會")).toBe("signals");
    expect(revisitAsk("他心裡把我放在什麼位置")).toBe("signals");
    expect(revisitAsk("is he seeing someone else")).toBe("signals");
    expect(revisitAsk("假期這幾天，猴男有與其他異性出來約會嗎")).toBe("signals");
  });
  it("events stay events", () => {
    expect(revisitAsk("我會不會被其他人選上")).toBe("event");
    expect(revisitAsk("我會不會後悔換工作")).toBe("event");
    expect(revisitAsk("這份工作會錄取嗎")).toBe("event");
    expect(revisitAsk("他這週會不會約我出去")).toBe("event");
  });
});
