import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eventLabel } from "../src/lib/live-labels";
import { fromEvent } from "../src/lib/presence";
import { POST as track } from "../src/app/api/track/route";
import { readEvents } from "../src/lib/analytics-server";

/**
 * 10-02 (Neil saw 「访客 dk8i 被一事一占拦下」 after the cap had stopped blocking): the panel left is the "same question"
 * reminder, which one tap passes — the board now says so, and how alike the two wordings were.
 */
describe("一事一占面板字样（10-02）", () => {
  it("the same-question reminder reads as one that can be passed; the others say what they are", () => {
    expect(eventLabel("repeat_blocked", "same", "waivable", 82)).toBe("同一问题提醒（可继续） · 问法相似 82%");
    expect(eventLabel("repeat_blocked", "same", "waivable")).toBe("同一问题提醒（可继续）");
    expect(eventLabel("repeat_blocked", "same", "spent", 100)).toBe("同一问题提醒（「情况变了」已用完） · 问法相似 100%");
    expect(eventLabel("repeat_blocked", "reply_go")).toBe("像回复 → 去追问");
    expect(eventLabel("repeat_blocked", "reply_new")).toBe("像回复 → 仍起新卦");
    expect(eventLabel("repeat_blocked", "cap", "topic")).toBe("问满被拦（旧版页面）");
    expect(eventLabel("repeat_blocked")).toBe("同一问题提醒（可继续）");
    expect(eventLabel("repeat_capped")).toBe("问满了照常起卦（不送免费一句）");
  });

  // 10-03: a hydration mismatch (hy:) self-heals — show it as a recovered redraw, not a page error; real errors unchanged
  it("a recoverable hydration redraw reads as self-healed, not as a page error", () => {
    expect(eventLabel("client_error", "hy:React #418 HTML body ")).toBe("页面水合重绘·已自愈 React #418 HTML body ");
    expect(eventLabel("client_error", "res:SCRIPT 3122-8d7f83bb")).toBe("页面报错 res:SCRIPT 3122-8d7f83bb");
    expect(eventLabel("client_error", "js:TypeError: x is not")).toBe("页面报错 js:TypeError: x is not");
    expect(eventLabel("client_error")).toBe("页面报错");
  });

  it("the board gets the number for this panel only", () => {
    expect(fromEvent({ t: 1, s: "a", e: "repeat_blocked", method: "same", tier: "waivable", hex: 100 }).num).toBe(100);
    expect(fromEvent({ t: 1, s: "a", e: "repeat_blocked", method: "same", tier: "waivable", hex: 0 }).num).toBe(0);
    expect(fromEvent({ t: 1, s: "a", e: "cast_complete", hex: 63 }).num).toBeUndefined();
  });
});

describe("问法相似度不再被丢（10-02）", () => {
  const post = (b: Record<string, unknown>) =>
    track(new NextRequest("http://localhost/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }));

  it("keeps 0–100 on the one-matter panel, and only a hexagram number (1–64) everywhere else", async () => {
    await post({ e: "repeat_blocked", s: "simtest1", method: "same", tier: "waivable", hex: 100, mem: 0, same: 1 });
    await post({ e: "repeat_blocked", s: "simtest2", method: "same", tier: "waivable", hex: 0, mem: 0, same: 1 });
    await post({ e: "repeat_blocked", s: "simtest3", method: "same", hex: 101 });
    await post({ e: "repeat_blocked", s: "simtest6", method: "same", hex: 72.5 });
    await post({ e: "cast_complete", s: "simtest4", hex: 100 });
    await post({ e: "cast_complete", s: "simtest5", hex: 64 });
    const evs = readEvents(1);
    const hexOf = (s: string) => evs.find((e) => e.s === s)?.hex;
    expect(hexOf("simtest1")).toBe(100); // identical wording — dropped before today
    expect(hexOf("simtest2")).toBe(0);
    expect(hexOf("simtest3")).toBeUndefined();
    expect(hexOf("simtest6")).toBeUndefined();
    expect(hexOf("simtest4")).toBeUndefined(); // not a hexagram
    expect(hexOf("simtest5")).toBe(64);
  });
});
