import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CRISIS_T, isCrisis } from "../src/lib/crisis";
import { questionIssue } from "../src/lib/question-check";
import { LOCALES } from "../src/lib/locales";

describe("危机词闸门（09-26）", () => {
  it("catches self-harm phrasing in every language", () => {
    for (const q of [
      "我不想活了，还有意义吗", "我好想死", "想自杀怎么办", "活不下去了", "我想結束自己的生命", "想割腕",
      "should I kill myself", "I want to die", "I've been thinking about suicide", "I keep hurting myself",
      "死にたいです", "消えたい", "죽고 싶어요", "자살 생각이 나요",
      "j'ai envie de mourir", "je pense au suicide", "ich will mich umbringen", "Suizidgedanken",
      "quiero morir", "no quiero vivir más", "quero morrer", "não quero mais viver",
    ]) expect(isCrisis(q), q).toBe(true);
  });

  it("leaves ordinary questions alone, including colloquial 'to death' phrases", () => {
    for (const q of [
      "想死你了，他什么时候回来", "笑死，这个offer要不要接", "累死了，要不要换工作", "他还爱我吗", "自杀式袭击的新闻会影响股市吗",
      "Will I get the job?", "should I move to Berlin", "転職すべき?", "이직해도 될까요", "Dois-je accepter l'offre ?",
    ]) expect(isCrisis(q), q).toBe(false);
  });

  it("is a hard question issue, so every paid path refuses it", () => {
    expect(questionIssue("我不想活了", "zh")).toBe("crisis");
    expect(questionIssue("I want to die", "en")).toBe("crisis");
  });

  it("has copy and at least one helpline for all nine languages", () => {
    for (const l of LOCALES) {
      expect(CRISIS_T[l].lines.length, l).toBeGreaterThan(0);
      expect(CRISIS_T[l].lead.length, l).toBeGreaterThan(10);
    }
  });

  it("uses no lookbehind (runs in the browser)", () => {
    expect(readFileSync(new URL("../src/lib/crisis.ts", import.meta.url), "utf8")).not.toMatch(/\(\?<[=!]/);
  });
});
