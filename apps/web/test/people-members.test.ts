import { describe, expect, it } from "vitest";
import { db, recordOrder, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { linkBrowser, noteBrowserEvent } from "../src/lib/browsers";
import { record, type TrackedEvent } from "../src/lib/analytics-server";
import { castsForTrail, peopleList, peopleView, personFunnel, personTrail } from "../src/lib/people";
import { cohort, stageFunnel } from "../src/lib/stage-funnel";
import { memberAt, memberSpans, personResolver, purchaseRecords } from "../src/lib/purchases";
import { homeDay } from "../src/lib/clock";

/**
 * 10-04 排除会员 (Neil, on /admin/people: 「这页应该要标明和排除会员的吧？」): a member sees no price, so their visits and
 * casts are not a funnel to convert. The lists mark them and keep them to the 「会员」 list; the funnel counts only new
 * people (not members, not people who came before) and counts a membership as paid; the stage funnel leaves their casts out.
 */

const H = 3_600_000;
const DAY = 24 * H;
const NOW = Date.now();
const SINCE = NOW - 2 * DAY;

const put = (b: string, s: string, e: TrackedEvent["e"], t: number, more: Partial<TrackedEvent> = {}) => {
  const x: TrackedEvent = { t, e, s, b, ...more };
  record(x);
  noteBrowserEvent(b, x);
};
/** a visit on `t`'s day (the browser remembering `fd` as its first day), with `casts` casts */
const visit = (b: string, s: string, t: number, casts = 0, fd = homeDay(t)) => {
  put(b, s, "page_view", t, { path: "/zh-hant/cast" });
  put(b, s, "visit_day", t, { fd, td: homeDay(t) });
  for (let i = 0; i < casts; i += 1) put(b, s, "cast_complete", t + (i + 1) * 60_000, { hex: 1 });
};
/** a cast_log row (one cast on matter `thread`, its n-th); `member` = the page said a membership covered it */
const logRow = (bid: string, t: number, thread: number, n: number, member = 0) =>
  db().prepare(
    "INSERT INTO cast_log (bid, at, tz, values_str, primary_num, thread_id, thread_n, question, created_at, updated_at, member) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  ).run(bid, t, 480, "787878", 1, thread, n, "test question", t, t, member);
const sub = (cid: number, id: string, status: string, createdAt: number, periodEnd: number | null) => {
  upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: id, status, plan: "month", periodStart: createdAt, periodEnd, cancelAtPeriodEnd: false });
  db().prepare("UPDATE subscriptions SET created_at = ? WHERE stripe_subscription_id = ?").run(createdAt, id);
};

const B = {
  member: "eeeeeeeeeeee0001", flagged: "eeeeeeeeeeee0002", joiner: "eeeeeeeeeeee0003", lapsed: "eeeeeeeeeeee0004",
  plain: "eeeeeeeeeeee0005", ended: "eeeeeeeeeeee0006", oldDay: "eeeeeeeeeeee0007", oldAccount: "eeeeeeeeeeee0008",
  twoA: "eeeeeeeeeeee0010", twoB: "eeeeeeeeeeee0011",
};

// a member all along: three casts on one matter, no reading bought — and an extra reading at the member's price
const cm = upsertCustomer("pm-member@example.com", "zh-hant");
linkBrowser(B.member, cm, "signed-in");
sub(cm, "sub_pm_member", "active", SINCE - 10 * DAY, NOW + 20 * DAY);
visit(B.member, "pmtab0000001", NOW - 20 * H, 3);
for (let i = 0; i < 3; i += 1) logRow(B.member, NOW - 20 * H + (i + 1) * 60_000, 9001, i + 1);
recordOrder({ sessionId: "cs_pm_member_extra", customerId: cm, castId: null, tier: "deep", amountCents: 299, currency: "usd", email: "pm-member@example.com", status: "paid", firstDeep: false, browserSid: "pmtab0000001" });

// a browser never filed under anyone, whose cast the page said a membership covered
visit(B.flagged, "pmtab0000002", NOW - 10 * H, 1);
logRow(B.flagged, NOW - 10 * H + 60_000, 9002, 1, 1);

// new, cast once, then bought a single month: a conversion
const cj = upsertCustomer("pm-joiner@example.com", "zh-hant");
linkBrowser(B.joiner, cj, "pay");
visit(B.joiner, "pmtab0000003", NOW - 30 * H, 1);
logRow(B.joiner, NOW - 30 * H + 60_000, 9003, 1);
sub(cj, "pass_pm_joiner", "active", NOW - 10 * H, NOW + 20 * DAY);

