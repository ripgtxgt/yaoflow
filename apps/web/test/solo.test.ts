import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";

/**
 * 10-22 分開 (Neil, after a reader's Threads message: her casts about different people — all 他 — were filed as one
 * matter, and each reading answered the previous person). Three things, tested here:
 *  1. the reader can say 「不是同一件事」 — on the cast page (`solo` rides with the cast) and on the reading page (split +
 *     one free re-read when the reading had looked at the earlier casts);
 *  2. the grouping is more careful: words like 「全新事件」 force a new matter before any model, the love-question
 *     shortcut skips 「會遇到…的人嗎」, and the model is told to answer null when unsure;
 *  3. the prompts no longer force a tie-in: the reading first judges whether the earlier casts are the same person.
 */
const llm = vi.hoisted(() => ({ json: [] as (string | Error)[], calls: [] as { role: string; content: string }[][] }));
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  const next = (q: (string | Error)[]) => { const v = q.shift(); if (v === undefined) throw new Error("no model in tests"); if (v instanceof Error) throw v; return v; };
  return {
    ...real,
    chatJson: vi.fn(async (messages: { role: string; content: string }[]) => { llm.calls.push(messages.map((m) => ({ ...m }))); return next(llm.json); }),
    chatText: vi.fn(async () => { throw new Error("no model in tests"); }),
  };
});
const gen = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));
vi.mock("../src/lib/generate", async (orig) => {
  const real = await orig<typeof import("../src/lib/generate")>();
  return {
    ...real,
    generateReading: vi.fn(async (_tier: string, input: Record<string, unknown>) => {
      gen.calls.push(input);
      return { verdict: { "zh-hant": "重出：只看這一卦。" }, timing: { "zh-hant": "11月上旬。" }, tendency: { "zh-hant": "x" }, basis: { "zh-hant": "x" }, strategy: { "zh-hant": "x" }, caution: { "zh-hant": "x" }, next_step: { "zh-hant": "x" }, closing: { "zh-hant": "x" } };
    }),
  };
});
const paid = vi.hoisted(() => ({ recs: new Map<string, unknown>() }));
vi.mock("../src/lib/paid-store", async (orig) => {
  const real = await orig<typeof import("../src/lib/paid-store")>();
  return { ...real, verifyPaidSession: vi.fn(async (sid: string) => paid.recs.get(sid) ?? null) };
});

const { soloOf, OTHER_PERSON, SOLO_WORDS } = await import("../src/lib/solo");
const { decideMatter, fileCast, matterSystemPrompt, resolveSessionMatter, ruleMatter } = await import("../src/lib/matter-assign");
const { MATTER_NOTE, THREAD_NOTE, TEASER_THREAD_NOTE, resolveServerChart } = await import("../src/lib/reading");
const { readCastExtras } = await import("../src/lib/cast-extras");
const cl = await import("../src/lib/cast-log");
const { castsInMatter, createMatter, db, matterById, recordOrder, saveCast, saveReading, sessionMatter, setCastMatter, upsertCustomer, storedReadingForSession, castOwnerMatter } = await import("../src/lib/db");
const { splitCastOff, rereadAlone, rereadState, readingHadContext, castOfSession, unsplitCast, unsplitOffer, UNSPLIT_WINDOW_MS } = await import("../src/lib/reread");
const { POST: matterPOST } = await import("../src/app/api/matter/route");
const { POST: rereadPOST } = await import("../src/app/api/reading/reread/route");
const { CAST_THREAD_T } = await import("../src/lib/dict/cast-thread");
const { MATTER_T } = await import("../src/lib/dict/matter");
const { LOCALES } = await import("../src/lib/locales");

const H = 3_600_000;
const NOW = Date.now();
const V1: LineValue[] = [7, 8, 7, 8, 7, 8];
const V2: LineValue[] = [9, 8, 7, 7, 8, 6];
const V3: LineValue[] = [8, 8, 7, 9, 7, 7];
const inp = (question: string, at: number, values: LineValue[] = V1) => ({ question, values, castAtMs: at, tzOffsetMinutes: 480 });

