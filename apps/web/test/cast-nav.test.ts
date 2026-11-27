import { describe, expect, it } from "vitest";
import { cleanCastUrl } from "../src/lib/cast-nav";

/** 09-24: the iPhone clean-document reload dropped the gift token — every 送一卦 opened on an iPhone lost its gift. */
describe("cleanCastUrl keeps what the page arrived with", () => {
  it("keeps gift / reward / after / pair / via and rewrites only q", () => {
    const u = cleanCastUrl("zh-hant", "他會聯繫我嗎", "?gift=abc&via=878787&c=threads");
    const p = new URL(u, "https://x").searchParams;
    expect(u.startsWith("/zh-hant/cast?")).toBe(true);
    expect(p.get("gift")).toBe("abc");
    expect(p.get("via")).toBe("878787");
    expect(p.get("c")).toBe("threads");
    expect(p.get("q")).toBe("他會聯繫我嗎");
  });
  it("replaces an old q, drops an emptied one, and stays bare with nothing to keep", () => {
    expect(new URL(cleanCastUrl("zh", "新问题", "?q=旧问题&reward=r1"), "https://x").searchParams.get("q")).toBe("新问题");
    expect(cleanCastUrl("zh", "  ", "?q=旧&after=a1")).toBe("/zh/cast?after=a1");
    expect(cleanCastUrl("en", "", "")).toBe("/en/cast");
  });
});
