import { describe, expect, it } from "vitest";
import { GUA_EXAMPLES, guaExamples } from "../src/lib/dict/gua-examples";
import { guaSearchFunnel } from "../src/lib/gua-funnel";
import type { TrackedEvent } from "../src/lib/analytics-server";

/** 10-14 进度表 48 卦页情境起卦 */
describe("卦页起一卦入口", () => {
  it("three example questions for each of the 64, in 繁體 and 简体, none promising anything", () => {
    for (const l of ["zh-hant", "zh"] as const) {
      for (let n = 1; n <= 64; n++) {
        const ex = GUA_EXAMPLES[l][n]!;
        expect(ex, `${l} ${n}`).toHaveLength(3);
        for (const q of ex) { expect(q.length).toBeLessThanOrEqual(20); expect(q).not.toMatch(/準|准|AI|靈驗|灵验|神明/); }
      }
    }
    expect(guaExamples("zh-hant", 31).join()).toContain("告白");
    expect(guaExamples("zh", 1)[0]).toBe("这次升迁会轮到我吗？");
    expect(guaExamples("en", 1)).toEqual([]);
  });
  it("the funnel counts a search landing on a hexagram page through tap, cast and pay", () => {
    const ev = (s: string, t: number, e: string, extra: Partial<TrackedEvent> = {}) => ({ s, t, e, ...extra }) as TrackedEvent;
    const events = [
      ev("a", 1, "page_view", { path: "/zh-hant/gua/31-xian", ref: "www.google.com" }), ev("a", 2, "gua_cta", { method: "view", hex: 31 }),
      ev("a", 3, "gua_cta", { method: "example", hex: 31 }), ev("a", 4, "cast_complete"),
      ev("b", 1, "page_view", { path: "/zh-hant/gua/31-xian", ref: "www.bing.com" }), ev("b", 2, "gua_cta", { method: "view", hex: 31 }),
      ev("c", 1, "page_view", { path: "/zh-hant/gua/1-qian", ref: "threads.net" }),
    ];
    const f = guaSearchFunnel(events, new Set(["a"]));
    expect(f.rows).toEqual([{ hex: 31, landed: 2, saw: 2, tapped: 1, cast: 1, paid: 1 }]);
  });
});
