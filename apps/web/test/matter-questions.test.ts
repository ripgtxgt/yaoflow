import { describe, expect, it } from "vitest";
import { mergeNew, parseGroups, questionsPrompt, wordGroups, type QCast } from "../src/lib/matter-questions";

const c = (id: number, question: string, d = id): QCast => ({ id, question, created_at: Date.UTC(2026, 8, d), locale: "zh-hant" });

describe("parseGroups", () => {
  it("keeps every id exactly once and drops unknown ids", () => {
    const g = parseGroups(JSON.stringify({ groups: [{ label: "他怎麼想？", ids: [1, 2, 99] }, { label: "何時聯絡", ids: [2, 3] }] }), new Set([1, 2, 3, 4]))!;
    expect(g.map((x) => x.ids)).toEqual([[1, 2], [3], [4]]);
    expect(g[0]!.label).toBe("他怎麼想");
  });
  it("returns null on junk", () => {
    expect(parseGroups("not json", new Set([1]))).toBeNull();
    expect(parseGroups("{}", new Set([1]))).toBeNull();
  });
});

describe("wordGroups / mergeNew", () => {
  it("joins identical wordings", () => {
    const g = wordGroups([c(1, "他還喜歡我嗎"), c(2, "他還喜歡我嗎？"), c(3, "我該換工作嗎")]);
    expect(g.length).toBe(2);
    expect(g.find((x) => x.ids.includes(1))!.ids).toEqual([1, 2]);
  });
  it("places new casts into the cached groups and drops moved ones", () => {
    const out = mergeNew([{ label: "A", ids: [1, 2] }, { label: "B", ids: [3] }], [c(1, "他還喜歡我嗎"), c(3, "我該換工作嗎"), c(5, "他還喜歡我嗎？"), c(6, "完全不同的事情")]);
    expect(out[0]!.ids).toEqual([1, 5]);
    expect(out[1]!.ids).toEqual([3]);
    expect(out[2]!.ids).toEqual([6]);
  });
  it("prompt asks for JSON groups", () => {
    expect(questionsPrompt()).toMatch(/"groups"/);
  });
});
