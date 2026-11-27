import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LineValue } from "@yaoflow/engine";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import { createMatter, listCases, caseView, recordOrder, saveCast, saveReading, setCastMatter, upsertCustomer } from "../src/lib/db";
import { publishCase } from "../src/lib/cases";
import { resolveServerChart } from "../src/lib/reading";

/** 11-01 T-014: the public cases say which are a reader's follow-ups; a numbers-only file a day for the promotion runs. */
const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 9, 30, 3);

function paidCast(sid: string, cid: number, at: number, matter: number | null) {
  const input = { question: "他會回來嗎", values: V, castAtMs: at, tzOffsetMinutes: 480 };
  const chart = resolveServerChart(input, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: at, tzOffsetMinutes: 480, locale: "zh-hant", question: input.question, topic: "relationship", values: V, chart });
  if (matter) setCastMatter(castId, matter, "rule");
  saveReading(castId, cid, "deep", "zh-hant", { verdict: { "zh-hant": "會有消息。" }, tendency: { "zh-hant": "先慢後快。" }, timing: { "zh-hant": "十一月中旬。" }, basis: { "zh-hant": "x" }, strategy: { "zh-hant": "x" }, caution: { "zh-hant": "y" }, next_step: { "zh-hant": "z" }, closing: { "zh-hant": "w" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 999, currency: "USD", email: "t014@example.org", status: "paid" });
  const r = publishCase(sid, null, cid);
  if (!r.ok) throw new Error("publish");
  return r.row.public_id;
}

describe("T-014", () => {
  it("a follow-up on the same matter is series 2; a lone cast is 1", () => {
    const cid = upsertCustomer("t014@example.org", "zh-hant");
    const m = createMatter(cid, "他會不會回來", "rule", "relationship", AT);
    const a = paidCast("cs_t014_a", cid, AT, m);
    const b = paidCast("cs_t014_b", cid, AT + 3_600_000, m);
    const other = upsertCustomer("t014-b@example.org", "zh-hant");
    const c = paidCast("cs_t014_c", other, AT + 7_200_000, null);
    const rows = new Map(listCases("zh-hant", 50).map((x) => [x.public_id, x.series]));
    expect(rows.get(a)).toBe(1);
    expect(rows.get(b)).toBe(2);
    expect(rows.get(c)).toBe(1);
    expect(caseView(b)!.series).toBe(2);
  });

  it("writes yesterday's numbers, and on Monday the week's — counts only", async () => {
    const { writePromoStats } = await import("../src/lib/promo-stats");
    const dir = mkdtempSync(join(tmpdir(), "yf-promo-"));
    // 2026-11-02 is a Monday; 00:10 台北
    const files = writePromoStats(Date.UTC(2026, 10, 1, 16, 10), dir);
    expect(files.map((f) => f.split(/[\\/]/).pop())).toEqual(["2026-11-01.json", "week-2026-11-02.json"]);
    const day = JSON.parse(readFileSync(files[0]!, "utf8"));
    expect(Object.keys(day)).toEqual(expect.arrayContaining(["day", "funnel", "byLocale", "byCampaign", "sharing", "groups", "dailyPick", "genFail"]));
    const week = JSON.parse(readFileSync(files[1]!, "utf8"));
    expect(week.lastMonth.month).toBe("2026-10");
    const text = readFileSync(files[0]!, "utf8") + readFileSync(files[1]!, "utf8");
    expect(text).not.toMatch(/@|他會回來/);
  });
});
