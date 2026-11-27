import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { proofData, saveCast, scheduleRevisit, setRevisitOutcome, upsertCustomer } from "../src/lib/db";
import { outcomeToken, parseProofRef, proofToken, proofUrl, verifyOutcomeToken, verifyProofToken } from "../src/lib/outcome-token";
import { resolveServerChart } from "../src/lib/reading";

/** 裂变 V1 ④: a proof card exists only for a revisit that came true, under a token that cannot set outcomes. */
describe("proof card", () => {
  const VALUES: LineValue[] = [7, 8, 9, 8, 7, 8];
  function revisitFor(sid: string) {
    process.env.ADMIN_KEY ??= "test-admin-key";
    const cid = upsertCustomer(`${sid}@example.com`, "zh");
    const input = { question: "问一件事", values: VALUES, castAtMs: Date.UTC(2026, 8, 1, 3), tzOffsetMinutes: 480 };
    const chart = resolveServerChart(input, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: cid, castAtMs: input.castAtMs, tzOffsetMinutes: 480, locale: "zh", question: input.question, topic: "career", values: VALUES, chart });
    scheduleRevisit({ sessionId: sid, castId, customerId: cid, email: `${sid}@example.com`, locale: "zh", tier: "deep", castAtMs: input.castAtMs, windowDays: 7, timingQuote: "9月8日前后" });
    return castId;
  }

  it("signs a proof token that is not an outcome token", () => {
    process.env.ADMIN_KEY ??= "test-admin-key";
    expect(verifyProofToken(42, proofToken(42))).toBe(true);
    expect(verifyProofToken(43, proofToken(42))).toBe(false);
    expect(verifyOutcomeToken(42, proofToken(42))).toBe(false); // a shared card can never flip an outcome
    expect(proofToken(42)).not.toBe(outcomeToken(42).slice(0, 20));
    expect(parseProofRef(`42-${proofToken(42)}`)).toEqual({ id: 42, token: proofToken(42) });
    expect(parseProofRef("42-zzz")).toBeNull();
    expect(proofUrl("https://yaoflow.com", 42, "ja")).toBe(`https://yaoflow.com/ja/proof/42-${proofToken(42)}`);
  });

  it("has data only once the revisit is marked hit, and carries no question", () => {
    revisitFor("cs_proof_1");
    // the newest revisit row: the first id (counting down) whose outcome can be set
    let hitId = 0;
    for (let id = 500; id > 0; id--) { if (setRevisitOutcome(id, "open")) { hitId = id; break; } }
    expect(hitId).toBeGreaterThan(0);
    expect(proofData(hitId)).toBeNull(); // "still open" is not a proof
    setRevisitOutcome(hitId, "hit");
    const d = proofData(hitId)!;
    expect(d).not.toBeNull();
    expect(d.values_str).toBe("7,8,9,8,7,8");
    expect(d.outcome_at).toBeGreaterThan(0);
    expect(d.timing_quote).toBe("9月8日前后");
    expect(d.window_days).toBe(7);
    expect(Object.keys(d)).not.toContain("question");
    // marking it miss takes the card away again
    setRevisitOutcome(hitId, "miss");
    expect(proofData(hitId)).toBeNull();
  });
});
