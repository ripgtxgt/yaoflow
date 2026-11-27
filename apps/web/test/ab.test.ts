import { describe, expect, it } from "vitest";
import { abStats } from "../src/lib/ab-stats";
import type { TrackedEvent } from "../src/lib/analytics-server";

describe("对照测试统计（09-26）", () => {
  it("splits sessions by each bit and counts the funnel", () => {
    const ev = (s: string, e: TrackedEvent["e"], ab: string, method?: string): TrackedEvent => ({ t: 1, s, e, ab, ...(method ? { method } : {}) });
    const evs = [
      ev("a", "teaser_shown", "f1o0"), ev("a", "reading_click", "f1o0", "free_ok"),
      ev("b", "teaser_shown", "f0o1"), ev("b", "reading_click", "f0o1"), ev("b", "checkout_start", "f0o1"),
      ev("c", "teaser_shown", "f0o0"),
    ];
    const r = abStats(evs, new Set(["b"]));
    expect(r.free.find((x) => x.arm === "1")).toMatchObject({ sessions: 1, free: 1, paid: 0 });
    expect(r.free.find((x) => x.arm === "0")).toMatchObject({ sessions: 2, teased: 2, checkout: 1, paid: 1 });
    expect(r.odds.find((x) => x.arm === "1")).toMatchObject({ sessions: 1, paid: 1 });
  });

  it("09-28: two more bits (one price / verdict paragraph); old four-character tags sit in neither new arm", () => {
    const ev = (s: string, e: TrackedEvent["e"], ab: string): TrackedEvent => ({ t: 1, s, e, ab });
    const evs = [ev("a", "teaser_shown", "f1o0p1v0"), ev("b", "teaser_shown", "f0o1p0v1"), ev("c", "teaser_shown", "f0o0")];
    const r = abStats(evs, new Set(["a"]));
    expect(r.onePrice.find((x) => x.arm === "1")).toMatchObject({ sessions: 1, paid: 1 });
    expect(r.onePrice.find((x) => x.arm === "0")).toMatchObject({ sessions: 1, paid: 0 });
    expect(r.verdict.find((x) => x.arm === "1")).toMatchObject({ sessions: 1 });
    expect(r.free.find((x) => x.arm === "0")!.sessions).toBe(2); // the old tag still counts for f/o
  });
});
