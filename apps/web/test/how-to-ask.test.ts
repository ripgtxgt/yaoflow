import { describe, expect, it } from "vitest";
import { HOW_TO_ASK_LOCALES, howToAskFor } from "../src/lib/how-to-ask";
import { LOCALES } from "../src/lib/locales";

/** 进度表 23 「怎麼問、怎麼看」: four parts, the plain voice, no AI / accuracy / price. */
describe("how-to-ask", () => {
  it("is written in all nine languages, each its own", () => {
    expect(HOW_TO_ASK_LOCALES).toEqual(LOCALES);
    for (const l of HOW_TO_ASK_LOCALES) expect(howToAskFor(l).title.length).toBeGreaterThan(4);
    expect(new Set(LOCALES.map((l) => howToAskFor(l).title)).size).toBe(LOCALES.length);
    for (const l of LOCALES) {
      const a = howToAskFor(l);
      expect(a.ask.rules.length).toBe(3);
      expect(a.ask.pairs.length).toBeGreaterThanOrEqual(10);
      expect(a.bad.angles.length).toBe(3);
      expect(a.again.rules.length).toBe(5);
      expect(a.check.steps.length).toBe(3);
    }
  });

  it("never says AI, never quotes an accuracy figure, never a price", () => {
    for (const l of HOW_TO_ASK_LOCALES) {
      const text = JSON.stringify(howToAskFor(l));
      expect(text).not.toMatch(/\bAI\b|人工智能|人工智慧|準確率|准确率|的中率|accuracy rate|\d+\s*%|NT\$|US\$|HK\$|¥\d/);
    }
  });

  it("the Japanese exam example does not ask for a pass/fail verdict", () => {
    const ja = howToAskFor("ja");
    const exam = ja.ask.pairs.find((p) => p.from.includes("受かる"))!;
    expect(exam.to).toContain("実る");
    expect(exam.to).not.toMatch(/合格|受かり/);
  });
});
