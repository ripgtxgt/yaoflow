import { describe, expect, it } from "vitest";
import { db, dueRevisitEmails, dueRevisitsForEmail, markRevisit, revisitBacklog, scheduleRevisit, setRevisitOutcome, upsertCustomer } from "../src/lib/db";
import { createDraw, dueTarotRevisits, markTarotRevisitSent, setTarotAnswer, setTarotRevisit } from "../src/lib/tarot";
import { RESULTS_TTL, resetResultsCache, resultsCounts } from "../src/lib/results-line";
import { t } from "../src/lib/i18n";

const DAY = 86_400_000;

/** 10-22 进度表 79 — the home page's results line: 六爻＋塔羅 revisits counted, never a rate; the first sentence */
describe("把結果擺出來 (79 → 104)", () => {
  it("counts matters asked (sent, or answered first) and each answer: the readings scored, the spreads as the reader's fact; five minutes' cache", () => {
    resetResultsCache();
    const before = resultsCounts(1);
    resetResultsCache();
    const cid = upsertCustomer("results-79@example.com", "zh-hant");
    const sid = (n: number) => `cs_results79_${n}`;
    for (const [n, outcome, event] of [[1, "hit", "happened"], [2, "partial", "stirred"], [3, "miss", "nothing"], [4, "open", "open"], [5, "unclear", "happened"]] as const) {
      scheduleRevisit({ sessionId: sid(n), castId: null, customerId: cid, email: "results-79@example.com", locale: "zh-hant", tier: "deep", castAtMs: Date.now() - 20 * DAY, windowDays: 10, timingQuote: "x" });
      const row = db().prepare("SELECT id FROM revisits WHERE session_id = ?").get(sid(n)) as { id: number };
      markRevisit(row.id, "sent");
      setRevisitOutcome(row.id, outcome, { event });
    }
    // 10-23 进度表 104 ②: answered on the site before its letter went — asked all the same
    scheduleRevisit({ sessionId: sid(6), castId: null, customerId: cid, email: "results-79@example.com", locale: "zh-hant", tier: "deep", castAtMs: Date.now() - 20 * DAY, windowDays: 10, timingQuote: "x" });
    setRevisitOutcome((db().prepare("SELECT id FROM revisits WHERE session_id = ?").get(sid(6)) as { id: number }).id, "miss", { event: "nothing" });
    const tk = createDraw({ question: "測試一件事", spread: 1, locale: "zh-hant", bid: null, customerId: cid, register: null }).token;
    markTarotRevisitSent(tk);
    setTarotAnswer(tk, "moving");
    const tk2 = createDraw({ question: "另一件事", spread: 1, locale: "zh-hant", bid: null, customerId: cid, register: null }).token;
    markTarotRevisitSent(tk2);
    resetResultsCache();
    const c = resultsCounts(2);
    expect(c.asked - before.asked).toBe(8); // six readings (one answered before its letter) + two spreads
    expect(c.answered - before.answered).toBe(7);
    expect(c.judged.hit - before.judged.hit).toBe(1);
    expect(c.judged.partial - before.judged.partial).toBe(1);
    expect(c.judged.miss - before.judged.miss).toBe(2);
    expect(c.judged.unclear - before.judged.unclear).toBe(1);
    expect(c.judged.open - before.judged.open).toBe(1);
    expect(c.facts.stirred - before.facts.stirred).toBe(1); // the spread's 「有動靜」 is the reader's fact, never a score
    expect(c.facts.happened - before.facts.happened).toBe(0);
    // the cache: within five minutes the same figure; after, read again; and forgotten at once when asked to
    setRevisitOutcome((db().prepare("SELECT id FROM revisits WHERE session_id = ?").get(sid(4)) as { id: number }).id, "hit", { event: "happened" });
    expect(resultsCounts(3).judged.hit).toBe(c.judged.hit);
    expect(resultsCounts(2 + RESULTS_TTL + 1).judged.hit).toBe(c.judged.hit + 1);
    setTarotAnswer(tk2, "happened");
    expect(resultsCounts(2 + RESULTS_TTL + 2).facts.happened).toBe(c.facts.happened);
    resetResultsCache();
    expect(resultsCounts(2 + RESULTS_TTL + 3).facts.happened).toBe(c.facts.happened + 1);
  });

  it("our own spreads stay out of the counts", () => {
    resetResultsCache();
    const before = resultsCounts(10);
    const me = upsertCustomer("results-test-acct@example.com", "zh-hant");
    db().prepare("UPDATE customers SET test_flag = 1 WHERE id = ?").run(me);
    const tk = createDraw({ question: "自己測一下", spread: 1, locale: "zh-hant", bid: null, customerId: me, register: null }).token;
    markTarotRevisitSent(tk);
    setTarotAnswer(tk, "happened");
    resetResultsCache();
    const after = resultsCounts(11);
    expect(after.asked).toBe(before.asked);
    expect(after.facts.happened).toBe(before.facts.happened);
  });

  it("the first sentence in both scripts, and no banned word on the Chinese home copy", () => {
    expect(t("zh-hant", "heroTitle")).toBe("問一件事，給一個日子，到期回來問你。");
    expect(t("zh", "heroTitle")).toBe("问一件事，给一个日子，到期回来问你。");
    expect(t("zh-hant", "heroSub")).toContain("不用生辰，一事一卦。");
    expect(t("zh-hant", "heroTitle") + t("zh-hant", "heroSub")).not.toMatch(/準|AI|靈驗|神明說/);
  });
});

