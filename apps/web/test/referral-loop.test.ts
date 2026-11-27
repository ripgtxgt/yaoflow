import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { bringNewStats, casesToPost, db, emailAlreadySent, markCasePosted, recordOrder, saveCast, saveReading, upsertCustomer } from "../src/lib/db";
import { publishCase } from "../src/lib/cases";
import { threadsDraft, THREADS_MAX } from "../src/lib/threads-draft";
import { bringNew } from "../src/lib/bring-new";
import { mintGiftCast, redeemGiftCast } from "../src/lib/grants";
import { notifyGiftUsed } from "../src/lib/referral";
import { resolveServerChart } from "../src/lib/reading";
import type { TrackedEvent } from "../src/lib/analytics-server";

const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 8, 20, 3);

function paidDeep(sid: string, email: string, cid: number, question = "这份合约能签下来吗") {
  const chart = resolveServerChart({ question, values: V, castAtMs: AT, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh", question, topic: "career", values: V, chart });
  saveReading(castId, cid, "deep", "zh", { verdict: { zh: "能签，但要让一步。" }, tendency: { zh: "先紧后松。" }, timing: { zh: "10月4日到8日之间。" }, basis: { zh: "x" }, strategy: { zh: "x" }, caution: { zh: "x" }, next_step: { zh: "x" }, closing: { zh: "x" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 999, currency: "USD", email, status: "paid" });
}

describe("裂变闭环（09-26）", () => {
  it("a case becomes a Threads draft with no private question, and leaves the list once posted", () => {
    const cid = upsertCustomer("rl-case@example.com", "zh");
    paidDeep("cs_rl_case_1", "rl-case@example.com", cid, "我老板的秘密问题");
    expect(publishCase("cs_rl_case_1", null, cid).ok).toBe(true);
    const c = casesToPost(50).find((x) => x.session_id === "cs_rl_case_1")!;
    const draft = threadsDraft(c, "https://yaoflow.com");
    expect(draft).toContain("能签，但要让一步。");
    expect(draft).toContain("?c=threads");
    expect(draft).not.toContain("秘密");
    expect(draft.length).toBeLessThanOrEqual(THREADS_MAX);
    markCasePosted(c.public_id);
    expect(casesToPost(50).some((x) => x.session_id === "cs_rl_case_1")).toBe(false);
  });

  it("the giver hears once that the gift was used; the chain counts the friend", async () => {
    const giver = upsertCustomer("rl-giver@example.com", "zh");
    paidDeep("cs_rl_giver_1", "rl-giver@example.com", giver);
    const token = mintGiftCast("cs_rl_giver_1", "zh", giver, null).token;
    const r = redeemGiftCast(token, JSON.stringify({ question: "q", values: V }), "rl-friend@example.com", null, "zh");
    expect(r.ok).toBe(true);
    const sid = (r as { sid: string }).sid;
    await notifyGiftUsed(sid);
    const rows = db().prepare("SELECT status FROM emails WHERE session_id = ? AND kind = 'gift_used'").all(sid) as { status: string }[];
    expect(rows.length).toBe(1);
    // no mail key in tests: recorded as failed, so a later page load may try again — never a second row
    await notifyGiftUsed(sid);
    expect((db().prepare("SELECT COUNT(*) AS v FROM emails WHERE session_id = ? AND kind = 'gift_used'").get(sid) as { v: number }).v).toBe(1);
    expect(emailAlreadySent(sid, "gift_used")).toBe(rows[0]!.status === "sent");
    const chain = bringNewStats(0).find((x) => x.key === "gift_paid")!;
    expect(chain.used).toBeGreaterThanOrEqual(1);
  });

  it("sessions are counted under the first shared thing they opened", () => {
    const ev = (s: string, t: number, e: TrackedEvent["e"], path?: string): TrackedEvent => ({ s, t, e, ...(path ? { path } : {}) });
    const rows = bringNew([
      ev("a", 1, "page_view", "/zh/cases/0123456789"), ev("a", 2, "page_view", "/zh/share/123"), ev("a", 3, "cast_start"),
      ev("b", 1, "gift_open"), ev("b", 2, "cast_start"), ev("b", 3, "checkout_start"),
      ev("c", 1, "page_view", "/zh/cast"),
    ], new Set(["b"]));
    expect(rows.find((r) => r.source === "case")).toEqual({ source: "case", visits: 1, casts: 1, checkout: 0, paid: 0 });
    expect(rows.find((r) => r.source === "gift")).toEqual({ source: "gift", visits: 1, casts: 1, checkout: 1, paid: 1 });
    expect(rows.some((r) => r.source === "share")).toBe(false);
  });
});

import { plainCheckoutRegion } from "../src/lib/geo";
describe("台湾、香港走自己的付款页（09-26）", () => {
  it("routes by edge country or by the device clock", () => {
    expect(plainCheckoutRegion("TW", null, ["TW", "HK"])).toBe("TW");
    expect(plainCheckoutRegion("JP", "Asia/Taipei", ["TW", "HK"])).toBe("TW"); // a proxy does not move the clock
    expect(plainCheckoutRegion(null, "Asia/Hong_Kong", ["TW", "HK"])).toBe("HK");
    expect(plainCheckoutRegion("US", "America/New_York", ["TW", "HK"])).toBeNull();
    expect(plainCheckoutRegion("TW", "Asia/Taipei", [])).toBeNull();
  });
});
