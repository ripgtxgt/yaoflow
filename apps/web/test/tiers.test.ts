import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { DEEP_KEYS, ONE_KEYS, buildUserPayload, dateTalkOffense, oneSystem, resolveServerChart, resolveTiming, validateReading } from "../src/lib/reading";
import ReadingArticle from "../src/components/ReadingArticle";
import { POST as followup } from "../src/app/api/followup/route";

/** 09-17 Neil: "轻解读和深断没什么区别" — the light tier is the mirror (no dates, no steps, no chat); the deep tier owns time, action, signals and the conversation. */

describe("the two tiers are told apart", () => {
  it("the light tier writes five fields and the prompt forbids time and instructions; the deep tier adds what to watch", () => {
    expect(ONE_KEYS).toEqual(["summary", "inner_condition", "outer_condition", "direction", "reflection_question"]);
    expect(DEEP_KEYS).toContain("signals");
    const p = oneSystem("zh");
    expect(p).toMatch(/No timing of any kind/);
    expect(p).toMatch(/No instructions/);
    expect(p).not.toMatch(/next_step/);
    // schema: the five fields are enough; the old eight still validate (superset)
    const five = { summary: "这是一件卡住的事。", inner_condition: "你心里其实已经偏向一边了。", outer_condition: "对方还没有表态。", direction: "往稳的那边靠更合适。", reflection_question: "你真正怕的是什么？" };
    expect(validateReading(five)).toBe(true);
    expect(validateReading({ ...five, direction: "短" })).toBe(false);
  });

  it("the light tier is not shown the calendar, the deep tier is", () => {
    const input = { question: "我该不该接这个 offer", values: [7, 8, 9, 8, 7, 8] as never, castAtMs: Date.UTC(2026, 8, 15, 4), tzOffsetMinutes: 480 };
    const chart = resolveServerChart(input);
    const timing = resolveTiming(input, chart);
    const light = JSON.parse(buildUserPayload(input.question, chart, timing, { tellTime: false })) as Record<string, unknown>;
    const deep = JSON.parse(buildUserPayload(input.question, chart, timing)) as Record<string, unknown>;
    expect(light.timing).toBeUndefined();
    expect(light.today).toBeUndefined();
    expect(deep.timing).toBeDefined();
    expect(deep.today).toBeDefined();
  });

  it("catches a light reading that tells time, in any of the nine languages", () => {
    const ok = { summary: "現在是僵住的。", direction: "往等一等那邊靠。" };
    expect(dateTalkOffense(ok, ["summary", "direction"])).toBeNull();
    expect(dateTalkOffense({ direction: "9月12日前後會有動靜。" }, ["direction"])).toBe("direction:9月12日");
    expect(dateTalkOffense({ direction: "两周内会有回音。" }, ["direction"])).toBe("direction:两周内");
    expect(dateTalkOffense({ direction: "13点到15点最踏实。" }, ["direction"])).toBe("direction:13点到15点");
    expect(dateTalkOffense({ direction: "Expect a sign around September 12." }, ["direction"])).toBe("direction:September 12");
    expect(dateTalkOffense({ direction: "Within 10 days you will hear back." }, ["direction"])).toBe("direction:Within 10 days");
    expect(dateTalkOffense({ direction: "9월 25일 전후에 소식이 옵니다." }, ["direction"])).toBe("direction:9월 25일");
    expect(dateTalkOffense({ direction: "Vers le 12 septembre, un signe." }, ["direction"])).toBe("direction:12 septembre");
  });

  it("renders a five-field light reading without the old blocks, and a deep reading with the signals block", () => {
    const z = (s: string) => ({ zh: s });
    const light = renderToStaticMarkup(createElement(ReadingArticle, { locale: "zh", tier: "one", reading: { summary: z("总"), inner_condition: z("内"), outer_condition: z("外"), direction: z("向"), reflection_question: z("问") } }));
    expect(light).toContain("内在处境");
    expect(light).toContain("决策方向");
    expect(light).not.toContain("七日一步");
    expect(light).not.toContain("需要提防");
    expect(light).not.toContain("变动之势");
    // an older light reading still shows everything it has
    const old = renderToStaticMarkup(createElement(ReadingArticle, { locale: "zh", tier: "one", reading: { summary: z("总"), inner_condition: z("内"), outer_condition: z("外"), movement: z("势"), direction: z("向"), next_step: z("步"), caution: z("忌"), reflection_question: z("问") } }));
    expect(old).toContain("七日一步");
    const deep = renderToStaticMarkup(createElement(ReadingArticle, { locale: "zh", tier: "deep", reading: { verdict: z("断"), tendency: z("势"), timing: z("期"), basis: z("据"), strategy: z("策"), caution: z("忌"), next_step: z("步"), signals: z("如果他先开口，就是在松动；如果那周还是只读不回，就别等了。"), closing: z("结") } }));
    expect(deep).toContain("要盯的信号");
    expect(deep.indexOf("忌讳")).toBeLessThan(deep.indexOf("要盯的信号"));
    expect(deep.indexOf("要盯的信号")).toBeLessThan(deep.indexOf("结语"));
  });

  it("the follow-up conversation belongs to the deep tier", async () => {
    const saved = process.env.PAYWALL;
    process.env.PAYWALL = "off";
    const res = await followup(new NextRequest("http://localhost/api/followup", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier: "one", locale: "zh", message: "为什么这么说？", question: "我该不该接这个 offer", values: [7, 8, 9, 8, 7, 8], castAtMs: Date.UTC(2026, 8, 15, 4), tzOffsetMinutes: 480 }),
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "deep_only" });
    process.env.PAYWALL = saved;
  });
});

