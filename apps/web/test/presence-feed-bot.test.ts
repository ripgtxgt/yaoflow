import { describe, expect, it } from "vitest";
import { _resetPresence, snapshot, touch } from "../src/lib/presence";

/** 11-04: a headless browser opening hexagram pages every few seconds filled the live feed; bots stay off it, as off the counts. */
describe("the live feed leaves bots out", () => {
  it("a headless tab's page views are not in the feed; a reader's are", () => {
    _resetPresence();
    const t = Date.now();
    touch({ s: "botfeed00001", t, e: "page_view", path: "/zh/gua/43-guai", locale: "zh", device: "bot", replay: true });
    touch({ s: "rdrfeed00001", t: t + 1, e: "page_view", path: "/zh-hant/cast", locale: "zh-hant", device: "phone", replay: true });
    const snap = snapshot(t + 2);
    expect(snap.feed.map((f) => f.s)).toEqual(["rdrfeed00001"]);
    expect(snap.online).toBe(1);
  });
});
