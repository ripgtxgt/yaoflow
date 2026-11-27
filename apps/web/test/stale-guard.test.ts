import { describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";

/**
 * 10-22 「一件事」记忆复查 (Neil: 「可以开始」): a full reading took a seven-day ritual the reader had asked about eleven
 * days earlier for what she is still doing; a follow-up on 10-21 gave 10月16日到20日 as "the next stir"; follow-ups had
 * no check at all. The model is mocked: chatJson for readings and the second look, chatText for follow-ups.
 */
const llm = vi.hoisted(() => ({ json: [] as string[], text: [] as string[], calls: [] as { role: string; content: string }[][], textCalls: [] as { role: string; content: string }[][] }));
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  return {
    ...real,
    chatJson: vi.fn(async (messages: { role: string; content: string }[]) => { llm.calls.push(messages.map((m) => ({ ...m }))); const v = llm.json.shift(); if (v === undefined) throw new Error("no model in tests"); return v; }),
    chatText: vi.fn(async (messages: { role: string; content: string }[]) => { llm.textCalls.push(messages.map((m) => ({ ...m }))); const v = llm.text.shift(); if (v === undefined) throw new Error("no model in tests"); return v; }),
  };
});
const { oldRecords, staleCheck, staleRewrite, STALE_SYSTEM } = await import("../src/lib/stale-guard");
const { generateReading } = await import("../src/lib/generate");
const { POST: followup } = await import("../src/app/api/followup/route");

const RITUAL = "I went to a temple for a ritual: I bring him a drink every day for seven days. Will he mind?";
const matter = {
  title: "him",
  earlier_casts: [
    { date: "2026-10-11", days_ago: 11, question: RITUAL, hexagram: "Return", tier: "full", call: "The ritual and the daily drinks will not turn him back." },
    { date: "2026-10-21", days_ago: 1, question: "Does he still like me?", hexagram: "Standstill", tier: "light", call: "He keeps his distance." },
    { date: "2026-10-10", days_ago: 12, question: "(asked 12 days ago — wording withheld; the matter is 「him」)", hexagram: "x", tier: "light", call: "(withheld)" },
  ],
  reader_notes: [{ date: "2026-10-13", days_ago: 9, note: "I yelled at him on the phone" }, { date: "2026-10-21", days_ago: 1, note: "He liked my story" }],
};

describe("what counts as old", () => {
  it("questions, notes and our own calls older than three days — not the recent ones, not what is already withheld", () => {
    const old = oldRecords(matter);
    expect(old.map((o) => `${o.kind}:${o.days_ago}`)).toEqual(["asked:11", "earlier_reading:11", "wrote:9"]);
    expect(oldRecords({ ...matter, no_context: true })).toEqual([]);
    expect(oldRecords(undefined)).toEqual([]);
  });
});

describe("the second look", () => {
  const reading = { verdict: "It will not move by waiting.", strategy: "Stop the daily drinks and the ritual now; let him notice the quiet.", next_step: "This week, put the phone away in the evenings." };
  const KEYS = ["verdict", "strategy", "next_step"];

  it("nothing old to compare with: no model call at all", async () => {
    llm.calls.length = 0;
    expect(await staleCheck(reading, KEYS, { ...matter, earlier_casts: [matter.earlier_casts[1]!], reader_notes: [] }, "q")).toBeNull();
    expect(llm.calls.length).toBe(0);
  });

  it("a passage that takes the old ritual for the present comes back; a quote the model made up does not count", async () => {
    llm.calls.length = 0;
    llm.json.push(JSON.stringify({ stale: true, passages: ["Stop the daily drinks and the ritual now", "you keep praying every night"] }));
    const v = await staleCheck(reading, KEYS, matter, "Should I keep waiting for him?");
    expect(v).toEqual({ stale: true, passages: ["Stop the daily drinks and the ritual now"] });
    expect(llm.calls[0]![0]!.content).toBe(STALE_SYSTEM);
    expect(llm.calls[0]![1]!.content).toContain(RITUAL.slice(0, 40));
    llm.json.push(JSON.stringify({ stale: true, passages: ["not in the reading at all"] }));
    expect(await staleCheck(reading, KEYS, matter, "q")).toEqual({ stale: false, passages: [] });
    llm.json.push("not json");
    const broken = await staleCheck(reading, KEYS, matter, "q");
    expect(broken === null || broken.stale === false).toBe(true);
    expect(await staleCheck(reading, KEYS, matter, "q")).toBeNull(); // the model is down: the reading goes through
  });

  it("the rewrite names the passages and how old the record is", () => {
    const t = staleRewrite(["Stop the daily drinks"], oldRecords(matter));
    expect(t).toMatch(/^REWRITE REQUIRED/);
    expect(t).toContain("「Stop the daily drinks」");
    expect(t).toContain("9–11 days ago");
  });
});

