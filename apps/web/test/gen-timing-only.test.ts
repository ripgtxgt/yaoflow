import { describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";

/** 10-14 进度表 30 ③: a refused timing passage is rewritten alone; the rest of the reading is kept as written. */
const llm = vi.hoisted(() => ({ json: [] as string[], calls: [] as { role: string; content: string }[][] }));
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  return { ...real, chatJson: vi.fn(async (messages: { role: string; content: string }[]) => { llm.calls.push(messages.map((m) => ({ ...m }))); const v = llm.json.shift(); if (v === undefined) throw new Error("no model in tests"); return v; }) };
});
const { generateReading } = await import("../src/lib/generate");

const V: LineValue[] = [7, 8, 9, 7, 8, 8];
const input = { question: "Will this interview work out", values: V, castAtMs: Date.now() - 60_000, tzOffsetMinutes: 480 };
const base = {
  verdict: "It can work out, but only after they take their time.", tendency: "Slow at first, then it turns your way.",
  other_side: "They are still comparing a few people and want more time.",
  basis: "The Officer line is strong in the month and the day supports it.", strategy: "Send one short, warm follow-up and then let them decide.",
  caution: "Do not chase them with several messages in one week.", next_step: "Today, write a three-line thank-you note and send it.",
  signals: "If they ask for references, it is moving. If two weeks pass in silence, look elsewhere.", closing: "Patience here is part of the answer, not a delay.",
};

describe("只改应期那一段", () => {
  it("asks for the timing alone and merges it into the reading it already has", async () => {
    llm.calls.length = 0;
    llm.json.push(JSON.stringify({ ...base, timing: "October 3, October 5, October 9, October 12 and October 20 are all possible." }));
    llm.json.push(JSON.stringify({ timing: "Watch October 12 to 16; if nothing by the 16th, let this round go." }));
    const out = await generateReading("deep", input, true, "en") as unknown as Record<string, Record<string, string>>;
    expect(llm.calls.length).toBe(2);
    expect(llm.calls[1]!.at(-1)!.content).toMatch(/REWRITE ONLY THE TIMING[\s\S]*Output ONLY this JSON/);
    expect(out.timing!.en).toBe("Watch October 12 to 16; if nothing by the 16th, let this round go.");
    expect(out.verdict!.en).toBe(base.verdict);
    expect(out.closing!.en).toBe(base.closing);
  });
});
