import { describe, expect, it } from "vitest";
import { createSubUse, db, insertCaseReward, packsSince, recordOrder, recordPack, setCaseRewardChoice, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { entitlementFor, DEEP_PER_MONTH } from "../src/lib/subscription";
import { fulfilPack, packName } from "../src/lib/pack";
import { CURRENCIES, PACK_PRICES, PACK_SMALL_PRICES, PRICES, formatMoney, packMinor } from "../src/lib/money";
import { MEMBER_GIFT_T } from "../src/lib/dict/member-gift";
import { THREAD_T } from "../src/lib/dict/thread";
import { LOCALES } from "../src/lib/locales";
import { CASE_SELF_DEEP_PER_PERIOD, PACK_NUDGE_SINGLES } from "../src/lib/sub-plan";
import { chooseCaseReward, memberSelfCapped, offerCaseReward } from "../src/lib/case-reward";
import { packOfferLetter, packOfferNumbers } from "../src/lib/pack-offer";
import { TERMS } from "../src/lib/legal";
import { TERMS_HANT } from "../src/lib/legal-hant";
import { llmsTxt } from "../src/lib/llms";
import type { CheckoutSession } from "../src/lib/stripe";

const DAY = 86_400_000;
let k = 0;

/** a TWD member whose period started two days ago, with the period's own ten already spent */
function spentMember(tag: string) {
  const now = Date.now();
  const cid = upsertCustomer(`ps-${tag}@example.com`, "zh-hant");
  const sub = upsertSubscription({
    customerId: cid, stripeCustomerId: `cus_ps_${tag}`, stripeSubscriptionId: `sub_ps_${tag}`, status: "active", plan: "month",
    periodStart: now - 2 * DAY, periodEnd: now + 28 * DAY, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900,
  });
  for (let i = 0; i < DEEP_PER_MONTH; i++) createSubUse({ subscriptionId: sub.id, customerId: cid, tier: "deep", locale: "zh-hant", token: `ps_${tag}_${i}`.padEnd(36, "x"), inputJson: "{}" });
  return { cid, sub };
}

/** a member's single extra full reading at the light price */
function single(cid: number, opts: { currency?: string; amount?: number; flag?: boolean | undefined } = {}) {
  recordOrder({
    sessionId: `cs_ps_single_${++k}`, customerId: cid, castId: null, tier: "deep", amountCents: opts.amount ?? 7500, currency: opts.currency ?? "twd",
    email: null, status: "paid", ...(opts.flag === undefined ? {} : { memberAddon: opts.flag }),
  });
}

describe("10-02 小包（5 份）", () => {
  it("every currency: dearer per reading than the 15-pack, cheaper than four singles' worth plus a bit; NT$299", () => {
    for (const c of CURRENCIES) {
      const per = PACK_SMALL_PRICES[c] / 5;
      expect(per, c).toBeGreaterThan(PACK_PRICES[c] / 15);
      expect(per, c).toBeLessThan(PRICES[c].one);
      expect(PACK_SMALL_PRICES[c] / (4 * PRICES[c].one), c).toBeGreaterThan(0.9);
      expect(PACK_SMALL_PRICES[c] / (4 * PRICES[c].one), c).toBeLessThan(1.01);
    }
    expect(PACK_SMALL_PRICES.TWD).toBe(29900);
    expect(packMinor("TWD", "small")).toBe(29900);
    expect(packMinor("TWD")).toBe(69900);
  });

  it("a member who ran out is offered both: 5 for NT$299 and 15 for NT$699", async () => {
    const { cid } = spentMember("both");
    const e = await entitlementFor(cid);
    expect(e.deepLeft).toBe(0);
    expect(e.packBuyable).toBe(true);
    expect(e.packQuotes?.small).toMatchObject({ size: "small", units: 5, minor: 29900, currency: "TWD", creditUnits: 0 });
    expect(e.packQuotes?.large).toMatchObject({ size: "large", units: 15, minor: 69900, creditUnits: 0 });
    expect(e.singlesThisPeriod).toBe(0);
  });

  it("a small pack is recorded as small, adds 5, and counts towards the two a period", async () => {
    const { cid } = spentMember("small");
    const s: CheckoutSession = { id: "cs_ps_small_1", url: null, payment_status: "paid", status: "complete", metadata: { kind: "pack", cust: String(cid), units: "5", size: "small" }, currency: "twd", amount_total: 29900, payment_intent: "pi_ps_small_1" };
    const r = fulfilPack(s);
    expect(r.ok && r.row.size === "small" && r.row.units === 5).toBe(true);
    const e = await entitlementFor(cid);
    expect(e.deepLeft).toBe(5);
    expect(e.packLeft).toBe(5);
    expect(packsSince(cid, 0).map((p) => p.size)).toEqual(["small"]);
  });
});

describe("10-02 单买抵扣", () => {
  it("this period's singles count towards the 15: three singles → NT$474 for 12 more", async () => {
    const { cid } = spentMember("credit3");
    single(cid, { flag: true });
    single(cid, { flag: true });
    single(cid); // an order from before the flag: read by its shape (full reading, light price, not first-time)
    const e = await entitlementFor(cid);
    expect(e.singlesThisPeriod).toBe(PACK_NUDGE_SINGLES);
    expect(e.packQuotes?.large).toMatchObject({ units: 12, minor: 69900 - 3 * 7500, creditUnits: 3, creditMinor: 22500, creditSingles: 3 });
    // the small pack takes no credit
    expect(e.packQuotes?.small).toMatchObject({ units: 5, minor: 29900, creditUnits: 0 });
  });

  it("only singles in the pack's currency, paid, at the light price and this period count", async () => {
    const { cid } = spentMember("credit-mix");
    single(cid, { currency: "usd", amount: 299 });          // another currency
    single(cid, { amount: 26900 });                          // a full-price deep reading
    single(cid, { flag: false, amount: 7500 });              // flagged as not a member's extra
    single(cid, { flag: true });                             // a real one, but from before this period
    db().prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(Date.now() - 10 * DAY, `cs_ps_single_${k}`);
    single(cid, { flag: true });
    const e = await entitlementFor(cid);
    expect(e.singlesThisPeriod).toBe(1);
    expect(e.packQuotes?.large).toMatchObject({ creditUnits: 1, minor: 69900 - 7500, units: 14 });
  });

  it("never charges less than one single: the ninth single is left out", async () => {
    const { cid } = spentMember("credit9");
    for (let i = 0; i < 9; i++) single(cid, { flag: true });
    const e = await entitlementFor(cid);
    expect(e.packQuotes?.large).toMatchObject({ creditUnits: 8, minor: 69900 - 8 * 7500, units: 7 });
  });

  it("a small pack bought this period counts too; after a large pack, nothing more is credited", async () => {
    const { cid } = spentMember("credit-small");
    recordPack({ customerId: cid, sessionId: "cs_ps_cs_1", paymentIntent: "pi_ps_cs_1", units: 5, currency: "TWD", amountMinor: 29900, size: "small" });
    single(cid, { flag: true });
    let e = await entitlementFor(cid);
    expect(e.packQuotes?.large).toMatchObject({ creditUnits: 6, creditMinor: 29900 + 7500, minor: 69900 - 37400, units: 9, creditSingles: 1 });
    // the large one is bought with that credit: it records what it added and what it took in
    const q = e.packQuotes!.large!;
    const s: CheckoutSession = { id: "cs_ps_cs_2", url: null, payment_status: "paid", status: "complete",
      metadata: { kind: "pack", cust: String(cid), units: String(q.units), size: "large", credit_minor: String(q.creditMinor), credit_units: String(q.creditUnits) },
      currency: "twd", amount_total: q.minor, payment_intent: "pi_ps_cs_2" };
    const r = fulfilPack(s);
    expect(r.ok && r.row.units === 9 && r.row.credit_units === 6 && r.row.credit_minor === 37400).toBe(true);
    e = await entitlementFor(cid);
    expect(e.packLeft).toBe(5 + 9); // 15 readings in all for NT$299 + 75 + 325 = NT$699
    // two packs this period: neither size again
    expect(e.packQuotes).toEqual({ small: null, large: null });
  });

  it("the line on Stripe says what it is", () => {
    expect(packName("zh-hant", { units: 5, creditUnits: 0 })).toBe("YaoFlow 會員增購 · 5 份深斷（數位內容）");
    expect(packName("zh-hant", { units: 12, creditUnits: 3 })).toContain("本期已買 3 份抵扣，這次加 12 份");
    for (const l of LOCALES) expect(packName(l, { units: 12, creditUnits: 3 }), l).not.toMatch(/\{\w\}/);
  });
});

describe("10-02 公开卦例回礼：会员每期留给自己最多 5 次", () => {
  it("past five this period, the reward stays open and can only be given", async () => {
    const now = Date.now();
    const cid = upsertCustomer("ps-cases@example.com", "zh");
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_ps_cases", stripeSubscriptionId: "sub_ps_cases", status: "active", plan: "month",
      periodStart: now - 10 * DAY, periodEnd: now + 20 * DAY, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900 });
    // five kept for themselves earlier this period (three days ago — the three-a-day rule is not what stops this)
    for (let i = 0; i < CASE_SELF_DEEP_PER_PERIOD; i++) {
      const row = insertCaseReward({ caseSid: `cs_ps_case_old_${i}`, customerId: cid, email: null }, now - 3 * DAY);
      setCaseRewardChoice(row!.id, "self_deep", null, now - 3 * DAY);
    }
    const sid = "cs_ps_case_new";
    recordOrder({ sessionId: sid, customerId: cid, castId: null, tier: "deep", amountCents: 7500, currency: "twd", email: null, status: "paid" });
    db().prepare("INSERT INTO case_rewards (case_sid, customer_id, email, created_at) VALUES (?,?,?,?)").run(sid, cid, null, now);
    const open = chooseCaseReward(sid, "self", "https://yaoflow.com", "zh");
    expect(open).toEqual({ state: "open", member: true, selfCapped: true });
    const gift = chooseCaseReward(sid, "gift", "https://yaoflow.com", "zh");
    expect(gift.state === "chosen" && gift.choice === "gift").toBe(true);
    // the ones already kept stay in this period's allowance
    expect((await entitlementFor(cid)).deepTotal).toBe(DEEP_PER_MONTH + CASE_SELF_DEEP_PER_PERIOD);
  });

  it("with four kept this period, the fifth can still be kept; a non-member is never capped", () => {
    const now = Date.now();
    const cid = upsertCustomer("ps-cases4@example.com", "zh");
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_ps_cases4", stripeSubscriptionId: "sub_ps_cases4", status: "active", plan: "month",
      periodStart: now - 10 * DAY, periodEnd: now + 20 * DAY, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900 });
    for (let i = 0; i < CASE_SELF_DEEP_PER_PERIOD - 1; i++) {
      const row = insertCaseReward({ caseSid: `cs_ps_case4_old_${i}`, customerId: cid, email: null }, now - 3 * DAY);
      setCaseRewardChoice(row!.id, "self_deep", null, now - 3 * DAY);
    }
    // one kept before this period does not count
    const before = insertCaseReward({ caseSid: "cs_ps_case4_before", customerId: cid, email: null }, now - 20 * DAY);
    setCaseRewardChoice(before!.id, "self_deep", null, now - 20 * DAY);
    db().prepare("INSERT INTO case_rewards (case_sid, customer_id, email, created_at) VALUES (?,?,?,?)").run("cs_ps_case4_new", cid, null, now);
    expect(memberSelfCapped(cid)).toBe(false);
    const r = chooseCaseReward("cs_ps_case4_new", "self", "https://yaoflow.com", "zh");
    expect(r.state === "chosen" && r.choice === "self_deep").toBe(true);
    expect(memberSelfCapped(cid)).toBe(true);
    expect(memberSelfCapped(upsertCustomer("ps-cases-guest@example.com", "zh"))).toBe(false);
    expect(offerCaseReward("cs_ps_none", "https://yaoflow.com", "zh")).toEqual({ state: "none" });
  });
});

