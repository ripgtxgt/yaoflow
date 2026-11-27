import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import { resolveCast } from "@yaoflow/engine";
import { PILES, dailyValues } from "../src/lib/daily";
import { dailyCast, saveDailyCast } from "../src/lib/db";

/**
 * 大众一卦 (09-21, A2): the day's three charts are derived from the date, not
 * stored — so every visitor in every language sees the same three, the page
 * costs nothing to render, and a restart changes nothing.
 */
describe("大众一卦", () => {
  it("derives the same three charts for a day, everywhere, forever", () => {
    const a = PILES.map((p) => dailyValues("2026-09-21", p).join(","));
    const b = PILES.map((p) => dailyValues("2026-09-21", p).join(","));
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3); // three different figures, not one repeated
    expect(a).not.toEqual(PILES.map((p) => dailyValues("2026-09-22", p).join(",")));
  });

  it("only ever yields real line values, and charts the engine accepts", () => {
    for (const day of ["2026-01-01", "2026-06-15", "2026-09-21", "2027-02-04"]) {
      for (const p of PILES) {
        const v = dailyValues(day, p);
        expect(v).toHaveLength(6);
        for (const x of v) expect([6, 7, 8, 9]).toContain(x);
        const cast = resolveCast(v);
        expect(cast.primary.number).toBeGreaterThanOrEqual(1);
        expect(cast.primary.number).toBeLessThanOrEqual(64);
      }
    }
  });

  it("spreads across the whole book rather than favouring a few figures", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 120; i++) {
      const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      for (const p of PILES) seen.add(resolveCast(dailyValues(day, p)).primary.number);
    }
    expect(seen.size).toBeGreaterThan(40); // 360 casts should touch most of the 64
  });

  it("caches the words per day, language and pile — and never overwrites a written one", () => {
    saveDailyCast({ day: "2026-09-21", locale: "zh", pile: 1, values: [7, 8, 9, 8, 7, 8], primaryNum: 41, note: "第一版", watch: "留意甲" });
    saveDailyCast({ day: "2026-09-21", locale: "zh", pile: 1, values: [7, 8, 9, 8, 7, 8], primaryNum: 41, note: "第二版", watch: "留意乙" });
    expect(dailyCast("2026-09-21", "zh", 1)).toEqual({ note: "第一版", watch: "留意甲" });
    expect(dailyCast("2026-09-21", "en", 1)).toBeNull();   // each language written on its own
    expect(dailyCast("2026-09-21", "zh", 2)).toBeNull();   // each pile written on its own
    expect(dailyCast("2026-09-22", "zh", 1)).toBeNull();   // tomorrow is a new page
  });
});

/** 我的卦谱 · 个人应验记录 (09-21, A3): the account's own track record — and the reason answering a revisit is worth something. */
describe("我的应验记录", () => {
  it("counts this customer's answered windows and leaves other people's alone", async () => {
    const { myOutcomes, upsertCustomer, saveCast, saveReading, recordOrder, scheduleRevisit, revisitBySession, setRevisitOutcome } = await import("../src/lib/db");
    const { resolveServerChart } = await import("../src/lib/reading");
    const mine = upsertCustomer("atlas-me@example.org", "zh");
    const theirs = upsertCustomer("atlas-them@example.org", "zh");
    const mk = (sid: string, cid: number, v: [number, number, number, number, number, number]) => {
      const input = { question: "这件事会怎样", values: v as never, castAtMs: Date.UTC(2026, 8, 1), tzOffsetMinutes: 480 };
      const chart = resolveServerChart(input, true) as unknown as Record<string, unknown>;
      const castId = saveCast({ customerId: cid, castAtMs: input.castAtMs, tzOffsetMinutes: 480, locale: "zh", question: input.question, topic: "career", values: v as never, chart });
      saveReading(castId, cid, "deep", "zh", { verdict: { zh: "可成。" }, tendency: { zh: "x" }, timing: { zh: "十月" }, basis: { zh: "b" }, strategy: { zh: "x" }, caution: { zh: "y" }, next_step: { zh: "z" }, closing: { zh: "w" } } as never);
      recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 999, currency: "USD", email: null, status: "paid" });
      scheduleRevisit({ sessionId: sid, castId, customerId: cid, email: "a@example.org", locale: "zh", tier: "deep", castAtMs: input.castAtMs, windowDays: 10, timingQuote: "十月" });
      return revisitBySession(sid)!.id;
    };
    setRevisitOutcome(mk("cs_atlas_1", mine, [7, 8, 9, 8, 7, 8]), "hit");
    setRevisitOutcome(mk("cs_atlas_2", mine, [8, 8, 9, 8, 7, 8]), "miss");
    mk("cs_atlas_3", mine, [7, 7, 9, 8, 7, 8]); // still running
    setRevisitOutcome(mk("cs_atlas_4", theirs, [6, 8, 9, 8, 7, 8]), "hit");
    expect(myOutcomes(mine)).toEqual({ hit: 1, miss: 1, open: 0, waiting: 1 });
    expect(myOutcomes(theirs)).toEqual({ hit: 1, miss: 0, open: 0, waiting: 0 });
  });
});
