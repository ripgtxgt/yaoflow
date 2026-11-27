import { describe, expect, it } from "vitest";
import { alternatesFor, pageAlternates, LOCALES } from "../src/lib/locales";
import { contentFor, isEnglishFallback } from "../src/lib/content";
import { PRIVACY, TERMS } from "../src/lib/legal";
import sitemap from "../src/app/sitemap";

/**
 * Search Console (09-07) reported "duplicate, no user-selected canonical": the
 * layout's canonical had stamped every page with the language's home, and
 * seven legal URLs served one English text. These pin the corrected shape.
 */
describe("canonical + hreflang per page", () => {
  it("is self-referencing and lists every language for a page that exists in all of them", () => {
    const a = pageAlternates("fr", "/about");
    expect(a.canonical).toBe("/fr/about");
    expect(Object.keys(a.languages)).toHaveLength(LOCALES.length + 1);
    expect(a.languages["zh-Hant"]).toBe("/zh-hant/about");
    expect(a.languages["x-default"]).toBe("/en/about");
  });

  it("legal pages list every language now that all nine carry their own text (09-10)", () => {
    const own = LOCALES.filter((l) => !isEnglishFallback(TERMS[0]!, l));
    expect(own).toEqual([...LOCALES]);
    const langs = alternatesFor("/terms", own);
    expect(Object.keys(langs)).toContain("ja");
    expect(Object.keys(langs)).toContain("x-default");
    for (const sec of [...TERMS, ...PRIVACY]) {
      for (const l of LOCALES) expect(isEnglishFallback(sec, l)).toBe(false);
      // every language has the same number of paragraphs as the source
      for (const l of ["ja", "ko", "fr", "de", "es", "pt"] as const) expect(sec[l]!.p).toHaveLength(sec.zh.p.length);
    }
    // the withdrawal-right sentence exists in every language of §4
    for (const l of LOCALES) expect(contentFor(TERMS[3]!, l).p[4]).toMatch(/14/); // 09-26: the first-purchase guarantee is now p[1]
    for (const l of LOCALES) expect(contentFor(TERMS[3]!, l).p[1]).toMatch(/24/);
  });

  it("the sitemap lists canonical URLs only: every legal page, no private pages", () => {
    // 09-23: the default is now the ~300-page focus list (test/gua-seo-0923); this checks the full one
    process.env.SITEMAP_FULL = "1";
    let urls: string[];
    try { urls = sitemap().map((e) => e.url); } finally { delete process.env.SITEMAP_FULL; }
    expect(urls).toContain("https://yaoflow.com/zh/terms");
    expect(urls).toContain("https://yaoflow.com/en/privacy");
    expect(urls).toContain("https://yaoflow.com/fr/terms");
    expect(urls).toContain("https://yaoflow.com/ja/privacy");
    expect(urls.some((u) => /\/(reading|login|account|share)\b/.test(u))).toBe(false);
    expect(urls).toContain("https://yaoflow.com/zh-hant/today"); // 大众一卦 (09-21): daily public charts, one page per language
    // 9 × (home, cast, about, today)  — /accuracy 09-26 撤下 + 9 × 2 legal + 9 × (index + 64)
    // + the public-cases index only where a language holds 5+ cases (10-16 进度表 61 — none in a fresh test database) + the scene pages (en 8 · ja 4 · zh-hant 4, three indexes)
    // The English 本卦→之卦 layer (64 index pages + 64 × 64 change pages) is OUT by default since 09-19: a
    // 4,819-entry sitemap on a new domain got nothing crawled. SITEMAP_TRANSITIONS=1 puts it back.
    expect(urls).toHaveLength(9 * 4 + 18 + 9 * 65 + 9 + 72 + 27 + 9 + 66 + 102 + 101 + 101 + 101 + 101 + 280 + 2 + 2 + 74 + 430 + 2 + 7 + 1407 + 7 + 2 + 723 + 1 + 80 - 1200)  // 11-06 T-020: 解夢 200 pages out of the sitemap in ja/ko/pt/fr/es/de (6 × 200 = -1200); 11-05 进度表 139 本命卦内容页 16＋64 = +80; 11-05 进度表 136 本命卦 繁中 +1; 10-30 进度表 128 ⑤⑥: 籤 七种外语（解籤＋索引＋100 籤）×7 = 714、線上求籤外语 7、姓名判断／성명학 2 = +723; 厄年 (ja) ＋ 삼재 (ko) +2; 10-30 进度表 128 ④: 正緣畫像 七种外语 +7 (八字 pages follow the bazi switch, off in a fresh test database); 10-30 进度表 128 ③: 解夢七种外语 7 ×（索引＋200 個夢）= +1407; 10-29 进度表 128: 尋物 七种外语 +7; 10-29 进度表 127: 尋物 繁简 +2; 10-29 进度表 122/124/125: 姓名學入口 2 + 太歲 26 + 解夢 402 = +430 (字页另有 /name-sitemap.xml); 10-28 樂成宮月老 40 + 烘爐地 32 + 兩個索引頁 = +74; 10-26 正緣畫像 product page 繁简 +2; 10-14 进度表 50: 今日一籤 繁简 +2; 09-24: 场景页九语×8 + 9 个索引页; 09-28: 三张资源页九语 +27; 09-30: how-to-ask 九语 +9; 10-12: 繁體感情落地页 4 + 年卦预约 1 + 解签入口 1 + 60 签 = +66; 10-12 籤系: 两个籤系索引页 + 黃大仙 100 籤 = +102; 关帝索引 + 100 籤 = +101
    expect(urls).toContain("https://yaoflow.com/ja/for/job-change");
    expect(urls).not.toContain("https://yaoflow.com/zh/cases"); // 10-16: no cases yet in a fresh database → thin, not listed
    expect(urls.some((u) => /\/to(\/|$)/.test(u))).toBe(false);
  });

  it("the 本卦→之卦 layer comes back into the sitemap on the switch, English only (09-19)", () => {
    const prev = process.env.SITEMAP_TRANSITIONS;
    process.env.SITEMAP_TRANSITIONS = "1";
    try {
      const urls = sitemap().map((e) => e.url);
      expect(urls).toHaveLength(9 * 4 + 18 + 9 * 65 + 64 + 64 * 64 + 9 + 72 + 27 + 9 + 66 + 102 + 101 + 101 + 101 + 101 + 280 + 2 + 2 + 74 + 430 + 2 + 7 + 1407 + 7 + 2 + 723 + 1 + 80 - 1200)  // 11-06 T-020: 解夢 200 pages out of the sitemap in ja/ko/pt/fr/es/de (6 × 200 = -1200); 11-05 进度表 139 本命卦内容页 16＋64 = +80; 11-05 进度表 136 本命卦 繁中 +1; 10-30 进度表 128 ⑤⑥ 籤外语 714＋求籤 7＋姓名 2; 厄年／삼재 +2; 10-30 进度表 128 ④ 正緣畫像外语 +7; 10-30 进度表 128 ③ 解夢外语 +1407; 10-29 进度表 128 尋物外语 +7; 10-29 进度表 127 尋物 +2; 10-29 +430; 10-28 +74; 10-26 正緣畫像 product page 繁简 +2; 10-14 进度表 50: 今日一籤 繁简 +2; 09-24: 场景页九语×8 + 9 个索引页; 09-28: +27 资源页; 09-30: +9 how-to-ask; 10-12: +66 繁體落地页/预约/解签; +102 籤系索引与黃大仙籤; +101 关帝
      expect(urls).toContain("https://yaoflow.com/en/gua/11-tai/to/5-xu");
      expect(urls.filter((u) => /\/to\//.test(u)).every((u) => u.startsWith("https://yaoflow.com/en/"))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.SITEMAP_TRANSITIONS; else process.env.SITEMAP_TRANSITIONS = prev;
    }
  });

  it("the language homes name the root as x-default, so Google stops folding /en into / (09-23)", async () => {
    const { pageAlternates } = await import("../src/lib/locales");
    expect(pageAlternates("en", "").languages["x-default"]).toBe("/");
    expect(pageAlternates("zh-hant", "/gua").languages["x-default"]).toBe("/en/gua");
  });

  it("11-06 T-020: the six-language libraries and the foreign almanac days are left out; English and Chinese keep them", () => {
    const urls = new Set(sitemap().map((e) => e.url));
    const site = "https://yaoflow.com";
    for (const l of ["ja", "ko", "pt", "fr", "es", "de"]) {
      expect(urls.has(`${site}/${l}/dream`), l).toBe(true);
      expect([...urls].some((u) => u.startsWith(`${site}/${l}/dream/`)), l).toBe(false);
      expect([...urls].some((u) => new RegExp(`^${site}/${l}/huangli/\\d`).test(u)), l).toBe(false);
    }
    expect([...urls].filter((u) => u.startsWith(`${site}/en/dream/`)).length).toBe(200);
    expect([...urls].filter((u) => u.startsWith(`${site}/zh-hant/dream/`)).length).toBe(200);
  });
});
