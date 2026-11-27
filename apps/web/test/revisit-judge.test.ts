import { beforeAll, describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";

/**
 * 10-07 回访改问法 (Neil: 「58% 没应验」→ 查 → 「做吧」): the revisit asks about the FACT (happened / stirred / nothing /
 * open) and the score is derived from the reading's own lean — a reading that called the matter unlikely is right when
 * nothing happened. Old links still work; a question about how someone feels asks about the signals and is never scored;
 * the answers already given are re-scored once, upwards or sideways only.
 */
const { db, deepReadingOf, outcomeStats, recordOrder, rescoreLegacyRevisits, revisitById, revisitBySession, saveCast, saveReading, scheduleRevisit, upsertCustomer } = await import("../src/lib/db");
const judge = await import("../src/lib/revisit-judge");
const { revisitAsk } = await import("../src/lib/revisit-ask");
const { outcomeToken } = await import("../src/lib/outcome-token");
const { resolveServerChart } = await import("../src/lib/reading");
const { buildRevisitEmail } = await import("../src/lib/email");
const { GET: outcomeGET } = await import("../src/app/api/revisit/outcome/route");

const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 8, 1, 3);
const DAY = 86_400_000;

beforeAll(() => { process.env.ADMIN_KEY ??= "test-admin-key"; });

