import { describe, expect, it } from "vitest";
import { homeDay, homeDayStart, homeMinute, localDay } from "../src/lib/clock";
import { computeStats } from "../src/lib/analytics-server";

/** 09-14: everything we read ourselves is on Neil's clock (UTC+8); what a reader sees stays on theirs. */
describe("the house clock", () => {
  it("shifts UTC instants to UTC+8, across midnight", () => {
    const t = Date.UTC(2026, 8, 10, 17, 30); // 2026-09-10 17:30 UTC = 09-11 01:30 in Shanghai
    expect(homeMinute(t)).toBe("2026-09-11 01:30");
    expect(homeDay(t)).toBe("2026-09-11");
    expect(homeMinute(Date.UTC(2026, 8, 10, 7, 57))).toBe("2026-09-10 15:57");
    expect(homeDayStart(t)).toBe(Date.UTC(2026, 8, 10, 16)); // 00:00 UTC+8 on 09-11 = 16:00 UTC on 09-10
    expect(homeDay(homeDayStart(t))).toBe("2026-09-11");
    expect(homeDay(homeDayStart(t) - 1)).toBe("2026-09-10");
  });

  it("dates a cast by the caster's own offset, not ours", () => {
    const t = Date.UTC(2026, 8, 10, 23, 0); // 23:00 UTC on 09-10
    expect(localDay(t, 480)).toBe("2026-09-11");   // Shanghai, 07:00 next morning
    expect(localDay(t, -420)).toBe("2026-09-10");  // Los Angeles, 16:00 same day
    expect(localDay(t, 0)).toBe("2026-09-10");
  });

  it("buckets the dashboard's Daily table by UTC+8 days", () => {
    const s = computeStats([
      { t: Date.UTC(2026, 8, 10, 15, 0), e: "page_view", s: "a", locale: "zh" },   // 23:00 UTC+8 on 09-10
      { t: Date.UTC(2026, 8, 10, 17, 0), e: "page_view", s: "b", locale: "zh" },   // 01:00 UTC+8 on 09-11
    ] as never);
    expect(s.byDay.map((d) => d.day)).toEqual(["2026-09-10", "2026-09-11"]);
  });

  it("tells casting sessions, figures cast and readings delivered apart in the Daily table (09-16)", () => {
    const t = Date.UTC(2026, 8, 16, 3, 0); // 11:00 UTC+8 on 09-16
    const s = computeStats([
      { t, e: "page_view", s: "a", locale: "zh-hant" },
      { t: t + 1, e: "cast_complete", s: "a", locale: "zh-hant" },
      { t: t + 2, e: "cast_complete", s: "a", locale: "zh-hant" },   // the same reader casts again
      { t: t + 3, e: "reading_click", s: "a", tier: "deep" },
      // 09-17: the gate ate a tap from another reader — intent, counted separately
      { t: t + 5, e: "reading_click_blocked", s: "b", tier: "deep", method: "cap" },
      { t: t + 4, e: "gift_claim", s: "a", tier: "deep", method: "email" },
      { t: t + 5, e: "gift", s: "gf1", tier: "deep" },               // delivered (server-side)
      { t: t + 6, e: "page_view", s: "b" },
      { t: t + 7, e: "cast_complete", s: "b" },                     // cast, then left at the price buttons
    ] as never);
    // the server-side gift event's pseudo-session is not a visitor
    // 09-30: no visit_day in this log (before 09-23) → unique visitors unknown, sessions still 2
    expect(s.byDay).toEqual([{ day: "2026-09-16", visitors: null, sessions: 2, bounces: 0, casters: 2, casts: 3, taps: 1, tapsBlocked: 1, claims: 1, readings: 1, purchases: 0 }]);
    expect(s.funnel.sessions).toBe(2);
    expect(s.funnel.visitors).toBe(0);
    expect(s.funnel.gifts).toBe(1);
  });

  it("splits the funnel by the language a session read in; delivered readings count under their own language (09-18)", () => {
    const t = Date.UTC(2026, 8, 18, 3, 0);
    const s = computeStats([
      { t, e: "page_view", s: "a", locale: "zh-hant" },
      { t: t + 1, e: "cast_complete", s: "a", locale: "zh-hant" },
      { t: t + 2, e: "reading_click", s: "a", locale: "zh-hant", tier: "deep" },
      { t: t + 3, e: "gift_claim", s: "a", locale: "zh-hant", tier: "deep", method: "email" },
      { t: t + 4, e: "gift", s: "gf1", locale: "zh", tier: "deep" },      // asked in Simplified → the reading followed the question
      { t: t + 5, e: "page_view", s: "b", locale: "en" },
      { t: t + 6, e: "cast_complete", s: "b", locale: "en" },
      { t: t + 7, e: "page_view", s: "c", locale: "en" },                  // looked and left
    ] as never);
    expect(s.byLocaleFunnel).toEqual([
      { locale: "en", visitors: 0, sessions: 2, casts: 1, clicks: 0, claims: 0, readings: 0, purchases: 0 },
      { locale: "zh-hant", visitors: 0, sessions: 1, casts: 1, clicks: 1, claims: 1, readings: 0, purchases: 0 },
      { locale: "zh", visitors: 0, sessions: 0, casts: 0, clicks: 0, claims: 0, readings: 1, purchases: 0 },
    ]);
  });
});

describe("the overview's ▲▼ against the previous window (09-18)", () => {
  it("reads as a rounded percentage, '新' from nothing, and '—' when both are empty", async () => {
    const { deltaLabel } = await import("../src/app/admin/ui");
    expect(deltaLabel(653, 581)).toEqual({ text: "▲ 12%", tone: "up" });
    expect(deltaLabel(134, 150)).toEqual({ text: "▼ 11%", tone: "down" });
    expect(deltaLabel(1322, 50)).toEqual({ text: "▲ 26.4×", tone: "up" });   // a promotion week against a quiet one reads as a multiple, not 2544%
    expect(deltaLabel(10, 10)).toEqual({ text: "持平", tone: "flat" });
    expect(deltaLabel(3, 0)).toEqual({ text: "新", tone: "up" });
    expect(deltaLabel(0, 0)).toEqual({ text: "—", tone: "flat" });
  });
});