describe("a full reading with old record gets the second look, and is written again once when it is stale", () => {
  const V: LineValue[] = [7, 8, 9, 7, 8, 8];
  const base = {
    verdict: "Waiting will not bring him back; the move is yours to stop making.", tendency: "Quiet for a while, then a small sign from him.",
    other_side: "He is keeping his distance and watching what you do.", basis: "The Officer line is still in the month.",
    timing: "Watch October 26 to 30; if nothing has moved by the 30th, let this round go.",
    strategy: "Stop the daily drinks and the ritual now; let him notice the quiet.", caution: "Do not chase him with several messages in one week.",
    next_step: "Today, write down three things you want for yourself.", signals: "If he writes first, it is moving. If two weeks pass in silence, let it go.",
    closing: "The quiet is part of the answer.",
  };
  it("stale → one rewrite with the passage pointed out; the rewrite is the reading", async () => {
    llm.calls.length = 0;
    llm.json.push(JSON.stringify(base));
    llm.json.push(JSON.stringify({ stale: true, passages: ["Stop the daily drinks and the ritual now"] }));
    llm.json.push(JSON.stringify({ ...base, strategy: "Whatever you were doing for him eleven days ago, nothing you do for him now will decide this; let him notice the quiet." }));
    const out = await generateReading("deep", { question: "Should I keep waiting for him?", values: V, castAtMs: Date.now() - 60_000, tzOffsetMinutes: 480, matterSoFar: matter } as never, true, "en") as unknown as Record<string, Record<string, string>>;
    expect(llm.calls.length).toBe(3);
    expect(llm.calls[1]![0]!.content).toBe(STALE_SYSTEM);
    expect(llm.calls[2]!.at(-1)!.content).toMatch(/^REWRITE REQUIRED\. These passages treat what the reader asked or wrote/);
    expect(out.strategy!.en).toMatch(/eleven days ago/);
  });

  it("not stale → the first reading stands, one look only", async () => {
    llm.calls.length = 0;
    llm.json.push(JSON.stringify(base));
    llm.json.push(JSON.stringify({ stale: false, passages: [] }));
    const out = await generateReading("deep", { question: "Should I keep waiting for him?", values: V, castAtMs: Date.now() - 60_000, tzOffsetMinutes: 480, matterSoFar: matter } as never, true, "en") as unknown as Record<string, Record<string, string>>;
    expect(llm.calls.length).toBe(2);
    expect(out.strategy!.en).toBe(base.strategy);
  });

  it("「you say … but deep down」 in any reading → written again once", async () => {
    llm.calls.length = 0;
    llm.json.push(JSON.stringify({ ...base, other_side: "You say you are fine, but deep down you still wait for him." }));
    llm.json.push(JSON.stringify(base));
    const out = await generateReading("deep", { question: "Should I keep waiting for him?", values: V, castAtMs: Date.now() - 60_000, tzOffsetMinutes: 480 } as never, true, "en") as unknown as Record<string, Record<string, string>>;
    expect(llm.calls.length).toBe(2);
    expect(llm.calls[1]!.at(-1)!.content).toMatch(/^REWRITE REQUIRED\. Field "other_side" sets the reader's own words/);
    expect(out.other_side!.en).toBe(base.other_side);
  });
});

describe("follow-ups", () => {
  const ask = (message: string, castAtMs: number) => new NextRequest("http://localhost/api/followup", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ tier: "deep", locale: "zh", message, question: "他这个月会联系我吗", values: [7, 8, 9, 7, 8, 8], castAtMs, tzOffsetMinutes: 480 }),
  });

  it("asked on a later day than the cast: the windows behind the reader are marked and the prompt says how to speak of them", async () => {
    const saved = process.env.PAYWALL;
    process.env.PAYWALL = "off";
    llm.textCalls.length = 0;
    llm.text.push("10月26日到30日这一段还在前面。");
    const res = await followup(ask("什么时候会有动静？", Date.now() - 30 * 3_600_000));
    expect(res.status).toBe(200);
    const sent = llm.textCalls[0]!;
    expect(sent[0]!.content).toContain("TODAY IS LATER THAN THE CAST");
    expect(sent[1]!.content).toContain("\"opened_on\"");
    // the same day: nothing of it
    llm.text.push("好。");
    await followup(ask("什么时候会有动静？", Date.now() - 60_000));
    expect(llm.textCalls[1]![0]!.content).not.toContain("TODAY IS LATER THAN THE CAST");
    process.env.PAYWALL = saved;
  });

  it("an answer that sets their words against their heart is written again once; the rewrite is what they get", async () => {
    const saved = process.env.PAYWALL;
    process.env.PAYWALL = "off";
    llm.textCalls.length = 0;
    llm.text.push("你嘴上说不急，心里其实很想要一个答案。");
    llm.text.push("卦上看他这段时间在收，你先把自己的事做好，月底再看他有没有先开口。");
    const res = await followup(ask("我该等吗？", Date.now() - 60_000));
    expect((await res.json()).reply).toBe("卦上看他这段时间在收，你先把自己的事做好，月底再看他有没有先开口。");
    expect(llm.textCalls.length).toBe(2);
    expect(llm.textCalls[1]!.at(-1)!.content).toMatch(/^\(system check, not the reader\) REWRITE REQUIRED/);
    process.env.PAYWALL = saved;
  });
});
