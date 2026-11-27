import { describe, expect, it } from "vitest";
import { cardLine, windowLabel } from "../src/lib/share-card";
import { isShareSurface, SHARE_TAGS, withShareTag } from "../src/lib/share-meta";
import { SHARE_SHEET_T } from "../src/lib/dict/share-sheet";
import { SHARE_STORY_T } from "../src/lib/dict/share-story";
import { LOCALES } from "../src/lib/locales";
import { writeFileSync } from "node:fs";
import type { LineValue } from "@yaoflow/engine";
import { saveCast, scheduleRevisit, setRevisitOutcome, upsertCustomer } from "../src/lib/db";
import { proofToken } from "../src/lib/outcome-token";
import { resolveServerChart } from "../src/lib/reading";
import { GET } from "../src/app/api/proof/[ref]/story/route";

/**
 * 10-13 进度表 41 提高分享率: the card's date window, the share tags, the surfaces /api/track accepts, and the share
 * sheet's words in every language.
 */
describe("进度表 41 分享", () => {
  it("the card names the window briefly, never a paragraph", () => {
    expect(windowLabel("大約在 10 月 14 日到 18 日之間，對方會先有動靜。", "zh-hant")).toBe("10 月 14–18 日");
    expect(windowLabel("最快10月20日，最晚11月3日。", "zh-hant")).toBe("10 月 20 日");
    expect(windowLabel("10月30日至11月2日这几天最关键", "zh")).toBe("10 月 30 日–11 月 2 日");
    expect(windowLabel("Expect movement between October 14 and 18.", "en")).toBe("Oct 14–18");
    expect(windowLabel("No date here at all.", "en")).toBeNull();
    expect(windowLabel(null, "zh")).toBeNull();
  });

  it("a reader's line is one short line, links removed", () => {
    expect(cardLine("  真的就在那幾天  https://x.y/z ")).toBe("真的就在那幾天");
    expect([...cardLine("一".repeat(80), 50)].length).toBe(50);
  });

  it("every shared link carries its tag, without overriding one already there", () => {
    expect(withShareTag("https://yaoflow.com/zh-hant/share/789678", SHARE_TAGS.gua)).toBe("https://yaoflow.com/zh-hant/share/789678?c=gua-share");
    expect(withShareTag("https://yaoflow.com/zh-hant/share/789678?r=abcdefgh", SHARE_TAGS.gua)).toContain("r=abcdefgh&c=gua-share");
    expect(withShareTag("https://yaoflow.com/zh-hant/jieqian?n=3&c=qian-share", SHARE_TAGS.gua)).toContain("c=qian-share");
    expect(Object.values(SHARE_TAGS)).toEqual(["gua-share", "qian-share", "ying-share", "qian-friend", "bazi-share", "ziwei-share", "astro-share", "hepan-share"]);
  });

  it("only the known surfaces are recorded", () => {
    for (const s of ["result", "deep", "qian", "matter", "revisit", "lot", "bazi", "ziwei", "astro", "hepan"]) expect(isShareSurface(s)).toBe(true);
    expect(isShareSurface("evil")).toBe(false);
  });

  it("the 應了 card renders 9:16 with the reader's line", async () => {
    process.env.ADMIN_KEY ??= "test-admin-key";
    const VALUES: LineValue[] = [7, 8, 9, 8, 7, 8];
    const sid = "cs_share41_proof";
    const cid = upsertCustomer(`${sid}@example.com`, "zh-hant");
    const input = { question: "问一件事", values: VALUES, castAtMs: Date.UTC(2026, 8, 1, 3), tzOffsetMinutes: 480 };
    const chart = resolveServerChart(input, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: cid, castAtMs: input.castAtMs, tzOffsetMinutes: 480, locale: "zh-hant", question: input.question, topic: "career", values: VALUES, chart });
    scheduleRevisit({ sessionId: sid, castId, customerId: cid, email: `${sid}@example.com`, locale: "zh-hant", tier: "deep", castAtMs: input.castAtMs, windowDays: 7, timingQuote: "9月8日前後" });
    let id = 0;
    for (let i = 800; i > 0; i--) { if (setRevisitOutcome(i, "open")) { id = i; break; } }
    setRevisitOutcome(id, "hit");
    const ref = `${id}-${proofToken(id)}`;
    const res = await GET(new Request(`https://yaoflow.com/api/proof/${ref}/story?l=zh-hant&m=${encodeURIComponent("真的就在那幾天")}`), { params: Promise.resolve({ ref }) });
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.readUInt32BE(16)).toBe(1080);
    expect(buf.readUInt32BE(20)).toBe(1920);
    if (process.env.SHARE41_OUT) writeFileSync(process.env.SHARE41_OUT, buf);
  }, 30000);

  it("the share sheet and story card speak all nine languages, same keys", () => {
    const keys = Object.keys(SHARE_SHEET_T["zh-hant"]).sort();
    for (const l of LOCALES) {
      expect(Object.keys((SHARE_SHEET_T as Record<string, object>)[l] ?? {}).sort(), l).toEqual(keys);
      expect((SHARE_STORY_T as Record<string, { when?: string }>)[l]?.when, l).toBeTruthy();
    }
    // no reward for sharing (进度表 41 ⑤), and no 「準」 or 「AI」 in what we say about it
    for (const l of LOCALES) for (const v of Object.values((SHARE_SHEET_T as Record<string, Record<string, string>>)[l]!)) expect(v).not.toMatch(/準|\bAI\b|解鎖|解锁|換次數|换次数/);
  });
});