// a member long ago (ended before the window): sees prices again
const cl = upsertCustomer("pm-lapsed@example.com", "zh-hant");
linkBrowser(B.lapsed, cl, "login");
sub(cl, "sub_pm_lapsed", "canceled", SINCE - 60 * DAY, SINCE - 20 * DAY);
visit(B.lapsed, "pmtab0000004", NOW - 5 * H, 1);

// new, three casts on one matter, never paid
visit(B.plain, "pmtab0000005", NOW - 8 * H, 3);
for (let i = 0; i < 3; i += 1) logRow(B.plain, NOW - 8 * H + (i + 1) * 60_000, 9005, i + 1);

// a member when they came, whose membership ran out yesterday
const ce = upsertCustomer("pm-ended@example.com", "zh-hant");
linkBrowser(B.ended, ce, "signed-in");
sub(ce, "sub_pm_ended", "canceled", SINCE - 30 * DAY, NOW - DAY);
visit(B.ended, "pmtab0000006", SINCE + H, 1);

// came before the window: the browser remembers an older first day / the account is older
visit(B.oldDay, "pmtab0000007", NOW - 6 * H, 1, homeDay(SINCE - 5 * DAY));
const co = upsertCustomer("pm-old@example.com", "zh-hant");
db().prepare("UPDATE customers SET first_seen = ? WHERE id = ?").run(SINCE - 5 * DAY, co);
linkBrowser(B.oldAccount, co, "login");
visit(B.oldAccount, "pmtab0000008", NOW - 7 * H, 1);

// one person on two browsers, two days: a cast on each, then a reading bought on the second
const cp = upsertCustomer("pm-two@example.com", "zh-hant");
visit(B.twoA, "pmtab0000010", NOW - 40 * H, 1);
visit(B.twoB, "pmtab0000011", NOW - 2 * H, 1);
recordOrder({ sessionId: "cs_pm_two_1", customerId: cp, castId: null, tier: "deep", amountCents: 7500, currency: "twd", email: "pm-two@example.com", status: "paid", firstDeep: true, browserSid: "pmtab0000011" });
linkBrowser(B.twoA, cp, "pay");
linkBrowser(B.twoB, cp, "pay");

const bids = (rows: { bid: string }[]) => rows.map((r) => r.bid).sort();

describe("按人看：标明会员、默认不含会员", () => {
  it("every list but 「会员」 leaves members out — a member now, one whose membership ran out in the window, one the page flagged", () => {
    expect(bids(peopleList(SINCE))).toEqual([B.joiner, B.lapsed, B.plain, B.oldDay, B.oldAccount, B.twoA, B.twoB].sort());
    expect(bids(peopleList(SINCE, "member"))).toEqual([B.member, B.flagged, B.ended].sort());
    const v = peopleView(SINCE);
    expect(v).toMatchObject({ members: 3, total: 7 });
    // the total counts every browser the filter keeps, also past the newest few the list shows
    expect(peopleView(SINCE, "all", 2)).toMatchObject({ total: 7, members: 3 });
    expect(peopleView(SINCE, "all", 2).rows).toHaveLength(2);
    expect(peopleView(SINCE, "repeat").total).toBe(1);
    expect(peopleView(SINCE, "member").total).toBe(3);
    const m = peopleList(SINCE, "member");
    expect(m.find((r) => r.bid === B.member)).toMatchObject({ member: true, memberNow: true, customerId: cm, who: "pm-member" });
    expect(m.find((r) => r.bid === B.ended)).toMatchObject({ member: true, memberNow: false });
    expect(m.find((r) => r.bid === B.flagged)).toMatchObject({ member: true, memberNow: true, customerId: null });
  });

  it("a member asking one matter three times is not 「问 3 次以上没付钱」; a new member and a lapsed one count as paid", () => {
    expect(bids(peopleList(SINCE, "repeat"))).toEqual([B.plain]);
    expect(bids(peopleList(SINCE, "unpaid"))).toEqual([B.plain, B.oldDay, B.oldAccount].sort());
    expect(bids(peopleList(SINCE, "paid"))).toEqual([B.joiner, B.lapsed, B.twoA, B.twoB].sort());
    const all = peopleList(SINCE);
    const j = all.find((r) => r.bid === B.joiner)!;
    expect(j).toMatchObject({ member: false, everPaid: true, paidOrders: 0 });
    expect(j.joinedAt).toBe(NOW - 10 * H);
    expect(all.find((r) => r.bid === B.lapsed)).toMatchObject({ member: false, lapsed: true, everPaid: true, joinedAt: null });
    // what a person paid is theirs on every browser
    expect(all.find((r) => r.bid === B.twoA)).toMatchObject({ paidOrders: 1, everPaid: true, customerId: cp });
    expect(all.find((r) => r.bid === B.plain)).toMatchObject({ member: false, lapsed: false, everPaid: false, maxThread: 3 });
  });

  it("the trail names the memberships and marks the casts a membership covered", () => {
    const tr = personTrail({ customerId: cm });
    expect(tr.memberships).toMatchObject([{ kind: "monthly", to: null }]);
    const { casts } = castsForTrail(tr.bids, SINCE, tr.memberships.map((x) => [x.from, x.to ?? Infinity]));
    expect(casts).toHaveLength(3);
    expect(casts.every((c) => c.member)).toBe(true);
    expect(personTrail({ customerId: ce }).memberships).toMatchObject([{ kind: "monthly", to: NOW - DAY }]);
    expect(personTrail({ customerId: cj }).memberships).toMatchObject([{ kind: "month", to: expect.any(Number) }]); // 11-01: a 通卡 runs to its own end
    expect(castsForTrail([B.plain], SINCE).casts.some((c) => c.member)).toBe(false);
    expect(castsForTrail([B.flagged], SINCE).casts[0]!.member).toBe(true);
  });
});

