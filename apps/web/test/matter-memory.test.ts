import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-04 进度表 30 「一件事」记忆的时效与边界 (会员 #651: two light readings quoted her note from five days earlier and read
 * her present mood off it — 「當時的想法只代表當時的狀態」). The record the model sees is dated, a "today" question sees
 * only the last 72 hours, the reader can switch a matter's record off, and the prompts say what the record is for.
 */
const llm = vi.hoisted(() => ({ text: [] as string[], calls: [] as { messages: { role: string; content: string }[] }[] }));
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  return {
    ...real,
    chatText: vi.fn(async (messages: { role: string; content: string }[]) => { llm.calls.push({ messages }); const v = llm.text.shift(); if (v === undefined) throw new Error("no model in tests"); return v; }),
  };
});

const { db, castsInMatter, createMatter, matterById, recordOrder, saveCast, saveProgressNote, saveReading, setCastMatter, setMatterNoContext, upsertCustomer } = await import("../src/lib/db");
const { daysAgo, isTodayScale, matterOptsFor, matterSoFar, RECENT_MS } = await import("../src/lib/matter-context");
const { questionScale } = await import("../src/lib/scale-words");
const { withCastThread } = await import("../src/lib/cast-log");
const { writeDailyLine, dailyLinePrompt } = await import("../src/lib/daily-line");
const { memberDaily } = await import("../src/lib/member-daily");
const { buildUserPayload, followupSystem, MATTER_NOTE, THREAD_NOTE, resolveServerChart, resolveTiming } = await import("../src/lib/reading");
const { MATTER_T } = await import("../src/lib/dict/matter");
const { THREAD_T } = await import("../src/lib/dict/thread");
const { LOCALES } = await import("../src/lib/locales");

const V: LineValue[] = [7, 8, 9, 7, 8, 8];
const DAY = 86_400_000, H = 3_600_000;
/** the reader's today, 10:00 in Taipei (UTC+8) */
const NOW = Date.UTC(2026, 9, 3, 2);
const TZ = 480; // tzOffsetMinutes as the site stores it: -getTimezoneOffset(), minutes east of UTC

beforeEach(() => { llm.text.length = 0; llm.calls.length = 0; });

function cast(cid: number, question: string, sid: string, at: number, deep = false) {
  const chart = resolveServerChart({ question, values: V, castAtMs: at, tzOffsetMinutes: TZ }, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: at, tzOffsetMinutes: TZ, locale: "zh-hant", question, topic: "relationship", values: V, chart });
  saveReading(castId, cid, deep ? "deep" : "one", "zh-hant", deep
    ? { verdict: { "zh-hant": "會聯絡，但不是現在。" }, timing: { "zh-hant": "10月3日到8日之間。" }, tendency: { "zh-hant": "x" }, basis: { "zh-hant": "x" }, strategy: { "zh-hant": "x" }, caution: { "zh-hant": "x" }, next_step: { "zh-hant": "x" }, closing: { "zh-hant": "x" } }
    : { summary: { "zh-hant": "他還在猶豫。" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: deep ? "deep" : "one", amountCents: 0, currency: null, email: null, status: "subscription" });
  db().prepare("UPDATE casts SET created_at = ? WHERE id = ?").run(at, castId);
  return castId;
}
function note(castId: number, text: string, at: number) {
  const id = saveProgressNote(castId, text, "回應");
  db().prepare("UPDATE progress_notes SET created_at = ? WHERE id = ?").run(at, id);
  return id;
}

/** #651's shape: a note five days ago, casts every day, and today's question "今日份" */
function sixFiftyOne(email: string) {
  const cid = upsertCustomer(email, "zh-hant");
  const m = createMatter(cid, "和他的關係", "model", "relationship", NOW - 6 * DAY);
  const c5 = cast(cid, "我們之間還有可能嗎", `sub_${email}_5`, NOW - 5 * DAY - 2 * H, true);
  setCastMatter(c5, m, "model");
  note(c5, "我知道答案了，就是當朋友", NOW - 5 * DAY - H);
  const c2 = cast(cid, "今日份情感忠告", `sub_${email}_2`, NOW - 2 * DAY);
  setCastMatter(c2, m, "model");
  note(c2, "他昨天回了一個貼圖", NOW - DAY - 3 * H);
  const c0 = cast(cid, "今日份情感忠告", `sub_${email}_0`, NOW);
  setCastMatter(c0, m, "model");
  return { cid, m, c5, c2, c0 };
}

