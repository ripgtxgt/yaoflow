import { describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";

/** 10-14 进度表 46 「怎樣算有結果？」: kept privately with the cast; the check-in letters ask with the reader's own words. */
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  return { ...real, chatJson: vi.fn(async () => { throw new Error("no model in tests"); }), chatText: vi.fn(async () => { throw new Error("no model in tests"); }) };
});
const cl = await import("../src/lib/cast-log");
const { db, saveCast, scheduleRevisit, upsertCustomer, outcomeHintFor } = await import("../src/lib/db");
const { resolveServerChart } = await import("../src/lib/reading");
const { buildRevisitEmail, buildCheckpointEmail, buildDayOfEmail } = await import("../src/lib/email");

const V: LineValue[] = [7, 8, 9, 8, 7, 7];
const AT = Date.now() - 3_600_000;

describe("怎樣算有結果", () => {
  it("cleans the line: short, one line, nothing for a crisis line", () => {
    expect(cl.cleanOutcomeHint("  對方主動\n傳訊息給我  ")).toBe("對方主動 傳訊息給我");
    expect(cl.cleanOutcomeHint("x")).toBeNull();
    expect(cl.cleanOutcomeHint(42)).toBeNull();
    expect(cl.cleanOutcomeHint("a".repeat(200))!.length).toBe(60);
  });
  it("is kept with the cast, found again from the paid cast, and makes the check-in ask about an event", async () => {
    const bid = "b0utc0mehint0001";
    await cl.logCast({ bid, input: { question: "他心裡還有我嗎", values: V, castAtMs: AT, tzOffsetMinutes: 480 }, locale: "zh-hant", outcomeHint: "對方主動傳訊息給我" });
    const cid = upsertCustomer("hint@example.com", "zh-hant");
    const chart = resolveServerChart({ question: "他心裡還有我嗎", values: V, castAtMs: AT, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh-hant", question: "他心裡還有我嗎", topic: "relationship", values: V, chart });
    expect(outcomeHintFor(castId)).toBe("對方主動傳訊息給我");
    scheduleRevisit({ sessionId: "cs_hint_1", castId, customerId: cid, email: "hint@example.com", locale: "zh-hant", tier: "deep", castAtMs: AT, windowDays: 10, timingQuote: null, question: "他心裡還有我嗎" });
    // a feeling question would be asked about signals — with the reader's own observable line it is an event
    expect((db().prepare("SELECT ask FROM revisits WHERE session_id = 'cs_hint_1'").get() as { ask: string | null }).ask).toBeNull();
  });
  it("the three letters ask with their words", () => {
    const r = buildRevisitEmail({ locale: "zh-hant", question: "q", values: V, hexName: "乾", changedName: null, timingQuote: null, windowDays: 10, readingUrl: "u", castUrl: "c", outcomeUrls: { hit: "h", partial: "p", miss: "m", open: "o" }, ask: "event", hint: "對方主動傳訊息給我" });
    expect(r.text).toContain("你寫的「對方主動傳訊息給我」，發生了嗎？");
    expect(r.html).toContain("發生了嗎");
    const k = buildCheckpointEmail({ locale: "zh-hant", question: "q", hexName: "乾", timingQuote: null, range: "10/15–10/19", next: "10/25", urls: { seen: "s", none: "n", unsure: "u" }, readingUrl: "r", noteUrl: "n", hint: "收到錄取通知" });
    expect(k.html).toContain("收到錄取通知");
    const d = buildDayOfEmail({ locale: "zh-hant", item: { question: "q", hexName: "乾", timing: "t", signals: null, readingUrl: "r", noteUrl: "n", hint: "合約簽下來" }, stopUrl: "s" });
    expect(d.text).toContain("合約簽下來");
    // without one, nothing changes
    const plain = buildRevisitEmail({ locale: "zh-hant", question: "q", values: V, hexName: "乾", changedName: null, timingQuote: null, windowDays: 10, readingUrl: "u", castUrl: "c", ask: "event" });
    expect(plain.text).not.toContain("你寫的");
  });
});
