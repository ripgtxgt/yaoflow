import { describe, expect, it, vi, beforeAll, afterEach } from "vitest";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-04 按人写的引导 (Neil: 「像这种用户，AI会根据他前几次的问题和卦象来自动调整引导下一次摇卦的付费引导吗？」→「要」).
 * The model is stubbed: each test queues what it needs (a function is a slow answer); an empty queue throws like a dead provider.
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
      if (v instanceof Error) throw v;
      if (typeof v === "function") return await (v as () => Promise<string>)();
      return v as string;
    }),
    chatText: vi.fn(async () => { throw new Error("no model in tests"); }),
  };
});

const { db } = await import("../src/lib/db");
const cl = await import("../src/lib/cast-log");
const nudge = await import("../src/lib/nudge");
const { PRIVACY, LEGAL_UPDATED } = await import("../src/lib/legal");
const { PRIVACY_HANT } = await import("../src/lib/legal-hant");

const H = 3_600_000;
const NOW = Date.now();
const V1: LineValue[] = [7, 8, 7, 8, 7, 8];
const V2: LineValue[] = [9, 8, 7, 7, 8, 6];
const inp = (question: string, at: number, values: LineValue[] = V1) => ({ question, values, castAtMs: at, tzOffsetMinutes: 480 });
const ok = (t: { title: string; body: string; cta: string }) => JSON.stringify(t);
const GOOD = { title: "和他的事，再看一次", body: "前一卦那一句不太順著你想的方向。深斷把兩卦放在一起讀，說清楚卡在哪、接下來看哪幾天。", cta: "兩卦一起讀 · {price}" };

afterEach(() => { llm.json.length = 0; llm.calls.length = 0; delete process.env.NUDGE_PERSONAL; });
beforeAll(() => {
  nudge.variants("n2"); // seeds in
  // n2-merge set aside: a reader who already saw n2-plain then has only the written-per-reader version left to draw,
  // and n2-plain to fall back to — every test below is deterministic. 10-05: n2-bad too (the first line here leans
  // "bad", which would put it in the draw; test/nudge-lean.test.ts covers it)
  db().prepare("UPDATE nudge_variants SET status = 'draft' WHERE id IN ('n2-merge', 'n2-bad')").run();
});

let seq = 0;
/** One reader, one matter: a first cast whose free line leaned against them and which (for the test) showed n2-plain, then the second cast. */
async function secondCast(q = "他還會回來嗎", o: { capped?: boolean } = {}): Promise<NonNullable<Awaited<ReturnType<typeof cl.logCast>>>> {
  seq += 1;
  const bid = `ab${String(seq).padStart(14, "0")}`;
  const t0 = NOW - 10 * H + seq * 60_000;
  const a1 = (await cl.logCast({ bid, input: inp(q, t0), locale: "zh-hant", capped: o.capped }))!;
  if (!o.capped) cl.setLogTeaser(a1.logId, "他還在猶豫，主動權不在你這邊。", null);
  db().prepare("UPDATE cast_log SET lean = 'bad', nudge = 'n2-plain', nudge_seen = 1 WHERE id = ?").run(a1.logId);
  return (await cl.logCast({ bid, input: inp(q, t0 + H, V2), locale: "zh-hant" }))!;
}

describe("按人写的版本在抽签里", () => {
  it("every stage has one, live, speaking every language (11-06: the 4th's back and the 1st joins — the written block is the default); NUDGE_PERSONAL=off or a caller's no leaves it out", () => {
    for (const id of ["n1-personal", "n2-personal", "n3-personal", "n4-personal"]) expect(nudge.variantById(id)).toMatchObject({ status: "active", source: "personal" });
    const picks = (ctx = {}) => new Set(Array.from({ length: 200 }, () => nudge.pickVariant("n2", "ko", NOW, Math.random, ctx)!.id));
    expect(picks().has("n2-personal")).toBe(true);
    expect(picks({ personal: false }).has("n2-personal")).toBe(false);
    process.env.NUDGE_PERSONAL = "off";
    expect(picks().has("n2-personal")).toBe(false);
  });

  it("what a person already saw is left out of their next draw — unless nothing else would be left", () => {
    const seen = new Set(["n2-plain"]);
    for (let i = 0; i < 50; i++) expect(nudge.pickVariant("n2", "zh-hant", NOW, Math.random, { exclude: seen })!.id).toBe("n2-personal");
    expect(nudge.pickVariant("n2", "zh-hant", NOW, Math.random, { exclude: seen, personal: false })!.id).toBe("n2-plain");
  });
});

