import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-03 分组 + 按组挑版本 + AI 每周分析 (Neil: 「这个优化的功能，AI能调取所有的记录然后自学习自己优化吗？」→「两个都做吧」).
 * The model is stubbed: each test queues what it needs; an empty queue throws like a dead provider.
 */
/** a queued JSON answer: the text, or the text with a note that the model ran out of room (10-04 askJson) */
type Queued = string | Error | { content: string; cutOff: boolean };
const llm = vi.hoisted(() => ({ json: [] as (string | Error | { content: string; cutOff: boolean })[], text: [] as (string | Error)[], calls: [] as { kind: "json" | "text"; messages: { role: string; content: string }[] }[] }));
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  const next = <T,>(q: (T | Error)[]): T => { const v = q.shift(); if (v === undefined) throw new Error("no model in tests"); if (v instanceof Error) throw v; return v; };
  return {
    ...real,
    chatJson: vi.fn(async (messages: { role: string; content: string }[]) => { llm.calls.push({ kind: "json", messages }); const v = next<Queued>(llm.json); return typeof v === "string" ? v : (v as { content: string }).content; }),
    chatJsonFull: vi.fn(async (messages: { role: string; content: string }[]) => { llm.calls.push({ kind: "json", messages }); const v = next<Queued>(llm.json); return typeof v === "string" ? { content: v, cutOff: false } : v; }),
    chatText: vi.fn(async (messages: { role: string; content: string }[]) => { llm.calls.push({ kind: "text", messages }); return next<string>(llm.text); }),
  };
});

const { db, upsertCustomer, recordOrder } = await import("../src/lib/db");
const { linkBrowser } = await import("../src/lib/browsers");
const { uaSegment } = await import("../src/lib/ua-brief");
const cl = await import("../src/lib/cast-log");
const nudge = await import("../src/lib/nudge");
const { segmentTable, cohort, channelOf } = await import("../src/lib/stage-funnel");
const review = await import("../src/lib/ai-review");
const { PRIVACY } = await import("../src/lib/legal");
const { PRIVACY_HANT } = await import("../src/lib/legal-hant");
const { LOCALES } = await import("../src/lib/locales");

const H = 3_600_000;
const T = Date.now();
const V: LineValue[] = [7, 8, 7, 8, 7, 8];
const IPHONE_THREADS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 389.0.0.22.86";
const ANDROID_IG = "Mozilla/5.0 (Linux; Android 14; SM-S9180 Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0.0.0";

// 10-17: auto is the default again; these tests exercise the review path unless they say otherwise
beforeEach(() => { llm.json.length = 0; llm.text.length = 0; llm.calls.length = 0; process.env.NUDGE_AI_MODE = "review"; });

