import { describe, expect, it } from "vitest";
import { ensureReviewLinks, isReviewGrant, REVIEW_SITES, reviewLinks } from "../src/lib/review-links";
import { redeemGiftCast } from "../src/lib/grants";
import { productReviewLines, PRODUCT_REVIEWS } from "../src/lib/product-review";

// 10-16 进度表 52: five sites × three full readings, 30 days, one use each; 59: the two-week review lines.
describe("review trial links", () => {
  it("makes fifteen links once, tagged per site, each spent once", () => {
    expect(ensureReviewLinks()).toBe(15);
    expect(ensureReviewLinks()).toBe(0); // already there: nothing new
    const links = reviewLinks("https://example.test");
    expect(links).toHaveLength(15);
    expect(new Set(links.map((l) => l.token)).size).toBe(15);
    for (const s of REVIEW_SITES) expect(links.filter((l) => l.site === s.id).map((l) => l.n)).toEqual([1, 2, 3]);
    const first = links[0]!;
    expect(first.url).toBe(`https://example.test/zh-hant/cast?gift=${first.token}&c=rv-techritual`);
    for (const l of links) expect(/[?&]c=([a-z0-9_-]{1,16})$/.test(l.url)).toBe(true); // lib/track.ts keeps tags of ≤16
    expect(isReviewGrant(first.token)).toBe(true);
    const days = Math.round((first.expiresAt - Date.now()) / 86_400_000);
    expect(days).toBe(30);

    const r = redeemGiftCast(first.token, "{}", "reviewer@example.test", null, "zh-hant");
    expect(r.ok).toBe(true);
    expect(redeemGiftCast(first.token, "{}", "someone@example.test", null, "zh-hant")).toEqual({ ok: false, error: "already_used" });
    expect(reviewLinks().find((l) => l.token === first.token)?.state).toBe("used");
  });
});

describe("new product review", () => {
  it("prints a line per open product and flags it at two weeks", () => {
    const opened = Date.parse(`${PRODUCT_REVIEWS[0]!.openedOn}T12:00:00+08:00`);
    const early = productReviewLines(opened + 3 * 86_400_000);
    expect(early.find((r) => r.id === "today-qian")).toMatchObject({ day: 4, due: false, reviewOn: "2026-10-29" });
    expect(early[0]!.line).toContain("待 Neil 定");
    const late = productReviewLines(opened + 15 * 86_400_000);
    // 10-29 进度表 127: 尋物 opened two weeks after 今日一籤 — every product is due on its own reviewOn
    expect(late.filter((r) => r.id !== "xunwu").every((r) => r.due)).toBe(true);
    expect(late[0]!.line).toContain("该定去留了");
    expect(late.find((r) => r.id === "xunwu")).toMatchObject({ due: false, reviewOn: "2026-11-12" });
    for (const r of late) expect(productReviewLines(Date.parse(`${r.reviewOn}T12:00:00+08:00`)).find((x) => x.id === r.id)?.due).toBe(true);
  });
});