describe("10-02 copy and documents", () => {
  it("every language has the new pack and case lines", () => {
    for (const l of LOCALES) {
      const m = (MEMBER_GIFT_T as Record<string, Record<string, string>>)[l]!;
      for (const key of ["packCompare", "packCreditBtn", "packCreditNote", "packNudge"]) expect(m[key]!.length, `${l}.${key}`).toBeGreaterThan(0);
      expect(m.packDone, l).not.toContain("15");
      const t = (THREAD_T as Record<string, Record<string, string>>)[l]!;
      expect(t.rwSelfCapped!.length, l).toBeGreaterThan(0);
      expect(t.pubRewardMember, l).toBeTruthy();
    }
  });

  it("the offer letter names the small pack; terms and llms.txt carry both sizes and the credit", async () => {
    const n = packOfferNumbers("TWD", "zh-hant");
    expect(n.smallPrice).toContain("299");
    expect(n.smallPer).toContain("60");
    const m = packOfferLetter({ customerId: 1, email: "x@y.z", locale: "zh-hant", left: 0, key: "k", reset: Date.now() + DAY, currency: "TWD" });
    expect(m.text).toContain("5 份的小包");
    // 10-22 进度表 78 (通卡): the packs are withdrawn for new buyers — the terms say so, and llms.txt no longer sells them
    const all = TERMS.flatMap((sec) => Object.values(sec).map((x) => (x as { p: string[] }).p.join(" "))).join(" ");
    expect(all).not.toContain("US$11.99");
    expect(TERMS_HANT.map((x) => x.p.join(" ")).join(" ")).toContain("會員增購包");
    expect(TERMS_HANT.map((x) => x.p.join(" ")).join(" ")).toContain("已停售");
    const was = process.env.PAYWALL;
    process.env.PAYWALL = "on";
    const txt = llmsTxt("https://yaoflow.com", []);
    process.env.PAYWALL = was;
    expect(txt).not.toContain(formatMoney("TWD", PACK_SMALL_PRICES.TWD, "en"));
    expect(txt).not.toContain("count towards");
  });
});
