import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-04 (Neil: 「深断要一起改一处，改吧」): a deep reading bought days after the cast — a saved cast, an old light reading
 * upgraded, a reminder letter — was written as if the reader opened it on the cast day (「明天会有消息」 for a day long
 * gone). The chart stays the cast day's; the payload now says which day they read it on and which windows are behind it,
 * the prompt says how to speak of them, and the timing field gets one rewrite if it still says 今天 / 明天.
 */
const llm = vi.hoisted(() => ({ json: [] as string[], calls: [] as { role: string; content: string }[][] }));
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  return {
    ...real,
    chatJson: vi.fn(async (messages: { role: string; content: string }[]) => { llm.calls.push(messages.map((m) => ({ ...m }))); const v = llm.json.shift(); if (v === undefined) throw new Error("no model in tests"); return v; }),
  };
});

const { buildUserPayload, deepSystem, lateTimingOffense, resolveServerChart, resolveTiming, LATE_OPENING_NOTE } = await import("../src/lib/reading");
const { generateReading, lateOpenedOn } = await import("../src/lib/generate");
const { timingHint } = await import("../src/lib/timing-hint");
const { isoDaysBetween, localIsoDate } = await import("../src/lib/timing");

const V: LineValue[] = [7, 8, 9, 7, 8, 8];
const DAY = 86_400_000;
const TZ = 480;
const NOW = Date.now();
const CAST = NOW - 5 * DAY; // five days ago — inside the stored lookback, well outside the 48 h one
const input = { question: "這次面試能過嗎", values: V, castAtMs: CAST, tzOffsetMinutes: TZ };

beforeEach(() => { llm.json.length = 0; llm.calls.length = 0; });

