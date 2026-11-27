import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";

/**
 * 10-03 起卦记录 + 付费话术学习 (Neil: 「从一个人第一次摇卦开始，记录他的所有问题和卦象……让AI整合所有出相关信息，
 * 然后对之后的卦象和付费引导的话术进行不停地学习和优化」→「只改隐私政策，不告诉读者」→「完整实现，不要阉割」).
 * The model is stubbed: each test queues the answers it needs (lib/llm), and an empty queue throws like a dead provider.
 */
const llm = vi.hoisted(() => ({ json: [] as (string | Error)[], text: [] as (string | Error)[], calls: [] as { kind: "json" | "text"; messages: { role: string; content: string }[] }[] }));
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  const next = (q: (string | Error)[]) => { const v = q.shift(); if (v === undefined) throw new Error("no model in tests"); if (v instanceof Error) throw v; return v; };
  return {
    ...real,
    chatJson: vi.fn(async (messages: { role: string; content: string }[]) => { llm.calls.push({ kind: "json", messages }); return next(llm.json); }),
    chatText: vi.fn(async (messages: { role: string; content: string }[]) => { llm.calls.push({ kind: "text", messages }); return next(llm.text); }),
  };
});

const cl = await import("../src/lib/cast-log");
const nudge = await import("../src/lib/nudge");
const { db, upsertCustomer, recordOrder, eraseCustomer } = await import("../src/lib/db");
const { linkBrowser, BID_COOKIE } = await import("../src/lib/browsers");
const { generateTeaser, countOffense, tidyTeaser } = await import("../src/lib/teaser");
const { deepSystem, oneSystem, buildUserPayload, resolveServerChart, teaserSystem } = await import("../src/lib/reading");
const { POST: teaserPOST } = await import("../src/app/api/teaser/route");
const { POST: logPOST } = await import("../src/app/api/cast/log/route");
const { POST: trackPOST } = await import("../src/app/api/track/route");
const { eventLabel } = await import("../src/lib/live-labels");
const { PRIVACY } = await import("../src/lib/legal");
const { PRIVACY_HANT } = await import("../src/lib/legal-hant");
const { LOCALES } = await import("../src/lib/locales");
const { castsForTrail, peopleList } = await import("../src/lib/people");
const { CAST_THREAD_T, ctt, shortDay } = await import("../src/lib/dict/cast-thread");

const H = 3_600_000;
const NOW = Date.now();
const V1: LineValue[] = [7, 8, 7, 8, 7, 8];
const V2: LineValue[] = [9, 8, 7, 7, 8, 6];
const V3: LineValue[] = [8, 8, 7, 9, 7, 7];
const inp = (question: string, at: number, values: LineValue[] = V1) => ({ question, values, castAtMs: at, tzOffsetMinutes: 480 });

beforeEach(() => { llm.json.length = 0; llm.text.length = 0; llm.calls.length = 0; });

