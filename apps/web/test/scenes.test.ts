import { describe, expect, it } from "vitest";
import { resolveCast, type LineValue } from "@yaoflow/engine";
import { sceneAlternates, sceneBySlug, sceneLocales, scenePath, scenesFor } from "../src/lib/scenes";

/** §14 ⑭ 场景页: the reviewed data files stay whole, honest, and consistent across languages. */
describe("scenes", () => {
  it("ships all nine languages, every situation in every language, under one slug (09-24: 补完全)", () => {
    const ALL = ["de", "en", "es", "fr", "ja", "ko", "pt", "zh", "zh-hant"];
    expect(sceneLocales().sort()).toEqual(ALL);
    for (const l of ALL) expect(scenesFor(l as never), l).toHaveLength(8);
    for (const s of scenesFor("en")) {
      expect(sceneAlternates(s.slug).sort()).toEqual(ALL);
      // same situation, same example cast, same hexagrams in every language
      for (const l of ALL) {
        const x = sceneBySlug(l as never, s.slug)!;
        expect(x.example.values, `${l}/${s.slug}`).toBe(s.example.values);
        expect(x.hexagrams, `${l}/${s.slug}`).toEqual(s.hexagrams);
        expect(x.topic).toBe(s.topic);
      }
    }
    expect(scenePath("ja", "moving")).toBe("/ja/for/moving");
    expect(sceneBySlug("en", "nope")).toBeNull();
  });

  it("every page is complete, its example chart is a real cast, and nothing crosses the red lines", () => {
    const RED = /\d\d\s*%|predict(s|ing|ed)? (your|the) future|\bguaranteed\b|神準|必ず(?!しも)|(よく|絶対に?)当たる|百分之[百九]/i;
    for (const l of sceneLocales()) {
      for (const s of scenesFor(l)) {
        expect(s.title.length, `${l}/${s.slug} title`).toBeLessThanOrEqual(70);
        expect(s.meta.length, `${l}/${s.slug} meta`).toBeLessThanOrEqual(160);
        expect(s.intro.length).toBeGreaterThanOrEqual(2);
        expect(s.how.points.length).toBeGreaterThanOrEqual(3);
        expect(s.patterns.length).toBeGreaterThanOrEqual(3);
        expect(s.faq.length).toBe(3);
        expect(s.example.values).toMatch(/^[6789]{6}$/);
        const cast = resolveCast(s.example.values.split("").map(Number) as LineValue[]);
        expect(cast.primary.number).toBeGreaterThan(0);
        for (const n of s.hexagrams) expect(n).toBeGreaterThanOrEqual(1);
        expect(JSON.stringify(s), `${l}/${s.slug} red line`).not.toMatch(RED);
        if (l === "zh-hant") expect(JSON.stringify(s), `${l}/${s.slug} 简体字`).not.toMatch(/[这么为说时会将来对给认让还应该开关业经过发现见问间们财冲]/);
        expect(s.title).not.toContain("| YaoFlow");
        if (l === "fr") expect(JSON.stringify(s), `${l}/${s.slug} vous`).not.toMatch(/(?<!\p{L})(tu|ton|ta|tes|toi)(?!\p{L})/u);
      }
    }
  });
});
