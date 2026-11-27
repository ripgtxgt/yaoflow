import { describe, expect, it } from "vitest";
import { focusCast, memberDaily, type DailyKind } from "../src/lib/member-daily";
import { THREAD_T } from "../src/lib/dict/thread";
import { LOCALES } from "../src/lib/locales";
import type { ThreadCast } from "../src/lib/db";

const DAY = 86_400_000;
const base: ThreadCast = {
  id: 1, created_at: Date.UTC(2026, 8, 20), cast_at: Date.UTC(2026, 8, 20, 3), tz_offset: 480, locale: "zh", question: "这份合约能签下来吗", topic: "career",
  values_str: "7,8,9,8,7,6", primary_num: 1, changed_num: null, tier: "deep", session_id: "cs_x", followups: 0, notes: 0,
  revisit_id: 9, due_at: Date.UTC(2026, 9, 10), timing_quote: null, outcome: null,
};

describe("会员今日一卦（09-26）", () => {
  it("is rules, not dice: same day same line, and it turns with the days", () => {
    const now = Date.UTC(2026, 8, 26, 4);
    const a = memberDaily(base, now)!, b = memberDaily(base, now)!;
    expect(a).toEqual(b);
    const kinds = new Set<DailyKind>();
    for (let i = 0; i < 12; i++) kinds.add(memberDaily(base, now + i * DAY)!.kind);
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    expect(kinds.has("zhi")).toBe(true);   // the focal branch comes round once in twelve days
    expect(kinds.has("chong")).toBe(true);
  });

  it("follows the matter still waiting on its window, else the latest deep cast", () => {
    const now = Date.UTC(2026, 8, 26);
    const waiting = { ...base, id: 2 };
    const settled = { ...base, id: 3, created_at: now - DAY, outcome: "hit" };
    expect(focusCast([settled, waiting], now)?.id).toBe(2);
    expect(focusCast([{ ...base, tier: "one" }], now)).toBeNull();
    expect(focusCast([{ ...base, revisit_id: null, created_at: now - 90 * DAY }], now)).toBeNull();
  });

  it("every line exists in all nine languages", () => {
    for (const l of LOCALES) {
      const t = (THREAD_T as unknown as Record<string, Record<string, string>>)[l]!;
      for (const k of ["zhi", "chong", "he", "sheng", "ke", "xie", "hao", "bi"]) expect(t[`dK_${k}`], `${l} ${k}`).toBeTruthy();
      expect(t.dailyTitle).toContain("{gz}");
    }
  });
});
