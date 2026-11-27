import { describe, expect, it } from "vitest";
import type { TrackedEvent } from "../src/lib/analytics-server";
import { qianSearchFunnel } from "../src/lib/qian-funnel";

/** 10-13 进度表 40 ⑥: the lot pages as a search door, per set. */
describe("籤页搜索落地 · 分套漏斗", () => {
  const ev = (s: string, t: number, e: string, extra: Partial<TrackedEvent> = {}) => ({ s, t, e, locale: "zh-hant", ...extra }) as TrackedEvent;
  const G = "https://www.google.com/";
  const events: TrackedEvent[] = [
    // a 關帝 lot from Google, read it, cast, paid
    ev("a", 1, "page_view", { path: "/zh-hant/qian/guandi/23", ref: G }),
    ev("a", 2, "page_leave", { path: "/zh-hant/qian/guandi/23", ms: 40_000, depth: 80 }),
    ev("a", 3, "cast_complete", { path: "/zh-hant/cast" }),
    // a 觀音 lot from Bing, bounced
    ev("b", 1, "page_view", { path: "/zh-hant/qian/guanyin/61", ref: "https://www.bing.com/" }),
    ev("b", 2, "page_leave", { path: "/zh-hant/qian/guanyin/61", ms: 3_000, depth: 10 }),
    // the entry page from Google, drew a lot (result page counts as read)
    ev("c", 1, "page_view", { path: "/zh-hant/jieqian", ref: G }),
    ev("c", 2, "page_view", { path: "/zh-hant/jieqian/r/abcdef0123456789abcdef01" }),
    // not from a search engine: not counted
    ev("d", 1, "page_view", { path: "/zh-hant/qian/guandi/1", ref: "https://www.threads.net/" }),
    // from Google but the first page is not a lot page: not counted
    ev("e", 1, "page_view", { path: "/zh-hant", ref: G }),
    ev("e", 2, "page_view", { path: "/zh-hant/qian/guandi/2" }),
  ];

  it("counts landings per set and how far each went", () => {
    const f = qianSearchFunnel(events, new Set(["a"]));
    expect(f.total).toEqual({ key: "total", landed: 3, read: 2, cast: 1, paid: 1 });
    expect(f.rows.find((r) => r.key === "guandi")).toEqual({ key: "guandi", landed: 1, read: 1, cast: 1, paid: 1 });
    expect(f.rows.find((r) => r.key === "guanyin")).toEqual({ key: "guanyin", landed: 1, read: 0, cast: 0, paid: 0 });
    expect(f.rows.find((r) => r.key === "entry")).toEqual({ key: "entry", landed: 1, read: 1, cast: 0, paid: 0 });
  });
});
