import { describe, expect, it } from "vitest";
import { buildRows, checkoutBoard, classify, tierOf } from "../src/lib/checkout-audit";
import type { ChargeLite, IntentLite, ListedSession } from "../src/lib/stripe";

/** 10-14 进度表 49 结账失败原因看板 */
const NOW = Date.UTC(2026, 9, 14, 8);
const T = (h: number) => Math.floor((NOW - h * 3_600_000) / 1000);
const sess = (id: string, h: number, status: ListedSession["status"], o: Partial<ListedSession> = {}): ListedSession =>
  ({ id, created: T(h), status, url: null, mode: "payment", payment_status: status === "complete" ? "paid" : "unpaid", metadata: { tier: "deep", currency: "twd" }, currency: "twd", amount_total: 7500, ...o }) as ListedSession;
const charge = (pi: string, h: number, status: string, o: Partial<ChargeLite> = {}): ChargeLite =>
  ({ id: `ch_${pi}_${h}`, created: T(h), status, payment_intent: pi, failure_code: null, payment_method_details: { type: "card" }, ...o });

describe("结账分类", () => {
  it("A declined, B 3DS unfinished, C no attempt, D alipay hand-off, open while young", () => {
    expect(classify({ paid: false, stillOpen: false, attempts: [{ failed: true, code: "card_declined", decline: "insufficient_funds", type: "card", threeDs: null }] })).toMatchObject({ cls: "A", code: "insufficient_funds" });
    expect(classify({ paid: false, stillOpen: false, attempts: [], intent: { status: "requires_action", errCode: null, errDecline: null, action: true } }).cls).toBe("B");
    expect(classify({ paid: false, stillOpen: false, attempts: [{ failed: true, code: "card_declined", decline: "generic_decline", type: "card", threeDs: "failed" }] }).cls).toBe("B");
    expect(classify({ paid: false, stillOpen: false, attempts: [] }).cls).toBe("C");
    expect(classify({ paid: false, stillOpen: true, attempts: [] }).cls).toBe("open");
    expect(classify({ paid: false, stillOpen: false, attempts: [{ failed: true, code: "payment_intent_payment_attempt_failed", decline: "generic_decline", type: "alipay", threeDs: null }] }).cls).toBe("D");
    expect(classify({ paid: true, stillOpen: false, attempts: [] }).cls).toBe("ok");
  });

  it("builds rows from Stripe's lists; a page paid for within a day after is E; methods and tiers read right", () => {
    const sessions = [
      sess("cs_live_a1", 30, "expired", { payment_intent: "pi_a", metadata: { tier: "deep", bs: "tab001x", c: "threads", country: "TW", dv: "ios:threads" } }),
      sess("cs_live_c1", 20, "expired", { metadata: { tier: "one", bs: "tab002x" } }),
      sess("cs_live_ok", 19, "complete", { payment_intent: "pi_ok", metadata: { tier: "deep", bs: "tab002x" } }),
      sess("cs_live_sub", 10, "expired", { mode: "subscription", metadata: { plan: "month" } }),
    ];
    const charges = [charge("pi_a", 29.9, "failed", { failure_code: "card_declined", outcome: { reason: "do_not_honor" } }), charge("pi_ok", 18.9, "succeeded", { payment_method_details: { type: "card", card: { wallet: { type: "apple_pay" } } } })];
    const intents: IntentLite[] = [{ id: "pi_w", created: T(5), status: "requires_payment_method", currency: "twd", amount: 7500, metadata: { kind: "wallet", tier: "deep" }, last_payment_error: { code: "card_declined", decline_code: "transaction_not_allowed" } }];
    const rows = buildRows(sessions, charges, intents, NOW);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.cs_live_a1).toMatchObject({ cls: "A", code: "do_not_honor", device: "ios", app: "threads", channel: "threads", country: "TW", currency: "TWD", tier: "deep" });
    expect(by.cs_live_c1).toMatchObject({ cls: "E", recovered_by: "C", tier: "light" });
    expect(by.cs_live_ok).toMatchObject({ cls: "ok", method: "apple_pay", paid: 1 });
    expect(by.cs_live_sub).toMatchObject({ cls: "C", sub_blind: 1, tier: "sub" });
    expect(by.pi_w).toMatchObject({ source: "wallet", cls: "A", code: "transaction_not_allowed" });
    expect(tierOf({ kind: "pass" }, "payment")).toBe("pass");
    // 10-22 进度表 94: a 通卡 keeps its length
    expect(tierOf({ kind: "pass", days: "7" }, "payment")).toBe("pass_7d");
    expect(tierOf({ kind: "pass", days: "1" }, "payment")).toBe("pass_1d");
    expect(tierOf({ kind: "pass", days: "9" }, "payment")).toBe("pass");
    expect(tierOf({ units: "15", size: "m" }, "payment")).toBe("pack");
    expect(tierOf({ kind: "qian" }, "payment")).toBe("qian");
  });

  it("the board reads an empty table without failing", () => {
    expect(checkoutBoard(7).total.opened).toBeGreaterThanOrEqual(0);
  });
});

describe("结账分类：确认过但没扣款", () => {
  it("a session with a PaymentIntent and no charge is B (bank check or redirect never finished)", () => {
    const rows = buildRows([sess("cs_live_b1", 30, "expired", { payment_intent: "pi_b" })], [], [{ id: "pi_b", created: T(30), status: "canceled", currency: "twd", amount: 7500, metadata: {} }], NOW);
    expect(rows[0]).toMatchObject({ cls: "B", attempted: 1 });
  });
});
