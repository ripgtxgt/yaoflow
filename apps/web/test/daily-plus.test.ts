import { describe, expect, it } from "vitest";
import { claimDailySend, confirmDailySub, dailyStats, dailySubsDue, dailyVote, requestDailySub, unsubDaily } from "../src/lib/db";
import { dailyUnsubUrl, dailyUnsubValid, localHour } from "../src/lib/daily-mail";
import { buildDailyEmail } from "../src/lib/email";
import { DAILY_PLUS_T } from "../src/lib/dict/daily-plus";

describe("今天的三卦 互动（09-26）", () => {
  it("counts picks and reactions per browser session, once each", () => {
    const day = "2099-01-01";
    dailyVote(day, "bsaaaaaa", 1, null);
    dailyVote(day, "bsaaaaaa", 1, null);
    dailyVote(day, "bsaaaaaa", 1, "hit");
    dailyVote(day, "bsbbbbbb", 2, null);
    dailyVote(day, "bscccccc", 1, "miss");
    expect(dailyStats(day, 1)).toEqual({ visitors: 3, pickers: 2, hits: 1, reactions: 2 });
  });

  it("the daily letter needs the confirmation click, is sent once a day, and stops on unsubscribe", () => {
    const row = requestDailySub("daily-a@example.com", "zh-hant", "Asia/Taipei", "a".repeat(36));
    expect(dailySubsDue("2099-01-02").some((r) => r.id === row.id)).toBe(false); // not confirmed
    confirmDailySub("a".repeat(36));
    expect(dailySubsDue("2099-01-02").some((r) => r.id === row.id)).toBe(true);
    expect(claimDailySend(row.id, "2099-01-02")).toBe(true);
    expect(claimDailySend(row.id, "2099-01-02")).toBe(false);
    unsubDaily("daily-a@example.com");
    expect(dailySubsDue("2099-01-03").some((r) => r.id === row.id)).toBe(false);
    // asking again after unsubscribing needs a fresh confirmation
    requestDailySub("daily-a@example.com", "zh-hant", null, "b".repeat(36));
    expect(dailySubsDue("2099-01-03").some((r) => r.id === row.id)).toBe(false);
  });

  it("unsubscribe links are signed per list, and the letter names the three piles", () => {
    process.env.UNSUB_SECRET ??= "test-secret";
    const url = new URL(dailyUnsubUrl("Daily-B@example.com", "en"));
    expect(dailyUnsubValid("daily-b@example.com", url.searchParams.get("t")!)).toBe(true);
    expect(dailyUnsubValid("other@example.com", url.searchParams.get("t")!)).toBe(false);
    const m = buildDailyEmail({ locale: "zh-hant", names: ["乾為天", "坤為地", "水雷屯"], todayUrl: "https://x/today", unsubUrl: url.toString() });
    expect(m.subject).toContain("乾為天");
    expect(m.html).toContain("坤為地");
    expect(m.text).toContain(url.toString());
    expect(localHour("Asia/Taipei", Date.UTC(2026, 8, 26, 0))).toBe(8);
    expect(Object.keys(DAILY_PLUS_T).length).toBe(9);
  });
});
