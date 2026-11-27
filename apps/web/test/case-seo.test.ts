import { describe, expect, it } from "vitest";
import { caseDescription, caseIndexable, caseJsonLd, caseQuestion, caseTitle, tidyFraming } from "../src/lib/case-seo";
import { caseSearchLandings } from "../src/lib/analytics-server";
import type { CaseView } from "../src/lib/db";
import type { TrackedEvent } from "../src/lib/analytics-server";

const base = { primary_num: 47, changed_num: 60, topic: "relationship", locale: "zh-hant", cast_at: Date.UTC(2026, 8, 20), published_at: Date.UTC(2026, 8, 21) } as unknown as CaseView;

describe("公开卦例做成搜索入口（09-28）", () => {
  it("标题是问句：作者的公开说法优先，否则按类型；从不带原问题", () => {
    expect(tidyFraming("他這個月會不會主動聯絡我 😭😭")).toBe("他這個月會不會主動聯絡我");
    expect(tidyFraming("嗯…")).toBeNull();
    expect(caseQuestion({ framing: "該不該和他拉開距離", topic: "relationship" }, "zh-hant")).toBe("該不該和他拉開距離？");
    expect(caseQuestion({ framing: null, topic: "relationship" }, "zh-hant")).toBe("這段感情接下來會怎麼走？");
    expect(caseQuestion({ framing: null, topic: "career" }, "en")).toBe("How will this job or opportunity turn out?");
    // 10-02 进度表 27: the 繁體 tail says 卜卦
    expect(caseTitle({ ...base, framing: null }, "zh-hant")).toBe("這段感情接下來會怎麼走？ 真實的六爻卜卦實例（澤水困 → 水澤節）");
    const t = caseTitle({ ...base, framing: "他這個月會不會主動聯絡我" }, "zh-hant");
    expect(t).toContain("他這個月會不會主動聯絡我？");
    expect(t).toContain("澤水困");
  });
  it("description 是断语第一句加应期第一句，不超过 160 字", () => {
    const d = caseDescription({ verdict: "他不會主動開口。因為他被事情綁住。", timing: "十月二日到六日之間比較可能。之後就淡了。" });
    expect(d).toBe("他不會主動開口。 十月二日到六日之間比較可能。");
    expect(caseDescription({ summary: "x".repeat(300) }).length).toBeLessThanOrEqual(160);
  });
  it("太薄的不收录；别的语言的网址也不收录", () => {
    expect(caseIndexable({ fields_json: JSON.stringify({ verdict: "😭😭 好" }), locale: "zh-hant" }, "zh-hant")).toBe(false);
    const rich = JSON.stringify({ verdict: "他不會主動開口，因為他現在自己被事情綁住，連往前一步都難。", timing: "十月二日到六日之間她比較可能有反應，四日前後最明顯。如果那幾天沒動靜，下一個時間點在月底。" });
    expect(caseIndexable({ fields_json: rich, locale: "zh-hant" }, "zh-hant")).toBe(true);
    expect(caseIndexable({ fields_json: rich, locale: "zh-hant" }, "en")).toBe(false);
  });
  it("结构化数据：有公开说法用 QAPage，否则 Article；日期用起卦日", () => {
    const fields = JSON.stringify({ verdict: "會。", timing: "十月。" });
    const qa = caseJsonLd({ ...base, framing: "他會回來嗎", fields_json: fields }, "https://yaoflow.com", "/zh-hant/cases/abc") as { "@type": string; mainEntity: { name: string; dateCreated: string; acceptedAnswer: { text: string } } };
    expect(qa["@type"]).toBe("QAPage");
    expect(qa.mainEntity.name).toBe("他會回來嗎？");
    expect(qa.mainEntity.dateCreated).toBe("2026-09-20T00:00:00.000Z");
    expect(qa.mainEntity.acceptedAnswer.text).toContain("十月");
    const ar = caseJsonLd({ ...base, framing: null, fields_json: fields }, "https://yaoflow.com", "/zh-hant/cases/abc") as { "@type": string; datePublished: string };
    expect(ar["@type"]).toBe("Article");
    expect(ar.datePublished).toBe("2026-09-20T00:00:00.000Z");
  });
  it("周报：自然搜索落到卦例页的会话，与其中起卦的", () => {
    const ev = (s: string, e: TrackedEvent["e"], path?: string, ref?: string): TrackedEvent => ({ t: 1, s, e, ...(path ? { path } : {}), ...(ref ? { ref } : {}) });
    const evs = [
      ev("a", "page_view", "/zh-hant/cases/0123456789", "www.google.com"), ev("a", "cast_complete"),
      ev("b", "page_view", "/zh-hant/cases/0123456789", "l.threads.com"),
      ev("c", "page_view", "/zh-hant/cast", "www.google.com"), ev("c", "page_view", "/zh-hant/cases/0123456789"),
      ev("d", "page_view", "/zh-hant/cases/abcdefabcd", "www.bing.com"),
    ];
    expect(caseSearchLandings(evs)).toEqual({ sessions: 2, casts: 1, paid: 0, byEngine: { google: 1, bing: 1 } });
  });
});