describe("记忆带时效：每条带 days_ago，「今天」的问题只带 72 小时", () => {
  it("counts the reader's local days", () => {
    expect(daysAgo(NOW - 5 * DAY, NOW, TZ)).toBe(5);
    expect(daysAgo(NOW - 3 * H, NOW, TZ)).toBe(0);
    expect(daysAgo(NOW - 11 * H, NOW, TZ)).toBe(1); // 23:00 yesterday in Taipei
    expect(daysAgo(NOW + H, NOW, TZ)).toBe(0); // never negative
    expect(isTodayScale("day")).toBe(true); expect(isTodayScale("now")).toBe(true); expect(isTodayScale("weeks")).toBe(false); expect(isTodayScale(undefined)).toBe(false);
    expect(isTodayScale(questionScale("今日份情感忠告"))).toBe(true);
    expect(isTodayScale(questionScale("今天他會聯絡我嗎"))).toBe(true);
    expect(RECENT_MS).toBe(72 * H);
  });

  it("a weeks-scale question sees the whole record, dated; a today question sees only the last 72 hours and one background line", () => {
    const { m } = sixFiftyOne("mm-a@example.com");
    const whole = matterSoFar(m, { sessions: ["sub_mm-a@example.com_0"] }, "zh-hant", { scale: "weeks", at: NOW })!;
    expect(whole.earlier_casts.map((c) => [c.question, c.days_ago])).toEqual([["我們之間還有可能嗎", 5], ["今日份情感忠告", 2]]);
    expect(whole.reader_notes.map((n) => [n.note, n.days_ago])).toEqual([["我知道答案了，就是當朋友", 5], ["他昨天回了一個貼圖", 1]]);
    expect(whole.background).toBeUndefined();

    // dated from a cast's instant, what came after it is not its past (the sweep writing a reading late; a re-read later)
    const back = matterSoFar(m, { sessions: ["sub_mm-a@example.com_2"] }, "zh-hant", { scale: "weeks", at: NOW - 2 * DAY })!;
    expect(back.earlier_casts.map((c) => [c.question, c.days_ago])).toEqual([["我們之間還有可能嗎", 3]]);
    expect(back.reader_notes.map((n) => n.note)).toEqual(["我知道答案了，就是當朋友"]);
    // dated from now (a follow-up), a note written since the cast is in
    expect(matterSoFar(m, { sessions: ["sub_mm-a@example.com_2"] }, "zh-hant", { scale: "weeks" })!.reader_notes).toHaveLength(2);

    const today = matterSoFar(m, { sessions: ["sub_mm-a@example.com_0"] }, "zh-hant", { scale: "day", at: NOW })!;
    expect(today.earlier_casts.map((c) => [c.question, c.days_ago])).toEqual([["今日份情感忠告", 2]]);
    expect(today.reader_notes.map((n) => n.note)).toEqual(["他昨天回了一個貼圖"]);
    // the five-day-old note is gone from the payload; what remains of it is one line about how much lies before the window
    expect(JSON.stringify(today)).not.toContain("就是當朋友");
    expect(today.background).toBe("「和他的關係」: 1 earlier cast and 1 note from 5 days ago, not shown here; the latest of those asked 「我們之間還有可能嗎」");
    // the reading's payload carries it; the light tier still drops the dates
    // the scale comes from the chip the reader tapped, else from the question's own words (「今日份」 is a today question)
    const input = { question: "今日份情感忠告", values: V, castAtMs: NOW, tzOffsetMinutes: TZ };
    expect(matterOptsFor(input, true)).toEqual({ scale: "now", at: NOW });
    expect(matterOptsFor({ ...input, question: "明年2月會怎麼相處" }, true).scale).not.toMatch(/^(now|day)$/);
    expect(matterOptsFor({ ...input, question: "明年2月會怎麼相處", scaleHint: "day" }, true).scale).toBe("day");
    const chart = resolveServerChart(input, true);
    const payload = JSON.parse(buildUserPayload(input.question, chart, resolveTiming(input, chart, true), { tellTime: false, matter: today }));
    expect(payload.matter_so_far.background).toContain("not shown here");
    expect(payload.matter_so_far.earlier_casts[0].days_ago).toBe(2);
    expect(payload.matter_so_far.earlier_casts[0].timing).toBeUndefined();
  });

  it("the daily line only carries notes from the last 72 hours, and never the older ones", async () => {
    const { cid, m } = sixFiftyOne("mm-b@example.com");
    const fc = castsInMatter(m).find((c) => c.tier === "deep")!;
    const d = memberDaily(fc, NOW)!;
    llm.text.push("今天適合把自己的事做好，留意訊息但不急著回；別在今晚追問他的想法。");
    expect(await writeDailyLine(cid, fc, d, NOW)).toContain("今天適合");
    const sent = llm.calls[0]!.messages[1]!.content;
    expect(sent).toContain("他昨天回了一個貼圖");
    expect(sent).not.toContain("就是當朋友");
    expect(llm.calls[0]!.messages[0]!.content).toContain("never quote or paraphrase them back");
  });
});

