import { describe, expect, it } from "vitest";
import { EMAIL_GATE_AT, inRepeatArm, LOCK_AT, LOCK_WINDOW_MS, lockLiftsAt, repeatState } from "../src/lib/repeat-test";
import { db } from "../src/lib/db";

/** 10-13 同一件事反复问: half the browsers, the same half every time; lock from the 6th cast in 3 days; address from the 3rd. */
describe("同一件事反复问 · 对照", () => {
  const bids = Array.from({ length: 2000 }, (_, i) => `b${i.toString(16).padStart(15, "0")}`);
  const armBid = bids.find((b) => inRepeatArm(b))!;
  const ctlBid = bids.find((b) => !inRepeatArm(b))!;

  it("splits browsers about half and half, stably", () => {
    const n = bids.filter((b) => inRepeatArm(b)).length;
    expect(n).toBeGreaterThan(900);
    expect(n).toBeLessThan(1100);
    expect(inRepeatArm(armBid)).toBe(true);
    expect(inRepeatArm(null)).toBe(false);
  });

  it("asks an unknown reader for an address from the 3rd cast — only in the test half, never a member", () => {
    const at = (n: number) => ({ n, threadId: -1 });
    expect(repeatState(at(EMAIL_GATE_AT - 1), armBid, { member: false, known: false }).emailGate).toBe(false);
    expect(repeatState(at(EMAIL_GATE_AT), armBid, { member: false, known: false }).emailGate).toBe(true);
    expect(repeatState(at(EMAIL_GATE_AT), armBid, { member: false, known: true }).emailGate).toBe(false);
    expect(repeatState(at(EMAIL_GATE_AT), armBid, { member: true, known: false }).emailGate).toBe(false);
    expect(repeatState(at(EMAIL_GATE_AT), ctlBid, { member: false, known: false }).emailGate).toBe(false);
  });

  it("locks only when the matter really has that many casts in the window", () => {
    // threadId -1 has no rows: the place on the matter alone is not enough
    expect(repeatState({ n: LOCK_AT + 3, threadId: -1 }, armBid, { member: false, known: true }).lock).toBeNull();
  });

  it("10-14: the lock says when it lifts — three days after the oldest cast in the window", () => {
    const now = Date.UTC(2026, 9, 14, 4);
    const ins = db().prepare("INSERT INTO cast_log (bid, s, at, tz, locale, question, values_str, primary_num, capped, thread_id, thread_n, created_at, updated_at) VALUES (?, NULL, ?, 480, 'zh-hant', 'q', '777777', 1, 0, ?, ?, ?, ?)");
    for (let k = 0; k < LOCK_AT; k++) ins.run("rest-test-bid", now - (LOCK_AT - k) * 3_600_000, 9901, k + 1, now - (LOCK_AT - k) * 3_600_000, now);
    expect(lockLiftsAt(9901, now)).toBe(now - LOCK_AT * 3_600_000 + LOCK_WINDOW_MS);
    const st = repeatState({ n: LOCK_AT, threadId: 9901 }, armBid, { member: false, known: true }, now);
    expect(st.lock?.until).toBe(now - LOCK_AT * 3_600_000 + LOCK_WINDOW_MS);
  });
});
