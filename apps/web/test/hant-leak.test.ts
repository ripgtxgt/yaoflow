import { describe, expect, it } from "vitest";
import { ensureHant, hansRatio, HANS_LEAK_THRESHOLD, toHans, toHant } from "../src/lib/hant";

/**
 * 09-09: a zh-hant deep reading came back entirely in Simplified (水風井).
 * The pipeline now measures how much OpenCC would rewrite and converts the
 * leaking fields instead of shipping them.
 */
describe("Traditional-script guard", () => {
  const hans = "复合有望，但需你主动推动；对方态度尚不明确，以应爻为用，官鬼旺相。";
  const hant = "復合有望，但需你主動推動；對方態度尚不明確，以應爻為用，官鬼旺相。";

  it("tells a Simplified paragraph from a Traditional one", () => {
    expect(hansRatio(hans)).toBeGreaterThan(0.2);
    expect(hansRatio(hant)).toBeLessThanOrEqual(HANS_LEAK_THRESHOLD);
    expect(hansRatio("9月12日前後")).toBe(0);
  });

  it("converts only the fields that leaked and reports them", () => {
    const { fixed, leaked } = ensureHant({ verdict: hans, timing: hant, basis: "乾為天，世爻旺相。" });
    expect(leaked).toEqual(["verdict"]);
    expect(fixed.verdict).toBe(hant);
    expect(fixed.timing).toBe(hant);      // untouched, byte for byte
    expect(fixed.basis).toContain("乾為天"); // 乾 survives the pass
  });

  /**
   * 09-17, seen live: "今年或明年有没有对象" came back as "今年到明年是有物件的".
   * OpenCC's Taiwan vocabulary table reads 对象 as a programming object.
   */
  it("keeps the everyday word where Taiwan vocabulary would pick the technical one", () => {
    expect(toHant("今年或明年有没有对象")).toBe("今年或明年有沒有對象");
    expect(toHant("遇到认真发展的对象")).toBe("遇到認真發展的對象");
    expect(toHant("方向是支持你回去的")).toBe("方向是支持你回去的");
    // the substitutions that are right for a Taiwan reader still happen
    expect(toHant("网络上的消息")).toBe("網路上的訊息");
    // and the guard still sees a Simplified paragraph as Simplified
    expect(hansRatio("今年或明年有没有对象")).toBeGreaterThan(HANS_LEAK_THRESHOLD);
  });
});

import { classifyTopic } from "../src/lib/topic";
describe("keyword rules across scripts (09-10)", () => {
  it("leaves Japanese alone in toHans and reads 繁體 keywords without conversion", () => {
    expect(toHans("元彼と復縁できますか")).toBe("元彼と復縁できますか");
    expect(classifyTopic(toHans("元彼と復縁できますか"))).toBe("relationship");
    expect(classifyTopic("我和他還能復合嗎")).toBe("relationship"); // client-side chip, no OpenCC
    expect(classifyTopic("該不該接這個 offer")).toBe("career");
    expect(toHans("我和他還能復合嗎")).toBe("我和他还能复合吗");
  });
});

/**
 * 09-22, from the funnel review: `hant_leak` fires 4–21 times a day. The guard
 * does repair what it catches — but only above a 4% threshold, so a Traditional
 * paragraph carrying three stray Simplified characters went out as written.
 * Free readings could wear that; a paid one cannot.
 */
describe("繁體里的零星简体字", () => {
  it("cleans stray Simplified characters that fall under the leak threshold", async () => {
    const { ensureHant, hansRatio, HANS_LEAK_THRESHOLD } = await import("../src/lib/hant");
    // one Simplified character in an otherwise Traditional paragraph (under 4%)
    const mostly = "這件事目前看來還算穩，对方的態度是關鍵，但真正要盯的是他那邊的資源什麼時候到位，再觀察兩週就會清楚許多。";
    expect(hansRatio(mostly)).toBeLessThanOrEqual(HANS_LEAK_THRESHOLD);
    const { fixed, leaked } = ensureHant({ verdict: mostly });
    expect(fixed.verdict).toContain("對方");
    expect(fixed.verdict).not.toContain("对方");
    expect(leaked).toEqual([]); // repaired quietly: this is not the "whole field is Simplified" alarm
  });

  it("leaves a reader's own Traditional idiom alone — script only, no Taiwan vocabulary swap", async () => {
    const { ensureHant } = await import("../src/lib/hant");
    // 消息 is perfectly good Traditional; the twp layer would make it 訊息
    const fine = "還沒有消息，再等等就會有答覆。";
    const { fixed, leaked } = ensureHant({ note: fine });
    expect(fixed.note).toBe(fine);
    expect(leaked).toEqual([]);
  });

  it("still converts and reports a field that is wholly Simplified", async () => {
    const { ensureHant } = await import("../src/lib/hant");
    const hans = "这件事目前看来还算稳，对方的态度是关键，再观察两周。";
    const { fixed, leaked } = ensureHant({ verdict: hans });
    expect(leaked).toEqual(["verdict"]);
    expect(fixed.verdict).toContain("這件事");
  });
});
