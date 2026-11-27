import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { resolveServerChart, resolveTiming } from "../src/lib/reading";
import { parseTimingDays } from "../src/lib/revisit";

describe("应期改成时间段（09-26）", () => {
  it("every day-level window is a five-day span that never starts before tomorrow", () => {
    const V: LineValue[] = [7, 8, 9, 8, 7, 6];
    const input = { question: "这周面试能过吗", values: V, castAtMs: Date.UTC(2026, 8, 26, 4), tzOffsetMinutes: 480 };
    const plan = resolveTiming(input, resolveServerChart(input));
    const days = plan.candidates.filter((c) => c.kind === "day").flatMap((c) => c.windows);
    expect(days.length).toBeGreaterThan(0);
    for (const w of days) {
      expect(w.end > w.start).toBe(true);
      expect(w.start > plan.today).toBe(true);
      expect(w.label_zh).toMatch(/核心\d{1,2}月\d{1,2}日/);
      const span = (Date.parse(w.end) - Date.parse(w.start)) / 86_400_000;
      expect(span).toBeLessThanOrEqual(4);
      expect(span).toBeGreaterThanOrEqual(2);
    }
  });

  it("the revisit waits for the end of a written span, not its first day", () => {
    const from = new Date(2026, 8, 26);
    expect(parseTimingDays("10月4日到8日之间，6日前后最可能", from)).toBe(13); // Oct 8 + 1 day grace
    expect(parseTimingDays("9月28日–10月2日，30日前后", from)).toBe(7);
    expect(parseTimingDays("between October 4 and 8, most likely around the 6th", from)).toBe(13);
    // 09-26 review: ordinary words are not months, and a stray far date does not push the revisit out
    expect(parseTimingDays("maybe 2 to 3 weeks, a decision around October 4 to 8", from)).toBe(13);
    // what the model actually wrote (09-26 live test): the core day comes AFTER the span
    expect(parseTimingDays("更可能在10月3日到7日之间，10月5日前后最像他开口的日子。", from)).toBe(12);
  });
});
