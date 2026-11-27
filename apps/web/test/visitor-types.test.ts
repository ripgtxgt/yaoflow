import { describe, expect, it } from "vitest";
import { visitorTypes } from "../src/lib/analytics-server";

/** 09-30: 新客的转化率 / 回访客的使用频率 — every event carries vt/vn, paid comes back via the order's browser session. */
describe("new vs returning visitors", () => {
  const t = Date.UTC(2026, 8, 30, 3, 0);
  const evs = [
    { t, e: "visit_day", s: "a", vt: "n", vn: 1, fd: "2026-09-30", td: "2026-09-30" },
    { t: t + 1, e: "page_view", s: "a", vt: "n", vn: 1 },
    { t: t + 2, e: "cast_complete", s: "a", vt: "n", vn: 1 },
    { t: t + 3, e: "cast_complete", s: "a2", vt: "n", vn: 1 },          // a second tab of the same new reader — still new
    { t: t + 4, e: "reading_click", s: "a2", vt: "n", vn: 1 },
    { t: t + 5, e: "checkout_start", s: "a2", vt: "n", vn: 1 },
    { t, e: "visit_day", s: "b", vt: "r", vn: 3, fd: "2026-09-25", pd: "2026-09-29", td: "2026-09-30" },
    { t: t + 1, e: "cast_complete", s: "b", vt: "r", vn: 3 },
    { t: t + 2, e: "cast_complete", s: "b", vt: "r", vn: 3 },
    { t, e: "visit_day", s: "c", vt: "r", vn: 9, fd: "2026-09-01", pd: "2026-09-20", td: "2026-09-30" },
    { t: t + 9, e: "page_view", s: "old" },                               // shipped before the flag: not counted
  ];
  const v = visitorTypes(evs as never, new Set(["a2", "zzz"]));

  it("splits every session, and joins payments back through the order's browser session", () => {
    expect(v.new).toMatchObject({ visitors: 1, sessions: 2, casters: 2, clickers: 1, checkout: 1, paid: 1 });
    expect(v.back).toMatchObject({ visitors: 2, sessions: 2, casters: 1, paid: 0, casts: 2 });
    expect(v.since).toBe(t);
  });

  it("describes how often returning readers come", () => {
    expect(v.castsPerReturnDay).toBe(1);
    expect(v.byVisitDay).toEqual([{ label: "第 2 天", n: 0 }, { label: "第 3 天", n: 1 }, { label: "第 4–7 天", n: 0 }, { label: "第 8 天以后", n: 1 }]);
    expect(v.byGap.find((g) => g.label === "隔天就回来")!.n).toBe(1);
    expect(v.byGap.find((g) => g.label === "隔 8 天以上")!.n).toBe(1);
  });
});
