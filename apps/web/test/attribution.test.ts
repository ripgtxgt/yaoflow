import { describe, expect, it } from "vitest";
import { fullChart, type LineValue } from "@yaoflow/engine";
import { db, ordersByPaymentIntent, recordOrder, saveCast, saveFollowup, upsertCustomer, usageIn } from "../src/lib/db";

/**
 * 09-23. Two leaks in the numbers:
 *  - every paid order sat under 「—」 in the channel table: events are keyed by
 *    the browser's session, orders by Stripe's, and the join compared the two.
 *    The order now carries its own ?c= tag and browser session.
 *  - followups.customer_id was never written (the only caller passed null).
 */
describe("付费归因", () => {
  it("订单记下 ?c= 和浏览器会话，重复写不覆盖第一次", () => {
    recordOrder({
      sessionId: "cs_live_attr1", customerId: null, castId: null, tier: "deep", amountCents: 26900, currency: "twd",
      email: "a@example.com", status: "paid", paymentIntent: "pi_attr1", campaign: "threads", browserSid: "abc123xyz",
    });
    // the reading page and the fulfil cron both write the same order
    recordOrder({
      sessionId: "cs_live_attr1", customerId: null, castId: null, tier: "deep", amountCents: 26900, currency: "twd",
      email: "a@example.com", status: "paid", paymentIntent: "pi_attr1",
    });
    const o = ordersByPaymentIntent().get("pi_attr1")!;
    expect(o.campaign).toBe("threads");
    expect(o.browser_sid).toBe("abc123xyz");
  });
});

describe("追问归属", () => {
  it("没给客户时取卦的主人", () => {
    const values: LineValue[] = [7, 8, 7, 8, 7, 8];
    const cid = upsertCustomer("followup-owner@example.com", "zh-hant");
    const castId = saveCast({
      customerId: cid, castAtMs: Date.UTC(2026, 8, 23, 6), tzOffsetMinutes: 480, locale: "zh-hant", question: "這份工作要不要接？",
      topic: "career", values, chart: fullChart({ values, utcMs: Date.UTC(2026, 8, 23, 6), tzOffsetMinutes: 480 }) as unknown as Record<string, unknown>,
    });
    saveFollowup(castId, null, "user", "那薪水呢？");
    const row = db().prepare("SELECT customer_id FROM followups WHERE cast_id = ?").get(castId) as { customer_id: number };
    expect(row.customer_id).toBe(cid);
    expect(usageIn(cid, 0, Date.now() + 1).followups).toBe(1);
  });
});
