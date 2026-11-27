import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import type { TrackedEvent } from "../src/lib/analytics-server";

/**
 * 10-23 进度表 105 (Neil: 「有些数据好像不太准确」): the dashboard counted the 通卡 model with the old one —
 * a pass was money twice (its order row and its subscriptions row), every reading under a pass was 「会员额度」, the
 * deliveries were two event kinds, the rate divided every product's sales by the I Ching casts, 在册 held the passes.
 */
const { db, upsertCustomer, recordOrder, saveCast, upsertSubscription, membershipChargesForCustomer, allowanceUsesForCustomer } = await import("../src/lib/db");
const { resolveServerChart } = await import("../src/lib/reading");
const { createDraw } = await import("../src/lib/tarot");
const { deliveries, deliveryCounts, sourceLine } = await import("../src/lib/deliveries");
const { chargesIn, passCharges, passSales, passFromPath, firstDayPassFollowups, standing, saleBucket } = await import("../src/lib/admin-money");
const { dailyBreakdown, orderSplitSince, whoAt } = await import("../src/lib/daily-who");
const { salesByCurrency } = await import("../src/lib/db");

const H = 3_600_000, D = 86_400_000, M = 60_000;
const T0 = Date.parse("2026-10-22T04:00:00Z"); // 12:00 Taipei, 10-22
const since = T0 - 6 * H;                        // 10-22 06:00 Taipei
const V: LineValue[] = [7, 8, 9, 8, 7, 8];

function cast(cid: number | null, at: number): number {
  const question = "這份工作能不能談成";
  const chart = resolveServerChart({ question, values: V, castAtMs: at, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
  return saveCast({ customerId: cid, castAtMs: at, tzOffsetMinutes: 480, locale: "zh-hant", question, topic: "career", values: V, chart });
}
function order(sid: string, at: number, i: { cid: number | null; tier: string; status: string; cents?: number | null; castId?: number | null; bs?: string | null }) {
  recordOrder({ sessionId: sid, customerId: i.cid, castId: i.castId ?? null, tier: i.tier, amountCents: i.cents ?? (i.status === "paid" ? 7500 : null), currency: "TWD", email: null, status: i.status, browserSid: i.bs ?? null });
  db().prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(at, sid);
}
function sub(cid: number, sid: string, at: number, days: number | null, end: number, status = "active", plan = "month") {
  const row = upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: sid, status, plan, periodStart: at, periodEnd: end, cancelAtPeriodEnd: sid.startsWith("pass_"), currency: "TWD", amountMinor: 9900, passDays: days });
  db().prepare("UPDATE subscriptions SET created_at = ? WHERE id = ?").run(at, row.id);
  return row.id;
}
function allowance(subId: number, cid: number, token: string, at: number, tier = "deep") {
  db().prepare("INSERT INTO sub_uses (subscription_id, customer_id, created_at, tier, locale, token, input_json) VALUES (?,?,?,?,?,?,?)").run(subId, cid, at, tier, "zh-hant", token, "{}");
  order(`sub_${token}`, at, { cid, tier, status: "subscription", castId: cast(cid, at - M) });
}

// --- the people of 10-22 ---
const passer = upsertCustomer("p105-passer@example.com", "zh-hant");   // buys a 1 日 card on the cast page, uses it twice more
const member = upsertCustomer("p105-member@example.com", "zh-hant");   // a member: two readings under the membership
const buyer = upsertCustomer("p105-buyer@example.com", "zh-hant");     // buys a 合盘 (a single purchase) and a 7 天 card from the tarot page
const tester = upsertCustomer("p105-test@example.com", "zh-hant");
db().prepare("UPDATE customers SET test_flag = 1 WHERE id = ?").run(tester);

// the pass bought on the cast page: an order row (tier pass_1d, with its cast) AND a subscriptions row — one charge
const passCastSid = "cs_p105_pass_cast_aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const passId = sub(passer, `pass_${passCastSid.slice(-40)}`, T0, 1, T0 + D);
order(passCastSid, T0, { cid: passer, tier: "pass_1d", status: "paid", cents: 7500, castId: cast(passer, T0 - M) });
allowance(passId, passer, "p105tokpass1", T0 + H);
allowance(passId, passer, "p105tokpass2", T0 + 2 * H, "one");
// a tarot personal reading under the same pass
const tk = createDraw({ question: "我跟他接下來會怎樣", spread: 3, locale: "zh-hant", bid: "p105bid000000001", customerId: passer, register: null }, T0 + 3 * H).token;
db().prepare("UPDATE tarot_draws SET paid_at = ?, paid_session = ?, amount_minor = 0, personal_json = '{}' WHERE token = ?").run(T0 + 3 * H, `member:${passId}`, tk);