describe("起卦记录：每一卦写下来，归到一件事", () => {
  it("files the first cast as a new matter, a near-identical one into it without the model, and asks the model only when unsure", async () => {
    const bid = "dddddddddddd0001";
    const a = await cl.logCast({ bid, s: "tabdddd00001", input: inp("他還會回來找我嗎", NOW - 5 * H), locale: "zh-hant" });
    expect(a).toMatchObject({ n: 1, earlier: [] });
    expect(a!.row).toMatchObject({ question: "他還會回來找我嗎", sensitive: null, s: "tabdddd00001", locale: "zh-hant" });
    expect(llm.calls).toHaveLength(0); // nothing open to join: no model

    const b = await cl.logCast({ bid, input: inp("他還會不會回來找我", NOW - 4 * H, V2), locale: "zh-hant" });
    expect(b).toMatchObject({ n: 2, threadId: a!.threadId, how: "rule" });
    expect(b!.earlier.map((r) => r.question)).toEqual(["他還會回來找我嗎"]);
    expect(llm.calls).toHaveLength(0); // the words were near enough

    llm.json.push(JSON.stringify({ matter: a!.threadId, title: "和他的關係" }));
    const c = await cl.logCast({ bid, input: inp("我們之間還有沒有可能", NOW - 3 * H, V3), locale: "zh-hant" });
    expect(c).toMatchObject({ n: 3, threadId: a!.threadId, how: "model", title: "和他的關係" });
    expect(llm.calls[0]!.messages[1]!.content).toContain("他還會回來找我嗎"); // the model saw the open matter's questions

    llm.json.push(JSON.stringify({ matter: null, title: "面試" }));
    const d = await cl.logCast({ bid, input: inp("下個月的面試會過嗎", NOW - 2 * H), locale: "zh-hant" });
    expect(d).toMatchObject({ n: 1 });
    expect(d!.threadId).not.toBe(a!.threadId);
    expect(cl.threadRow(a!.threadId)).toMatchObject({ n: 3, title: "和他的關係" });
  });

  it("the same instant twice is one filing; a question changed after the cast is filed afresh", async () => {
    const bid = "dddddddddddd0002";
    const a = await cl.logCast({ bid, input: inp("要不要換工作", NOW - 3 * H), locale: "zh-hant" });
    const again = await cl.logCast({ bid, input: inp("要不要換工作", NOW - 3 * H), locale: "zh-hant", capped: true });
    expect(again!.logId).toBe(a!.logId);
    expect(cl.logRow(a!.logId)!.capped).toBe(1);
    const edited = await cl.logCast({ bid, input: inp("今年要不要換工作，去台北", NOW - 3 * H), locale: "zh-hant" });
    expect(edited!.logId).toBe(a!.logId);
    expect(cl.logRow(a!.logId)!.question).toBe("今年要不要換工作，去台北");
  });

  it("never writes a crisis question; keeps only the category of a health one — never its words or its line", async () => {
    const bid = "dddddddddddd0003";
    expect(await cl.logCast({ bid, input: inp("我不想活了", NOW - H), locale: "zh-hant" })).toBeNull();
    const h = await cl.logCast({ bid, input: inp("我媽媽的手術會順利嗎", NOW - H), locale: "zh-hant" });
    expect(h!.row).toMatchObject({ question: null, sensitive: "health", topic: "health" });
    cl.setLogTeaser(h!.logId, "這件事會順利。", "style-held");
    expect(cl.logRow(h!.logId)).toMatchObject({ teaser: null, style: "style-held" });
    // a second health question joins the same kind of matter by its category
    const h2 = await cl.logCast({ bid, input: inp("住院要多久", NOW - H + 60_000, V2), locale: "zh-hant" });
    expect(h2).toMatchObject({ n: 2, threadId: h!.threadId });
    expect(cl.priorsFor(h2!, "zh-hant").earlier_casts[0]!.question).toContain("words not kept");
    expect(cl.sensitiveKind("他有前科，還能嫁嗎", "relationship")).toBe("crime");
    expect(cl.sensitiveKind("我們的性生活不和諧", "relationship")).toBe("sex");
  });

  it("one person's browsers share their matters (filed under one customer)", async () => {
    const cid = upsertCustomer("castlog-two@example.com", "zh-hant");
    linkBrowser("dddddddddddd0004", cid, "pay");
    linkBrowser("dddddddddddd0005", cid, "login");
    const a = await cl.logCast({ bid: "dddddddddddd0004", input: inp("她會答應我的求婚嗎", NOW - 6 * H), locale: "zh-hant" });
    const b = await cl.logCast({ bid: "dddddddddddd0005", input: inp("她會不會答應我的求婚", NOW - 5 * H, V2), locale: "zh-hant" });
    expect(b).toMatchObject({ n: 2, threadId: a!.threadId });
    expect(cl.personBids("dddddddddddd0005").sort()).toEqual(["dddddddddddd0004", "dddddddddddd0005"]);
  });

  it("the cast page's view: which cast this is and the figures before it", async () => {
    const bid = "dddddddddddd0006";
    await cl.logCast({ bid, input: inp("新公司會錄取我嗎", NOW - 30 * H), locale: "zh-hant" });
    const b = await cl.logCast({ bid, input: inp("新公司會不會錄取我", NOW - 2 * H, V2), locale: "zh-hant" });
    const v = cl.threadView(b!, "zh-hant");
    expect(v.n).toBe(2);
    expect(v.chain).toHaveLength(1);
    expect(v.chain[0]!.day).toMatch(/^20\d\d-\d\d-\d\d$/);
    expect(cl.spanDays(b!, NOW)).toBeGreaterThanOrEqual(2);
  });
});

