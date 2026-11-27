import { describe, expect, it } from "vitest";
import { bounceSessions, computeStats } from "../src/lib/analytics-server";

// 09-30 (进度表待定 21): unique visitors = visit_day (browser·day); sessions kept apart; rates over visitors
describe("独立访客口径", () => {
  const t = Date.UTC(2026, 8, 29, 4, 0); // 12:00 UTC+8, 09-29
  const evs = [
    // one reader, two tabs: one visit_day, two sessions
    { t, e: "visit_day", s: "a1", locale: "zh-hant", fd: "2026-09-20", pd: "2026-09-28", td: "2026-09-29", c: "threads" },
    { t, e: "page_view", s: "a1", locale: "zh-hant", c: "threads" },
    { t: t + 1, e: "cast_complete", s: "a1", locale: "zh-hant" },
    { t: t + 2, e: "reading_click", s: "a1", tier: "deep" },
    { t: t + 3, e: "purchase", s: "a1", method: "paid", tier: "deep" },
    { t: t + 4, e: "page_view", s: "a2", locale: "zh-hant" },
    // a newcomer who casts
    { t, e: "visit_day", s: "b1", locale: "en", fd: "2026-09-29", td: "2026-09-29" },
    { t, e: "page_view", s: "b1", locale: "en" },
    { t: t + 1, e: "cast_complete", s: "b1", locale: "en" },
    // a bounce: one page, gone in 1.2 s — a visitor, but listed as a bounce too
    { t, e: "visit_day", s: "c1", locale: "en", fd: "2026-09-29", td: "2026-09-29" },
    { t, e: "page_view", s: "c1", locale: "en" },
    { t: t + 1200, e: "page_leave", s: "c1", ms: 1200, depth: 10 },
    // a retried visit_day from the same browser is one visitor
    { t: t + 5, e: "visit_day", s: "c1", locale: "en", fd: "2026-09-29", td: "2026-09-29" },
    // server-side pseudo session: never a visitor or a session
    { t, e: "gift", s: "gf1", tier: "deep" },
  ] as never;

  it("counts browser·days, not tabs", () => {
    const s = computeStats(evs);
    expect(s.funnel.visitors).toBe(3);
    expect(s.funnel.sessions).toBe(4);
    expect(s.funnel.firstVisits).toBe(2);
    expect(s.funnel.returnVisits).toBe(1);
    expect(s.funnel.bounces).toBe(1);
    expect(s.byDay).toEqual([expect.objectContaining({ day: "2026-09-29", visitors: 3, sessions: 4, bounces: 1 })]);
  });

  it("takes the rates over unique visitors, overall, by language and by channel", () => {
    const s = computeStats(evs);
    expect(s.rates.activation).toBe(66.7); // 2 casting sessions / 3 visitors
    expect(s.rates.priceRate).toBe(33.3);
    expect(s.rates.payRate).toBe(33.3);
    expect(s.byLocaleFunnel.find((r) => r.locale === "en")).toEqual(expect.objectContaining({ visitors: 2, sessions: 2, casts: 1 }));
    expect(s.byLocaleFunnel.find((r) => r.locale === "zh-hant")).toEqual(expect.objectContaining({ visitors: 1, sessions: 2 }));
    expect(s.byChannel.find((r) => r.c === "threads")).toEqual(expect.objectContaining({ visitors: 1, sessions: 1 }));
  });

  it("a bounce is one page, under 3 s, nothing else; no leave event is not a bounce", () => {
    const b = bounceSessions([
      { t, e: "page_view", s: "x" }, { t, e: "page_leave", s: "x", ms: 900 },
      { t, e: "page_view", s: "y" }, { t, e: "page_leave", s: "y", ms: 4000 },
      { t, e: "page_view", s: "z" },
      { t, e: "page_view", s: "w" }, { t, e: "heat_click", s: "w", method: "x" }, { t, e: "page_leave", s: "w", ms: 800 },
    ] as never);
    expect([...b]).toEqual(["x"]);
  });
});