// the member
const memberSub = sub(member, "sub_p105_member", T0 - 20 * D, null, T0 + 10 * D);
allowance(memberSub, member, "p105tokmem1", T0 + H);
allowance(memberSub, member, "p105tokmem2", T0 + 4 * H);
// a lot reading under the membership
db().prepare(`INSERT INTO qian_draws (token, set_name, num, situation, question, locale, customer_id, created_at, paid_session, paid_at, amount_minor, personal_json, personal_at)
              VALUES ('p105qian00000000000001', '六十甲子籤', 23, 'work', '這次調動好不好', 'zh-hant', ?, ?, ?, ?, 0, '{}', ?)`).run(member, T0 + 5 * H, `member:${memberSub}`, T0 + 5 * H, T0 + 5 * H);

// the buyer: a 合盘 bought outright, and a 7 天 card bought from the tarot page (no cast: attributed by the page it returns to)
order("cs_p105_hepan", T0 + 2 * H, { cid: buyer, tier: "hepan_pair", status: "paid", cents: 39900 });
const tarotPassSid = "cs_p105_pass_tarot_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
sub(buyer, `pass_${tarotPassSid.slice(-40)}`, T0 + 6 * H, 7, T0 + 7 * D);
order(tarotPassSid, T0 + 6 * H, { cid: buyer, tier: "pass_7d", status: "paid", cents: 19900 });
try {
  const { notePending } = await import("../src/lib/recover-offer");
  notePending({ co: "coP105tarot", sessionId: tarotPassSid, kind: "pass", email: null, remind: false, locale: "zh-hant", currency: "twd", amount: 19900, product: "7 天通卡", managed: false, cardHint: true, metadata: {}, cancelUrl: "u", successUrl: "https://yaoflow.com/zh-hant/tarot/r/abc?pass={CHECKOUT_SESSION_ID}", now: T0 + 6 * H });
} catch { /* the attribution falls back to 通卡 without the note */ }

// a free reading (a friend's gift) and our own test purchase
order("gc_p105_free", T0 + 7 * H, { cid: buyer, tier: "one", status: "gift_cast", castId: cast(buyer, T0 + 7 * H - M) });
order("cs_p105_test", T0 + 2 * H, { cid: tester, tier: "pass_1d", status: "paid", cents: 7500, castId: cast(tester, T0 + 2 * H - M) });
sub(tester, "pass_p105_tester", T0 + 2 * H, 1, T0 + D + 2 * H);

const until = T0 + 12 * H;

describe("交付：全部产品、按凭什么给的分", () => {
  it("a pass's readings are 通卡 (the one bought with it on the cast page too), a membership's 会员, money for a single one 付费, a gift 免费; ours stay out", () => {
    const all = deliveries(since, until);
    const by = (ref: string) => all.find((d) => d.ref === ref);
    expect(by(passCastSid)).toMatchObject({ product: "liuyao", source: "pass", what: "深断（随1 日通卡）" });
    expect(by("sub_p105tokpass1")).toMatchObject({ product: "liuyao", source: "pass" });
    expect(by("sub_p105tokpass2")).toMatchObject({ product: "liuyao", source: "pass", what: "轻解读" });
    expect(by(tk)).toMatchObject({ product: "tarot", source: "pass", what: "3 张", href: `/zh-hant/tarot/r/${tk}` });
    expect(by("sub_p105tokmem1")).toMatchObject({ product: "liuyao", source: "member" });
    expect(by("p105qian00000000000001")).toMatchObject({ product: "jieqian", source: "member" });
    expect(by("gc_p105_free")).toMatchObject({ product: "liuyao", source: "free" });
    expect(by(tarotPassSid)).toBeUndefined();     // a pass bought with no cast is not a reading
    expect(by("cs_p105_hepan")).toBeUndefined();  // the 合盘 is delivered when its report is written (none here)
    expect(by("cs_p105_test")).toBeUndefined();   // ours
    expect(deliveries(since, until, { test: true }).some((d) => d.ref === "cs_p105_test" && d.test)).toBe(true);
    const c = deliveryCounts(since, until);
    expect(c.all).toEqual({ paid: 0, pass: 4, member: 3, free: 1, total: 8 });
    expect(c.byProduct.liuyao).toEqual({ paid: 0, pass: 3, member: 2, free: 1, total: 6 });
    expect(sourceLine(c.all)).toBe("通卡 4 · 会员 3 · 免费 1");
  });

  it("customer page: under a pass and under a membership, apart", () => {
    expect(allowanceUsesForCustomer(passer)).toEqual({ pass: 2, member: 0 });
    expect(allowanceUsesForCustomer(member)).toEqual({ pass: 0, member: 2 });
  });
});