describe("第 2 卦起：免费那一句连起来说", () => {
  it("the line sees the earlier casts and is written in the learner's style; it never counts their casts back", async () => {
    const bid = "dddddddddddd0007";
    const a = await cl.logCast({ bid, input: inp("前男友會聯絡我嗎", NOW - 8 * H), locale: "zh-hant" });
    cl.setLogTeaser(a!.logId, "他現在還沒有要主動找你的意思。", null);
    const b = await cl.logCast({ bid, input: inp("前男友會不會主動聯絡我", NOW - 7 * H, V2), locale: "zh-hant" });
    const style = nudge.styleFor(b!)!;
    expect(style.id).toMatch(/^(ai-)?style-/);
    llm.text.push("你又問了一次，他還是沒有要找你。", "和上次比，他的態度沒有變，還是在等你先開口。");
    const line = await generateTeaser({ ...inp("前男友會不會主動聯絡我", NOW - 7 * H, V2) }, "zh-hant", { thread: cl.priorsFor(b!, "zh-hant"), style });
    expect(line).toBe("和上次比，他的態度沒有變，還是在等你先開口。");
    const sys = llm.calls[0]!.messages[0]!.content;
    expect(sys).toContain("SAME MATTER AGAIN");
    expect(sys).toContain(style.prompt);
    expect(llm.calls[0]!.messages[1]!.content).toContain("same_matter_before");
    expect(llm.calls[0]!.messages[1]!.content).toContain("他現在還沒有要主動找你的意思。");
    expect(llm.calls[1]!.messages.at(-1)!.content).toContain("counts their casts");
    expect(countOffense("你第三次問這件事了")).toBe(true);
    expect(countOffense("他的態度沒有變。")).toBe(false);
    // a linked line gets a little more room than a first line
    const long = "和前面幾卦比起來，他的態度一直沒有變，這一卦也還是在等你先開口，關鍵在你願不願意先放下面子，以及你們之間那件還沒說開的事。"; // 61 characters
    expect(tidyTeaser(long, "zh-hant")).toBeNull();
    expect(tidyTeaser(long, "zh-hant", true)).toBe(long);
  });

  it("the paid reading is given every free cast on the matter, and told to read them as one", async () => {
    const bid = "dddddddddddd0008";
    const a = await cl.logCast({ bid, s: "tabdddd00081", input: inp("我和他會復合嗎", NOW - 20 * H), locale: "zh-hant" });
    cl.setLogTeaser(a!.logId, "復合的機會有，但不在他那邊先動。", "style-new");
    const b = await cl.logCast({ bid, s: "tabdddd00082", input: inp("我和他會不會復合", NOW - 10 * H, V2), locale: "zh-hant", capped: true });
    const c = await cl.logCast({ bid, s: "tabdddd00083", input: inp("我和他還會不會復合", NOW - H, V3), locale: "zh-hant" });
    db().prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run("tabdddd00083", bid, NOW - H);
    const soFar = cl.withCastThread("cs_castlog_1", { input: inp("我和他還會不會復合", NOW - H, V3), browserSid: "tabdddd00083", locale: "zh-hant" }, undefined)!;
    expect(soFar.casts_before).toBe(2);
    expect(soFar.earlier_casts.map((x) => x.tier)).toEqual(["free_line", "cast_only"]);
    expect(soFar.earlier_casts[0]!.call).toBe("復合的機會有，但不在他那邊先動。");
    expect(cl.logRow(c!.logId)!.paid_sid).toBe("cs_castlog_1");
    expect(b!.n).toBe(2);
    // no browser known: the instant to the millisecond and the same words still find it
    const again = cl.withCastThread("cs_castlog_2", { input: inp("我和他還會不會復合", NOW - H, V3), browserSid: null, locale: "zh-hant" }, undefined);
    expect(again?.earlier_casts).toHaveLength(2);
    // another browser's tab cannot pull this thread
    db().prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run("tabeeee00001", "eeeeeeeeeeee0001", NOW);
    expect(cl.withCastThread("cs_castlog_3", { input: inp("我和他還會不會復合", NOW - H, V3), browserSid: "tabeeee00001", locale: "zh-hant" }, undefined)).toBeUndefined();
    // the prompts
    expect(deepSystem("zh-hant", { thread: true })).toContain("ONE MATTER, MANY CASTS");
    expect(oneSystem("zh-hant", { thread: "light" })).toContain("take NO date");
    const chart = resolveServerChart(inp("我和他還會不會復合", NOW - H, V3));
    expect(buildUserPayload("q", chart, undefined, { matter: soFar })).toContain("free_line");
    expect(teaserSystem("zh-hant", { teaserThread: { n: 3, style: "say X" } })).toContain("cast number 3");
  });
});

