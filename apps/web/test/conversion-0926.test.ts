import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { fuzzyWhen } from "../src/lib/fuzzy-when";
import { timingHint } from "../src/lib/timing-hint";
import { THREAD_T } from "../src/lib/dict/thread";
import { LOCALES } from "../src/lib/locales";

describe("转化 09-26：价格旁的应期提示、挽回与大陆说明", () => {
  it("says the part of the month, never the day", () => {
    expect(fuzzyWhen("2026-10-06", "zh-hant")).toBe("10月上旬");
    expect(fuzzyWhen("2026-10-15", "zh")).toBe("10月中旬");
    expect(fuzzyWhen("2026-10-28", "ja")).toBe("10月下旬");
    expect(fuzzyWhen("2026-10-06", "en")).toBe("early October");
    expect(fuzzyWhen("2026-10-15", "en")).toBe("mid-October");
    expect(fuzzyWhen("2026-10-28", "de")).toBe("Ende Oktober");
    for (const l of LOCALES) expect(fuzzyWhen("2026-11-03", l), l).not.toMatch(/\b3\b|03/);
  });

  it("counts the chart's own windows, from today on", () => {
    const V: LineValue[] = [7, 8, 9, 8, 7, 6];
    const h = timingHint({ question: "这个月能拿到offer吗", values: V, castAtMs: Date.UTC(2026, 8, 26, 4), tzOffsetMinutes: 480 });
    expect(h).not.toBeNull();
    expect(h!.n).toBeGreaterThan(0);
    expect(h!.first >= "2026-09-26").toBe(true);
  });

  it("every new line exists in all nine languages with the same placeholders", () => {
    const keys = ["payBackTitle", "payBackWallet", "payBackDeclined", "payBackDebit", "payBackSafe", "payBackCur", "payBackGo", "payBackFirst", "cnPayTitle", "cnPayBody", "cnPayGo", "cnPayCancel", "gatePrior", "teaserTiming", "teaserTimingIn"] as const;
    for (const l of LOCALES) {
      const table = (THREAD_T as unknown as Record<string, Record<string, string>>)[l]!;
      for (const k of keys) {
        expect(table[k], `${l}.${k}`).toBeTruthy();
        const want = (THREAD_T.zh[k].match(/\{\w+\}/g) ?? []).sort().join();
        expect((table[k]!.match(/\{\w+\}/g) ?? []).sort().join(), `${l}.${k}`).toBe(want);
      }
    }
  });
});
