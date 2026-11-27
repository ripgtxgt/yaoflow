import { describe, expect, it } from "vitest";
import { passedWindowMention } from "../src/lib/followup-dates";

/** 10-22 复查: a follow-up on 10-21 gave a cast's 10月16日到20日 window, already gone by, as "the next stir". */
const W = [{ start: "2026-10-16", end: "2026-10-20" }, { start: "2026-10-27", end: "2026-10-31" }, { start: "2026-12-07", end: "2027-01-05" }];

describe("a passed window of this chart named as if still to come", () => {
  it("is caught, as written", () => {
    expect(passedWindowMention("10月16日到20日這幾天，18日前後最可能——她主動發個訊息。再往後是10月27日到31日。", W, "2026-10-22")).toBe("10月16日到20日");
    expect(passedWindowMention("Between October 16 and 20 she is most likely to write.", W, "2026-10-22")).toBe("October 16 and 20");
    expect(passedWindowMention("真正定下來要等12月7日到1月5日這一段。", W, "2027-01-10")).toBe("12月7日到1月5日");
  });

  it("said to have gone by, still ahead, or a date the reader reported: left alone", () => {
    expect(passedWindowMention("前面10月16日到20日那一波已經過去了，接下來看10月27日到31日。", W, "2026-10-22")).toBeNull();
    expect(passedWindowMention("That window, October 16–20, has passed; watch October 27–31.", W, "2026-10-22")).toBeNull();
    expect(passedWindowMention("他10月11日連打三通，你隔了三天才回。", W, "2026-10-22")).toBeNull();
    expect(passedWindowMention("10月27日到31日，29日前後最明顯。", W, "2026-10-22")).toBeNull();
    expect(passedWindowMention("10月16日到20日這幾天最可能。", W, "2026-10-18")).toBeNull(); // not passed yet
    expect(passedWindowMention("anything", [], "2026-10-22")).toBeNull();
  });
});