/**
 * 09-22, from asking why six hours passed with no sale. The answer was not a
 * broken funnel — only three non-members reached Stripe at all — but the
 * digging found this: four of the day's abandoned checkouts were MEMBERS.
 *
 * The cast page checks entitlement and redeems; `UpgradePanel` posted straight
 * to /api/checkout, so a member who took a light reading on her membership and
 * then tapped 「看這一卦的深斷」 was asked to pay for what she already pays for
 * monthly. She refused, twice, and so did the other one. The check now lives in
 * the checkout handler — the single door every purchase goes through.
 */
describe("会员的额度排在她的卡前面", () => {
  it("an entitled member's upgrade is redeemed, not charged", async () => {
    const { redeemSubscription, entitlementFor } = await import("../src/lib/subscription");
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    const cid = db.upsertCustomer(`up_${tag}@e.com`, "zh-hant");
    db.upsertSubscription({
      customerId: cid, stripeCustomerId: `cus_up_${tag}`, stripeSubscriptionId: `sub_up_${tag}`,
      status: "active", plan: "month", periodStart: Date.now() - 86400_000, periodEnd: Date.now() + 29 * 86400_000,
      cancelAtPeriodEnd: false, currency: "HKD", amountMinor: 6800,
    });
    const ent = await entitlementFor(cid);
    expect(ent.active).toBe(true);
    expect(ent.deepLeft).toBeGreaterThan(0);

    const r = await redeemSubscription(cid, "deep", {
      question: "這一卦的深斷", values: [7, 8, 7, 8, 7, 8], castAtMs: Date.now(),
      tzOffsetMinutes: 480, scaleHint: null, topicHint: null, locale: "zh-hant",
    } as never);
    expect(r.ok).toBe(true);
    // and the allowance actually moved, so the same tap cannot be free twice
    expect((await entitlementFor(cid)).deepLeft).toBe(ent.deepLeft - 1);
  });

  it("a member with nothing left falls through to paying", async () => {
    const { redeemSubscription } = await import("../src/lib/subscription");
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    const cid = db.upsertCustomer(`none_${tag}@e.com`, "zh-hant");
    // no subscription at all: the checkout path must not think it is covered
    const r = await redeemSubscription(cid, "deep", {
      question: "測試", values: [7, 8, 7, 8, 7, 8], castAtMs: Date.now(),
      tzOffsetMinutes: 480, scaleHint: null, topicHint: null, locale: "zh-hant",
    } as never);
    expect(r.ok).toBe(false);
  });
});

/**
 * 09-22 (Neil: 「首次价过后，同一个客户再来一卦，也还是首次价」).
 *
 * The live case: a member signed in as niceeva741220@yahoo.com.tw paid at
 * Stripe as marimar741220@gmail.com — same person, two addresses, 741220 in
 * both. The order was filed under the PAYING address's customer, so the
 * signed-in account never learnt it had bought a deep reading, and she got the
 * first-time price twice ($3.14 at 14:15 and again at 14:32; the second should
 * have been $9.99). Two things had to change: the order follows the account
 * that was signed in, and the question is asked of every address we know.
 */
describe("首次价只该给一次", () => {
  it("recognises a returning buyer by the address they paid with", async () => {
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    const email = `fd_${tag}@e.com`;
    const cid = db.upsertCustomer(email, "zh-hant");
    expect(db.emailHasPaidDeep(email)).toBe(false);
    db.recordOrder({ sessionId: `cs_fd_${tag}`, customerId: cid, castId: null, tier: "deep", amountCents: 299, currency: "usd", email, status: "paid", firstDeep: true });
    expect(db.emailHasPaidDeep(email)).toBe(true);
    expect(db.customerHasPaidDeep(cid)).toBe(true);
  });

  it("and by a second address the same person paid with", async () => {
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    const signedIn = `acct_${tag}@e.com`;      // the account they are logged into
    const paidWith = `card_${tag}@e.com`;      // the address Stripe collected
    const cid = db.upsertCustomer(signedIn, "zh-hant");
    db.recordOrder({ sessionId: `cs_alt_${tag}`, customerId: cid, castId: null, tier: "deep", amountCents: 299, currency: "usd", email: paidWith, status: "paid", firstDeep: true });
    db.noteAlternateEmail(cid, paidWith);
    // either address must now answer "yes, this person has had it"
    expect(db.emailHasPaidDeep(signedIn)).toBe(true);
    expect(db.emailHasPaidDeep(paidWith)).toBe(true);
  });

  it("a refunded deep leaves the first-time price available again", async () => {
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    const email = `ref_${tag}@e.com`;
    const cid = db.upsertCustomer(email, "zh-hant");
    db.recordOrder({ sessionId: `cs_rf_${tag}`, customerId: cid, castId: null, tier: "deep", amountCents: 299, currency: "usd", email, status: "paid", firstDeep: true });
    db.markOrderRefunded(`cs_rf_${tag}`, "requested");
    expect(db.customerHasPaidDeep(cid)).toBe(false);
    expect(db.emailHasPaidDeep(email)).toBe(false);
  });

  it("a painted-door gift or a membership redemption never spends it", async () => {
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    const email = `gift_${tag}@e.com`;
    const cid = db.upsertCustomer(email, "zh-hant");
    db.recordOrder({ sessionId: `gf_${tag}`, customerId: cid, castId: null, tier: "deep", amountCents: 0, currency: null, email, status: "gift" });
    db.recordOrder({ sessionId: `cs_sub_${tag}`, customerId: cid, castId: null, tier: "deep", amountCents: 0, currency: null, email, status: "subscription" });
    expect(db.customerHasPaidDeep(cid)).toBe(false);
    expect(db.emailHasPaidDeep(email)).toBe(false);
  });
});
