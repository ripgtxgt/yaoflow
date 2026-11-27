import { describe, expect, it } from "vitest";
import { createSubUse, db, markPackConverted, packBalance, packCreditOnBalance, packsForCustomer, recordPack, refundPackByIntent, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { entitlementFor, redeemSubscription, DEEP_PER_MONTH } from "../src/lib/subscription";
import { fulfilPack } from "../src/lib/pack";
import { PACK_PRICES, PRICES, CURRENCIES } from "../src/lib/money";
import { MEMBER_GIFT_T } from "../src/lib/dict/member-gift";
import { LOCALES } from "../src/lib/locales";
import type { CheckoutSession } from "../src/lib/stripe";

const DAY = 86_400_000;

function member(email: string, subId: string) {
  const now = Date.now();
  const cid = upsertCustomer(email, "zh-hant");
  const sub = upsertSubscription({
    customerId: cid, stripeCustomerId: `cus_${subId}`, stripeSubscriptionId: subId, status: "active", plan: "month",
    periodStart: now - 2 * DAY, periodEnd: now + 28 * DAY, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900,
  });
  return { cid, sub };
}

describe("09-29 会员增购包", () => {
  it("a pack adds 15 after the period's own; units come out of it only once those are gone", async () => {
    const { cid, sub } = member("pack-a@example.com", "sub_pack_a");
    for (let i = 0; i < DEEP_PER_MONTH; i++) createSubUse({ subscriptionId: sub.id, customerId: cid, tier: "deep", locale: "zh-hant", token: `pk_a_${String(i).padStart(3, "0")}_`.padEnd(36, "x"), inputJson: "{}" });
    let ent = await entitlementFor(cid);
    expect(ent.deepLeft).toBe(0);
    expect(ent.packBuyable).toBe(true);
    expect(ent.subCurrency).toBe("TWD");

    recordPack({ customerId: cid, sessionId: "cs_pack_a_1", paymentIntent: "pi_pack_a_1", units: 15, currency: "TWD", amountMinor: 69900 });
    ent = await entitlementFor(cid);
    expect(ent.deepLeft).toBe(15);
    expect(ent.packLeft).toBe(15);

    const r = await redeemSubscription(cid, "deep", { question: "q", values: [7, 8, 9, 7, 8, 8], castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh-hant" } as never);
    expect(r.ok).toBe(true);
    expect(packBalance(cid)).toEqual({ bought: 15, used: 1, left: 14 });
    ent = await entitlementFor(cid);
    expect(ent.deepLeft).toBe(14);
    // the period's own count did not move
    expect(ent.deepTotal).toBe(DEEP_PER_MONTH);
  });

  it("the period's own readings are spent first", async () => {
    const { cid } = member("pack-b@example.com", "sub_pack_b");
    recordPack({ customerId: cid, sessionId: "cs_pack_b_1", paymentIntent: "pi_pack_b_1", units: 15, currency: "TWD", amountMinor: 69900 });
    await redeemSubscription(cid, "deep", { question: "q2", values: [7, 7, 7, 8, 8, 8], castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh-hant" } as never);
    expect(packBalance(cid).used).toBe(0);
    expect((await entitlementFor(cid)).deepLeft).toBe(DEEP_PER_MONTH - 1 + 15);
  });

  it("limits: two a period, twenty held; a refund takes the unspent back; recording is idempotent", async () => {
    const { cid } = member("pack-c@example.com", "sub_pack_c");
    recordPack({ customerId: cid, sessionId: "cs_pack_c_1", paymentIntent: "pi_pack_c_1", units: 15, currency: "TWD", amountMinor: 69900 });
    // 15 held: a second large would make 30 > 20 — 10-02: the small pack (5) still fits, exactly to 20
    const held = await entitlementFor(cid);
    expect(held.packQuotes?.large).toBeNull();
    expect(held.packQuotes?.small?.units).toBe(5);
    expect(held.packBuyable).toBe(true);
    expect(recordPack({ customerId: cid, sessionId: "cs_pack_c_1", paymentIntent: "pi_pack_c_1", units: 15, currency: "TWD", amountMinor: 69900 }).created).toBe(false);
    expect(refundPackByIntent("pi_pack_c_1")?.customer_id).toBe(cid);
    expect(packBalance(cid).left).toBe(0);
    expect((await entitlementFor(cid)).packBuyable).toBe(true);

    const { cid: d, sub: sd } = member("pack-d@example.com", "sub_pack_d");
    const s = (id: string): CheckoutSession => ({ id, url: null, payment_status: "paid", status: "complete", metadata: { kind: "pack", cust: String(d), units: "15" }, currency: "twd", amount_total: 69900, payment_intent: `pi_${id}` });
    expect(fulfilPack(s("cs_pack_d_1")).ok).toBe(true);
    // spend 11 of it so 4 are left, then a second pack; a third in the same period is refused
    for (let i = 0; i < 11; i++) createSubUse({ subscriptionId: sd.id, customerId: d, tier: "deep", locale: "zh-hant", token: `pk_d_${String(i).padStart(3, "0")}_`.padEnd(36, "x"), inputJson: "{}", fromPack: true });
    expect((await entitlementFor(d)).packBuyable).toBe(true);
    expect(fulfilPack(s("cs_pack_d_2")).ok).toBe(true);
    for (let i = 11; i < 26; i++) createSubUse({ subscriptionId: sd.id, customerId: d, tier: "deep", locale: "zh-hant", token: `pk_d_${String(i).padStart(3, "0")}_`.padEnd(36, "x"), inputJson: "{}", fromPack: true });
    expect(packBalance(d).left).toBe(4);
    // two packs this period (of either size): none more, whatever is held
    const two = await entitlementFor(d);
    expect(two.packBuyable).toBe(false);
    expect(two.packQuotes).toEqual({ small: null, large: null });
  });

  it("every currency has a pack price, about 0.62 × fifteen light readings", () => {
    for (const c of CURRENCIES) {
      const ratio = PACK_PRICES[c] / (15 * PRICES[c].one);
      expect(ratio, c).toBeGreaterThan(0.58);
      expect(ratio, c).toBeLessThan(0.66);
    }
    expect(PACK_PRICES.TWD).toBe(69900);
  });

  it("pack copy exists in every language", () => {
    for (const l of LOCALES) {
      const t = (MEMBER_GIFT_T as Record<string, Record<string, string>>)[l]!;
      for (const k of ["packLead", "packBtn", "packNote", "packLimit", "packError", "packIncl", "packDone", "packUsing"]) expect(t[k]!.length, `${l}.${k}`).toBeGreaterThan(0);
    }
  });
});

describe("10-23 进度表 102：增购包剩余折成会员费", () => {
  it("a converted pack is spent: nothing left on the account, the conversion is kept once, and the credit is named", async () => {
    const { cid, sub } = member("pack-conv@example.com", "sub_pack_conv");
    recordPack({ customerId: cid, sessionId: "cs_pack_conv_1", paymentIntent: "pi_pack_conv_1", units: 15, currency: "TWD", amountMinor: 69900 });
    for (let i = 0; i < 4; i++) createSubUse({ subscriptionId: sub.id, customerId: cid, tier: "deep", locale: "zh-hant", token: `pk_cv_${String(i).padStart(3, "0")}_`.padEnd(36, "x"), inputJson: "{}", fromPack: true });
    const before = packBalance(cid);
    expect(before.left).toBe(15 - before.used);
    const pack = packsForCustomer(cid)[0]!;
    expect(markPackConverted(pack.id, { units: before.left, how: "balance", minor: 14000 })).toBe(true);
    expect(markPackConverted(pack.id, { units: 1, how: "balance", minor: 1 })).toBe(false); // once
    expect(packBalance(cid).left).toBe(0);
    expect((await entitlementFor(cid)).packLeft ?? 0).toBe(0);
    expect(packsForCustomer(cid)[0]).toMatchObject({ converted_how: "balance", converted_minor: 14000, converted_units: before.left });
    expect(packCreditOnBalance(cid)).toMatchObject({ currency: "TWD", minor: 14000 });
  });

  it("turning renewal off with a credit still on the balance tells the owner: the rest goes back the way it came", () => {
    const { cid } = member("pack-conv-off@example.com", "sub_pack_conv_off");
    recordPack({ customerId: cid, sessionId: "cs_pack_conv_off", paymentIntent: "pi_pack_conv_off", units: 15, currency: "USD", amountMinor: 2799 });
    markPackConverted(packsForCustomer(cid)[0]!.id, { units: 15, how: "balance", minor: 2799 });
    const n = () => (db().prepare("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'pack_credit_refund_due' AND detail LIKE ?").get(`客户 ${cid}：%`) as { n: number }).n;
    expect(n()).toBe(0);
    const now = Date.now();
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_sub_pack_conv_off", stripeSubscriptionId: "sub_pack_conv_off", status: "active", plan: "month", periodStart: now - 2 * DAY, periodEnd: now + 28 * DAY, cancelAtPeriodEnd: true, currency: "USD", amountMinor: 999 });
    expect(n()).toBe(1);
    // the same state again is not news
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_sub_pack_conv_off", stripeSubscriptionId: "sub_pack_conv_off", status: "active", plan: "month", periodStart: now - 2 * DAY, periodEnd: now + 28 * DAY, cancelAtPeriodEnd: true, currency: "USD", amountMinor: 999 });
    expect(n()).toBe(1);
  });
});
