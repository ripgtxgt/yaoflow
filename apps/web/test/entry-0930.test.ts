import { describe, expect, it } from "vitest";
import { homeAbStats } from "../src/lib/ab-stats";
import { AB_RE, HOME_AB_SCRIPT, HOME_BIT } from "../src/lib/ab";
import { ENTRY_T } from "../src/lib/dict/entry";
import { LOCALES } from "../src/lib/locales";

/** 09-30 (Neil: 「1，2，3都做吧」): home hero test, the share card's door, the topic cap's exits. */
describe("the home hero test (bit h)", () => {
  it("adds a fifth bit to the tag and still accepts the older tags", () => {
    expect(AB_RE.test("f1o0p1v0h1")).toBe(true);
    expect(AB_RE.test("f1o0p1v0")).toBe(true);
    expect(AB_RE.test("f1o0")).toBe(true);
    expect(AB_RE.test("f1o0h1")).toBe(false);
    expect([0, 15, 16, 31, 32, 48].map(HOME_BIT)).toEqual([false, false, true, true, false, true]);
  });

  it("decides the arm before paint with the same draw and the same bit", () => {
    const store = new Map<string, string>([["yaoflow:ab", "17"]]);
    const attrs = new Map<string, string>();
    const run = new Function("localStorage", "document", HOME_AB_SCRIPT);
    run({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v) } });
    expect(attrs.get("data-abh")).toBe("1");
    store.set("yaoflow:ab", "3"); attrs.clear();
    run({ getItem: (k: string) => store.get(k) ?? null, setItem: () => {} }, { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v) } });
    expect(attrs.has("data-abh")).toBe(false);
  });

  it("reads the arms on the sessions that landed on the home page only", () => {
    const t = Date.UTC(2026, 8, 30, 3);
    const rows = homeAbStats([
      { t, e: "page_view", s: "a", path: "/zh-hant", ab: "f0o0p0v0h1" },
      { t: t + 1, e: "cast_start", s: "a", ab: "f0o0p0v0h1" },
      { t: t + 2, e: "cast_complete", s: "a", ab: "f0o0p0v0h1" },
      { t, e: "page_view", s: "b", path: "/zh-hant/", ab: "f0o0p0v0h0" },
      { t, e: "page_view", s: "c", path: "/zh-hant/cast", ab: "f0o0p0v0h1" },  // landed elsewhere
      { t, e: "page_view", s: "d", path: "/en", ab: "f0o0p0v0" },              // before the test
    ] as never, new Set(["a"]));
    expect(rows).toEqual([
      { arm: "0", landed: 1, started: 0, cast: 0, clicked: 0, paid: 0 },
      { arm: "1", landed: 1, started: 1, cast: 1, clicked: 0, paid: 1 },
    ]);
  });
});

describe("the copy", () => {
  it("exists in every language, with four example questions", () => {
    for (const l of LOCALES) {
      const c = ENTRY_T[l];
      expect(c, l).toBeTruthy();
      expect(c!.chips).toHaveLength(4);
      for (const v of [c!.heroTitle, c!.heroSub, c!.chipsLead, c!.shareFree, c!.capOther, ...c!.chips]) expect(v.trim().length, l).toBeGreaterThan(1);
    }
  });
});
