import { describe, expect, it } from "vitest";
import { checkFacts } from "../src/lib/public-event";
import { buildUserPayload, deepSystem, oneSystem, resolveServerChart } from "../src/lib/reading";
import type { LineValue } from "@yaoflow/engine";

/** 11-05 进度表 140: what the search returns is kept only when the program's checks pass */
const TODAY = "2026-11-05";
const two = ["https://esports.gg/a", "https://www.redbull.com/b"];

describe("140 public event facts", () => {
  it("keeps an upcoming final with two real sources", () => {
    const f = checkFacts({ event: "Worlds 2026 final", date: "2026-11-14", status: "upcoming" }, two, TODAY)!;
    expect(f).toMatchObject({ date: "2026-11-14", status: "upcoming" });
    expect(f.sources).toEqual(["esports.gg", "redbull.com"]);
  });
  it("drops one source, mirror sites, impossible dates and results claimed for days ahead", () => {
    expect(checkFacts({ event: "x", date: "2026-11-14", status: "upcoming" }, [two[0]!], TODAY)).toBeNull();
    expect(checkFacts({ event: "x", date: "2026-11-14", status: "upcoming" }, [two[0]!, "https://tournaments-x.vercel.app/news/1"], TODAY)).toBeNull();
    expect(checkFacts({ event: "x", date: "2026-11-14", status: "decided", result: "T1 won" }, two, TODAY)).toBeNull();
    expect(checkFacts({ event: "x", date: "2026-11-01", status: "upcoming" }, two, TODAY)).toBeNull();
    expect(checkFacts({ event: "x", date: "2026-13-40", status: "upcoming" }, two, TODAY)).toBeNull();
    expect(checkFacts({ event: "x", date: "2026-11-01", status: "decided" }, two, TODAY)).toBeNull(); // decided needs the result
    expect(checkFacts({ status: "unknown" }, two, TODAY)).toBeNull();
  });
  it("keeps a decided result whose day has passed", () => {
    expect(checkFacts({ event: "x 2026", date: "2026-11-02", status: "decided", result: "A won" }, two, TODAY)?.result).toBe("A won");
  });
  it("11-09 T-034: a result for yesterday or today (another time zone's day), without this edition's year, or reported before it happened is dropped", () => {
    const T = "2026-11-09";
    expect(checkFacts({ event: "2026 Worlds semifinal T1 vs BLG", date: "2026-11-08", status: "decided", result: "T1 won" }, two, T)).toBeNull();
    expect(checkFacts({ event: "2026 Worlds semifinal", date: "2026-11-09", status: "decided", result: "T1 won" }, two, T)).toBeNull();
    expect(checkFacts({ event: "Worlds semifinal T1 vs BLG", date: "2026-11-06", status: "decided", result: "T1 won" }, two, T)).toBeNull();
    expect(checkFacts({ event: "2026 Worlds quarterfinal", date: "2026-11-06", status: "decided", result: "T1 won", reported: "2024-11-02" }, two, T)).toBeNull();
    expect(checkFacts({ event: "2026 Worlds quarterfinal", date: "2026-11-06", status: "decided", result: "T1 won", reported: "2026-11-06" }, two, T)?.status).toBe("decided");
  });
  it("11-09 T-034: the follow-up prompt carries the rule only when there are facts", async () => {
    const { followupSystem } = await import("../src/lib/reading");
    expect(followupSystem("deep", "zh-hant", { publicEvent: true })).toContain("PUBLIC EVENT");
    expect(followupSystem("deep", "zh-hant")).not.toContain("PUBLIC EVENT");
  });
  it("the facts reach the payload and both prompts carry the rule", () => {
    const values: LineValue[] = [7, 8, 9, 8, 7, 8];
    const input = { question: "決賽誰會贏", values, castAtMs: Date.UTC(2026, 10, 5, 4), tzOffsetMinutes: 480 };
    const p = JSON.parse(buildUserPayload(input.question, resolveServerChart(input), undefined, { publicEvent: { event: "Final", date: "2026-11-14", status: "upcoming", sources: ["a.com", "b.com"] } }));
    expect(p.public_event).toEqual({ event: "Final", date: "2026-11-14", status: "upcoming" });
    expect(p.public_event.sources).toBeUndefined();
    expect(oneSystem("zh-hant")).toContain("PUBLIC EVENT");
    expect(deepSystem("zh-hant")).toContain("PUBLIC EVENT");
  });
});
