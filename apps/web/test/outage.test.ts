import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import type { LineValue } from "@yaoflow/engine";
import { createGift, opsSummary, recordOps, recordOrder, saveCast, saveReading, unfulfilledGifts, upsertCustomer } from "../src/lib/db";
import { resolveServerChart } from "../src/lib/reading";

/**
 * 09-15: a night-time DeepSeek outage cost a reader ten deep readings in a row
 * and kept /api/health at 503 for a day after generation had recovered.
 */
const V: LineValue[] = [8, 7, 8, 6, 6, 8];
const AT = Date.UTC(2026, 8, 14, 17, 26);

describe("generation health", () => {
  it("is 'down' after three recent failures with nothing delivered since, and recovers on the next reading", () => {
    expect(opsSummary().genDown).toBe(false);
    recordOps("gen_fail", "deep zh-hant The operation was aborted due to timeout");
    recordOps("gen_fail", "deep zh-hant The operation was aborted due to timeout");
    expect(opsSummary().genDown).toBe(false); // two is noise
    recordOps("gen_fail", "one zh-hant llm http 503");
    const down = opsSummary();
    expect(down.genFail3h).toBe(3);
    expect(down.genDown).toBe(true);

    // a reading delivered after the last failure = the model answers again
    const cid = upsertCustomer("back@example.com", "zh-hant");
    const chart = resolveServerChart({ question: "9月該不該主動找前任", values: V, castAtMs: AT, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh-hant", question: "9月該不該主動找前任", topic: "relationship", values: V, chart });
    saveReading(castId, cid, "deep", "zh-hant", { verdict: { "zh-hant": "x" } } as never);
    const up = opsSummary();
    expect(up.genFail24h).toBe(3);
    expect(up.lastGenOk).not.toBeNull();
    expect(up.genDown).toBe(false);
  });
});

describe("painted-door claims the page never fulfilled", () => {
  it("lists claims with no cast on record, old enough, and drops them once fulfilled", () => {
    const input = JSON.stringify({ question: "前任9月是否會聯繫我", values: V, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh-hant" });
    createGift({ token: "b".repeat(36), tier: "deep", locale: "zh-hant", currency: "TWD", amountShown: 38000, firstDeep: true, email: null, customerId: null, via: null, inputJson: input });
    createGift({ token: "c".repeat(36), tier: "one", locale: "zh-hant", currency: "TWD", amountShown: 9900, firstDeep: false, email: "left@example.com", customerId: null, via: null, inputJson: input });

    expect(unfulfilledGifts(0, 48 * 3_600_000)).toEqual(["b".repeat(36), "c".repeat(36)]);
    expect(unfulfilledGifts(10 * 60_000, 48 * 3_600_000)).toEqual([]); // just claimed: the page is still trying
    expect(unfulfilledGifts(0, 48 * 3_600_000, 1)).toEqual(["b".repeat(36)]);

    // fulfilled by the sweep → gone from the list; an order without a cast still counts as unfulfilled
    const chart = resolveServerChart({ question: "前任9月是否會聯繫我", values: V, castAtMs: AT, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: null, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh-hant", question: "前任9月是否會聯繫我", topic: "relationship", values: V, chart });
    recordOrder({ sessionId: `gf_${"b".repeat(36)}`, customerId: null, castId, tier: "deep", amountCents: 0, currency: "TWD", email: null, status: "gift" });
    recordOrder({ sessionId: `gf_${"c".repeat(36)}`, customerId: null, castId: null, tier: "one", amountCents: 0, currency: "TWD", email: "left@example.com", status: "gift" });
    expect(unfulfilledGifts(0, 48 * 3_600_000)).toEqual(["c".repeat(36)]);
  });
});