describe("晚买的深断：知道今天几号", () => {
  it("lateOpenedOn: a later calendar day in the cast's clock; null on the cast day, and for an unstored old cast", () => {
    expect(lateOpenedOn(input, true, NOW)).toBe(localIsoDate(NOW, TZ));
    expect(lateOpenedOn({ ...input, castAtMs: NOW - 60_000 }, true, NOW)).toBeNull();
    // stored = false clamps an old instant to now: nothing is late there
    expect(lateOpenedOn(input, false, NOW)).toBeNull();
    expect(isoDaysBetween("2026-10-04", "2026-10-09")).toBe(5);
  });

  it("the payload marks windows behind the opening day, says the day, and leaves an on-time reading as it was", () => {
    const chart = resolveServerChart(input, true);
    const timing = resolveTiming(input, chart, true);
    const today = timing.today;
    // open the reading the day after the first candidate window ends, so at least one window is behind
    const firstEnd = timing.candidates.flatMap((c) => c.windows).map((w) => w.end).sort()[0]!;
    const opened = new Date(Date.parse(`${firstEnd}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
    const late = JSON.parse(buildUserPayload(input.question, chart, timing, { tellTime: true, openedOn: opened }));
    expect(late.opened_on).toBe(opened);
    expect(late.days_after_cast).toBe(isoDaysBetween(today, opened));
    expect(late.timing.today_hours_passed).toBeUndefined(); // 10-13: no hour windows at all any more
    const wins = late.timing.candidates.flatMap((c: { windows: { end: string; start: string; passed?: boolean; under_way?: boolean }[] }) => c.windows);
    for (const w of wins) {
      if (w.end < opened) expect(w.passed, w.end).toBe(true);
      else if (w.start <= opened) expect(w.under_way, w.start).toBe(true);
      else expect(w.passed ?? w.under_way, w.start).toBeUndefined();
    }
    expect(wins.some((w: { passed?: boolean }) => w.passed)).toBe(true);

    const onTime = JSON.parse(buildUserPayload(input.question, chart, timing, { tellTime: true }));
    expect(onTime.opened_on).toBeUndefined();
    expect(JSON.stringify(onTime)).not.toMatch(/"passed"|"under_way"|today_hours_passed/);
    // the light tier never sees the calendar, late or not
    const light = JSON.parse(buildUserPayload(input.question, chart, timing, { tellTime: false, openedOn: opened }));
    expect(light.opened_on).toBeUndefined();
  });

  it("the prompt carries the rule only when the reading is opened late", () => {
    expect(deepSystem("zh-hant", { late: true })).toContain(LATE_OPENING_NOTE);
    expect(deepSystem("zh-hant", {})).not.toContain("OPENED LATER");
  });

  it("lateTimingOffense: relative days in the timing field, per language; dates and other fields pass", () => {
    expect(lateTimingOffense({ timing: "明天會有消息。" }, "zh-hant")).toBe("late:明天");
    expect(lateTimingOffense({ timing: "10月5日前後那一次已經過去了，下一次在10月12日前後。" }, "zh-hant")).toBeNull();
    expect(lateTimingOffense({ timing: "Expect word tomorrow." }, "en")).toBe("late:tomorrow");
    expect(lateTimingOffense({ timing: "Am 12. Oktober, eher am Morgen." }, "de")).toBeNull(); // Morgen = morning
    expect(lateTimingOffense({ timing: "10月12日ごろ", next_step: "今日は履歴書を直す" }, "ja")).toBeNull();
  });

  it("generateReading: a late deep reading gets the rule and the day, and one rewrite when the timing says 'tomorrow'", async () => {
    const base = {
      verdict: "It can work out, but only after they take their time.",
      tendency: "Slow at first, then it turns your way.",
      other_side: "They are still comparing a few people and want more time.",
      basis: "The Officer line is strong in the month and the day supports it.",
      strategy: "Send one short, warm follow-up and then let them decide.",
      caution: "Do not chase them with several messages in one week.",
      next_step: "Today, write a three-line thank-you note and send it.",
      signals: "If they ask for references, it is moving. If two weeks pass in silence, look elsewhere.",
      closing: "Patience here is part of the answer, not a delay.",
    };
    llm.json.push(JSON.stringify({ ...base, timing: "You should hear back tomorrow." }));
    llm.json.push(JSON.stringify({ ...base, timing: "The first window, around October 5, has gone by; watch October 12 to 16." }));
    const out = await generateReading("deep", input, true, "en") as unknown as Record<string, Record<string, string>>;
    expect(llm.calls.length).toBe(2);
    const [system, user] = llm.calls[0]!;
    expect(system!.content).toContain("OPENED LATER");
    expect(JSON.parse(user!.content).opened_on).toBe(localIsoDate(Date.now(), TZ));
    expect(llm.calls[1]!.at(-1)!.content).toMatch(/REWRITE REQUIRED.*opens this reading on/);
    expect(out.timing!.en).toContain("October 12");
  });

  it("an on-time deep reading is untouched: no rule, no day, no extra call", async () => {
    llm.json.push(JSON.stringify({
      verdict: "It can work out, but only after they take their time.", tendency: "Slow at first, then it turns your way.",
      other_side: "They are still comparing a few people and want more time.", timing: "Watch October 12 to 16; if nothing by the 16th, let this round go.",
      basis: "The Officer line is strong in the month and the day supports it.", strategy: "Send one short, warm follow-up and then let them decide.",
      caution: "Do not chase them with several messages in one week.", next_step: "Today, write a three-line thank-you note and send it.",
      signals: "If they ask for references, it is moving. If two weeks pass in silence, look elsewhere.", closing: "Patience here is part of the answer, not a delay.",
    }));
    await generateReading("deep", { ...input, castAtMs: Date.now() - 60_000 }, true, "en");
    expect(llm.calls.length).toBe(1);
    expect(llm.calls[0]![0]!.content).not.toContain("OPENED LATER");
    expect(JSON.parse(llm.calls[0]![1]!.content).opened_on).toBeUndefined();
  });

  it("timingHint for a figure brought back days later: charted at its own instant, only windows still ahead counted", () => {
    const stale = timingHint(input as never);                       // the old behaviour: charted at "now"
    const kept = timingHint(input as never, { stored: true, asOf: NOW });
    const plan = resolveTiming(input, resolveServerChart(input, true), true);
    const ahead = plan.candidates.filter((c) => c.kind !== "hour").flatMap((c) => c.windows.map((w) => w.core ?? w.start)).filter((d) => d >= localIsoDate(NOW, TZ));
    if (ahead.length) {
      expect(kept!.first >= localIsoDate(NOW, TZ)).toBe(true);
      expect(kept!.first).toBe([...ahead].sort()[0]);
    } else {
      expect(kept).toBeNull();
    }
    // a fresh cast is unchanged by the new options
    const fresh = { ...input, castAtMs: NOW - 60_000 };
    expect(timingHint(fresh as never, { stored: true, asOf: NOW })).toEqual(timingHint(fresh as never));
    void stale;
  });
});
