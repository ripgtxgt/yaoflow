import { describe, expect, it } from "vitest";

// 11-27 后台内存溢出: the overview's PAGE_KINDS readings are counted one day at a time (not kept as events), and the
// admin cache drops keys nobody reads any more.
const DAY = 86_400_000;

describe("admin overview memory (11-27)", () => {
  it("pageCounts reads the window a day at a time and keeps only counts, first tags and today's events", async () => {
    const { pageCounts } = await import("../src/lib/admin-bundle");
    const now = Date.parse("2026-11-27T06:00:00Z"); // 14:00 Taipei
    const since = now - 3 * DAY;
    const evs = [
      { t: since + 1000, e: "page_view", s: "s1", c: "threads" },
      { t: since + 2000, e: "page_view", s: "s1", c: "later" },
      { t: since + DAY, e: "daily_pick", s: "s2", method: "2" },
      { t: since + DAY + 5, e: "revisit_answer", s: "s2", method: "hit" },
      { t: now - 3_600_000, e: "visit_day", s: "s3" },
      { t: now - 60_000, e: "cast_complete", s: "s3" },
    ];
    const calls: [number, number][] = [];
    const read = (a: number, z: number) => { calls.push([a, z]); return evs.filter((e) => e.t >= a && e.t < z) as never[]; };
    const p = pageCounts(since, now, new Set(["s2"]), read as never);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const [a, z] of calls) expect(z - a).toBeLessThanOrEqual(DAY);
    expect(p.counts).toMatchObject({ page_view: 2, daily_pick: 1, revisit_answer: 1, visit_day: 1, cast_complete: 1 });
    expect(p.dailyByPile).toEqual([0, 1, 0]);
    expect(p.answers.hit).toBe(1);
    expect(p.campaignOf.get("s1")).toBe("threads");
    expect(p.today.map((e) => e.e)).toEqual(["visit_day", "cast_complete"]);
  });

  it("swr drops entries past their lifetime and keeps fresh ones", async () => {
    const { swr, refresh, sweep, swrSize, REFRESH_KEEP_MS } = await import("../src/lib/swr");
    const t0 = Date.now();
    swr("oom-test|old", 1000, 5000, () => 1, t0);
    refresh("oom-test|warm", () => 2);
    const before = swrSize();
    expect(sweep(t0 + 10_000, true)).toBeGreaterThanOrEqual(1); // the old one (5 s) goes
    expect(swrSize()).toBe(before - 1);
    expect(swr("oom-test|warm", 60_000, 60_000, () => 3)).toBe(2); // the warmed one stays
    expect(sweep(Date.now() + REFRESH_KEEP_MS + 1, true)).toBeGreaterThanOrEqual(1);
  });
});