/** 10-23 进度表 104 ②: 10-22 five readers got a letter about a matter they had already answered on the site */
describe("已答過的不再寄回訪信", () => {
  it("a due revisit answered on the site (anything but 還沒定) leaves the queue and the backlog; 還沒定 stays", () => {
    const now = Date.now();
    const email = "answered-first@example.com";
    const cid = upsertCustomer(email, "zh-hant");
    const mk = (sid: string) => {
      scheduleRevisit({ sessionId: sid, castId: null, customerId: cid, email, locale: "zh-hant", tier: "deep", castAtMs: now - 12 * DAY, windowDays: 10, timingQuote: "x" });
      return (db().prepare("SELECT id FROM revisits WHERE session_id = ?").get(sid) as { id: number }).id;
    };
    const backlog0 = revisitBacklog(now).waiting;
    const a = mk("cs_ans_first_a");
    const b = mk("cs_ans_first_b");
    const c = mk("cs_ans_first_c");
    expect(dueRevisitsForEmail(email, now).map((r) => r.id).sort()).toEqual([a, b, c].sort());
    expect(revisitBacklog(now).waiting - backlog0).toBe(3);
    setRevisitOutcome(a, "hit", { event: "happened" });
    setRevisitOutcome(b, "open", { event: "open" });
    expect(dueRevisitsForEmail(email, now).map((r) => r.id).sort()).toEqual([b, c].sort());
    expect(revisitBacklog(now).waiting - backlog0).toBe(2);
    setRevisitOutcome(c, "miss", { event: "nothing" });
    expect(dueRevisitsForEmail(email, now).map((r) => r.id)).toEqual([b]);
    expect(dueRevisitEmails(now, 5000)).toContain(email);
    setRevisitOutcome(b, "partial", { event: "stirred" });
    expect(dueRevisitEmails(now, 5000)).not.toContain(email);
  });

  it("a spread answered on its page is not asked again by letter (還沒定 still is)", () => {
    const now = Date.now();
    const mk = () => {
      const tk = createDraw({ question: "這件事會怎樣", spread: 1, locale: "zh-hant", bid: null, customerId: null, register: null }).token;
      expect(setTarotRevisit(tk, 14, "", now - 20 * DAY, { email: "tarot-first@example.com" })).toBe(true);
      return tk;
    };
    const x = mk(); const y = mk(); const z = mk();
    setTarotAnswer(x, "happened");
    setTarotAnswer(y, "undecided");
    const due = dueTarotRevisits(now, 500).map((d) => d.token);
    expect(due).not.toContain(x);
    expect(due).toContain(y);
    expect(due).toContain(z);
  });
});
