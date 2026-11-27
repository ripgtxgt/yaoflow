import { describe, expect, it } from "vitest";
import { db, saveCast, upsertCustomer, usageIn } from "../src/lib/db";
import { resolveServerChart, type ReadingInput } from "../src/lib/reading";
import { fileCast } from "../src/lib/matter-assign";

/** 10-26 (#3112「我的卦找不到了」): a signed-in reader's free cast is kept, and the reading that follows reuses the row */
describe("免费起卦也存进「我的」", () => {
  it("the same figure for the same reader is one row, filed once", () => {
    const cid = upsertCustomer("free-cast1026@example.com", "zh-hant");
    const input = { question: "他會對我回心轉意嗎", values: [7, 8, 9, 6, 7, 8], castAtMs: Date.UTC(2026, 9, 25, 13, 22), tzOffsetMinutes: 480 } as ReadingInput;
    const chart = resolveServerChart(input) as unknown as Record<string, unknown>;
    const base = { customerId: cid, castAtMs: input.castAtMs, tzOffsetMinutes: 480, locale: "zh-hant", question: input.question, values: input.values, chart };
    const a = saveCast(base);
    fileCast(a, null, cid, input.question, "love", "zh-hant");
    const m = (db().prepare("SELECT matter_id FROM casts WHERE id = ?").get(a) as { matter_id: number }).matter_id;
    expect(m).toBeGreaterThan(0);
    const b = saveCast(base); // the paid reading on the same figure
    expect(b).toBe(a);
    fileCast(b, "cs_test_free1026", cid, input.question, "love", "zh-hant");
    expect((db().prepare("SELECT matter_id FROM casts WHERE id = ?").get(a) as { matter_id: number }).matter_id).toBe(m);
    expect((db().prepare("SELECT COUNT(*) n FROM casts WHERE customer_id = ?").get(cid) as { n: number }).n).toBe(1);
    expect(saveCast({ ...base, customerId: null })).not.toBe(a); // nobody's casts are never merged
    expect(usageIn(cid, 0, Date.now() + 1).readings).toBe(0); // a free cast is not a reading in the retention numbers
  });
});
