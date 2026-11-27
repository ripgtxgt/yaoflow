import { describe, expect, it } from "vitest";
import { classifyTopic, topicScores } from "../src/lib/topic";
import { toHans } from "../src/lib/hant";

/**
 * 09-23 起卦主题识别 (Neil: 「识别率要95%以上」). Synthetic wordings — each one
 * mirrors a shape found among the real questions that used to fall to "other",
 * none of them copies a reader's words. The real-question rate is measured on
 * the server by scripts/topic-eval.ts (98.4% on 501 at the time of writing).
 */

const both = (q: string) => [q, toHans(q)];

describe("感情题不说「感情」也认得出", () => {
  const cases = [
    "他今天會不會想到我",                 // someone else → me
    "對方這個月會主動聯絡我嗎",
    "佢而家會唔會諗起我？",                 // Cantonese
    "我們還有以後嗎",                      // we → where
    "我跟他接下來一個月會怎麼發展",
    "小明跟我還會有後續嗎",                // X 跟我
    "他心裡還有我嗎",                      // their heart
    "陳先生對我是什麼看法",
    "他還會回來嗎",                        // will they, without 我
    "今年底前會不會遇到可以認真發展的人",
    "他現在是不是在接觸新的人",
    "我該不該繼續和這個人發展",
    "Why do I think that guy likes me?",
    "Will he text me this week?",
  ];
  for (const q of cases) it(q, () => { for (const x of both(q)) expect(classifyTopic(x), x).toBe("relationship"); });
});

describe("工作、钱、健康、学业不被「他 / 我」抢走", () => {
  it("career", () => {
    for (const q of ["獵頭這週會不會聯繫我談新職缺", "Anna 能不能幫我順利入職", "我10月能不能調動回老家的單位", "下星期的面試會拿到 offer 嗎", "公司這個月會裁員嗎"]) {
      expect(classifyTopic(q), q).toBe("career");
    }
  });
  it("money", () => {
    for (const q of ["這筆資金月底前籌得到嗎", "我在老家的房子什麼時候賣得掉", "我是不是遇到詐騙了", "借出去的錢能要回來嗎"]) expect(classifyTopic(q), q).toBe("money");
  });
  it("health / study", () => {
    expect(classifyTopic("媽媽下週的手術會順利嗎")).toBe("health");
    expect(classifyTopic("是不是懷孕了")).toBe("health");
    expect(classifyTopic("孩子能考上第一志願的小學嗎")).toBe("study");
    expect(classifyTopic("下個月的日文檢定考試能過嗎")).toBe("study");
  });
  it("a partner plus a mood is still about the partner", () => {
    expect(classifyTopic("女朋友最近一直焦慮，我該怎麼辦")).toBe("relationship");
    expect(classifyTopic("他工作很忙，這週會主動找我嗎")).toBe("relationship");
  });
});

describe("「要不要 / 應該」只在别的都没说话时才算抉择", () => {
  it("decision only as the fallback", () => {
    expect(classifyTopic("我早餐要不要喝奶茶")).toBe("decision");
    expect(classifyTopic("下週去旅行該不該去")).toBe("decision");
    expect(classifyTopic("該不該接這個 offer")).toBe("career");
    expect(classifyTopic("我該不該封鎖前任")).toBe("relationship");
    expect(topicScores("該不該接這個 offer").decision).toBeGreaterThan(0);
  });
  it("what is truly general stays other", () => {
    expect(classifyTopic("中秋前後會不會有大事發生")).toBe("other");
    expect(classifyTopic("")).toBe("other");
  });
});

describe("浏览器里也能跑（没有 lookbehind，老 Safari 不会整页报错）", () => {
  it("the source carries no lookbehind", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("../src/lib/topic.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/\(\?<[=!]/);
  });
});
