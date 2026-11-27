import { describe, expect, it } from "vitest";
import { orphanSubUses, recordOrder, setSubUseVoid, subUseByToken, subUsesLedger, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { entitlementFor, redeemSubscription, DEEP_PER_MONTH } from "../src/lib/subscription";

const V = [7, 8, 9, 7, 8, 8] as (6 | 7 | 8 | 9)[];

describe("会员额度对账 (09-29)", () => {
  it("a unit that produced nothing can be returned, and counts again if it is opened later", async () => {
    const cid = upsertCustomer("ledger@example.com", "zh-hant");
    const now = Date.now();
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_led", stripeSubscriptionId: "sub_led", status: "active", plan: "month", periodStart: now - 86_400_000, periodEnd: now + 29 * 86_400_000, cancelAtPeriodEnd: false });
    const input = { question: "三個月後我們會怎麼相處", values: V, castAtMs: now - 60_000, tzOffsetMinutes: -480, locale: "zh-hant" as const };
    const r = await redeemSubscription(cid, "deep", input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const u = subUseByToken(r.sid.slice(4))!;
    expect((await entitlementFor(cid)).deepLeft).toBe(DEEP_PER_MONTH - 1);

    // fresh units are never swept
    expect(orphanSubUses().some((o) => o.id === u.id)).toBe(false);
    expect(orphanSubUses(-1).some((o) => o.id === u.id)).toBe(true);

    expect(setSubUseVoid(u.id, "没有生成解读")).toBe(true);
    expect((await entitlementFor(cid)).deepLeft).toBe(DEEP_PER_MONTH);
    const row = subUsesLedger(cid).find((x) => x.id === u.id)!;
    expect(row.voided_at).toBeTruthy();
    expect(row.question).toBe("三個月後我們會怎麼相處");
    expect(orphanSubUses(-1).some((o) => o.id === u.id)).toBe(false);

    // the page is opened after all: the reading exists, so the unit is spent again
    recordOrder({ sessionId: r.sid, customerId: cid, castId: null, tier: "deep", amountCents: 0, currency: null, email: "ledger@example.com", status: "subscription" });
    expect((await entitlementFor(cid)).deepLeft).toBe(DEEP_PER_MONTH - 1);

    expect(setSubUseVoid(u.id, null)).toBe(true);
    expect(subUsesLedger(cid).find((x) => x.id === u.id)!.voided_at).toBeNull();
  });
});