function cast(cid: number, question: string, sid: string, at: number, values: LineValue[] = V1) {
  const chart = resolveServerChart({ question, values, castAtMs: at, tzOffsetMinutes: -480 }, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: at, tzOffsetMinutes: -480, locale: "zh-hant", question, topic: "relationship", values, chart });
  saveReading(castId, cid, "deep", "zh-hant", { verdict: { "zh-hant": "跟前一卦比，他還是沒動。" }, timing: { "zh-hant": "10月。" }, tendency: { "zh-hant": "x" }, basis: { "zh-hant": "x" }, strategy: { "zh-hant": "x" }, caution: { "zh-hant": "x" }, next_step: { "zh-hant": "x" }, closing: { "zh-hant": "x" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 0, currency: null, email: null, status: "subscription" });
  // as on the site: the row is written a couple of minutes after the cast, when the reading is (matterSoFar dates by it)
  db().prepare("UPDATE casts SET created_at = ? WHERE id = ?").run(at + 120_000, castId);
  return castId;
}

beforeEach(() => { llm.json.length = 0; llm.calls.length = 0; gen.calls.length = 0; });

describe("分開 ①: the reader's own words and tap", () => {
  it("knows the words for 'a new matter', and the cues for 'someone else'", () => {
    expect(soloOf({ question: "（全新事件）我跟那個人的關係會如何發展" })).toBe(true);
    expect(soloOf({ question: "這是另一件事：下個月的面試會過嗎" })).toBe(true);
    expect(soloOf({ question: "不要參考之前的，單獨看這一卦" })).toBe(true);
    expect(soloOf({ question: "他會回我嗎" })).toBe(false);
    expect(soloOf({ question: "他會回我嗎", solo: true })).toBe(true);
    expect(soloOf(null)).toBe(false);
    expect(SOLO_WORDS.test("Is this a new matter for me")).toBe(true);
    expect(OTHER_PERSON.test("今年年底前，我會遇到可以認真交往的人嗎？")).toBe(true);
    expect(OTHER_PERSON.test("最近新認識的那個人對我有意思嗎")).toBe(true);
    expect(OTHER_PERSON.test("他什麼時候會回我")).toBe(false);
    expect(OTHER_PERSON.test("明年2月我們會怎麼相處")).toBe(false);
  });

  it("the cast page's extras carry `solo`, and drop the prior reading with it", () => {
    const x = readCastExtras({ solo: true, prior: { q: "他會回我嗎", at: Date.now() - 60_000, hex: "乾", call: "會回，但不在這週。" } }, "新認識的人對我有意思嗎", "zh-hant", null);
    expect(x.solo).toBe(true);
    expect(x.prior).toBeUndefined();
    expect(readCastExtras({ prior: { q: "他會回我嗎", at: Date.now() - 60_000, hex: "乾", call: "會回，但不在這週。" } }, "他會回我嗎", "zh-hant", null).prior).toBeDefined();
  });

  it("the words are in every language", () => {
    for (const l of LOCALES) {
      const t = (CAST_THREAD_T as Record<string, Record<string, string>>)[l]!;
      expect(t.sepChip, l).toBeTruthy();
      expect(t.sepDone, l).toBeTruthy();
      const m = (MATTER_T as Record<string, Record<string, string>>)[l]!;
      for (const k of ["splitAsk", "splitBtn", "splitDone", "splitReread", "rereadBtn", "rereadWait", "rereadDone", "rereadFail"]) expect(m[k], `${l}.${k}`).toBeTruthy();
    }
  });
});

