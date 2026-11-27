import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import type { LineValue } from "@yaoflow/engine";
import {
  db, followupBonus, grantByRedeemSession, markRevisitReminded, reaskRevisit, recordOrder, revisitById, revisitRewardForSession,
  revisitsToRemind, saveCast, saveReading, scheduleRevisit, setRevisitOutcome, upsertCustomer,
} from "../src/lib/db";
import { afterContext, mintRevisitReward, redeemRevisitLight } from "../src/lib/grants";
import { resolveServerChart } from "../src/lib/reading";

/**
 * 回访奖励 (09-21, Neil: 只给「应验了」的人轻解读，「没应验」给一次追问):
 * hit → one light reading on what comes next (30 days, the earlier call rides
 * along as a prior marked "came true"); miss → one extra follow-up; open →
 * nothing, re-asked once two weeks later. One reward per reading.
 */
const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 8, 1, 3);

function deep(sid: string, email: string, question: string) {
  const cid = upsertCustomer(email, "zh");
  const input = { question, values: V, castAtMs: AT, tzOffsetMinutes: 480 };
  const chart = resolveServerChart(input, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh", question, topic: "career", values: V, chart });
  saveReading(castId, cid, "deep", "zh", { verdict: { zh: "可接，但要压价。" }, tendency: { zh: "先紧后松。" }, timing: { zh: "九月中旬有动静。" }, basis: { zh: "世爻旺相" }, strategy: { zh: "x" }, caution: { zh: "y" }, next_step: { zh: "z" }, closing: { zh: "w" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 999, currency: "USD", email, status: "paid" });
  scheduleRevisit({ sessionId: sid, castId, customerId: cid, email, locale: "zh", tier: "deep", castAtMs: AT, windowDays: 10, timingQuote: "九月中旬有动静" });
  const { id } = db().prepare("SELECT id FROM revisits WHERE session_id = ?").get(sid) as { id: number };
  return { cid, castId, row: revisitById(id)! };
}

describe("回访奖励", () => {
  it("hit → an aftermath light reading, minted once, redeemable once, carrying the earlier call as a prior that came true", () => {
    const { row } = deep("cs_rr_1", "rr1@example.com", "这个 offer 接不接");
    const r = revisitById(row.id)!;
    setRevisitOutcome(r.id, "hit");
    const g = mintRevisitReward(r, "hit")!;
    expect(g.kind).toBe("revisit_light");
    expect(g.tier).toBe("one");
    expect(g.from_session_id).toBe("cs_rr_1");
    expect(g.expires_at - g.created_at).toBeCloseTo(30 * 86_400_000, -4);
    // a second tap (even "miss") mints nothing new
    expect(mintRevisitReward(r, "miss")!.token).toBe(g.token);
    expect(revisitRewardForSession("cs_rr_1")!.kind).toBe("revisit_light");
    expect(followupBonus("cs_rr_1")).toBe(0);

    const ctx = afterContext(g.token)!;
    expect(ctx).toMatchObject({ question: "这个 offer 接不接", call: "可接，但要压价", state: "open" }); // the banner adds its own 。
    expect(ctx.hex.length).toBeGreaterThan(0);

    const res = redeemRevisitLight(g.token, { question: "谈完价了，接下来会顺吗", values: V, castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh" }, null, null, "zh");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const used = grantByRedeemSession(res.sid)!;
    const input = JSON.parse(used.input_json!) as { prior?: { question: string; call: string; outcome?: string } };
    expect(input.prior).toMatchObject({ question: "这个 offer 接不接", call: "可接，但要压价。", outcome: "hit" });
    expect(used.claimed_email).toBe("rr1@example.com"); // delivered to whoever held the deep reading
    expect(afterContext(g.token)!.state).toBe("used");
    expect(redeemRevisitLight(g.token, {}, null, null, "zh")).toEqual({ ok: false, error: "already_used" });
  });

  it("miss → one extra follow-up on that reading, nothing else", () => {
    const { row } = deep("cs_rr_2", "rr2@example.com", "换工作的事");
    setRevisitOutcome(row.id, "miss");
    const g = mintRevisitReward(row, "miss")!;
    expect(g.kind).toBe("revisit_followup");
    expect(followupBonus("cs_rr_2")).toBe(1);
    expect(afterContext(g.token)).toBeNull();
    // flipping to hit afterwards does not also earn the light reading
    expect(mintRevisitReward(row, "hit")!.kind).toBe("revisit_followup");
    expect(followupBonus("cs_rr_2")).toBe(1);
  });

  it("open → re-asked once, two weeks later; a reminder goes once, five days after an unanswered mail", () => {
    const { row } = deep("cs_rr_3", "rr3@example.com", "搬家的事");
    const before = revisitById(row.id)!;
    expect(reaskRevisit(row.id)).toBe(true);
    const after = revisitById(row.id)!;
    expect(after.status).toBe("pending");
    expect(after.due_at - Date.now()).toBeGreaterThan(13 * 86_400_000);
    expect(after.due_at).toBeGreaterThan(before.due_at);
    expect(reaskRevisit(row.id)).toBe(false); // only once

    // reminder: a mail sent 6 days ago with no answer
    const { row: r4 } = deep("cs_rr_4", "rr4@example.com", "考试的事");
    db().prepare("UPDATE revisits SET status = 'sent', sent_at = ? WHERE id = ?").run(Date.now() - 6 * 86_400_000, r4.id);
    expect(revisitsToRemind(5).map((r) => r.id)).toContain(r4.id);
    markRevisitReminded(r4.id);
    expect(revisitsToRemind(5).map((r) => r.id)).not.toContain(r4.id);
    // answered ones are never reminded
    db().prepare("UPDATE revisits SET status = 'sent', sent_at = ?, outcome = 'hit' WHERE id = ?").run(Date.now() - 6 * 86_400_000, row.id);
    expect(revisitsToRemind(5).map((r) => r.id)).not.toContain(row.id);
  });
});
