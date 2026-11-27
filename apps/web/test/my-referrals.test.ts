import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import { fullChart, type LineValue } from "@yaoflow/engine";
import { createReferral, recordOrder, redeemReferral, saveCast, saveReading, upsertCustomer } from "../src/lib/db";
import { grantInviteLight, mintGiftCast, redeemGiftCast } from "../src/lib/grants";
import { record } from "../src/lib/analytics-server";
import { castsBroughtBy, myReferrals } from "../src/lib/my-referrals";

/** §14 ⑩ 我的推荐: the account page's view of one person's sharing. */
const VALUES: LineValue[] = [9, 8, 8, 7, 8, 8]; // share code 988788
const AT = Date.UTC(2026, 8, 9, 6);
const chartOf = (v: LineValue[]) => fullChart({ values: v, utcMs: AT, tzOffsetMinutes: 480 }) as unknown as Record<string, unknown>;
const INPUT = JSON.stringify({ question: "朋友的事", values: VALUES, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh" });

function deepReading(customerId: number, sid: string, status = "paid") {
  const castId = saveCast({ customerId, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh", question: "这份工作要不要接", topic: "career", values: VALUES, chart: chartOf(VALUES) });
  saveReading(castId, customerId, "deep", "zh", { verdict: { zh: "可接" } } as never);
  recordOrder({ sessionId: sid, customerId, castId, tier: "deep", amountCents: status === "paid" ? 999 : 0, currency: "USD", email: "me@example.com", status });
}

describe("我的推荐", () => {
  it("counts the casts that came through this account's share codes, first touch only, last 90 days", () => {
    const now = Date.now();
    record({ t: now - 1000, e: "page_view", s: "s-a", via: "988788", path: "/zh" });
    record({ t: now - 900, e: "cast_complete", s: "s-a", path: "/zh/cast" });
    record({ t: now - 800, e: "page_view", s: "s-b", via: "988788", path: "/zh" }); // came in, never cast
    record({ t: now - 700, e: "page_view", s: "s-c", via: "777777", path: "/zh" });
    record({ t: now - 600, e: "cast_complete", s: "s-c", via: "988788", path: "/zh/cast" }); // a later via does not re-attribute
    record({ t: now - 100 * 86_400_000, e: "page_view", s: "s-old", via: "988788", path: "/zh" });
    record({ t: now - 100 * 86_400_000 + 1, e: "cast_complete", s: "s-old", path: "/zh/cast" }); // outside the window
    expect(castsBroughtBy(new Set(["988788"]))).toBe(1);
    expect(castsBroughtBy(new Set())).toBe(0);
  });

  it("lists gifts with claim state, rewards with a link only while usable, and the deep readings that can still give one", () => {
    const me = upsertCustomer("me@example.com", "zh");
    deepReading(me, "cs_mine_1");
    deepReading(me, "cs_mine_2");
    deepReading(me, "sub_mine_3", "subscription");
    deepReading(me, "gf_mine_4", "gift"); // painted-door: nothing to give away
    // one gift minted and claimed, one minted and waiting
    const claimed = mintGiftCast("cs_mine_1", "zh", me, null);
    expect(redeemGiftCast(claimed.token, INPUT, "friend@example.com", null, "zh").ok).toBe(true);
    mintGiftCast("cs_mine_2", "en", me, null);
    // a newcomer took the free light reading through my code
    grantInviteLight("988788", INPUT, null, null, "zh");
    // two rewards: one live, one already spent
    const friendA = upsertCustomer("a@example.com", "zh");
    const friendB = upsertCustomer("b@example.com", "zh");
    createReferral({ via: "988788", referrerCustomerId: me, referredCustomerId: friendA, referredSessionId: "cs_a", token: "tok-live", expiresAt: Date.now() + 86_400_000, locale: "zh" });
    createReferral({ via: "988788", referrerCustomerId: me, referredCustomerId: friendB, referredSessionId: "cs_b", token: "tok-used", expiresAt: Date.now() + 86_400_000, locale: "zh" });
    redeemReferral("tok-used", "rw_tok-used", INPUT);

    const v = myReferrals(me, "zh", "https://yaoflow.com");
    expect(v.inviteLights).toBe(1);
    expect(v.gifts).toHaveLength(2);
    const byUsed = v.gifts.map((g) => !!g.usedAt).sort();
    expect(byUsed).toEqual([false, true]);
    expect(v.gifts.find((g) => !g.usedAt)?.url).toBe(`https://yaoflow.com/en/cast?gift=${v.gifts.find((g) => !g.usedAt)!.token}`);
    expect(v.gifts.some((g) => JSON.stringify(g).includes("friend@example.com"))).toBe(false); // the claimant stays private
    expect(v.rewards).toHaveLength(2);
    expect(v.rewards.find((r) => !r.usedAt)?.href).toBe("/zh/cast?reward=tok-live");
    expect(v.rewards.find((r) => r.usedAt)?.href).toBeNull();
    // only the member reading still has its gift to give; paid ones were used, the painted-door one never had one
    expect(v.giftable.map((g) => g.sid)).toEqual(["sub_mine_3"]);
    expect(v.giftable[0].values).toBe("988788");
  });

  it("is empty for an account that never shared, gave or earned anything", () => {
    const quiet = upsertCustomer("quiet@example.com", "zh");
    const v = myReferrals(quiet, "zh", "https://yaoflow.com");
    expect(v).toEqual({ broughtCasts: 0, inviteLights: 0, gifts: [], rewards: [], giftable: [] });
  });
});
