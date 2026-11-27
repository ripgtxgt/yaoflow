import { describe, expect, it } from "vitest";
import { adviceOffense, tidyTeaser } from "../src/lib/teaser";
import { OPENING_NOTE, deepSystem, oneSystem, openingOffense, teaserSystem } from "../src/lib/reading";

/**
 * 09-19, Neil: 80% of casters never tap a price; a third of them keep
 * re-casting instead. One free sentence of the call goes above the price —
 * and the paid reading has to open with that same sentence.
 */
describe("the free line", () => {
  it("keeps exactly one clean sentence and drops anything that is not one", () => {
    expect(tidyTeaser("斷語：「這段關係現在不是談能修好的，是退才保得住。」", "zh-hant")).toBe("這段關係現在不是談能修好的，是退才保得住。");
    expect(tidyTeaser("這件事成得了，但成在你先讓一步之後。 後面還有更多。", "zh-hant")).toBe("這件事成得了，但成在你先讓一步之後。");
    expect(tidyTeaser("This leans your way, but only after you stop pushing. And more.", "en")).toBe("This leans your way, but only after you stop pushing.");
    expect(tidyTeaser("  ", "en")).toBeNull();
    expect(tidyTeaser("好", "zh")).toBeNull();                       // too short to be a call
    expect(tidyTeaser('{"verdict":"…"}', "en")).toBeNull();          // JSON leaked through
    expect(tidyTeaser("這" .repeat(70) + "。", "zh-hant")).toBeNull(); // a paragraph, not a line
  });

  it("never gives the next step away for free (the first live line said 先別急著簽約)", () => {
    expect(adviceOffense("你想搬去台中讓日子更順，這股想望本身是對的，但你自己其實還沒真正下定決心，所以先別急著簽約。", "zh-hant")).toBe(true);
    expect(adviceOffense("這件事成得了，但成在你先讓一步之後。", "zh-hant")).toBe(false);
    expect(adviceOffense("This leans your way, but you should hold off until the money is real.", "en")).toBe(true);
    expect(adviceOffense("This leans your way, but only after you stop pushing.", "en")).toBe(false);
    // 11-06: 「應該會」 is "probably", not advice; 「你應該先」 still is
    expect(adviceOffense("這份工作應該會有回音，只是比你想的慢一些。", "zh-hant")).toBe(false);
    expect(adviceOffense("他应该是在意你的，只是还没准备好说出口。", "zh")).toBe(false);
    expect(adviceOffense("這件事你應該先放一放。", "zh-hant")).toBe(true);
  });

  it("asks for one plain sentence: no dates, no steps, no chart vocabulary, and the still-chart lean stays binding", () => {
    const p = teaserSystem("zh-hant");
    expect(p).toMatch(/ONE sentence/);
    expect(p).toMatch(/NO timing/);
    expect(p).toMatch(/NO hexagram names/);
    expect(p).toMatch(/static_read/);
    expect(p).toMatch(/plain text, no quotes/);
    expect(teaserSystem("zh-hant", { register: "yue" })).toMatch(/WRITTEN CANTONESE/);
    expect(teaserSystem("en")).toMatch(/12–28 words/);
  });

  it("binds the reading to open with the line it promised", () => {
    const line = "這件事成得了，但成在你先讓一步之後。";
    expect(deepSystem("zh-hant", { teaser: line })).toContain(OPENING_NOTE(line));
    expect(oneSystem("zh-hant", { teaser: line })).toContain(line);
    expect(deepSystem("zh-hant")).not.toMatch(/OPENING LINE/);
    // the check is on letters alone: punctuation and quotes do not count
    expect(openingOffense({ verdict: "「這件事成得了，但成在你先讓一步之後」。之後的三個月…" }, "verdict", line)).toBeNull();
    expect(openingOffense({ verdict: "這件事難成。" }, "verdict", line)).toBe("verdict");
    expect(openingOffense({ summary: "This leans your way, but only after you stop pushing — and not before." }, "summary", "This leans your way, but only after you stop pushing.")).toBeNull();
    expect(openingOffense({ summary: "x" }, "summary", "ab")).toBeNull();   // a line too short to bind is ignored
  });
});
