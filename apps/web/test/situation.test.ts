import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { parseOdds, parseSituation, SITUATIONS, SITUATION_LABELS } from "../src/lib/situation";
import { buildUserPayload, deepSystem, DEEP_KEYS, jargonOffense, resolveServerChart } from "../src/lib/reading";

describe("解读方向优化（09-26）", () => {
  it("only known situations and odds codes pass", () => {
    expect(parseSituation("apart")).toBe("apart");
    expect(parseSituation("married")).toBeUndefined();
    expect(parseOdds(" hard ")).toBe("hard");
    expect(parseOdds("70%")).toBeUndefined();
    for (const l of Object.keys(SITUATION_LABELS)) for (const k of SITUATIONS) expect(SITUATION_LABELS[l]![k].length).toBeGreaterThan(1);
  });

  it("the reader's situation reaches the model as a stated fact, and the deep reading asks for the other side and the odds", () => {
    const V: LineValue[] = [7, 8, 9, 8, 7, 8];
    const chart = resolveServerChart({ question: "他會回來嗎", values: V, castAtMs: Date.now(), tzOffsetMinutes: 480 });
    const p = JSON.parse(buildUserPayload("他會回來嗎", chart, undefined, { situation: "apart" }));
    expect(p.reader_context.situation).toBe("apart");
    expect(JSON.parse(buildUserPayload("他會回來嗎", chart)).reader_context).toBeUndefined();
    expect(DEEP_KEYS).toContain("other_side");
    const sys = deepSystem("zh-hant");
    expect(sys).toContain('"odds"');
    expect(sys).toContain("other_side");
    expect(sys).toContain("reader_context");
  });

  it("the metaphors readers kept asking about are sent back for a rewrite (outside basis)", () => {
    expect(jargonOffense({ closing: "取決於他自己那口氣順了沒有" }, ["basis"], "zh-hant")).toMatch(/^closing:/);
    expect(jargonOffense({ strategy: "他那條線什麼時候才會鬆" }, ["basis"], "zh-hant")).toMatch(/^strategy:/);
    expect(jargonOffense({ basis: "那口氣" }, ["basis"], "zh-hant")).toBeNull();
    expect(jargonOffense({ closing: "他還在介意上次的事，先別催他。" }, ["basis"], "zh-hant")).toBeNull();
  });
});