describe("分開 ②: the grouping is more careful", () => {
  it("the word rules: a love question about someone else is not the open love matter", () => {
    const cands = [{ id: 1, customer_id: 1, created_at: NOW - 1e6, last_at: NOW - H, title: "和他的關係", title_by: "model", topic: "relationship", questions: ["他會回我嗎"] }];
    expect(ruleMatter(cands, "明年2月會怎麼相處", "relationship", "zh-hant", NOW)).toBe(1);
    expect(ruleMatter(cands, "今年年底前，我會遇到可以認真交往的人嗎？", "relationship", "zh-hant", NOW)).toBeNull();
    expect(ruleMatter(cands, "新認識的那個人對我有意思嗎", "relationship", "zh-hant", NOW)).toBeNull();
    // the browser-level rule, the same
    const tc = [{ id: 1, title: "和他的關係", topic: "relationship", last_at: NOW - H, questions: ["他會回我嗎"] }];
    expect(cl.ruleThread(tc, "明年2月會怎麼相處", "relationship", "zh-hant", NOW)).toBe(1);
    expect(cl.ruleThread(tc, "今年年底前，我會遇到可以認真交往的人嗎？", "relationship", "zh-hant", NOW)).toBeNull();
  });

  it("the model is told: a new person, a future partner or doubt means null", () => {
    const p = matterSystemPrompt();
    expect(p).toContain("answer null");
    expect(p).toContain("will I meet someone");
    expect(p).toContain("several people in a row");
  });

  it("a cast the reader marked solo opens its own matter — no model, whatever is open", async () => {
    const cid = upsertCustomer("solo-a@example.com", "zh-hant");
    const open = createMatter(cid, "和他的關係", "model", "relationship", NOW - H);
    const c0 = cast(cid, "他會回我嗎", "sub_solo_a0", NOW - H);
    setCastMatter(c0, open, "model");
    // the tap
    const d = await decideMatter(cid, "他會不會再找我", "relationship", "zh-hant", NOW, { solo: true });
    expect(d).toMatchObject({ matterId: null, how: "rule", solo: true });
    expect(llm.calls).toHaveLength(0);
    const mid = await resolveSessionMatter("sub_solo_a1", cid, "他會不會再找我", "relationship", "zh-hant", true);
    expect(mid).toBeTruthy();
    expect(mid).not.toBe(open);
    expect(sessionMatter("sub_solo_a1")).toBe(mid);
    expect(db().prepare("SELECT how FROM matter_sessions WHERE session_id = ?").get("sub_solo_a1")).toMatchObject({ how: "reader" });
    // the words alone, without the tap — the near-identical wording would otherwise join by rule
    const mid2 = await resolveSessionMatter("sub_solo_a2", cid, "（全新事件）他會回我嗎", "relationship", "zh-hant");
    expect(mid2).not.toBe(open);
    expect(mid2).not.toBe(mid);
    // the model may have been asked for a TITLE (nothing open in that call) — never whether to join
    for (const c of llm.calls) expect(c[1]!.content).toContain('"open_matters":[]');
    // a saved cast filed by the rules, marked solo: its own matter, however much the words overlap
    const c1 = cast(cid, "他會回我嗎", "sub_solo_a3", NOW - 10 * 60_000, V2);
    fileCast(c1, null, cid, "他會回我嗎", "relationship", "zh-hant", true);
    const m1 = castOwnerMatter(c1)!.matter_id!;
    expect(m1).not.toBe(open);
    expect(castsInMatter(open).map((c) => c.id)).toEqual([c0]);
    expect(db().prepare("SELECT matter_how FROM casts WHERE id = ?").get(c1)).toMatchObject({ matter_how: "reader" });
  });

  it("the browser's record: 「分開」 re-files the same cast into a thread of its own, and the reading sees nothing of the old one", async () => {
    const bid = "ssssssssssss0001";
    const a = await cl.logCast({ bid, s: "tabssss00001", input: inp("我和他會復合嗎", NOW - 20 * H), locale: "zh-hant" });
    cl.setLogTeaser(a!.logId, "復合的機會有，但不在他那邊先動。", "style-new");
    const b = await cl.logCast({ bid, s: "tabssss00002", input: inp("我和他會不會復合", NOW - H, V2), locale: "zh-hant" });
    expect(b).toMatchObject({ n: 2, threadId: a!.threadId });
    // the tap: same cast, same words, now a matter of its own
    const s = await cl.logCast({ bid, s: "tabssss00002", input: inp("我和他會不會復合", NOW - H, V2), locale: "zh-hant", separate: true });
    expect(s!.logId).toBe(b!.logId);
    expect(s!.threadId).not.toBe(a!.threadId);
    expect(s).toMatchObject({ n: 1, how: "reader", earlier: [] });
    expect(cl.logRow(b!.logId)).toMatchObject({ separate: 1, thread_how: "reader", thread_n: 1 });
    expect(cl.threadRow(a!.threadId)).toMatchObject({ n: 1 });
    expect(cl.threadRow(s!.threadId)).toMatchObject({ how: "reader", n: 1 });
    expect(llm.calls).toHaveLength(0);
    // asked again without the flag (a refresh): the separate filing stands
    const again = await cl.logCast({ bid, s: "tabssss00002", input: inp("我和他會不會復合", NOW - H, V2), locale: "zh-hant" });
    expect(again!.threadId).toBe(s!.threadId);
    // the paid reading of it gets no thread
    db().prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run("tabssss00002", bid, NOW - H);
    expect(cl.withCastThread("cs_solo_t1", { input: inp("我和他會不會復合", NOW - H, V2), browserSid: "tabssss00002", locale: "zh-hant" }, undefined)).toBeUndefined();
    // the words alone open a new thread too, with the old one still open
    const w = await cl.logCast({ bid, s: "tabssss00003", input: inp("（全新事件）我和他會復合嗎", NOW - 30 * 60_000, V3), locale: "zh-hant" });
    expect(w!.threadId).not.toBe(a!.threadId);
    expect(w).toMatchObject({ n: 1, how: "reader" });
    expect(llm.calls).toHaveLength(0);
    // and a solo input never pulls a thread into the reading, whatever the row says
    expect(cl.withCastThread("cs_solo_t2", { input: { ...inp("我和他會復合嗎", NOW - 20 * H), solo: true }, browserSid: "tabssss00001", locale: "zh-hant" }, undefined)).toBeUndefined();
  });
});