let seq = 0;
function cast(bid: string, n: number, ago: number, o: { topic?: string; lean?: string; teaser?: string | null; thread?: number; nudge?: string; seen?: boolean; capped?: boolean; question?: string | null; sensitive?: string; app?: string; device?: string } = {}): number {
  seq += 1;
  return Number(db().prepare(
    `INSERT INTO cast_log (bid, s, at, tz, locale, question, sensitive, values_str, primary_num, topic, teaser, capped, thread_id, thread_n, nudge, nudge_seen, lean, device, app, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(bid, `arv${String(seq).padStart(6, "0")}`, T - ago, 480, "zh-hant", o.question === undefined ? `問題 ${seq}` : o.question, o.sensitive ?? null, "787878", 63, o.topic ?? "relationship",
    o.teaser === undefined ? `免費一句 ${seq}` : o.teaser, o.capped ? 1 : 0, o.thread ?? null, n, o.nudge ?? null, o.seen ? 1 : null, o.lean ?? null, o.device ?? "ios", o.app ?? "threads", T - ago, T - ago).lastInsertRowid);
}
function pay(bid: string, sid: string, ago: number): void {
  db().prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run(`t_${sid}`, bid, T - ago - H);
  recordOrder({ sessionId: sid, customerId: null, castId: null, tier: "deep", amountCents: 7500, currency: "twd", email: null, status: "paid", firstDeep: true, browserSid: `t_${sid}` });
  db().prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(T - ago, sid);
}
/** each group of tests counts people in the same fortnight: start it from an empty log */
function wipe(): void {
  for (const t of ["cast_log", "cast_threads", "orders", "tab_browsers"]) db().prepare(`DELETE FROM ${t}`).run();
}

describe("① 分组：起卦记录多记设备 / App / 吉凶", () => {
  it("reads the device class and the app off the browser string", () => {
    expect(uaSegment(IPHONE_THREADS)).toEqual({ device: "ios", app: "threads" });
    expect(uaSegment(ANDROID_IG)).toEqual({ device: "android", app: "instagram" });
    expect(uaSegment("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36")).toEqual({ device: "desktop", app: "browser" });
    expect(uaSegment("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Line/14.1.0")).toEqual({ device: "ios", app: "line" });
    expect(uaSegment(null)).toEqual({ device: "other", app: "browser" });
    expect(channelOf("~threads", null)).toBe("threads");
    expect(channelOf(null, "~ref:www.google.com.tw")).toBe("google");
    expect(channelOf(null, null)).toBe("direct");
  });

  it("a logged cast keeps them; the free line's lean comes from a light model afterwards — never for a special-category question", async () => {
    const info = await cl.logCast({ bid: "abcdef0000000001", input: { question: "他會回來嗎", values: V, castAtMs: T - H, tzOffsetMinutes: 480 }, locale: "zh-hant", ua: IPHONE_THREADS });
    expect(info!.row).toMatchObject({ device: "ios", app: "threads" });
    cl.setLogTeaser(info!.logId, "他還在想，回不回來要看你怎麼開口。", null);
    llm.text.push("mixed");
    expect(await cl.classifyLean(info!.logId, "他還在想，回不回來要看你怎麼開口。", "他會回來嗎")).toBe("mixed");
    expect(cl.logRow(info!.logId)!.lean).toBe("mixed");
    // already judged: no second call
    expect(await cl.classifyLean(info!.logId, "x", "y")).toBe("mixed");
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.messages[1]!.content).toContain("他會回來嗎");
    const h = await cl.logCast({ bid: "abcdef0000000001", input: { question: "我的手術會順利嗎", values: V, castAtMs: T - 30 * 60_000, tzOffsetMinutes: 480 }, locale: "zh-hant", ua: IPHONE_THREADS });
    expect(await cl.classifyLean(h!.logId, "會順利。", "我的手術會順利嗎")).toBeNull();
    expect(llm.calls).toHaveLength(1);
    llm.text.push("I am not sure");
    const g = await cl.logCast({ bid: "abcdef0000000002", input: { question: "這份工作會順利嗎", values: V, castAtMs: T - 20 * 60_000, tzOffsetMinutes: 480 }, locale: "zh-hant", ua: ANDROID_IG });
    expect(await cl.classifyLean(g!.logId, "會順利。", "這份工作會順利嗎")).toBeNull();
  });

  it("conversion by group, per person: who cast with that value, who paid at a cast with it", () => {
    // three love questions (one paid, its line leaned good), two career ones (none paid), one capped cast with no line
    wipe();
    const since = T - 8 * H;
    cast("abcd000000000a01", 1, 7 * H, { topic: "relationship", lean: "good", app: "threads" });
    pay("abcd000000000a01", "cs_seg_1", 6 * H);
    cast("abcd000000000a02", 1, 7 * H, { topic: "relationship", lean: "bad", app: "browser", device: "android" });
    cast("abcd000000000a03", 1, 6 * H, { topic: "relationship", lean: "good" });
    cast("abcd000000000a04", 1, 5 * H, { topic: "career", lean: "mixed" });
    cast("abcd000000000a05", 1, 5 * H, { topic: "career", teaser: null, capped: true });
    const co = cohort(since);
    const t = segmentTable(since, "topic", co);
    expect(t.all.relationship).toEqual({ reached: 3, paid: 1 });
    expect(t.all.career).toEqual({ reached: 2, paid: 0 });
    expect(t.byStage["1"].relationship).toEqual({ reached: 3, paid: 1 });
    expect(t.values[0]!.key).toBe("relationship"); // most people first
    const lean = segmentTable(since, "lean", co);
    expect(lean.all.good).toEqual({ reached: 2, paid: 1 });
    expect(lean.all.bad).toEqual({ reached: 1, paid: 0 });
    expect(lean.all.none!.reached).toBe(1);
    expect(lean.values.find((v) => v.key === "none")!.label).toContain("问满");
    const app = segmentTable(since, "app", co);
    expect(app.all.threads!.paid).toBe(1);
    expect(app.all.browser).toEqual({ reached: 1, paid: 0 });
  });
});

describe("① 按组挑版本", () => {
  it("a version meant for one kind of question is offered only to it, and each version is judged on that kind (borrowing the overall rate)", () => {
    const add = nudge.addVariant("n2", "zh-hant", { title: "和他的事，合起來看", body: "前一卦和這一卦都在問他，深斷把兩卦放在一起讀，說清楚他那邊的態度和接下來看哪幾天。", cta: "合起來斷 · {price}" }, T, "relationship");
    expect(add.id).toBeTruthy();
    expect(nudge.variantById(add.id!)!.segment).toBe("topic:relationship");
    const forCareer = new Set<string>(), forLove = new Set<string>();
    for (let i = 0; i < 80; i++) {
      forCareer.add(nudge.pickVariant("n2", "zh-hant", T, Math.random, { topic: "career" })!.id);
      forLove.add(nudge.pickVariant("n2", "zh-hant", T, Math.random, { topic: "relationship" })!.id);
    }
    expect(forCareer.has(add.id!)).toBe(false);
    expect(forLove.has(add.id!)).toBe(true);
    // shrinkage: no data on the kind → the overall rate; plenty on the kind → its own
    const s = { id: "x", shown: 100, pending: 0, settled: 100, paid: 20, rate: 0.2, pBest: null, payers: [], byTopic: { career: { shown: 60, settled: 60, paid: 0 } }, byLean: {} };
    const [a0, b0] = nudge.topicPosterior(s, "money");
    expect(a0 / (a0 + b0)).toBeCloseTo((1 + 6 * (21 / 102)) / (2 + 6), 6);
    const [a1, b1] = nudge.topicPosterior(s, "career");
    expect(a1 / (a1 + b1)).toBeLessThan(0.05);
    const [a2, b2] = nudge.topicPosterior(s, null);
    expect([a2, b2]).toEqual([21, 81]);
  });

  it("the drafting model sees results by kind and may write a version for one kind; an unknown kind is ignored", async () => {
    process.env.NUDGE_AI_MODE = "auto"; process.env.NUDGE_AI_MAX = "2"; // two seats here so both can go live; 10-17 default is one
    llm.json.push(JSON.stringify({ variants: [
      { title: "這份工作，一次看清楚", body: "工作的事每卦各說一句，深斷把幾卦合起來讀，告訴你現在卡在哪、接下來看哪幾天。", cta: "合起來看 · {price}", for_topic: "career", idea: "career people want the step" },
      { title: "同一件事，合起來看", body: "前面幾卦各看了一句，深斷把它們放在一起讀，說清楚前後有沒有變、關鍵在哪。", cta: "合起來斷 · {price}", for_topic: "love", idea: "x" },
    ] }), JSON.stringify({ ok: true }), JSON.stringify({ ok: true })); // then one claim check for each
    const r = await nudge.draftVariants("n3", "zh-hant", { by: "test" });
    expect(r.created).toHaveLength(2);
    expect(r.created.map((c) => c.status)).toEqual(["active", "active"]);
    expect(nudge.variantById(r.created[0]!.id)!.segment).toBe("topic:career");
    expect(nudge.variantById(r.created[1]!.id)!.segment).toBeNull();
    const sent = llm.calls[0]!.messages[1]!.content;
    expect(sent).toContain("by_kind");
    expect(sent).toContain("people_at_this_stage_by_kind");
    expect(llm.calls[0]!.messages[0]!.content).toContain("for_topic");
    // the claim check reads each as every reader at that stage (and of that kind) will see it
    expect(llm.calls[1]!.messages[0]!.content).toContain("3rd cast about the same matter (only on career questions)");
    expect(llm.calls[2]!.messages[0]!.content).not.toContain("only on");
    process.env.NUDGE_AI_MODE = "review"; delete process.env.NUDGE_AI_MAX;
  });

  it("a reworded copy of a version already in the slot is turned away — the first live review handed back the seeds with a phrase added", async () => {
    // what the first weekly review proposed on 10-03 (our own block texts): a seed's title and most of its words
    expect(nudge.nearCopy("n2", "zh-hant", { title: "這件事，你問第二次了", body: "免費那句只說方向。深斷會把上一卦和這一卦放在一起讀：哪裡沒變、哪裡變了、接下來留意哪幾天，以及你可以怎麼做。", cta: "把這兩卦合起來斷 · {price}" }))
      .toBe("copy: same title as n2-merge");
    expect(nudge.nearCopy("n2", "zh-hant", { title: "兩卦一起看", body: "上一卦和這一卦各看到一面。深斷會把兩卦放在一起讀：哪裡沒變、哪裡變了。", cta: "合起來斷 · {price}" }))
      .toMatch(/^copy: mostly the words of n2-merge/);
    expect(nudge.nearCopyStyle("say plainly whether the way it leans has held since their earlier casts or has turned, and name the one thing in THIS chart that explains why")).toMatch(/style-held/);
    expect(nudge.nearCopyStyle("say what THIS chart adds that the earlier lines did not — the new piece, not the old lean restated")).toMatch(/style-new \(100%\)/);
    // a different angle passes, and the hand-written seeds never count as copies of each other, in any language
    expect(nudge.nearCopy("n2", "zh-hant", { title: "他那邊的態度", body: "問的是對方怎麼想，免費那一句只看得到方向。深斷會讀出他那邊卡在哪、你這邊可以做什麼。", cta: "看他那邊 · {price}" })).toBeNull();
    expect(nudge.nearCopyStyle("say first what has changed since the earlier casts, then what this chart adds")).toBeNull();
    for (const slot of ["n2", "n3", "n4", "style"] as const) {
      const seeds = nudge.SEEDS.filter((s) => s.slot === slot);
      for (const l of slot === "style" ? (["*"] as const) : LOCALES) for (let i = 0; i < seeds.length; i++) for (let k = i + 1; k < seeds.length; k++) {
        const a = seeds[i]!.texts[l]!, b = seeds[k]!.texts[l]!;
        expect(nudge.textAlike(`${a.title} ${a.body}`, `${b.title} ${b.body}`), `${seeds[i]!.id}/${seeds[k]!.id} ${l}`).toBeLessThan(0.5);
      }
    }
    // the weekly drafting turns copies away too
    llm.json.push(JSON.stringify({ variants: [{ title: "同一件事，換個方式問", body: "再搖一卦也只多一句。深斷讀完這幾卦，你就能在解讀下面直接追問這件事。", cta: "深斷，附追問 · {price}", idea: "x" }] }));
    const r = await nudge.draftVariants("n4", "zh-hant", { by: "test", count: 1 });
    expect(r.created).toHaveLength(0);
    expect(r.rejected[0]!.why).toContain("copy: same title as n4-ask");
  });
});

describe("说法核对：可能对某些人不成立的话先待定", () => {
  const block = (title: string, body: string, cta: string) => ({ title, body, cta, idea: "x" });

  it("a block the check doubts waits for a yes, with the reason; one it could not read waits too and is read again later", async () => {
    // what the second live review wrote for the 3rd cast, moved to n4 here (n4 has room): true only for some readers
    llm.json.push(JSON.stringify({ variants: [block("問了這麼多次，答案在變", "同一件事問到現在，免費句每次只露出一角。深斷把這幾卦一起讀完，說清楚整體怎麼走。", "讀完這幾卦 · {price}")] }),
      JSON.stringify({ ok: false, why: "「答案在变」——有人几卦方向都一样" }));
    const a = await nudge.draftVariants("n4", "zh-hant", { by: "test", count: 1 });
    expect(a.created[0]!.status).toBe("draft");
    const va = nudge.variantById(a.created[0]!.id)!;
    expect(va.status_why).toContain("说法核对：「答案在变」");
    expect(va.checked_at).not.toBeNull();
    expect(llm.calls[1]!.messages[0]!.content).toContain("SAME words are shown to every reader at that stage");
    // the check itself failed (provider down): not live, not marked as read
    llm.json.push(JSON.stringify({ variants: [block("換個角度看這件事", "免費那一句只看一卦。深斷把你問過的幾卦連起來，說清楚卡在哪、什麼時候鬆動。", "連起來看 · {price}")] }));
    const b = await nudge.draftVariants("n4", "zh-hant", { by: "test", count: 1 });
    expect(b.created[0]!.status).toBe("draft");
    expect(nudge.variantById(b.created[0]!.id)!.status_why).toContain(nudge.CLAIM_UNREAD);
    expect(nudge.variantById(b.created[0]!.id)!.checked_at).toBeNull();
  });

  it("the cron re-reads live AI blocks never read (written before the check): a doubted one goes back to waiting; one the owner switched on stays", async () => {
    const ins = (id: string, title: string, why: string | null, at: number) => db().prepare(
      "INSERT INTO nudge_variants (id, slot, status, source, texts_json, created_at, updated_at, status_why) VALUES (?,?,?,?,?,?,?,?)",
    ).run(id, "n4", "active", "ai", JSON.stringify({ "zh-hant": { title, body: "深斷把這幾卦一起讀完，說清楚整體怎麼走、哪幾天要留意。", cta: "讀完 · {price}" } }), at, at, why);
    ins("ai-n4-old-1", "三次問下來，答案在變", "auto: passed the guards, slot had room", T + 1);
    ins("ai-n4-old-2", "他那邊的態度", "dashboard", T + 2);
    ins("ai-n4-old-3", "這幾卦，一起讀", "auto: passed the guards, slot had room", T + 3);
    llm.json.push(JSON.stringify({ ok: false, why: "「答案在变」不一定成立" }), JSON.stringify({ ok: true }));
    expect(await nudge.recheckLive(T + 10)).toEqual(["ai-n4-old-1"]);
    expect(llm.calls).toHaveLength(2); // the owner's own yes is not second-guessed
    expect(nudge.variantById("ai-n4-old-1")).toMatchObject({ status: "draft", checked_at: T + 10 });
    expect(nudge.variantById("ai-n4-old-1")!.status_why).toContain("说法核对：「答案在变」");
    expect(nudge.variantById("ai-n4-old-2")).toMatchObject({ status: "active", checked_at: null });
    expect(nudge.variantById("ai-n4-old-3")).toMatchObject({ status: "active", checked_at: T + 10 });
    // read once: the next hour asks nothing
    expect(await nudge.recheckLive(T + 20)).toEqual([]);
    expect(llm.calls).toHaveLength(2);
  });
});

describe("② AI 每周逐条读起卦记录", () => {
  // a fortnight: a payer, a repeat caster who never paid, a special-category asker, a capped cast
  const since = T - 14 * 24 * H;
  const cust = upsertCustomer("review-payer@example.com", "zh-hant");
  linkBrowser("feed000000000b01", cust, "pay");
  beforeAll(wipe);

  it("builds anonymous journeys: payers and repeat casters first, coded and shuffled, with no address, account or browser id", () => {
    const th = Number(db().prepare("INSERT INTO cast_threads (bid, title, topic, how, first_at, last_at, n) VALUES (?,?,?,?,?,?,?)").run("feed000000000b02", "和他", "relationship", "rule", T - 50 * H, T - 2 * H, 3).lastInsertRowid);
    cast("feed000000000b01", 1, 30 * H, { question: "新工作會錄取我嗎", topic: "career", lean: "good" });
    pay("feed000000000b01", "cs_review_1", 29 * H);
    cast("feed000000000b02", 1, 50 * H, { thread: th, question: "他還愛我嗎", lean: "bad" });
    cast("feed000000000b02", 2, 26 * H, { thread: th, question: "他到底還愛不愛我", lean: "mixed", nudge: "n2-plain", seen: true });
    cast("feed000000000b02", 3, 2 * H, { thread: th, question: "他還會不會愛我", teaser: null, capped: true, nudge: "n3-merge", seen: true });
    cast("feed000000000b03", 1, 3 * H, { question: null, sensitive: "health", topic: "health", teaser: null });
    const j = review.buildJourneys(since, 150, () => 0.42);
    const p1 = j.journeys.find((x) => x.bid === "feed000000000b01")!;
    const p2 = j.journeys.find((x) => x.bid === "feed000000000b02")!;
    expect(p1.buys).toHaveLength(1);
    expect(p2.casts.map((c) => c.n)).toEqual([1, 2, 3]);
    expect(p2.casts.every((c) => c.matter === "A")).toBe(true);
    expect(j.journeys.every((x) => /^P\d+$/.test(x.code))).toBe(true);
    const txt = j.journeys.map(review.journeyText).join("\n");
    expect(txt).not.toMatch(/feed0000|@example|review-payer/);
    expect(txt).toContain("PAID full reading at the first price (TWD)");
    expect(txt).toContain("no free line (daily limit");
    expect(txt).toContain("block n2-plain shown");
    expect(txt).toContain("(health question — words not kept)");
    expect(txt).toContain("「他到底還愛不愛我」");
    // payers and repeat casters are always in, even with room for only two
    const two = review.buildJourneys(since, 2, () => 0.42);
    expect(two.journeys.map((x) => x.bid).sort()).toEqual(["feed000000000b01", "feed000000000b02"]);
    expect(two.picked).toEqual({ payers: 1, repeat: 1, sampled: 0 });
  });

  it("one review: the journeys in batches, a report, new versions through the guards, a style left waiting — in the background", async () => {
    llm.json.push(
      JSON.stringify({ findings: [{ title: "反复问感情的人没买", detail: "P2 问了三次同一个人", people: ["P2"], strength: "weak" }], why_not_paying: ["免费那一句已经回答了他想知道的"], what_payers_share: ["工作类问题，当天就买"] }),
      JSON.stringify({
        // the model slips into Traditional now and then: the owner's report comes out Simplified all the same
        summary: "這兩週反覆問感情的人多，買的是工作類。",
        findings: [{ title: "第 3 卦問滿時沒有免費一句，人就走了", detail: "…", people: ["P2", "P9"], strength: "weak" }],
        copy: [
          { slot: "n3", for_topic: "relationship", title: "和他的事，三卦合起來", body: "三卦都在問他，深斷把它們放在一起讀，說清楚他那邊的態度和你接下來看哪幾天。", cta: "合起來斷 · {price}", why: "answers finding 1" },
          { slot: "n2", for_topic: null, title: "最後機會", body: "限時優惠，今天內購買，保證準確。", cta: "立刻買 · {price}", why: "x" },
          { slot: "n4", for_topic: null, title: "這件事已經問了 {n} 次", body: "與其再搖一卦，深斷把這幾卦放在一起讀，告訴你這件事接下來怎麼走。", cta: "合起來看 · {price}", why: "x" },
        ],
        styles: [
          { label: "先說變化", prompt: "say first what has changed since the earlier casts, then what this chart adds", why: "repeaters want change" },
          { label: "這卦新在哪", prompt: "say what THIS chart adds that the earlier lines did not — the new piece, not the old lean restated", why: "x" },
        ],
        owner: ["第 3 卦問滿時也給一句很短的方向"],
      }),
      JSON.stringify({ ok: true }), // the claim check of the one block that passed the guards and the copy check
    );
    const r = review.startAiReview({ by: "test", now: T, rnd: () => 0.42 });
    expect(r.started).toBe(true);
    // a second one while it runs is refused
    expect(review.startAiReview({ by: "test", now: T }).started).toBe(false);
    await r.done;
    const rep = review.reviewById(r.id!)!;
    expect(rep.status).toBe("done");
    expect(rep.body!.summary).toBe("这两周反复问感情的人多，买的是工作类。");
    expect(rep.body!.findings[0]!.title).toBe("第 3 卦问满时没有免费一句，人就走了");
    expect(rep.body!.why_not_paying).toContain("免费那一句已经回答了他想知道的");
    expect(rep.body!.owner).toEqual(["第 3 卦问满时也给一句很短的方向"]);
    expect(rep.body!.copy.find((c) => c.slot === "n4")!.rejected).toEqual(["copy: same title as n4-merge"]);
    expect(rep.body!.styles[1]!.rejected![0]).toMatch(/^copy: mostly the words of style-new/);
    expect(rep.body!.styles[0]!.label).toBe("先说变化");
    const good = rep.body!.copy.find((c) => c.slot === "n3")!;
    expect(good.id).toBe(`ai-n3-r${r.id}-1`);
    expect(nudge.variantById(good.id!)!.segment).toBe("topic:relationship");
    expect(nudge.variantById(good.id!)!.notes).toContain(`每周分析 #${r.id}`);
    expect(rep.body!.copy.find((c) => c.slot === "n2")!.rejected!.length).toBeGreaterThan(0);
    expect(rep.body!.styles[0]).toMatchObject({ status: "draft" });
    expect(nudge.variantById(rep.body!.styles[0]!.id!)!.status).toBe("draft");
    // codes lead back to people on the dashboard only
    expect(Object.values(rep.body!.codes).some((c) => c.bid === "feed000000000b02")).toBe(true);
    // what the model was sent: journeys and numbers, never an address or a browser id
    const sent = llm.calls.map((c) => c.messages.map((m) => m.content).join("\n")).join("\n");
    expect(sent).not.toMatch(/feed0000|@example\.com/);
    expect(llm.calls[0]!.messages[1]!.content).toContain("journeys");
    expect(llm.calls.find((c) => c.messages[0]!.content === review.SYNTH_SYSTEM)!.messages[1]!.content).toContain("\"stages\"");
    expect(llm.calls).toHaveLength(3); // one batch, the synthesis, one claim check
  });

  it("a failed model leaves a failed report, not a hung one", async () => {
    llm.json.push(new Error("provider down"));
    const r = review.startAiReview({ by: "test", now: T + 1 });
    await r.done;
    expect(review.reviewById(r.id!)).toMatchObject({ status: "failed" });
    expect(review.reviewById(r.id!)!.error).toContain("provider down");
  });

  it("an answer cut off at max_tokens: a batch is read up to where it stopped, the report is asked for again shorter, and the report says so", async () => {
    llm.json.push(
      // the batch: the model ran out of room inside its second finding — the first is kept
      { content: '{"findings":[{"title":"第一条","detail":"完整的","people":["P1"],"strength":"weak"},{"title":"第二条","detail":"写到一半就', cutOff: true },
      // the synthesis: cut off the first time, whole the second
      { content: '{"summary":"写到一半', cutOff: true },
      JSON.stringify({ summary: "缩短后写完了。", findings: [{ title: "第一条", detail: "完整的", people: ["P1"], strength: "weak" }], copy: [], styles: [], owner: [] }),
    );
    const r = review.startAiReview({ by: "test", now: T + 2 });
    await r.done;
    const rep = review.reviewById(r.id!)!;
    expect(rep.status).toBe("done");
    expect(rep.body!.summary).toBe("缩短后写完了。");
    expect(rep.body!.notes).toEqual(["第 1 批的回答没写完，读了写完的部分", "汇总报告第一次没写完，缩短后重写了一次"]);
    const asks = llm.calls.filter((c) => c.messages[0]!.content === review.SYNTH_SYSTEM);
    expect(asks).toHaveLength(2);
    // what the batch finished reached the synthesis — the second finding with its title, without the detail cut mid-way
    expect(asks[0]!.messages[1]!.content).toContain('{"title":"第一条","detail":"完整的","people":["P1"],"strength":"weak"},{"title":"第二条"}');
    expect(asks[0]!.messages[1]!.content).not.toContain("写到一半就");
    // the second ask carries the cut-off answer and the word to be shorter
    expect(asks[1]!.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(asks[1]!.messages[3]!.content).toMatch(/cut off .* SHORTER/);
  });

  it("a report cut off twice keeps what the first answer finished; nothing readable at all fails the review and says why", async () => {
    llm.json.push(
      JSON.stringify({ findings: [], why_not_paying: [], what_payers_share: [] }),
      { content: '{"summary":"第一次写了一半","findings":[{"title":"只有这条","detail":"x","people":["P1"],"strength":"weak"}],"cop', cutOff: true },
      { content: '{"summary":"第二次也', cutOff: true },
    );
    const r = review.startAiReview({ by: "test", now: T + 3 });
    await r.done;
    const rep = review.reviewById(r.id!)!;
    expect(rep.status).toBe("done");
    expect(rep.body!.summary).toBe("第一次写了一半");
    expect(rep.body!.findings.map((f) => f.title)).toEqual(["只有这条"]);
    expect(rep.body!.copy).toEqual([]);
    expect(rep.body!.notes).toEqual(["汇总报告两次都没写完，读了第一次写完的部分（后面的建议可能缺）"]);

    llm.json.push(JSON.stringify({ findings: [] }), { content: '{"summary":"没', cutOff: true }, { content: '{"summary":"还是没', cutOff: true });
    const r2 = review.startAiReview({ by: "test", now: T + 4 });
    await r2.done;
    expect(review.reviewById(r2.id!)).toMatchObject({ status: "failed" });
    expect(review.reviewById(r2.id!)!.error).toContain("could not be read twice (first cut off, then cut off");
  });

  it("a batch whose answers cannot be read twice is skipped and said so; when no batch can be read, the review fails", async () => {
    // two batches of 2 journeys: the first unreadable twice, the second whole
    llm.json.push(
      { content: "not json at all", cutOff: false }, { content: "{{{", cutOff: false },
      JSON.stringify({ findings: [{ title: "第二批的", detail: "x", people: ["P1"], strength: "weak" }], why_not_paying: [], what_payers_share: [] }),
      JSON.stringify({ summary: "靠第二批写的。", findings: [], copy: [], styles: [], owner: [] }),
    );
    const r = review.startAiReview({ by: "test", now: T + 5, max: 4, batch: 2 });
    await r.done;
    const rep = review.reviewById(r.id!)!;
    expect(rep.status).toBe("done");
    expect(rep.body!.batches).toBe(2);
    expect(rep.body!.notes).toEqual(["第 1 批的回答两次都读不出来，跳过"]);
    expect(llm.calls[1]!.messages[3]!.content).toMatch(/not valid JSON/);
    expect(llm.calls[3]!.messages[1]!.content).toContain('"batches":[{"unreadable":true},{"findings":[{"title":"第二批的"');

    llm.json.push({ content: "x", cutOff: false }, { content: "y", cutOff: false });
    const r2 = review.startAiReview({ by: "test", now: T + 6, max: 2, batch: 2 });
    await r2.done;
    expect(review.reviewById(r2.id!)).toMatchObject({ status: "failed", error: "no batch could be read" });
  });

  it("the cron's weekly turn: the dashboard's review counts as the week's; then it waits for enough people; a failed one is retried the next day", () => {
    const D = 86_400_000;
    process.env.NUDGE_REVIEW_MIN = "500";
    expect(review.maybeWeeklyReview(T + 2)).toBe(""); // the review above ran this week
    expect(review.maybeWeeklyReview(T + 8 * D)).toBe("review: waiting");
    expect(review.maybeWeeklyReview(T + 8 * D + 1)).toBe(""); // waited today already
    db().prepare("INSERT INTO ai_reports (at, by, status, window_from, window_to, error) VALUES (?,?,?,?,?,?)").run(T + 12 * D, "cron", "failed", T, T + 12 * D, "provider down");
    expect(review.maybeWeeklyReview(T + 12 * D + H)).toBe(""); // failed today: not again on every cron run
    expect(review.maybeWeeklyReview(T + 13 * D + 2 * H)).toBe("review: waiting"); // the next day it looks again
    process.env.NUDGE_REVIEW = "off";
    expect(review.maybeWeeklyReview(T + 20 * D)).toBe("");
    delete process.env.NUDGE_REVIEW;
    delete process.env.NUDGE_REVIEW_MIN;
  });
});

describe("隐私政策：AI 每周读起卦记录写明了", () => {
  it("every language says the AI reads the cast log entry by entry under codes, and no longer that it sees only numbers", () => {
    const text = (l: string) => (l === "zh-hant" ? JSON.stringify(PRIVACY_HANT) : JSON.stringify(PRIVACY.map((s) => (s as unknown as Record<string, unknown>)[l])));
    const says: Record<string, RegExp> = {
      zh: /逐条读.*只用代号/, "zh-hant": /逐條讀.*只用代號/, en: /entry by entry.*under codes/, ja: /一件ずつ.*符号/, ko: /한 건씩.*코드/,
      fr: /entrée par entrée.*sous des codes/, de: /Eintrag für Eintrag.*unter Codes/, es: /registro por registro.*bajo códigos/, pt: /registro por registro.*sob códigos/,
    };
    for (const l of LOCALES) expect(text(l), l).toMatch(says[l]!);
    expect(text("zh")).not.toContain("看不到任何人的问题");
    expect(text("zh-hant")).not.toContain("看不到任何人的問題");
    expect(text("en")).not.toContain("never anyone's question");
    expect(text("zh")).toContain("偏吉还是偏凶");
    expect(text("en")).toContain("which app you opened the site in");
  });
});