describe("读者开关：这件事的记录不进解读", () => {
  it("matterSoFar hands over the title alone, the free-cast thread stays out, the daily line carries no notes", async () => {
    const { cid, m } = sixFiftyOne("mm-c@example.com");
    expect(setMatterNoContext(m, cid, true)).toBe(true);
    expect(setMatterNoContext(m, cid + 999, true)).toBe(false); // not theirs
    expect(matterById(m)!.no_context).toBe(1);
    const so = matterSoFar(m, { sessions: ["sub_mm-c@example.com_0"] }, "zh-hant", { scale: "weeks", at: NOW })!;
    expect(so).toEqual({ title: "和他的關係", earlier_casts: [], reader_notes: [], no_context: true });
    // nothing for the prompt: the payload has no matter_so_far at all
    const input = { question: "今日份情感忠告", values: V, castAtMs: NOW, tzOffsetMinutes: TZ };
    const chart = resolveServerChart(input, true);
    expect(JSON.parse(buildUserPayload(input.question, chart, resolveTiming(input, chart, true), { matter: so })).matter_so_far).toBeUndefined();
    // the cast-log thread is not merged in either
    expect(withCastThread("sub_mm-c@example.com_0", { input, locale: "zh-hant" }, so)).toBe(so);
    // the daily line
    const fc = castsInMatter(m).find((c) => c.tier === "deep")!;
    llm.text.push("今天適合把自己的事做好，留意訊息但不急著回；別在今晚追問他的想法。");
    await writeDailyLine(cid, fc, memberDaily(fc, NOW)!, NOW);
    expect(JSON.parse(llm.calls[0]!.messages[1]!.content).reader_notes_recent).toEqual([]);
    // and back on
    expect(setMatterNoContext(m, cid, false)).toBe(true);
    expect(matterSoFar(m, { sessions: ["sub_mm-c@example.com_0"] }, "zh-hant", { scale: "weeks", at: NOW })!.earlier_casts).toHaveLength(2);
  });

  it("the matter page's form flips it (owner only) and sends the reader back to the page", async () => {
    const { POST } = await import("../src/app/api/matter/route");
    const { createSession } = await import("../src/lib/db");
    const { SESSION_COOKIE } = await import("../src/lib/auth");
    const { NextRequest } = await import("next/server");
    const { cid, m } = sixFiftyOne("mm-d@example.com");
    const other = upsertCustomer("mm-e@example.com", "zh-hant");
    const sid = "e".repeat(64), sid2 = "f".repeat(64);
    createSession(sid, cid, 3_600_000);
    createSession(sid2, other, 3_600_000);
    const post = (session: string, off: string) => POST(new NextRequest("http://localhost/api/matter", {
      method: "POST", headers: { cookie: `${SESSION_COOKIE}=${session}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "context", id: String(m), off, back: `/zh-hant/matter/${m}` }).toString(),
    }));
    const r1 = await post(sid, "1");
    expect(r1.status).toBeGreaterThanOrEqual(300);
    expect(r1.headers.get("location")).toContain(`/zh-hant/matter/${m}`);
    expect(matterById(m)!.no_context).toBe(1);
    // someone else's session cannot touch it
    expect((await post(sid2, "0")).status).toBe(404);
    expect(matterById(m)!.no_context).toBe(1);
    await post(sid, "0");
    expect(matterById(m)!.no_context).toBe(0);
  });

  it("the words exist in every language: the switch on the matter page, the hint under the note box", () => {
    for (const l of LOCALES) {
      const mt = (MATTER_T as Record<string, Record<string, string>>)[l]!;
      for (const k of ["ctxTitle", "ctxOn", "ctxOff", "ctxTurnOff", "ctxTurnOn", "ctxOffBadge"]) expect(mt[k]!.length, `${l}.${k}`).toBeGreaterThan(3);
      expect((THREAD_T as unknown as Record<string, Record<string, string>>)[l]!.noteHint!.length, `${l}.noteHint`).toBeGreaterThan(10);
    }
    expect(THREAD_T.zh.noteHint).toContain("记发生的事");
  });
});

describe("提示词：过去的记录不断现在的心情、不引原话", () => {
  it("the matter, thread and follow-up notes carry the rules", () => {
    for (const light of [true, false]) {
      const n = MATTER_NOTE(light);
      expect(n).toContain("HARD RULES");
      expect(n).toContain("Never read the reader's PRESENT mood");
      expect(n).toContain("`inner_condition`");
      expect(n).toContain("Never quote or closely paraphrase");
      expect(n).toContain("`days_ago` above 3 is background only");
      expect(n).toContain("`matter_so_far.background`");
      expect(n).toContain("an event, never their words or their feelings");
      expect(THREAD_NOTE(light)).toContain("never how the reader feels now");
    }
    expect(MATTER_NOTE(true)).toContain("take NO date");
    expect(MATTER_NOTE(false)).not.toContain("take NO date");
    const fu = followupSystem("deep", "zh-hant", { matter: true });
    expect(fu).toContain("never quote their own notes or earlier questions back");
    expect(fu).toContain("older than 3 days as background only");
    expect(followupSystem("deep", "zh-hant", {})).not.toContain("older than 3 days");
    expect(dailyLinePrompt("zh-hant")).toContain("never tell the reader how they feel today from them");
  });
});
