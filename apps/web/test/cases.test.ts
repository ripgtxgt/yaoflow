import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import type { LineValue } from "@yaoflow/engine";
import { allLiveCases, caseBySession, caseLatestByHex, caseView, db, hideCase, listCases, recordOrder, saveCast, saveReading, scheduleRevisit, upsertCustomer } from "../src/lib/db";
import sitemap from "../src/app/sitemap";
import { casePath, cleanCaseFraming, outcomeKey, outcomeWord, publicFields, publishCase, withdrawCase } from "../src/lib/cases";
import { resolveServerChart } from "../src/lib/reading";

/** §14 ⑬ 公开卦例: a reading published as an anonymous case, by its owner, withdrawable. */
const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 8, 10, 3);

function deep(sid: string, email: string, question: string, status = "paid") {
  const cid = upsertCustomer(email, "zh");
  const input = { question, values: V, castAtMs: AT, tzOffsetMinutes: 480 };
  const chart = resolveServerChart(input, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh", question, topic: "career", values: V, chart });
  saveReading(castId, cid, "deep", "zh", { verdict: { zh: "可接，但要压价。" }, tendency: { zh: "先紧后松。" }, timing: { zh: "九月中旬有动静。" }, basis: { zh: "世爻旺相" }, strategy: { zh: "x" }, caution: { zh: "y" }, next_step: { zh: "z" }, closing: { zh: "w" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 999, currency: "USD", email, status });
  return { cid, castId };
}

describe("公开卦例", () => {
  it("keeps the public wording short and link-free, and off by default", () => {
    expect(cleanCaseFraming("")).toEqual({ ok: true, framing: null });
    expect(cleanCaseFraming("  要不要接这个  offer ")).toEqual({ ok: true, framing: "要不要接这个 offer" });
    expect(cleanCaseFraming("看 https://spam.example 吧")).toEqual({ ok: false, error: "link" });
    expect(cleanCaseFraming("写信到 a@b.com")).toEqual({ ok: false, error: "link" });
    expect(cleanCaseFraming("very".repeat(40)).ok && (cleanCaseFraming("very".repeat(40)) as { framing: string }).framing.length).toBe(80);
  });

  it("publishes only the plain-language passages, never the basis, and never the original question", () => {
    const { castId } = deep("cs_case_1", "c1@example.com", "我私下问的 offer 到底接不接");
    const r = publishCase("cs_case_1", null, null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.public_id).toMatch(/^[0-9a-f]{10}$/);
    expect(r.row.framing).toBeNull();
    const fields = JSON.parse(r.row.fields_json) as Record<string, string>;
    expect(Object.keys(fields)).toEqual(["verdict", "tendency", "timing"]);
    expect(r.row.fields_json).not.toContain("世爻"); // basis stays private
    const view = caseView(r.row.public_id)!;
    expect(view.cast_id).toBe(castId);
    expect(view.values_str).toBe("7,8,9,8,7,8");
    expect(JSON.stringify(view)).not.toContain("私下"); // the view never carries the question
    expect(JSON.stringify(view)).not.toContain("c1@example.com");
    expect(casePath("zh", r.row.public_id)).toBe(`/zh/cases/${r.row.public_id}`);
    expect(listCases("zh").map((c) => c.public_id)).toEqual([r.row.public_id]);
    expect(listCases("en")).toEqual([]);
    // re-publishing with a public wording keeps the same address
    const again = publishCase("cs_case_1", "要不要接这个 offer", null);
    expect(again.ok && again.row.public_id).toBe(r.row.public_id);
    expect(caseBySession("cs_case_1")?.framing).toBe("要不要接这个 offer");
  });

  it("withdraws and hides: the page is gone, the reading is untouched", () => {
    deep("cs_case_2", "c2@example.com", "q");
    const r = publishCase("cs_case_2", null, null);
    if (!r.ok) throw new Error("publish failed");
    expect(withdrawCase("cs_case_2")).toBe(true);
    expect(withdrawCase("cs_case_2")).toBe(false);
    expect(caseView(r.row.public_id)).toBeNull();
    expect(allLiveCases().some((c) => c.public_id === r.row.public_id)).toBe(false);
    // publish again, then moderation takes it down for good
    publishCase("cs_case_2", null, null);
    expect(caseView(r.row.public_id)).not.toBeNull();
    hideCase(r.row.public_id);
    expect(caseView(r.row.public_id)).toBeNull();
    // refunded readings cannot be published
    deep("cs_case_3", "c3@example.com", "q", "refunded");
    expect(publishCase("cs_case_3", null, null)).toEqual({ ok: false, error: "not_eligible" });
    expect(publishCase("cs_nothing", null, null)).toEqual({ ok: false, error: "not_found" });
  });

  it("shows how the timing window turned out", () => {
    const { castId, cid } = deep("cs_case_4", "c4@example.com", "q");
    scheduleRevisit({ sessionId: "cs_case_4", castId, customerId: cid, email: "c4@example.com", locale: "zh", tier: "deep", castAtMs: AT, windowDays: 3, timingQuote: "九月中旬有动静" });
    const r = publishCase("cs_case_4", null, null);
    if (!r.ok) throw new Error("publish failed");
    const v = caseView(r.row.public_id)!;
    expect(v.window_days).toBe(3);
    expect(v.timing_quote).toBe("九月中旬有动静");
    expect(outcomeKey(v, AT)).toBe("caseOutcomePending");
    // 10-23 进度表 104 ②: the window closed but the letter still waits in the queue — not 「到期後沒有回覆」
    expect(v.revisit_status).toBe("pending");
    expect(outcomeKey(v, AT + 30 * 86_400_000)).toBe("caseOutcomeQueued");
    expect(outcomeWord("caseOutcomeQueued", "zh")).toBe("应期已过，等回访");
    expect(outcomeKey({ ...v, revisit_status: "sent" }, AT + 30 * 86_400_000)).toBe("caseOutcomeUnanswered");
    expect(outcomeKey({ window_days: 3, outcome: "hit", due_at: AT }, AT + 86_400_000)).toBe("caseOutcomeHit");
    expect(outcomeKey({ window_days: null, outcome: null, due_at: null })).toBeNull();
    // every answer its own word, the same as /outcomes and the records list: 部分 was 「還說不準」, 不確定 「到期後沒有回覆」
    const word = (outcome: string, l: "zh" | "zh-hant") => outcomeWord(outcomeKey({ window_days: 3, outcome, due_at: AT, revisit_status: "sent" }, AT + 86_400_000)!, l);
    expect(word("partial", "zh-hant")).toBe("部分應了");
    expect(word("unclear", "zh-hant")).toBe("不確定");
    expect(word("open", "zh-hant")).toBe("還沒定");
    expect(word("hit", "zh-hant")).toBe("應驗了");
    expect(word("miss", "zh")).toBe("没有应验");
    expect(publicFields("one", { summary: { zh: "a" }, movement: { zh: "b" }, direction: { zh: "c" }, caution: { zh: "d" } }, "zh")).toEqual({ summary: "a", movement: "b", direction: "c" });
  });

  it("10-09: a published case moves its hexagram's page in the sitemap (primary and changed), a withdrawn one does not count", () => {
    const { castId } = deep("cs_case_5", "c5@example.com", "q");
    const cast = db().prepare("SELECT primary_num, changed_num FROM casts WHERE id = ?").get(castId) as { primary_num: number; changed_num: number | null };
    const before = caseLatestByHex("zh").get(cast.primary_num) ?? 0;
    const r = publishCase("cs_case_5", null, null);
    if (!r.ok) throw new Error("publish failed");
    const row = caseBySession("cs_case_5")!;
    const latest = caseLatestByHex("zh");
    expect(latest.get(cast.primary_num)).toBe(row.published_at);
    expect(latest.get(cast.primary_num)!).toBeGreaterThan(before);
    if (cast.changed_num) expect(latest.get(cast.changed_num)).toBe(row.published_at);
    expect(caseLatestByHex("ko").get(cast.primary_num)).toBeUndefined(); // another language's page did not change
    const map = sitemap();
    const guaEntry = map.find((e) => e.url.includes(`/zh/gua/${cast.primary_num}-`))!;
    expect(new Date(guaEntry.lastModified as Date).getTime()).toBe(row.published_at);
    const other = map.find((e) => /\/zh\/gua\/\d+-/.test(e.url) && !e.url.includes(`/zh/gua/${cast.primary_num}-`) && !e.url.includes(`/zh/gua/${cast.changed_num}-`))!;
    expect(new Date(other.lastModified as Date).getTime()).toBeLessThan(row.published_at); // untouched pages keep the content date
    withdrawCase("cs_case_5");
    expect(caseLatestByHex("zh").get(cast.primary_num) ?? 0).toBe(before);
  });
});
