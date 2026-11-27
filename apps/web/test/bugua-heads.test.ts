import { describe, expect, it } from "vitest";
import { t } from "../src/lib/i18n";
import { GUA, guaBySlug, guaName, guaSlug } from "../src/lib/gua";
import { referenceFor } from "../src/lib/reference";
import { howToAskFor } from "../src/lib/how-to-ask";
import { BUGUA, caseDescriptionHead, caseTitleHead, casesIndexHead, guaDescription, homeHead } from "../src/lib/seo-head";
import { caseTitle } from "../src/lib/case-seo";
import type { CaseView } from "../src/lib/db";

const count = (s: string) => s.split(BUGUA).length - 1;
const once = (s: string) => expect(count(s), s).toBe(1);
const clean = (s: string) => expect(s, s).not.toMatch(/\bAI\b|準確|准确|accura/i);

/** 进度表 27 (10-02): 繁體 <title> and description say 卜卦 — once each, never stuffed, nothing else touched */
describe("繁體 heads say 卜卦 once", () => {
  it("home: title and description, with 六爻 in the title; other languages keep the layout default", () => {
    const h = homeHead("zh-hant")!;
    once(h.title); once(h.description); clean(h.title); clean(h.description);
    expect(h.title).toContain("六爻");
    expect(h.title).toContain("YaoFlow");
    // 10-16 进度表 61: every home now has its own head — the searched words, YaoFlow, no "AI", no accuracy claim
    for (const l of ["zh", "en", "ja", "ko", "fr", "de", "es", "pt"] as const) {
      const x = homeHead(l)!;
      expect(x.title).toContain("YaoFlow");
      expect(x.title.length).toBeLessThanOrEqual(70);
      for (const s of [x.title, x.description]) { expect(s).not.toMatch(/\bAI\b|準|准确|accura|präzis|précis|preciso|当たる|정확/i); }
    }
    // the hero and H1 are not head text: the A/B test h keeps running on them
    expect(t("zh-hant", "tagline")).toBe("一事一卦");
  });

  it("the 64 pages and their index", () => {
    once(t("zh-hant", "guaIndexMetaTitle"));
    once(t("zh-hant", "guaIndexMetaDesc"));
    for (const h of GUA) {
      const d = guaBySlug(guaSlug(h), "zh-hant")!;
      const name = guaName(h, "zh-hant");
      const title = t("zh-hant", "guaMetaTitle", { name, n: h.number });
      once(title); clean(title);
      expect(title.startsWith(name)).toBe(true);
      const desc = guaDescription(d.seo.meta, name, "zh-hant");
      once(desc); clean(desc);
      expect(desc.startsWith(d.seo.meta.replace(/[。！？]$/, ""))).toBe(true);
    }
    // other languages: untouched
    expect(t("en", "guaMetaTitle", { name: "x", n: 1 })).not.toContain(BUGUA);
    const d = guaBySlug("1-qian", "zh")!;
    expect(guaDescription(d.seo.meta, "乾为天", "zh")).toBe(d.seo.meta);
  });

  it("/timing and /how-to-ask: the head changes, the page's heading and lead do not", () => {
    const r = referenceFor("zh-hant").timing;
    once(r.metaTitle!); once(r.metaDesc!);
    expect(r.title).not.toContain(BUGUA);
    expect(r.lead).not.toContain(BUGUA);
    expect(referenceFor("en").timing.metaTitle).toBeUndefined();
    const a = howToAskFor("zh-hant");
    once(a.metaTitle); once(a.metaDesc!);
    expect(a.lead).not.toContain(BUGUA);
    expect(howToAskFor("en").metaDesc).toBeUndefined();
  });

  it("public cases: index head, case titles and descriptions — once, even when the author's wording already says it", () => {
    const ix = casesIndexHead("zh-hant")!;
    once(ix.title); once(ix.description);
    expect(casesIndexHead("en")).toBeNull();
    const base = { primary_num: 47, changed_num: 60, topic: "relationship", locale: "zh-hant" } as unknown as CaseView;
    once(caseTitle({ ...base, framing: null }, "zh-hant"));
    const own = caseTitle({ ...base, framing: "這次卜卦問他會不會回來" }, "zh-hant");
    once(own);
    expect(own).toContain("真實的六爻實例");
    expect(caseTitleHead("Q?", "A real Liu Yao case (x)", "en")).toBe("Q? A real Liu Yao case (x)");
    once(caseDescriptionHead("他不會主動開口。 十月二日到六日之間比較可能。", "zh-hant"));
    expect(caseDescriptionHead("卜卦說他不會開口。", "zh-hant")).toBe("卜卦說他不會開口。");
    expect(caseDescriptionHead("x".repeat(300), "zh-hant").length).toBeLessThanOrEqual(160);
    expect(caseDescriptionHead("He will not.", "en")).toBe("He will not.");
  });
});
