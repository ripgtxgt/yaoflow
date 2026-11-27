import { describe, expect, it, vi, afterEach } from "vitest";
import type { LineValue } from "@yaoflow/engine";

/**
 * 11-06 (Neil:「付费引导弱爆了，我们不会让AI根据用户的问题去自行调整吗？」): the block before the price is written for the
 * reader by default — the first cast too — with a share of browsers kept on the ready versions as the control.
 */
const llm = vi.hoisted(() => ({ json: [] as unknown[], calls: [] as { messages: { role: string; content: string }[] }[] }));
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  return {
    ...real,
    chatJson: vi.fn(async (messages: { role: string; content: string }[]) => {
      llm.calls.push({ messages });
      const v = llm.json.shift();
      if (v === undefined) throw new Error("no model in tests");
      return v as string;
    }),
    chatText: vi.fn(async () => { throw new Error("no model in tests"); }),
  };
});

const { db } = await import("../src/lib/db");
const cl = await import("../src/lib/cast-log");
const nudge = await import("../src/lib/nudge");

const NOW = Date.now();
const V1: LineValue[] = [7, 8, 7, 8, 7, 8];
const inp = (question: string, at: number) => ({ question, values: V1, castAtMs: at, tzOffsetMinutes: 480 });
const BLOCK = { title: "他會不會主動，看這一卦", body: "你想知道的是他接下來會不會靠近、哪幾天有動靜、你現在先做什麼。深斷照你這件事一一說清楚。", cta: "看他會不會主動 · {price}" };

afterEach(() => { llm.json.length = 0; llm.calls.length = 0; delete process.env.NUDGE_PERSONAL_SHARE; delete process.env.NUDGE_PERSONAL; });

let seq = 0;
async function firstCast(q = "他到底喜不喜歡我"): Promise<NonNullable<Awaited<ReturnType<typeof cl.logCast>>>> {
  seq += 1;
  return (await cl.logCast({ bid: `ai${String(seq).padStart(14, "0")}`, input: inp(q, NOW - 3_600_000 + seq * 60_000), locale: "zh-hant" }))!;
}

describe("11-06 按读者的问题写引导（默认）", () => {
  it("the first cast gets a block written for it, kept on the cast; a second request costs no model call", async () => {
    process.env.NUDGE_PERSONAL_SHARE = "1";
    nudge.ensureSeeds();
    expect(nudge.variantById("n1-personal")?.status).toBe("active");
    const info = await firstCast();
    llm.json.push(JSON.stringify(BLOCK), JSON.stringify({ ok: true }));
    const out = (await nudge.nudgeFor(info, "zh-hant", NOW))!;
    expect(out).toMatchObject({ id: "n1-personal", goal: "deep", title: BLOCK.title });
    // the writer was told it is the first cast and saw the question
    expect(llm.calls[0]!.messages[0]!.content).toContain("FIRST cast");
    expect(llm.calls[0]!.messages[1]!.content).toContain("他到底喜不喜歡我");
    db().prepare("UPDATE cast_log SET nudge = ? WHERE id = ?").run(out.id, info.logId);
    const calls = llm.calls.length;
    expect((await nudge.nudgeFor(info, "zh-hant", NOW))!.title).toBe(BLOCK.title);
    expect(llm.calls.length).toBe(calls);
  });

  it("a block that fails the guards gives way to a ready first-cast version", async () => {
    process.env.NUDGE_PERSONAL_SHARE = "1";
    const info = await firstCast("這次面試會不會上");
    llm.json.push(JSON.stringify({ ...BLOCK, body: "3 天內就有消息，深斷告訴你是哪一天、你可以先做什麼。" }));
    const out = (await nudge.nudgeFor(info, "zh-hant", NOW))!;
    expect(out.id).not.toBe("n1-personal");
    expect(out.id).toMatch(/^n1-/);
  });

  it("control browsers (share 0) get ready words with no model call; a special-category question never goes to the writer", async () => {
    process.env.NUDGE_PERSONAL_SHARE = "0";
    const a = await firstCast("我們會不會在一起");
    expect((await nudge.nudgeFor(a, "zh-hant", NOW))!.id).toMatch(/^n1-(line|answer)$/);
    expect(llm.calls.length).toBe(0);
    expect(nudge.inPersonalDefault("anything")).toBe(false);
    process.env.NUDGE_PERSONAL_SHARE = "1";
    expect(nudge.inPersonalDefault("anything")).toBe(true);
    process.env.NUDGE_PERSONAL = "off";
    expect(nudge.inPersonalDefault("anything")).toBe(false);
  });

  it("11-06 ①: the writer gets this cast's free line when it is ready, builds on it, and may not copy it", async () => {
    process.env.NUDGE_PERSONAL_SHARE = "1";
    const LINE = "他其實有在意，只是這份在意被他壓著沒說出口。";
    const a = await firstCast("他到底在不在意我");
    llm.json.push(JSON.stringify(BLOCK), JSON.stringify({ ok: true }));
    const out = (await nudge.nudgeFor(a, "zh-hant", NOW, { line: Promise.resolve(LINE) }))!;
    expect(out.id).toBe("n1-personal");
    expect(llm.calls[0]!.messages[1]!.content).toContain(LINE);
    expect(llm.calls[0]!.messages[0]!.content).toContain("build on it");
    // a block that copies the line is sent back once, then gives way
    llm.calls.length = 0;
    const b = await firstCast("他到底在不在意我呢");
    const copy = { ...BLOCK, body: "他其實有在意，只是這份在意被他壓著沒說出口。深斷說清楚他會不會表現出來。" };
    llm.json.push(JSON.stringify(copy), JSON.stringify(copy));
    const out2 = (await nudge.nudgeFor(b, "zh-hant", NOW, { line: Promise.resolve(LINE) }))!;
    expect(out2.id).not.toBe("n1-personal");
    expect(llm.calls[1]!.messages.at(-1)!.content).toContain("copies the free line");
  });

  it("11-06 ②: on the 4th+ cast with the 通卡 model live, the writer and the checker know the button is a one-day pass", () => {
    process.env.TONGKA_MODEL = "on";
    expect(nudge.personalSystem("n4", "zh-hant")).toContain("one-day pass");
    expect(nudge.personalClaimSystem("n4")).toContain("one-day pass");
    expect(nudge.personalSystem("n2", "zh-hant")).not.toContain("one-day pass");
    process.env.TONGKA_MODEL = "off";
    expect(nudge.personalSystem("n4", "zh-hant")).not.toContain("one-day pass");
  });

  it("the written arms are never retired by the loser sweep", () => {
    nudge.retireLosers(NOW);
    for (const id of ["n1-personal", "n2-personal", "n3-personal", "n4-personal"]) expect(nudge.variantById(id)?.status, id).toBe("active");
  });
});