describe("按人漏斗：只算新来的人，开会员算付钱", () => {
  it("counts people, not browsers; leaves out members and people who came before; a membership is a payment", () => {
    const f = personFunnel(SINCE);
    expect(f).toMatchObject({ people: 3, members: 3, old: 3, cast: 3, back: 1, paid: 2, paidBy: { reading: 1, membership: 1 } });
    // the joiner cast once before paying (day 1); the two-browser person twice, on their second day
    expect(f.castsBeforePaid).toEqual({ "1": 1, "2": 1, "3": 0, "4+": 0 });
    expect(f.payDay).toEqual({ "1": 1, "2": 1, "3": 0, "4+": 0 });
    expect(f.byCasts).toEqual([{ k: "1", n: 1, paid: 1 }, { k: "2", n: 1, paid: 1 }, { k: "3", n: 1, paid: 0 }, { k: "4+", n: 0, paid: 0 }]);
  });
});

describe("付费话术面板：会员的卦不算", () => {
  it("the cohort leaves out casts a membership covered, and a member's extra reading is not a conversion", () => {
    const co2 = cohort(SINCE);
    expect(co2.casts.map((c) => c.bid).sort()).toEqual([B.joiner, B.plain, B.plain, B.plain].sort());
    expect(co2).toMatchObject({ memberCasts: 4, memberPeople: 2 });
    const sf = stageFunnel(SINCE, Date.now(), co2);
    expect(sf.casters).toBe(2);
    // the single month (placed at the joiner's cast) and the two-browser reading (no cast logged); not the member's extra
    expect(sf.payments).toBe(2);
    expect(sf.stages[0]).toMatchObject({ k: "1", reached: 2, paid: 1 });
    expect(sf.stages[0]!.payers[0]!.purchase).toMatchObject({ kind: "membership", plan: "month" });
    expect(sf.noCast.map((p) => p.purchase.sessionId)).toEqual(["cs_pm_two_1"]);
  });

  it("a single month bought outright is a purchase; spans say when someone was a member", () => {
    const person = personResolver();
    const recs = purchaseRecords(SINCE, person);
    expect(recs.get(person(B.joiner, null)!)).toMatchObject([{ kind: "membership", t: NOW - 10 * H }]);
    const spans = memberSpans(person);
    expect(memberAt(spans, person(B.member, null), NOW)).toBe(true);
    expect(memberAt(spans, person(B.ended, null), NOW - 2 * DAY + H)).toBe(true);
    expect(memberAt(spans, person(B.ended, null), NOW)).toBe(false);
    expect(memberAt(spans, person(B.joiner, null), NOW - 30 * H)).toBe(false);
    expect(memberAt(spans, person(B.plain, null), NOW)).toBe(false);
  });
});
