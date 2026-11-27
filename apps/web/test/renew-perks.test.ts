import { describe, expect, it } from "vitest";
import { createSubUse, db, subscriptionByStripeId, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { entitlementFor, renewPerks, DEEP_PER_MONTH } from "../src/lib/subscription";
import { giftPoolFor } from "../src/lib/membership";
import { OWN_CARRY_MAX, PASS_PERKS_UNTIL } from "../src/lib/sub-plan";
import { RENEW_PERKS_T, rp } from "../src/lib/dict/renew-perks";
import { RETAIN_T } from "../src/lib/dict/retain";
import { buildRetainEmail } from "../src/lib/email";
import { LOCALES } from "../src/lib/locales";

/** 09-30 续订专属 (Neil: 「如果都这样操作的话，那349的一次性会员都卖不出去了」→「好，都做吧」). */
const DAY = 86_400_000;

function renewing(email: string, subId: string, opts: { ageDays: number; sinceDays: number }) {
  const now = Date.now();
  const cid = upsertCustomer(email, "zh-hant");
  const sub = upsertSubscription({
    customerId: cid, stripeCustomerId: `cus_${subId}`, stripeSubscriptionId: subId, status: "active", plan: "month",
    periodStart: now - opts.sinceDays * DAY, periodEnd: now + (30 - opts.sinceDays) * DAY, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900,
  });
  db().prepare("UPDATE subscriptions SET created_at = ? WHERE id = ?").run(now - opts.ageDays * DAY, sub.id);
  return { cid, sub: subscriptionByStripeId(subId)! };
}

function useDeep(subId: number, cid: number, n: number, at: number, tag: string) {
  for (let i = 0; i < n; i++) {
    const token = `rp_${tag}_${String(i).padStart(3, "0")}_`.padEnd(36, "x");
    createSubUse({ subscriptionId: subId, customerId: cid, tier: "deep", locale: "zh-hant", token, inputJson: "{}" });
    db().prepare("UPDATE sub_uses SET created_at = ? WHERE token = ?").run(at, token);
  }
}

describe("carry-over: a renewing member's unused readings", () => {
  it("up to five of last period's own readings carry into this one, once", async () => {
    const { cid, sub } = renewing("rp-a@example.com", "sub_rp_a", { ageDays: 40, sinceDays: 5 });
    useDeep(sub.id, cid, 3, Date.now() - 20 * DAY, "a");          // last period: 3 of 10 used → 7 left over
    const ent = await entitlementFor(cid);
    expect(ent.carried).toBe(OWN_CARRY_MAX);
    expect(ent.deepTotal).toBe(DEEP_PER_MONTH + OWN_CARRY_MAX);
    expect(ent.deepLeft).toBe(DEEP_PER_MONTH + OWN_CARRY_MAX);
    expect(ent.renewing).toBe(true);
  });

  it("carries only what was left, and nothing into the first period", async () => {
    const a = renewing("rp-b@example.com", "sub_rp_b", { ageDays: 40, sinceDays: 5 });
    useDeep(a.sub.id, a.cid, 8, Date.now() - 20 * DAY, "b");       // 2 left over
    expect((await entitlementFor(a.cid)).carried).toBe(2);
    const b = renewing("rp-c@example.com", "sub_rp_c", { ageDays: 5, sinceDays: 5 });
    expect((await entitlementFor(b.cid)).carried).toBe(0);
  });
});

describe("turning renewal off stops the renew-only perks at once", () => {
  it("gift pool and add-on packs stop; the period's allowance stays; turning it back on restores them", async () => {
    const { cid } = renewing("rp-d@example.com", "sub_rp_d", { ageDays: 3, sinceDays: 3 });
    expect((await entitlementFor(cid)).packBuyable).toBe(true);
    expect(giftPoolFor(cid)?.available).toBeGreaterThan(0);

    const now = Date.now();
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_sub_rp_d", stripeSubscriptionId: "sub_rp_d", status: "active", plan: "month",
      periodStart: now - 3 * DAY, periodEnd: now + 27 * DAY, cancelAtPeriodEnd: true, currency: "TWD", amountMinor: 26900 });
    const row = subscriptionByStripeId("sub_rp_d")!;
    expect(row.renew_off_at).toBeGreaterThan(1);
    const ent = await entitlementFor(cid);
    expect(ent.renewing).toBe(false);
    expect(ent.packBuyable).toBe(false);
    expect(ent.deepLeft).toBe(DEEP_PER_MONTH);
    expect(giftPoolFor(cid)).toMatchObject({ available: 0, renewOff: true });

    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_sub_rp_d", stripeSubscriptionId: "sub_rp_d", status: "active", plan: "month",
      periodStart: now - 3 * DAY, periodEnd: now + 27 * DAY, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900 });
    expect(subscriptionByStripeId("sub_rp_d")!.renew_off_at).toBeNull();
    expect((await entitlementFor(cid)).renewing).toBe(true);
  });

  it("rows already off before the rule keep what they signed up with; one-off months only if bought before it", () => {
    const base = { cancel_at_period_end: 1, cancel_at: null, created_at: Date.now() };
    expect(renewPerks({ ...base, stripe_subscription_id: "sub_x", renew_off_at: 1 })).toBe(true);
    expect(renewPerks({ ...base, stripe_subscription_id: "sub_x", renew_off_at: Date.now() })).toBe(false);
    expect(renewPerks({ ...base, stripe_subscription_id: "sub_x", cancel_at_period_end: 0, renew_off_at: null })).toBe(true);
    expect(renewPerks({ ...base, stripe_subscription_id: "pass_x", created_at: PASS_PERKS_UNTIL - 1, renew_off_at: null })).toBe(true);
    expect(renewPerks({ ...base, stripe_subscription_id: "pass_x", created_at: PASS_PERKS_UNTIL + 1, renew_off_at: null })).toBe(false);
    expect(renewPerks({ ...base, stripe_subscription_id: "comp_x", renew_off_at: null })).toBe(true);
  });
});

describe("the copy", () => {
  it("every language has every line, and the cancellation letter says resuming brings them back", () => {
    const keys = Object.keys(RENEW_PERKS_T.zh!);
    for (const l of LOCALES) {
      expect(Object.keys(RENEW_PERKS_T[l]!).sort(), l).toEqual([...keys].sort());
      // 10-22 进度表 93: no counts — what stops after the end, never 「還剩 N 份」; 10-24 (Neil): 命盤問答 simply stops (no 3 free a day)
      expect(rp(l, "lose3"), l).not.toMatch(/\d/);
      expect(rp(l, "lead", { date: "D" }), l).not.toMatch(/\{n\}/);
      expect(rp(l, "afterEnd").length, l).toBeGreaterThan(10);
      expect((RETAIN_T as Record<string, { perksBack: string }>)[l]!.perksBack.length, l).toBeGreaterThan(10);
    }
    const m = buildRetainEmail({ locale: "zh-hant", letter: "confirm", date: "10/29", deepLeft: 6, resumeUrl: "https://x/r", castUrl: "https://x/c", perksBack: true } as never);
    expect(m.text).toContain(RETAIN_T["zh-hant"].perksBack);
    const m2 = buildRetainEmail({ locale: "zh-hant", letter: "confirm", date: "10/29", deepLeft: 6, resumeUrl: "https://x/r", castUrl: "https://x/c" } as never);
    expect(m2.text).not.toContain(RETAIN_T["zh-hant"].perksBack);
  });
});
