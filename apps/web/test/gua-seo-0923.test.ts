import { describe, expect, it } from "vitest";
import raw from "../src/data/gua-cases.json";
import { caseForHex, primaryOf, type GuaCase } from "../src/lib/gua-cases";
import { GUA } from "../src/lib/gua";

/**
 * 09-23 (§14 ⑯). The 64 pages each get a real cast when we have one, and the
 * sitemap narrows to ~300 pages Google should take first.
 */
describe("卦页卦例", () => {
  it("每条卦例算出的本卦与素材里记的本卦一致（没挂错页）", () => {
    for (const c of raw as GuaCase[]) {
      const h = GUA[primaryOf(c.code) - 1]!;
      expect(h.fullZh, c.code).toBe(c.primary_zh);
    }
  });
  it("简繁互通，其他语言只取本语言", () => {
    const hant = (raw as GuaCase[]).find((c) => c.locale === "zh-hant")!;
    const n = primaryOf(hant.code);
    const zh = caseForHex(n, "zh");
    expect(zh).not.toBeNull();
    expect(zh!.locale).toBe("zh");
    expect(caseForHex(n, "ko")?.locale ?? "ko").toBe("ko"); // 09-27: ko has its own cases now, never a Chinese one
  });
  it("九种语言 64 卦全覆盖（09-23 补齐 157 条，09-27 补齐韩法德西葡）", () => {
    for (const l of ["zh", "zh-hant", "en", "ja", "ko", "fr", "de", "es", "pt"] as const) {
      expect(GUA.filter((h) => !caseForHex(h.number, l)).map((h) => h.number), l).toEqual([]);
    }
  });
});

describe("站点地图", () => {
  // 10-30: a few thousand entries now (星盤 and 解夢 in nine languages) — more time than the default five seconds
  it("约 300 条：九语首页/today/accuracy、四语 64 卦与索引、场景页", { timeout: 30_000 }, async () => {
    const { default: sitemap } = await import("../src/app/sitemap");
    const urls = sitemap().map((e) => e.url.replace(/^https?:\/\/[^/]+/, ""));
    expect(urls.length).toBeGreaterThan(250);
    expect(urls.length).toBeLessThan(1890 + 1407 + 1785); // 10-30 进度表 128 ④ 星盤七种外语 254×7 + 看自己 7 = +1785 // 10-30 进度表 128 ③ 解夢七种外语 +1407 // 10-29 姓名學入口 2 + 太歲 26 + 解夢 402 = +430 // 10-28 樂成宮月老 40 + 烘爐地 32 + 索引 2 = +74 // 10-16 进度表 66: 葡语 64 卦 +65 // 10-12 关帝 +101, 天后宮 +101, 月老 +101, 觀音 +101, 籤詩網六套 +280 // 09-24: 场景页九语补全 +62 · 10-12: 感情落地页 4 + 年卦预约 1 + 解签 61 = +66 · 10-12 籤系: 索引页 2 + 黃大仙 100 = +102
    expect(urls).toContain("/zh-hant");
    expect(urls).toContain("/ja/today");
    expect(urls).not.toContain("/en/accuracy"); // 09-26 撤下
    // 09-28 (进度表 12): /gua/table in every language sits under /gua/ too — 4 more in the focus languages, one in ko
    expect(urls.filter((u) => /^\/(zh|zh-hant|en|ja)\/gua\/.+/.test(u)).length).toBe(256 + 4);
    expect(urls.filter((u) => u.startsWith("/ko/gua/"))).toEqual(["/ko/gua/table"]);
    expect(urls.filter((u) => /^\/pt\/gua\/\d/.test(u)).length).toBe(64); // 10-16 进度表 66
    for (const p of ["/en/glossary", "/ja/timing", "/pt/gua/table"]) expect(urls).toContain(p);
    expect(urls.some((u) => u.includes("/terms") || u.endsWith("/cast"))).toBe(false);
  });
});