describe("写给这个人", () => {
  it("reads their matter so far and writes their block: kept on the cast, the same words on a refresh", async () => {
    const info = await secondCast();
    llm.json.push(ok(GOOD), JSON.stringify({ ok: true }));
    const out = await nudge.nudgeFor(info, "zh-hant", NOW);
    expect(out).toEqual({ id: "n2-personal", goal: "deep", ...GOOD });
    // what the writer was given: their question, the figure, how the line leaned, the block they saw — this cast's line still unknown
    const sent = llm.calls[0]!.messages;
    expect(sent[0]!.content).toContain("for ONE reader, on their 2nd cast");
    expect(sent[1]!.content).toContain("他還會回來嗎");
    expect(sent[1]!.content).toContain("against what they hoped");
    expect(sent[1]!.content).toContain("this cast DOES show a free line"); // never "none": it is written alongside
    expect(sent[1]!.content).toContain("同一件事的第二卦"); // n2-plain's title: an angle not to repeat
    // the claim check read it against their own facts
    expect(llm.calls[1]!.messages[0]!.content).toContain("ONE reader right before the price");
    expect(JSON.parse(cl.logRow(info.logId)!.nudge_text!)).toMatchObject({ locale: "zh-hant", ...GOOD });
    cl.setLogNudge(info.logId, out!.id); // what the route does
    expect(await nudge.nudgeFor(info, "zh-hant", NOW)).toEqual(out);
    expect(llm.calls).toHaveLength(2); // no second writing
    expect(nudge.recentPersonal("n2-personal", 3)[0]).toMatchObject({ locale: "zh-hant", text: GOOD });
  });

  it("a cast the day's limit left without a line is told as such", async () => {
    const info = await secondCast("要不要換工作到台北", { capped: true });
    const facts = cl.personalFacts(info, "zh-hant", NOW);
    expect(facts.earlier_casts[0]!.free_line_leaned).toContain("the day's limit");
    expect(facts.this_cast_number).toBe(2);
  });

  it("anything that fails gives way to ready words, counted as those words: the guards, a quoted question, the claim check, no answer in time", async () => {
    // the guards (urgency, a discount, a guarantee)
    let info = await secondCast();
    llm.json.push(ok({ title: "最後機會", body: "限時優惠，今天內購買，保證準確。", cta: "立刻買 · {price}" }));
    expect((await nudge.nudgeFor(info, "zh-hant", NOW))!.id).toBe("n2-plain");
    expect(cl.logRow(info.logId)!.nudge_text ?? null).toBeNull();
    // their whole question in it
    const q = "我和前男友分手三個月了他還會回來找我嗎";
    info = await secondCast(q);
    llm.json.push(ok({ title: "這件事的第二卦", body: `你問的「${q}」，深斷把兩卦放在一起讀，說清楚卡在哪。`, cta: "一起讀 · {price}" }));
    expect((await nudge.nudgeFor(info, "zh-hant", NOW))!.id).toBe("n2-plain");
    // the claim check doubts it, or cannot run
    info = await secondCast();
    llm.json.push(ok(GOOD), JSON.stringify({ ok: false, why: "「他會回來」不一定成立" }));
    expect((await nudge.nudgeFor(info, "zh-hant", NOW))!.id).toBe("n2-plain");
    info = await secondCast();
    llm.json.push(ok(GOOD), new Error("provider down"));
    expect((await nudge.nudgeFor(info, "zh-hant", NOW))!.id).toBe("n2-plain");
    // the writer is slower than the page may wait
    info = await secondCast();
    llm.json.push(() => new Promise((r) => setTimeout(() => r(ok(GOOD)), 300)));
    expect((await nudge.nudgeFor(info, "zh-hant", NOW, { budgetMs: 50 }))!.id).toBe("n2-plain");
    await new Promise((r) => setTimeout(r, 400));
  });

  it("two requests for one cast share one writing", async () => {
    const info = await secondCast();
    llm.json.push(ok(GOOD), JSON.stringify({ ok: true }));
    const [a, b] = await Promise.all([nudge.nudgeFor(info, "zh-hant", NOW), nudge.nudgeFor(info, "zh-hant", NOW)]);
    expect(a).toEqual(b);
    expect(a!.id).toBe("n2-personal");
    expect(llm.calls).toHaveLength(2);
  });

  it("a special-category matter gets ready words only — nothing of it goes to a writer", async () => {
    const info = await secondCast("我的手術會順利嗎");
    expect(info.row.sensitive).toBe("health");
    expect((await nudge.nudgeFor(info, "zh-hant", NOW))!.id).toBe("n2-plain");
    expect(llm.calls).toHaveLength(0);
  });
});

describe("隐私政策：付款前那段说明可能由 AI 读前几卦专门写", () => {
  it("every language says so, dated 10-04", () => {
    expect(LEGAL_UPDATED >= "2026-10-04").toBe(true); // 10-07: the guarantee's "once per person" changed it again
    const text = (l: string) => (l === "zh-hant" ? JSON.stringify(PRIVACY_HANT) : JSON.stringify(PRIVACY.map((s) => (s as unknown as Record<string, unknown>)[l])));
    const says: Record<string, string> = {
      zh: "付款前给你看的那段说明（可能由 AI 读你这件事的前几卦专门写给你）", "zh-hant": "付款前給你看的那段說明（可能由 AI 讀你這件事的前幾卦專門寫給你）",
      en: "the note shown to you before the price (which an AI may write for you", ja: "価格の前に表示する説明文（その件で前に立てた卦をもとに AI があなた向けに", ko: "가격 앞에 보여 드리는 안내 문구(그 일로 앞서 뽑은 괘들을 바탕으로 AI가",
      fr: "le texte affiché avant le prix (qu'une IA peut rédiger pour vous", de: "der Text vor dem Preis (den eine KI aus deinen früheren Würfen", es: "el texto que ves antes del precio (que una IA puede escribir para ti", pt: "o texto mostrado antes do preço (que uma IA pode escrever para você",
    };
    for (const [l, s] of Object.entries(says)) expect(text(l), l).toContain(s);
  });
});