function deep(sid: string, email: string, question: string, body: Record<string, unknown>, o: { windowDays?: number } = {}) {
  const cid = upsertCustomer(email, "zh-hant");
  const chart = resolveServerChart({ question, values: V, castAtMs: AT, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh-hant", question, topic: "relationship", values: V, chart });
  saveReading(castId, cid, "deep", "zh-hant", body as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 7500, currency: "TWD", email, status: "paid" });
  scheduleRevisit({ sessionId: sid, castId, customerId: cid, email, locale: "zh-hant", tier: "deep", castAtMs: AT, windowDays: o.windowDays ?? 10, timingQuote: "十月中旬前有回音", question });
  return revisitBySession(sid)!;
}
const tap = async (id: number, v: string) => {
  const res = await outcomeGET(new NextRequest(`https://yaoflow.com/api/revisit/outcome?id=${id}&v=${v}&t=${outcomeToken(id)}&l=zh-hant`));
  return { status: res.status, html: await res.text(), row: revisitById(id)! };
};

describe("计分规则", () => {
  it("the lean: odds code first, else the verdict's words", () => {
    expect(judge.leanOfOdds("good")).toBe("likely");
    expect(judge.leanOfOdds("strong")).toBe("likely");
    expect(judge.leanOfOdds("hard")).toBe("unlikely");
    expect(judge.leanOfOdds("very_hard")).toBe("unlikely");
    expect(judge.leanOfOdds("even")).toBe("even");
    expect(judge.leanOfOdds(null)).toBeNull();
    expect(judge.leanOfWords("會。")).toBe("likely");
    expect(judge.leanOfWords("不會回來。他那邊沒有要回頭的意思")).toBe("unlikely");
    expect(judge.leanOfWords("難。這件事近期不會有結果")).toBe("unlikely");
    expect(judge.leanOfWords("會有回音，但要等到月中")).toBe("likely");
    expect(judge.leanOfWords("It is unlikely he will write before the window closes")).toBe("unlikely");
    expect(judge.leanOfWords("先緊後鬆，看你怎麼接")).toBeNull();
    expect(judge.readingLean({ odds: { "zh-hant": "hard" }, verdict: { "zh-hant": "會。" } }, "zh-hant")).toBe("unlikely"); // the code wins
    expect(judge.readingLean({ verdict: { "zh-hant": "會。" } }, "zh-hant")).toBe("likely");
    expect(judge.readingLean(null, "zh-hant")).toBeNull();
  });

  it("the score: likely + happened and unlikely + nothing are hits; stirred is partial; even, unknown and signals never score", () => {
    const J = judge.judgeEvent;
    expect(J("likely", "happened")).toBe("hit");
    expect(J("likely", "nothing")).toBe("miss");
    expect(J("likely", "stirred")).toBe("partial");
    expect(J("unlikely", "nothing")).toBe("hit");
    expect(J("unlikely", "happened")).toBe("miss");
    expect(J("unlikely", "stirred")).toBe("partial");
    expect(J("even", "happened")).toBe("unclear");
    expect(J("even", "nothing")).toBe("unclear");
    expect(J(null, "nothing")).toBe("unclear");
    expect(J("likely", "open")).toBe("open");
    expect(J("likely", "happened", "signals")).toBe("unclear");
    // the old links mean the fact they always meant
    expect(judge.parseEvent("hit")).toBe("happened");
    expect(judge.parseEvent("partial")).toBe("stirred");
    expect(judge.parseEvent("miss")).toBe("nothing");
    expect(judge.parseEvent("open")).toBe("open");
    expect(judge.parseEvent("nothing")).toBe("nothing");
    expect(judge.parseEvent("yes")).toBeNull();
    expect(judge.eventOf({ event: null, outcome: "miss" })).toBe("nothing");
    expect(judge.eventOf({ event: "happened", outcome: "miss" })).toBe("happened");
    expect(judge.eventOf({ event: null, outcome: "unclear" })).toBeNull();
  });

  it("a question about how another person feels asks about the signals; an event question about a person does not", () => {
    expect(revisitAsk("他還喜歡我嗎")).toBe("signals");
    expect(revisitAsk("對方對我有沒有好感")).toBe("signals");
    expect(revisitAsk("她到底怎麼想")).toBe("signals");
    expect(revisitAsk("Does he still love me?")).toBe("signals");
    expect(revisitAsk("彼は私をどう思っているか")).toBe("signals");
    expect(revisitAsk("他會不會主動聯絡我")).toBe("event");
    expect(revisitAsk("我喜歡的工作會錄取嗎")).toBe("event"); // a feeling word, but no other person: an event
    expect(revisitAsk("這次面試能過嗎")).toBe("event");
    expect(revisitAsk(null)).toBe("event");
  });
});

describe("从信里或页面点一下：记事实，按倾向计分", () => {
  it("an unlikely reading: 「完全沒發生」 is a hit (with the right words), 「發生了」 a miss, 「有一點動靜」 partial; the latest tap wins", async () => {
    const r = deep("cs_rj_hard", "rj-hard@example.com", "他會不會回來找我", { verdict: { "zh-hant": "不會。他那邊沒有要回頭的意思。" }, odds: { "zh-hant": "hard" }, timing: { "zh-hant": "十月中旬前有回音" } });
    expect(r.ask).toBeNull(); // an event question
    let a = await tap(r.id, "nothing");
    expect(a.status).toBe(200);
    expect(a.row).toMatchObject({ event: "nothing", lean: "unlikely", outcome: "hit" });
    expect(a.html).toContain("記下了"); // 10-17: the page no longer says how it scores
    expect(a.html).not.toContain("這算說中了");
    expect(a.html).toContain("/zh-hant/proof/"); // a hit makes a proof card
    a = await tap(r.id, "happened");
    expect(a.row).toMatchObject({ event: "happened", lean: "unlikely", outcome: "miss" });
    expect(a.html).not.toContain("這算說錯了");
    a = await tap(r.id, "stirred");
    expect(a.row).toMatchObject({ event: "stirred", outcome: "partial" });
    // the old link in an inbox: v=miss means 「完全沒發生」
    a = await tap(r.id, "miss");
    expect(a.row).toMatchObject({ event: "nothing", outcome: "hit" });
    expect((await tap(r.id, "yes")).status).toBe(400);
  });

  it("a likely reading scores the other way round; an even reading keeps the fact and scores nothing", async () => {
    const good = deep("cs_rj_good", "rj-good@example.com", "這個 offer 談得成嗎", { verdict: { "zh-hant": "可以談成，但要壓價。" }, odds: { "zh-hant": "good" } });
    expect((await tap(good.id, "happened")).row).toMatchObject({ event: "happened", lean: "likely", outcome: "hit" });
    expect((await tap(good.id, "nothing")).row).toMatchObject({ event: "nothing", lean: "likely", outcome: "miss" });
    const even = deep("cs_rj_even", "rj-even@example.com", "這個案子會不會成", { verdict: { "zh-hant": "看條件。" }, odds: { "zh-hant": "even" } });
    const a = await tap(even.id, "nothing");
    expect(a.row).toMatchObject({ event: "nothing", lean: "even", outcome: "unclear" });
    expect(a.html).not.toContain("不算對錯");
    // a reading without an odds code falls back to the verdict's words
    const words = deep("cs_rj_words", "rj-words@example.com", "他會回我訊息嗎", { verdict: { "zh-hant": "不會回。" } });
    expect((await tap(words.id, "nothing")).row).toMatchObject({ lean: "unlikely", outcome: "hit" });
  });

  it("a question about how someone feels: the letter and the page ask about the signals; the answer is kept, never scored", async () => {
    const r = deep("cs_rj_feel", "rj-feel@example.com", "他到底還喜不喜歡我", { verdict: { "zh-hant": "他那邊還有情分。" }, odds: { "zh-hant": "good" } });
    expect(r.ask).toBe("signals");
    const a = await tap(r.id, "happened");
    expect(a.row).toMatchObject({ event: "happened", outcome: "unclear" });
    expect(a.html).toContain("訊號");
    const m = buildRevisitEmail({ locale: "zh-hant", question: "q", values: V, hexName: "澤山咸", changedName: null, timingQuote: "十月中旬", windowDays: 10, readingUrl: "https://yaoflow.com/r", castUrl: "https://yaoflow.com", ask: "signals",
      outcomeUrls: { hit: "https://yaoflow.com/o?v=happened", partial: "https://yaoflow.com/o?v=stirred", miss: "https://yaoflow.com/o?v=nothing", open: "https://yaoflow.com/o?v=open" } });
    expect(m.html).toContain("訊號");
    expect(m.html).toContain("出現了");
    expect(m.html).toContain("沒看到");
    expect(m.html).not.toContain("完全沒發生");
    const plain = buildRevisitEmail({ locale: "zh-hant", question: "q", values: V, hexName: "澤山咸", changedName: null, timingQuote: "十月中旬", windowDays: 10, readingUrl: "https://yaoflow.com/r", castUrl: "https://yaoflow.com",
      outcomeUrls: { hit: "https://yaoflow.com/o?v=happened", partial: "https://yaoflow.com/o?v=stirred", miss: "https://yaoflow.com/o?v=nothing", open: "https://yaoflow.com/o?v=open" } });
    expect(plain.html).toContain("完全沒發生");
    expect(plain.html).not.toContain("像說的那樣");
  });

  it("the stats count hit and miss only where the reading could be scored, and name the rest", () => {
    const st = outcomeStats();
    expect(st.unclear).toBeGreaterThanOrEqual(2);
    expect(st.answered).toBe(st.hit + st.partial + st.miss + st.open + st.unclear);
    expect(deepReadingOf(revisitBySession("cs_rj_hard")!.cast_id!)?.locale).toBe("zh-hant");
  });
});

describe("已有的回答重算一次（只往上、往旁，不往下）", () => {
  it("「完全沒發生」 on an unlikely reading becomes a hit, on an even one unclear, on a likely one stays a miss; hits stay hits", () => {
    const d = db();
    const mk = (sid: string, email: string, body: Record<string, unknown>, outcome: string) => {
      const r = deep(sid, email, "他會不會聯絡我", body, { windowDays: 3 });
      d.prepare("UPDATE revisits SET outcome = ?, outcome_at = ?, event = NULL, lean = NULL WHERE id = ?").run(outcome, Date.now() - DAY, r.id);
      return r.id;
    };
    const a = mk("cs_rs_a", "rs-a@example.com", { verdict: { "zh-hant": "不會。" }, odds: { "zh-hant": "hard" } }, "miss");
    const b = mk("cs_rs_b", "rs-b@example.com", { verdict: { "zh-hant": "看條件。" }, odds: { "zh-hant": "even" } }, "miss");
    const c = mk("cs_rs_c", "rs-c@example.com", { verdict: { "zh-hant": "會。" }, odds: { "zh-hant": "good" } }, "miss");
    const e = mk("cs_rs_e", "rs-e@example.com", { verdict: { "zh-hant": "不會。" }, odds: { "zh-hant": "hard" } }, "hit");
    const f = mk("cs_rs_f", "rs-f@example.com", { verdict: { "zh-hant": "會。" }, odds: { "zh-hant": "good" } }, "partial");
    d.prepare("DELETE FROM ops_events WHERE kind = 'revisit_rescore_1007'").run();
    rescoreLegacyRevisits(d);
    expect(revisitById(a)).toMatchObject({ event: "nothing", lean: "unlikely", outcome: "hit" });
    expect(revisitById(b)).toMatchObject({ event: "nothing", lean: "even", outcome: "unclear" });
    expect(revisitById(c)).toMatchObject({ event: "nothing", lean: "likely", outcome: "miss" });
    expect(revisitById(e)).toMatchObject({ event: "happened", lean: "unlikely", outcome: "hit" }); // the reader confirmed it; a card may carry it
    expect(revisitById(f)).toMatchObject({ event: "stirred", outcome: "partial" });
    const marks = d.prepare("SELECT COUNT(*) AS c FROM ops_events WHERE kind = 'revisit_rescore_1007'").get() as { c: number };
    expect(Number(marks.c)).toBe(1);
    // runs once: a second call changes nothing
    d.prepare("UPDATE revisits SET event = NULL WHERE id = ?").run(c);
    rescoreLegacyRevisits(d);
    expect(revisitById(c)!.event ?? null).toBeNull();
  });
});