describe("分開 ③: the prompts judge first, tie in second", () => {
  it("the reading and the free line are told the grouping may be wrong", () => {
    expect(MATTER_NOTE(false)).toContain("treat matter_so_far as ABSENT");
    expect(MATTER_NOTE(true)).toContain("take NO date");
    expect(THREAD_NOTE(false)).toContain("treat them as absent");
    expect(THREAD_NOTE(false)).toContain("never how the reader feels now");
    expect(THREAD_NOTE(false)).not.toContain("mandatory");
    expect(THREAD_NOTE(true)).toContain("take NO date");
    expect(TEASER_THREAD_NOTE(3, "say X")).toContain("IGNORE the earlier casts");
    expect(TEASER_THREAD_NOTE(3, "say X")).toContain("cast number 3");
  });
});

describe("分開 on the reading page: split, and one free re-read", () => {
  it("the cast leaves its matter; a reading that had looked at earlier casts is owed one re-read without them", async () => {
    const cid = upsertCustomer("solo-b@example.com", "zh-hant");
    const m = createMatter(cid, "和他的關係", "model", "relationship", NOW - 2 * H);
    const c1 = cast(cid, "他會回我嗎", "sub_solo_b1", NOW - 2 * H);
    const c2 = cast(cid, "今年年底前，我會遇到可以認真交往的人嗎？", "sub_solo_b2", NOW - H, V2);
    setCastMatter(c1, m, "model");
    setCastMatter(c2, m, "model");
    paid.recs.set("sub_solo_b2", { tier: "deep", locale: "zh-hant", verifiedAt: Date.now(), customerId: cid, input: { ...inp("今年年底前，我會遇到可以認真交往的人嗎？", NOW - H, V2), tzOffsetMinutes: -480, teaser: "跟前一卦比，他還是沒動。", prior: { question: "他會回我嗎", at: NOW - 2 * H, hex: "乾", call: "x" } } });

    expect(castOfSession("sub_solo_b2")).toMatchObject({ castId: c2, customerId: cid, matterId: m });
    expect(readingHadContext("sub_solo_b2", castOfSession("sub_solo_b2")!)).toBe(true);
    expect(rereadState("sub_solo_b2")).toBeNull();

    const r = splitCastOff("sub_solo_b2")!;
    expect(r.matterId).not.toBe(m);
    expect(r.rereadOk).toBe(true);
    expect(castsInMatter(m).map((c) => c.id)).toEqual([c1]);
    expect(castsInMatter(r.matterId!).map((c) => c.id)).toEqual([c2]);
    expect(matterById(r.matterId!)).toMatchObject({ customer_id: cid, topic: "relationship" });
    expect(sessionMatter("sub_solo_b2")).toBe(r.matterId);
    expect(rereadState("sub_solo_b2")).toBe("offer");
    // split again: nothing changes, the offer stands
    expect(splitCastOff("sub_solo_b2")).toMatchObject({ matterId: r.matterId, rereadOk: true });

    const out = await rereadAlone("sub_solo_b2");
    expect(out).toBeTruthy();
    expect(gen.calls).toHaveLength(1);
    expect(gen.calls[0]).toMatchObject({ solo: true, question: "今年年底前，我會遇到可以認真交往的人嗎？" });
    expect(gen.calls[0]!.teaser).toBeUndefined();
    expect(gen.calls[0]!.prior).toBeUndefined();
    expect(gen.calls[0]!.matterSoFar).toBeUndefined();
    expect((storedReadingForSession("sub_solo_b2")!.reading as { verdict: Record<string, string> }).verdict["zh-hant"]).toBe("重出：只看這一卦。");
    expect(rereadState("sub_solo_b2")).toBe("done");
    // once
    expect(await rereadAlone("sub_solo_b2")).toBeNull();
    expect(gen.calls).toHaveLength(1);
  });

  it("the routes answer with the page; a first cast that had nothing before it is split but owed nothing", async () => {
    const cid = upsertCustomer("solo-c@example.com", "zh-hant");
    const m = createMatter(cid, "面試", "model", "career", NOW - H);
    const c1 = cast(cid, "面試會過嗎", "sub_solo_c1", NOW - H);
    const c2 = cast(cid, "要不要接這個 offer", "sub_solo_c2", NOW - 30 * 60_000, V3);
    setCastMatter(c1, m, "model");
    setCastMatter(c2, m, "model");
    expect(readingHadContext("sub_solo_c1", castOfSession("sub_solo_c1")!)).toBe(false);
    expect(readingHadContext("sub_solo_c2", castOfSession("sub_solo_c2")!)).toBe(true);
    // the second cast, split from the page: owed a re-read — the route comes back at once and the page waits
    paid.recs.set("sub_solo_c2", { tier: "deep", locale: "zh-hant", verifiedAt: Date.now(), customerId: cid, input: { ...inp("要不要接這個 offer", NOW - 30 * 60_000, V3), tzOffsetMinutes: -480 } });
    const form = new FormData();
    form.set("action", "split"); form.set("sid", "sub_solo_c2"); form.set("back", "/zh-hant/reading?sid=sub_solo_c2");
    const res = await matterPOST(new NextRequest("http://localhost/api/matter", { method: "POST", body: form }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/zh-hant/reading?sid=sub_solo_c2&split=reread#matter");
    expect(castsInMatter(m).map((c) => c.id)).toEqual([c1]);
    expect(rereadState("sub_solo_c2")).toBe("offer");
    const f3 = new FormData();
    f3.set("sid", "sub_solo_c2"); f3.set("back", "/zh-hant/reading?sid=sub_solo_c2");
    const r3 = await rereadPOST(new NextRequest("http://localhost/api/reading/reread", { method: "POST", body: f3 }));
    expect(r3.status).toBe(303);
    expect(r3.headers.get("location")).toContain("reread=wait");
    await new Promise((r) => setTimeout(r, 50));
    expect(rereadState("sub_solo_c2")).toBe("done");
    expect(gen.calls.at(-1)).toMatchObject({ solo: true, question: "要不要接這個 offer" });
    // the first cast: nothing came before it, so it is split and owed nothing — the re-read route says so
    const f1 = new FormData();
    f1.set("action", "split"); f1.set("sid", "sub_solo_c1"); f1.set("back", "/zh-hant/reading?sid=sub_solo_c1");
    const r1 = await matterPOST(new NextRequest("http://localhost/api/matter", { method: "POST", body: f1 }));
    expect(r1.headers.get("location")).toContain("/zh-hant/reading?sid=sub_solo_c1&split=1#matter");
    expect(rereadState("sub_solo_c1")).toBeNull();
    const f2 = new FormData();
    f2.set("sid", "sub_solo_c1"); f2.set("back", "/zh-hant/reading?sid=sub_solo_c1");
    expect((await rereadPOST(new NextRequest("http://localhost/api/reading/reread", { method: "POST", body: f2 }))).status).toBe(404);
    // a bad back never redirects anywhere else
    const f4 = new FormData();
    f4.set("sid", "sub_solo_c2"); f4.set("back", "https://evil.example/x");
    expect((await rereadPOST(new NextRequest("http://localhost/api/reading/reread", { method: "POST", body: f4 }))).status).toBe(400);
  });
});

/**
 * 10-23 进度表 98 (客服 #510 「如果不小心把同一件事情裡面的兩個問題分開了還能再加回去嗎」): the way back. For a day after a
 * split the reading page offers 「分錯了？合併回去」; the cast returns to the matter it left, nothing is rewritten, an untaken
 * free re-read is withdrawn. After the day, or once that matter is gone, the offer is over.
 */
describe("合併回去: a split tapped by mistake can be undone for a day", () => {
  it("the cast goes back to the matter it left; the untaken re-read is withdrawn; the reading is untouched", async () => {
    const cid = upsertCustomer("solo-d@example.com", "zh-hant");
    const m = createMatter(cid, "和他的關係", "model", "relationship", NOW - 2 * H);
    const c1 = cast(cid, "他會回我嗎", "sub_solo_d1", NOW - 2 * H);
    const c2 = cast(cid, "他下午不回訊息", "sub_solo_d2", NOW - H, V2);
    setCastMatter(c1, m, "model");
    setCastMatter(c2, m, "model");
    expect(unsplitOffer("sub_solo_d2")).toBeNull();
    const r = splitCastOff("sub_solo_d2")!;
    expect(r.matterId).not.toBe(m);
    expect(rereadState("sub_solo_d2")).toBe("offer");
    expect(db().prepare("SELECT split_from_matter AS f FROM casts WHERE id = ?").get(c2)).toMatchObject({ f: m });
    expect(unsplitOffer("sub_solo_d2")).toEqual({ matterId: m });
    const before = storedReadingForSession("sub_solo_d2")!.reading;
    const u = unsplitCast("sub_solo_d2");
    expect(u).toEqual({ ok: true, matterId: m });
    expect(castsInMatter(m).map((c) => c.id).sort()).toEqual([c1, c2].sort());
    expect(matterById(r.matterId!)).toBeNull(); // the matter the split made, empty now, is gone
    expect(sessionMatter("sub_solo_d2")).toBe(m);
    expect(db().prepare("SELECT matter_how AS h, split_from_matter AS f FROM casts WHERE id = ?").get(c2)).toMatchObject({ h: "reader_unsplit", f: null });
    expect(rereadState("sub_solo_d2")).toBeNull();
    expect(storedReadingForSession("sub_solo_d2")!.reading).toEqual(before);
    expect(gen.calls).toHaveLength(0);
    // the offer is spent
    expect(unsplitOffer("sub_solo_d2")).toBeNull();
    expect(unsplitCast("sub_solo_d2")).toEqual({ ok: false, why: "none" });
    expect(db().prepare("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'matter_unsplit'").get()).toMatchObject({ n: 1 });
  });

  it("the original matter is gone (its last cast moved on) → 「原來那件事已經不在了」; after a day the offer is over; the route answers with the page", async () => {
    const cid = upsertCustomer("solo-e@example.com", "zh-hant");
    const m = createMatter(cid, "面試", "model", "career", NOW - 2 * H);
    const c1 = cast(cid, "面試會過嗎", "sub_solo_e1", NOW - 2 * H);
    const c2 = cast(cid, "要不要接這個 offer", "sub_solo_e2", NOW - H, V3);
    setCastMatter(c1, m, "model");
    setCastMatter(c2, m, "model");
    splitCastOff("sub_solo_e2");
    // c1 leaves too: m is empty and removed
    const { moveCast } = await import("../src/lib/matter-move");
    moveCast(c1, null, cid, "別的事", "reader");
    expect(matterById(m)).toBeNull();
    expect(unsplitOffer("sub_solo_e2")).toBeNull();
    const form = new FormData();
    form.set("action", "unsplit"); form.set("sid", "sub_solo_e2"); form.set("back", "/zh-hant/reading?sid=sub_solo_e2");
    const res = await matterPOST(new NextRequest("http://localhost/api/matter", { method: "POST", body: form }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/zh-hant/reading?sid=sub_solo_e2&merged=gone#matter");
    expect(db().prepare("SELECT split_from_matter AS f FROM casts WHERE id = ?").get(c2)).toMatchObject({ f: null });
    // a split older than a day
    const c3 = cast(cid, "要不要換工作", "sub_solo_e3", NOW - 30 * 60_000, V2);
    const m2 = createMatter(cid, "工作", "model", "career", NOW - H);
    setCastMatter(c3, m2, "model");
    setCastMatter(c1, m2, "model");
    splitCastOff("sub_solo_e3");
    db().prepare("UPDATE casts SET split_at = ? WHERE id = ?").run(NOW - UNSPLIT_WINDOW_MS - 60_000, c3);
    expect(unsplitOffer("sub_solo_e3")).toBeNull();
    expect(unsplitCast("sub_solo_e3")).toEqual({ ok: false, why: "none" });
    expect(castsInMatter(m2).map((c) => c.id)).toEqual([c1]);
    // the happy path through the route
    const c4 = cast(cid, "下週的面試呢", "sub_solo_e4", NOW - 20 * 60_000, V3);
    setCastMatter(c4, m2, "model");
    splitCastOff("sub_solo_e4");
    const f2 = new FormData();
    f2.set("action", "unsplit"); f2.set("sid", "sub_solo_e4"); f2.set("back", "/zh-hant/reading?sid=sub_solo_e4");
    const r2 = await matterPOST(new NextRequest("http://localhost/api/matter", { method: "POST", body: f2 }));
    expect(r2.headers.get("location")).toContain("/zh-hant/reading?sid=sub_solo_e4&merged=1#matter");
    expect(castsInMatter(m2).map((c) => c.id).sort()).toEqual([c1, c4].sort());
    // an unknown session
    const f3 = new FormData();
    f3.set("action", "unsplit"); f3.set("sid", "sub_nobody_x1");
    expect((await matterPOST(new NextRequest("http://localhost/api/matter", { method: "POST", body: f3 }))).status).toBe(404);
  });

  it("the words are in every language", () => {
    for (const l of LOCALES) {
      const m = (MATTER_T as Record<string, Record<string, string>>)[l]!;
      for (const k of ["unsplitBtn", "unsplitDone", "unsplitGone"]) expect(m[k], `${l}.${k}`).toBeTruthy();
    }
  });
});