describe("钱：一笔收款算一次", () => {
  it("passes by their subscriptions row (never also as a reading sale), memberships started, singles; 六爻 = the cast page's own", () => {
    const c = chargesIn(since, until);
    expect(c).toMatchObject({ singles: 1, members: 0, packs: 0, liuyao: 1 });
    expect(c.passes).toEqual({ d1: 1, d7: 1, d30: 0, n: 2 });
    expect(c.total).toBe(3); // 1 日 card + 7 天 card + 合盘 — not 5
  });

  it("the overview's split and the market table read the pass orders (an ESCAPE '' in their SQL failed only on pass rows)", () => {
    const sp = orderSplitSince(since);
    expect(sp.non.passes + sp.member.passes).toBe(2);
    expect(sp.non.paid + sp.member.paid).toBe(1); // the 合盘 — a pass is not also a single sale
    const twd = salesByCurrency(since).orders.filter((o) => o.currency === "TWD");
    expect(twd.reduce((a, o) => a + o.castPaid, 0)).toBe(1); // the 1 日 card bought with its cast
    expect(twd.filter((o) => o.tier.startsWith("pass_")).reduce((a, o) => a + o.n, 0)).toBe(2);
  });

  it("a pass from before 10-22 (no order row) counts by its own row; a pass with its order row only once, when it was paid", () => {
    const old = upsertCustomer("p105-oldstyle@example.com", "zh-hant");
    sub(old, "pass_p105_oldstyle", T0 + 13 * H, null, T0 + 30 * D);
    expect(passCharges(T0 + 13 * H, T0 + 14 * H)).toMatchObject([{ customerId: old, days: 30 }]);
    // the cast-page 1 日 card: its subscriptions row says the same moment, its order row is the one counted
    expect(passCharges(T0, T0 + 1)).toHaveLength(1);
  });

  it("where a pass was bought: a cast means the cast page; else the page the checkout returns to; else 通卡 itself", () => {
    const ps = passSales(since, until);
    expect(ps.map((p) => p.from).sort()).toEqual(["liuyao", "tarot"]);
    expect(passFromPath("https://yaoflow.com/zh-hant/bazi/r/x?pass=1")).toBe("bazi");
    expect(passFromPath("/zh-hant/xingpan")).toBe("astro");
    expect(passFromPath("/zh-hant/account#membership")).toBe("tongka");
    expect(passFromPath(null)).toBe("tongka");
    expect(saleBucket("pass_7d")).toBe("pass");
    expect(saleBucket("hepan_pair")).toBe("mingli");
  });

  it("首张 1 日卡 → 再买通卡／开会员", () => {
    const before = firstDayPassFollowups();
    const p2 = upsertCustomer("p105-repeat@example.com", "zh-hant");
    sub(p2, "pass_p105_repeat_1", T0 - 5 * D, 1, T0 - 4 * D, "canceled");
    sub(p2, "pass_p105_repeat_2", T0 - 3 * D, 7, T0 + 4 * D);
    const p3 = upsertCustomer("p105-tomember@example.com", "zh-hant");
    sub(p3, "pass_p105_tomember", T0 - 5 * D, 1, T0 - 4 * D, "canceled");
    sub(p3, "sub_p105_tomember", T0 - 2 * D, null, T0 + 28 * D);
    const p4 = upsertCustomer("p105-month-first@example.com", "zh-hant");
    sub(p4, "pass_p105_month_first", T0 - 5 * D, 30, T0 + 25 * D); // a first pass that was not a 1 日 card: not counted
    const after = firstDayPassFollowups();
    expect(after.first - before.first).toBe(2);
    expect(after.repass - before.repass).toBe(1);
    expect(after.member - before.member).toBe(1);
  });

  it("在册 counts memberships; passes running are apart", () => {
    const s = standing(T0 + H);
    expect(s.members).toBeGreaterThanOrEqual(1);
    expect(s.passes).toBeGreaterThanOrEqual(2);
    const ms = standing(T0 + H);
    sub(upsertCustomer("p105-comp@example.com", "zh-hant"), "comp_p105", T0 - D, null, T0 + 30 * D);
    expect(standing(T0 + H).comps).toBe(ms.comps + 1);
    expect(standing(T0 + H).members).toBe(ms.members);
  });
});

describe("每日表", () => {
  it("one charge per pass; 通卡 deliveries apart; a pass holder is 通卡期内, not 会员", () => {
    const rows = dailyBreakdown([] as TrackedEvent[], since, undefined, until);
    const d = rows.find((r) => r.day === "2026-10-22")!;
    expect(d.all.money).toEqual({ readings: 1, passes: 2, memberships: 0, packs: 0 });
    expect(d.all.delivered).toEqual({ paid: 0, pass: 4, member: 3, free: 1 });
    const hist = new Map([["k", { paid: 0, free: Infinity, member: [] as [number, number][], pass: [[T0, T0 + D]] as [number, number][] }]]);
    expect(whoAt(hist, "k", T0 + H)).toBe("pass");
    expect(whoAt(hist, "k", T0 + 2 * D)).toBe("paid");
    expect(whoAt(hist, "k", T0 + H, true)).toBe("pass"); // an allowance spent inside a pass is the pass's
  });
});

describe("客户页：通卡不再出现两次", () => {
  it("a pass with its order row has no separate 「开通」 line (it said 待查); a pass with no order row (before 10-22) keeps its line", () => {
    const lines = membershipChargesForCustomer(passer);
    expect(lines.some((l) => l.id === `start_pass_${passCastSid.slice(-40)}`)).toBe(false);
    const old = upsertCustomer("p105-oldmonth@example.com", "zh-hant");
    sub(old, "pass_p105_old_month", T0 - 20 * D, null, T0 + 10 * D);
    expect(membershipChargesForCustomer(old).some((l) => l.id === "start_pass_p105_old_month")).toBe(true);
  });
});
