import { describe, expect, it } from "vitest";
import { decodeQuote, encodeQuote, shareUrlWithQuote, SHARE_QUOTE_MAX } from "../src/lib/share";

/** 裂变 V1 ③: the optional verdict line rides in the share URL as a path segment. */
describe("share quote", () => {
  it("round-trips CJK and Latin text through a URL-safe segment", () => {
    for (const q of ["此事可成，但成在让步之后。", "Still doable — after a concession.", "復合有望，需你主動推動。", "転職は吉。ただし急がず。"]) {
      const seg = encodeQuote(q);
      expect(seg).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeQuote(seg)).toBe(q);
    }
  });
  it("caps the length, strips control characters, and rejects junk", () => {
    const long = "很".repeat(400);
    expect(decodeQuote(encodeQuote(long))).toHaveLength(SHARE_QUOTE_MAX);
    expect(decodeQuote(encodeQuote("a b\nc"))).toBe("a b c");
    expect(decodeQuote("not base64 at all!")).toBeNull();
    expect(decodeQuote("")).toBeNull();
    expect(decodeQuote(encodeQuote("x"))).toBeNull(); // too short to be a sentence
  });
  it("builds the plain link without a quote and the /s/ link with one", () => {
    const v = [7, 8, 9, 8, 7, 8] as const;
    expect(shareUrlWithQuote("https://yaoflow.com", "zh", v, null)).toBe("https://yaoflow.com/zh/share/789878");
    expect(shareUrlWithQuote("https://yaoflow.com", "en", v, "Doable, later.")).toBe(`https://yaoflow.com/en/share/789878/s/${encodeQuote("Doable, later.")}`);
  });
});
