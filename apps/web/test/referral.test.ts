import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)

import { fullChart, type LineValue } from "@yaoflow/engine";
import {
  addOrderToCustomer, customerDetail, redeemReferral, referralByRedeemSession, referralByToken,
  referralStats, referrerForVia, saveCast, upsertCustomer,
} from "../src/lib/db";
import { maybeGrantReferral } from "../src/lib/referral";
import { verifyPaidSession } from "../src/lib/paid-store";

const VALUES: LineValue[] = [7, 8, 8, 9, 8, 9]; // share code 788989
const AT = Date.UTC(2026, 8, 1, 6);
const chartOf = (v: LineValue[]) => fullChart({ values: v, utcMs: AT, tzOffsetMinutes: 480 }) as unknown as Record<string, unknown>;

describe("推荐奖励 — a friend's first paid reading earns the sharer a free 深断", () => {
  it("finds the sharer behind a share code, never the buyer themself", () => {
    const sharer = upsertCustomer("sharer@example.com", "zh");
    saveCast({ customerId: sharer, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh", question: "分享的卦", topic: "other", values: VALUES, chart: chartOf(VALUES) });
    expect(referrerForVia("788989", "buyer@example.com")?.customerId).toBe(sharer);
    expect(referrerForVia("788989", "sharer@example.com")).toBeNull();
    expect(referrerForVia("777777", "buyer@example.com")).toBeNull();
    expect(referrerForVia("abc", "buyer@example.com")).toBeNull();
  });

  it("grants once, on the first purchase only, then the token redeems exactly once as a paid deep session", async () => {
    const sharer = upsertCustomer("sharer@example.com", "zh");
    const buyer = upsertCustomer("buyer@example.com", "zh");
    addOrderToCustomer(buyer, 299); // first purchase just landed

    // 09-24: the share card no longer earns the reward (the gift does, see perks.test.ts) — off by default
    delete process.env.SHARE_CARD_REWARD;
    expect(await maybeGrantReferral({ via: "788989", referredCustomerId: buyer, referredEmail: "buyer@example.com", referredSessionId: "cs_first" })).toBe("skipped");
    // switched back on, the old thread still works exactly as before
    process.env.SHARE_CARD_REWARD = "1";

    expect(await maybeGrantReferral({ via: "788989", referredCustomerId: buyer, referredEmail: "buyer@example.com", referredSessionId: "cs_first" })).toBe("granted");
    expect(await maybeGrantReferral({ via: "788989", referredCustomerId: buyer, referredEmail: "buyer@example.com", referredSessionId: "cs_first" })).toBe("skipped"); // already credited
    expect(referralStats().granted).toBe(1);

    const later = upsertCustomer("later@example.com", "zh");
    addOrderToCustomer(later, 299); addOrderToCustomer(later, 999); // second purchase — no reward
    expect(await maybeGrantReferral({ via: "788989", referredCustomerId: later, referredEmail: "later@example.com", referredSessionId: "cs_second" })).toBe("skipped");
    expect(await maybeGrantReferral({ via: null, referredCustomerId: buyer, referredEmail: "buyer@example.com", referredSessionId: "cs_x" })).toBe("skipped");

    // the sharer's reward
    const d = customerDetail(sharer);
    expect(d.customer).toBeTruthy();
    const token = (await import("../src/lib/db")).db().prepare("SELECT token FROM referrals WHERE referrer_customer_id = ?").get(sharer) as { token: string };
    expect(token.token).toMatch(/^[0-9a-f]{36}$/);
    const ref = referralByToken(token.token)!;
    expect(ref.used_at).toBeNull();
    expect(ref.expires_at - ref.created_at).toBeCloseTo(30 * 86_400_000, -3);

    const input = { question: "用奖励问的事", values: [9, 7, 8, 8, 7, 7], castAtMs: AT, tzOffsetMinutes: 480, locale: "zh" };
    expect(redeemReferral(token.token, `rw_${token.token}`, JSON.stringify(input))).toBe(true);
    expect(redeemReferral(token.token, `rw_${token.token}`, JSON.stringify(input))).toBe(false); // burned
    expect(referralByRedeemSession(`rw_${token.token}`)?.id).toBe(ref.id);
    expect(referralStats().redeemed).toBe(1);

    const rec = await verifyPaidSession(`rw_${token.token}`);
    expect(rec?.tier).toBe("deep");
    expect(rec?.reward).toBe(true);
    expect(rec?.email).toBe("sharer@example.com");
    expect(rec?.input.question).toBe("用奖励问的事");
    expect(await verifyPaidSession("rw_000000000000000000000000000000000000")).toBeNull();
    delete process.env.SHARE_CARD_REWARD;
  });
});