describe("付费话术：守则、分配、学习", () => {
  it("every seed passes the guards in every language it speaks; bad words do not", () => {
    for (const s of nudge.SEEDS.filter((x) => x.slot !== "style")) {
      for (const l of LOCALES) {
        const t = s.texts[l];
        expect(t, `${s.id} ${l}`).toBeTruthy();
        expect(nudge.nudgeOffenses(t!, l), `${s.id} ${l}`).toEqual([]);
      }
    }
    const ok = { title: "這件事問第 {n} 次了", body: "深斷把這幾卦一起讀，說清楚前後有沒有變、接下來看哪幾天。", cta: "合起來斷 · {price}" };
    expect(nudge.nudgeOffenses(ok, "zh-hant")).toEqual([]);
    expect(nudge.nudgeOffenses({ ...ok, body: "限時優惠，今天內購買保證準確！" }, "zh-hant").join()).toMatch(/urgency.*discount.*guarantee|urgency/);
    expect(nudge.nudgeOffenses({ ...ok, cta: "合起來斷" }, "zh-hant")).toContain("cta needs {price} once");
    expect(nudge.nudgeOffenses({ ...ok, body: "已有 9 成的人買了深斷，說清楚前後有沒有變。" }, "zh-hant").join()).toContain("digits");
    expect(nudge.nudgeOffenses({ title: "Last chance", body: "Hurry — most people regret waiting. The full reading reads all your casts together.", cta: "Buy now · {price}" }, "en").length).toBeGreaterThanOrEqual(2);
    expect(nudge.fillNudge({ title: "{span}問了 {n} 次", body: "這 {n} 卦", cta: "斷 · {price}" }, { n: 3, span: 2 }, "zh-hant")).toEqual({ title: "這兩天問了 3 次", body: "這 3 卦", cta: "斷 · {price}" });
    expect(nudge.fillNudge({ title: "{span}, {n} casts", body: "b", cta: "x · {price}" }, { n: 4, span: 1 }, "en").title).toBe("Today, 4 casts");
  });

  it("with learning off everyone sees the first seed; with it on, the sampler picks among live variants", () => {
    process.env.NUDGE_LEARN = "off";
    expect(nudge.pickVariant("n2", "zh-hant")!.id).toBe("n2-merge");
    delete process.env.NUDGE_LEARN;
    const seen = new Set<string>();
    for (let i = 0; i < 90; i++) seen.add(nudge.pickVariant("n2", "zh-hant")!.id);
    // 10-04: the written-per-reader version is one of the live ones too
    expect([...seen].sort()).toEqual(["n2-merge", "n2-personal", "n2-plain"]);
    expect(nudge.slotFor(1)).toBe("n1"); // 10-31 进度表 131: no free line — the first cast has a block too
    expect(nudge.slotFor(0)).toBeNull();
    expect(nudge.slotFor(2)).toBe("n2");
    expect(nudge.slotFor(7)).toBe("n4");
  });

  it("a purchase credits the last block seen in the 72 hours before it", () => {
    const e = (id: number, person: string, t: number, variant: string) => ({ id, person, t, variant, slot: "n2" as const });
    const exps = [e(1, "p", 0, "a"), e(2, "p", 10 * H, "b"), e(3, "q", 0, "a"), e(4, "r", NOW - H, "a"), e(5, "s", 0, "b")];
    const credit = nudge.creditExposures(exps, new Map([["p", [11 * H]], ["s", [100 * H]]]), NOW);
    expect(credit.get(1)).toBe("no"); // p paid, but after a later block
    expect(credit.get(2)).toBe("paid");
    expect(credit.get(3)).toBe("no");
    expect(credit.get(4)).toBe("pending"); // shown an hour ago
    expect(credit.get(5)).toBe("no"); // paid four days later: not this block's doing
    const [pa, pb] = nudge.chanceBest([[1 + 30, 1 + 70], [1 + 2, 1 + 98]], 2000);
    expect(pa!).toBeGreaterThan(0.99);
    expect(pb!).toBeLessThan(0.01);
    const xs = Array.from({ length: 4000 }, () => nudge.betaSample(3, 7));
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeGreaterThan(0.27);
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeLessThan(0.33);
  });

  it("counts real showings and real payments from the log, and retires a clear loser (never a seed)", () => {
    const d = db();
    const put = (bid: string, variant: string, n: number, ago: number, i: number) =>
      d.prepare(`INSERT INTO cast_log (bid, s, at, tz, locale, question, values_str, primary_num, thread_n, nudge, nudge_seen, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`).run(bid, `tabstat${String(i).padStart(5, "0")}`, NOW - ago - i, 480, "zh-hant", "q", "787878", 1, n, variant, NOW - ago, NOW - ago);
    // n2-plain: three people, one of whom paid within the day
    for (let i = 0; i < 3; i++) put(`ffffffffffff000${i}`, "n2-plain", 2, 5 * 24 * H, i);
    d.prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run("tabpay000001", "ffffffffffff0001", NOW - 5 * 24 * H);
    recordOrder({ sessionId: "cs_nudge_paid_1", customerId: null, castId: null, tier: "deep", amountCents: 7500, currency: "twd", email: null, status: "paid", firstDeep: true, browserSid: "tabpay000001" });
    d.prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(NOW - 5 * 24 * H + 3 * H, "cs_nudge_paid_1");
    const st = nudge.variantStats("n2", NOW, true).get("n2-plain")!;
    expect(st).toMatchObject({ shown: 3, settled: 3, paid: 1 });
    // an AI variant in n3 shown to 100 people, none paid
    d.prepare("INSERT INTO nudge_variants (id, slot, status, source, texts_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
      .run("ai-n3-test-loser", "n3", "active", "ai", JSON.stringify({ "zh-hant": { title: "t", body: "深斷把這三卦一起讀完，說清楚。", cta: "斷 · {price}" } }), NOW, NOW);
    for (let i = 0; i < 100; i++) put(`aaaabbbbcccc${String(i).padStart(4, "0")}`, "ai-n3-test-loser", 3, 6 * 24 * H, 100 + i);
    for (let i = 0; i < 30; i++) put(`aaaabbbbdddd${String(i).padStart(4, "0")}`, "n3-settle", 3, 6 * 24 * H, 300 + i);
    for (let i = 0; i < 6; i++) {
      d.prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run(`tabstat${String(300 + i).padStart(5, "0")}`, `aaaabbbbdddd${String(i).padStart(4, "0")}`, NOW - 6 * 24 * H);
      recordOrder({ sessionId: `cs_nudge_n3_${i}`, customerId: null, castId: null, tier: "deep", amountCents: 7500, currency: "twd", email: null, status: "paid", firstDeep: true, browserSid: `tabstat${String(300 + i).padStart(5, "0")}` });
      d.prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(NOW - 6 * 24 * H + H, `cs_nudge_n3_${i}`);
    }
    const gone = nudge.retireLosers(NOW);
    expect(gone).toContain("ai-n3-test-loser");
    expect(nudge.variantById("ai-n3-test-loser")!.status).toBe("retired");
    expect(nudge.variantById("n3-settle")!.status).toBe("active");
    // 10-06 瘦身: n3-merge was retired by the one-time cut (not by the learner), its words kept; the cut runs once per database
    expect(nudge.variantById("n3-merge")).toMatchObject({ status: "retired", source: "seed" });
    expect(nudge.variantById("n3-merge")!.status_why).toContain("10-06 瘦身");
    expect(nudge.recentRuns(50).filter((r) => r.kind === "slim_1006")).toHaveLength(1);
  });

  it("drafts new words from the numbers; in auto mode guarded drafts go live while the slot has room, the rest wait; styles always wait", async () => {
    // 10-06: review is the default (drafts wait for a yes); this test exercises the auto path
    process.env.NUDGE_AI_MODE = "auto";
    llm.json.push(JSON.stringify({ variants: [
      { title: "這件事，一次看完整", body: "前面幾卦各說了一句，深斷把它們放在一起讀，告訴你現在走到哪一步。", cta: "合起來看 · {price}", idea: "整體感" },
      { title: "最後機會", body: "限時優惠，今天內買保證準確。", cta: "立刻買 · {price}", idea: "急" },
    ] }), JSON.stringify({ ok: true })); // the second answer: the claim check (说法核对) of the one that passed the guards
    const r = await nudge.draftVariants("n2", "zh-hant", { by: "test" });
    expect(r.created).toHaveLength(1);
    expect(r.created[0]!.status).toBe("active");
    expect(r.rejected).toHaveLength(1);
    expect(llm.calls[0]!.messages[1]!.content).toContain("results_72h");
    expect(llm.calls[0]!.messages[1]!.content).not.toMatch(/他還會|前男友/); // the model sees numbers and words, never a question
    llm.json.push(JSON.stringify({ styles: [{ label: "先說變化", prompt: "say first what has changed since the earlier casts, then what this chart adds about it", idea: "x" }] }));
    const s = await nudge.draftVariants("style", "zh-hant", { by: "test" });
    expect(s.created[0]!.status).toBe("active"); // 10-17: a style takes the free AI seat too
    const add = nudge.addVariant("n4", "zh-hant", { title: "不用再搖", body: "深斷把這 {n} 卦一起讀完，之後有新進展直接追問。", cta: "合起來斷 · {price}" });
    expect(add.id).toMatch(/^admin-n4-/);
    expect(nudge.addVariant("n4", "zh-hant", { title: "x", body: "今天 50% off", cta: "y" }).why.length).toBeGreaterThan(0);
    process.env.NUDGE_AI_MODE = "review";
    // 10-06..17 review mode: a draft that passes everything still waits for a yes
    expect(nudge.aiMode()).toBe("review");
    llm.json.push(JSON.stringify({ variants: [{ title: "先看這件事卡在哪", body: "問到第二次，想知道的多半是這件事有沒有變。深斷會對照兩卦說清楚：哪一環卡住、現在能做的一步、哪幾天要留意。", cta: "看卡在哪 · {price}", idea: "x" }] }), JSON.stringify({ ok: true }));
    const r2 = await nudge.draftVariants("n2", "zh-hant", { by: "test", count: 1 });
    expect(r2.created).toHaveLength(1);
    expect(r2.created[0]!.status).toBe("draft");
    expect(nudge.variantById(r2.created[0]!.id)!.status_why).toContain("review mode");
  });

  it("the cron's share: the 365-day purge and the retirement check (drafting off here)", async () => {
    process.env.NUDGE_AI = "off";
    db().prepare(`INSERT INTO cast_log (bid, at, tz, values_str, primary_num, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`)
      .run("eeeeeeeeeeee0099", NOW - 400 * 24 * H, 0, "787878", 1, NOW - 400 * 24 * H, NOW - 400 * 24 * H);
    await nudge.runNudgeLearning(NOW);
    expect(db().prepare("SELECT COUNT(*) AS v FROM cast_log WHERE bid = ?").get("eeeeeeeeeeee0099")).toEqual({ v: 0 });
    expect(nudge.lastRun("purge")).toBe(NOW);
    delete process.env.NUDGE_AI;
  });
});

describe("接到页面：免费那一句的路由、问满的路由、看到了才算", () => {
  // 10-25: asking needs an account — the reader here is signed in
  const sess = "c5".repeat(32);
  const signIn = async () => { const dbm = await import("../src/lib/db"); dbm.createSession(sess, dbm.upsertCustomer("castlog-reader@example.com", "zh-hant"), 3_600_000); };
  const post = (url: string, body: Record<string, unknown>, bid: string) => new NextRequest(`http://localhost${url}`, {
    method: "POST", headers: { "content-type": "application/json", cookie: `${BID_COOKIE}=${bid}; yf_session=${sess}` }, body: JSON.stringify(body),
  });

  it("FREE_LINE=off (the 10-31 进度表 131 way): no model call, the first cast gets an n1 block, signed out too", async () => {
    process.env.PAYWALL = "on";
    process.env.FREE_LINE = "off";
    const bid = "dddddddddddd0031";
    const calls = llm.calls.length;
    const anon = new NextRequest("http://localhost/api/teaser", { method: "POST", headers: { "content-type": "application/json", cookie: `${BID_COOKIE}=${bid}` },
      body: JSON.stringify({ question: "這次換工作會順利嗎", values: V1, castAtMs: NOW - 3 * H, tzOffsetMinutes: 480, locale: "zh-hant", bs: "tabdddd00311" }) });
    const r = await (await teaserPOST(anon)).json() as { teaser: unknown; noLine?: boolean; nudge?: { id: string; cta: string } };
    expect(r.teaser).toBeNull();
    expect(r.noLine).toBe(true);
    expect(r.nudge?.id).toMatch(/^n1-/);
    expect(r.nudge?.cta).toContain("·");
    expect(llm.calls.length).toBe(calls);
    delete process.env.FREE_LINE;
  });

  it("the free line's route logs the cast, links the line, and hands the block on the 2nd cast", async () => {
    process.env.PAYWALL = "on";
    delete process.env.FREE_LINE; // 11-05 进度表 141: the free line is the default again
    await signIn();
    const bid = "dddddddddddd0010";
    llm.text.push("他現在還在觀望，主動權在你。");
    const r1 = await (await teaserPOST(post("/api/teaser", { question: "暗戀的同事對我有意思嗎", values: V1, castAtMs: NOW - 2 * H, tzOffsetMinutes: 480, locale: "zh-hant", bs: "tabdddd00101" }, bid))).json() as Record<string, unknown>;
    expect(r1.teaser).toBe("他現在還在觀望，主動權在你。");
    expect(r1.thread).toBeUndefined();
    expect((r1.nudge as { id?: string } | undefined)?.id).toMatch(/^n1-/); // 10-31: the first cast has a block too
    llm.text.push("和上次比，他還是在觀望，但這一卦多了一點靠近的意思。");
    const r2 = await (await teaserPOST(post("/api/teaser", { question: "暗戀的同事對我到底有沒有意思", values: V2, castAtMs: NOW - H, tzOffsetMinutes: 480, locale: "zh-hant", bs: "tabdddd00102" }, bid))).json() as { teaser: string; thread: { n: number; chain: unknown[] }; nudge: { id: string; cta: string } };
    expect(r2.thread).toMatchObject({ n: 2 });
    expect(r2.thread.chain).toHaveLength(1);
    // any live n2 version (the drafting test above put an AI one live next to the two seeds)
    expect(nudge.variants("n2").filter((v) => v.status === "active").map((v) => v.id)).toContain(r2.nudge.id);
    expect(r2.nudge.cta).toContain("{price}");
    const rows = cl.castsOfBids([bid]);
    expect(rows.map((x) => x.thread_n)).toEqual([1, 2]);
    expect(rows[1]).toMatchObject({ teaser: "和上次比，他還是在觀望，但這一卦多了一點靠近的意思。", nudge: r2.nudge.id, nudge_seen: null, s: "tabdddd00102" });
    expect(rows[1]!.style).toMatch(/^(ai-)?style-/);
    // a member sees no price, so no block is picked
    llm.text.push("這一卦說他還沒準備好。");
    const r3 = await (await teaserPOST(post("/api/teaser", { question: "同事會不會跟我告白", values: V3, castAtMs: NOW - 30 * 60_000, tzOffsetMinutes: 480, locale: "zh-hant", member: true }, bid))).json() as Record<string, unknown>;
    expect(r3.nudge).toBeUndefined();
    // 10-04 排除会员: the cast is marked as a member's (left out of the conversion numbers); the two before are not
    expect(cl.castsOfBids([bid]).map((x) => x.member ?? 0)).toEqual([0, 0, 1]);
    // the page showed it: the showing now counts
    await trackPOST(post("/api/track", { e: "nudge_shown", s: "tabdddd00102", method: r2.nudge.id, hex: 2 }, bid));
    expect(cl.castsOfBids([bid])[1]!.nudge_seen).toBe(1);
    expect(eventLabel("nudge_shown", r2.nudge.id, null, 2)).toContain("第 2 卦");
    expect(eventLabel("teaser_shown", null, null, 3)).toContain("第 3 卦");
  });

  it("a capped cast (no free line) is still written and still gets the block", async () => {
    process.env.PAYWALL = "on";
    const bid = "dddddddddddd0011";
    await cl.logCast({ bid, input: inp("這次考試會過嗎", NOW - 3 * H), locale: "zh-hant" });
    const r = await (await logPOST(post("/api/cast/log", { question: "這次考試會不會過", values: V2, castAtMs: NOW - H, tzOffsetMinutes: 480, locale: "zh-hant", capped: true }, bid))).json() as { thread?: { n: number }; nudge?: { id: string } };
    expect(r.thread?.n).toBe(2);
    // any live n2 variant — the AI draft from the test above is live too now
    expect(nudge.variants("n2").filter((v) => v.status === "active").map((v) => v.id)).toContain(r.nudge?.id);
    expect(cl.castsOfBids([bid])[1]).toMatchObject({ capped: 1, teaser: null });
    // no browser id: nothing written
    const none = await (await logPOST(new NextRequest("http://localhost/api/cast/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: "這次考試會不會過", values: V2, castAtMs: NOW - H, locale: "zh-hant" }) }))).json();
    expect(none).toEqual({});
  });
});

describe("后台与删除", () => {
  it("the trail lists the matters and the casts; the list finds those asking again and again without paying", async () => {
    const bid = "dddddddddddd0012";
    db().prepare("INSERT OR IGNORE INTO browsers (bid, first_at, last_at) VALUES (?,?,?)").run(bid, NOW - 10 * H, NOW);
    // no model in the queue: near words join by the rule; anything else falls back to "a love question within three days"
    for (const [i, q] of ["他愛我嗎", "他到底愛不愛我", "他還愛不愛我"].entries()) {
      await cl.logCast({ bid, input: inp(q, NOW - (9 - i) * H, [V1, V2, V3][i]!), locale: "zh-hant" });
    }
    const { casts, threads } = castsForTrail([bid], NOW - 24 * H);
    expect(casts).toHaveLength(3);
    expect(threads[0]).toMatchObject({ casts: 3, paid: false });
    expect(peopleList(NOW - 24 * H, "repeat").map((r) => r.bid)).toContain(bid);
    expect(cl.eraseBrowserCasts(bid)).toBe(3);
    expect(castsForTrail([bid], 0).casts).toHaveLength(0);
  });

  it("erasing a customer erases the casts of every browser filed under them", async () => {
    const cid = upsertCustomer("castlog-erase@example.com", "zh-hant");
    linkBrowser("dddddddddddd0013", cid, "pay");
    await cl.logCast({ bid: "dddddddddddd0013", input: inp("工作會順利嗎", NOW - H), locale: "zh-hant" });
    expect(cl.castsOfBids(["dddddddddddd0013"])).toHaveLength(1);
    expect(eraseCustomer(cid).ok).toBe(true);
    expect(cl.castsOfBids(["dddddddddddd0013"])).toHaveLength(0);
  });

  it("the cast page's words exist in every language, with the same placeholders", () => {
    for (const l of LOCALES) {
      const t = (CAST_THREAD_T as Record<string, Record<string, string>>)[l]!;
      expect(Object.keys(t).sort()).toEqual(Object.keys(CAST_THREAD_T.zh).sort());
      expect(t.thCount).toContain("{n}");
    }
    expect(ctt("zh-hant", "thCount", { n: 3 })).toBe("這件事的第 3 卦");
    expect(shortDay("2026-10-01", "zh-hant")).toBe("10/1");
  });
});

describe("隐私政策：起卦记录写明了", () => {
  it("every language says what is kept, for how long, the special categories, and that the AI sees earlier questions", () => {
    const text = (l: string) => (l === "zh-hant" ? JSON.stringify(PRIVACY_HANT) : JSON.stringify(PRIVACY.map((s) => (s as unknown as Record<string, unknown>)[l])));
    for (const l of LOCALES) {
      expect(text(l), l).toMatch(/365/);
      expect(text(l), l).toContain("yf_bid");
    }
    expect(text("zh")).toContain("起卦记录");
    expect(text("zh")).not.toContain("未登录且未付款的起卦不会被保存到服务器");
    expect(text("zh")).not.toContain("不上传服务器");
    expect(text("zh")).not.toContain("从不记录问题文本");
    expect(text("zh-hant")).toContain("起卦紀錄");
    expect(text("zh-hant")).not.toContain("不會保存至伺服器");
    expect(text("en")).toContain("Cast log");
    expect(text("en")).not.toContain("never sent to our server");
    expect(text("en")).not.toContain("never stored on our server");
    expect(text("ja")).toContain("卦の記録");
    expect(text("ko")).toContain("점괘 기록");
    expect(text("fr")).toContain("Journal des tirages");
    expect(text("de")).toContain("Wurfprotokoll");
    expect(text("es")).toContain("Registro de tiradas");
    expect(text("pt")).toContain("Registro de tiragens");
  });
});
