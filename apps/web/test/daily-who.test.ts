import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { TrackedEvent } from "../src/lib/analytics-server";

/**
 * 10-03 每日表 (Neil: 「在这个表上面显示各个阶段的转化率，然后也要区分会员，免费，付费的」→ 两种都做):
 * deliveries split by why, money counted from the orders and memberships, every step split by who the visitor was.
 */
const { db, upsertCustomer, recordOrder, createSession } = await import("../src/lib/db");
const { linkBrowser, BID_COOKIE } = await import("../src/lib/browsers");
const { computeStats } = await import("../src/lib/analytics-server");
const w = await import("../src/lib/daily-who");
const { POST: trackPOST } = await import("../src/app/api/track/route");

const H = 3_600_000, D = 86_400_000, M = 60_000;
const DAY0 = Date.parse("2026-10-03T04:00:00Z"); // 12:00 in the house clock (UTC+8): 10-03
const since = DAY0 - D - H;

const ev = (t: number, e: TrackedEvent["e"], s: string, b?: string, x: Partial<TrackedEvent> = {}): TrackedEvent => ({ t, e, s, ...(b ? { b } : {}), ...x });
const vd = (t: number, s: string, b?: string) => ev(t, "visit_day", s, b, { fd: "2026-10-01", td: new Date(t + 8 * H).toISOString().slice(0, 10) });
function order(sid: string, t: number, status: string, o: { cid?: number | null; bs?: string | null; cents?: number | null } = {}): void {
  recordOrder({ sessionId: sid, customerId: o.cid ?? null, castId: null, tier: "deep", amountCents: o.cents === undefined ? (status === "paid" ? 7500 : null) : o.cents, currency: "twd", email: null, status, browserSid: o.bs ?? null });
  db().prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(t, sid);
}
function sub(cid: number, id: string, status: string, created: number, periodEnd: number | null): void {
  db().prepare(`INSERT INTO subscriptions (customer_id, stripe_subscription_id, status, plan, period_start, period_end, cancel_at_period_end, created_at, updated_at, synced_at)
                VALUES (?,?,?,?,?,?,0,?,?,?)`).run(cid, id, status, "month", created, periodEnd, created, created, created);
}
const tab = (s: string, bid: string, t: number) => db().prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run(s, bid, t);

// the people
const A = "aaaa000000000001", MB = "eeee000000000001", F = "ffff000000000001", P = "dddd000000000001", N = "cccc000000000001", L = "bbbb000000000001";
const custA = upsertCustomer("dw-a@example.com", "zh-hant");
const custM = upsertCustomer("dw-m@example.com", "zh-hant");
const custF = upsertCustomer("dw-f@example.com", "zh-hant");
const custP = upsertCustomer("dw-p@example.com", "zh-hant");
const custL = upsertCustomer("dw-l@example.com", "zh-hant");
const custT = upsertCustomer("dw-test@example.com", "zh-hant");
db().prepare("UPDATE customers SET test_flag = 1 WHERE id = ?").run(custT);
linkBrowser(A, custA, "pay", DAY0 + 10 * M);
linkBrowser(MB, custM, "redeem", DAY0 - 20 * D);
linkBrowser(F, custF, "claim", DAY0 - 5 * D);
linkBrowser(P, custP, "pay", DAY0 - 40 * D);
// history
sub(custM, "sub_dw_m", "active", DAY0 - 20 * D, DAY0 + 10 * D);                 // a member now
order("gr_dw_f_old", DAY0 - 5 * D, "gift", { cid: custF });                     // had a free reading
sub(custP, "pass_dw_p", "canceled", DAY0 - 40 * D, DAY0 - 10 * D);              // a single month, ended: paid before
order("cs_dw_l_old", DAY0 - 30 * D, "paid", { cid: custL });                    // paid long ago, browser not filed yet
// 10-03
for (const [s, b] of [["tabA1", A], ["tabM1", MB], ["tabF1", F], ["tabP1", P], ["tabN1", N], ["tabL1", L]] as const) tab(s, b, DAY0);
order("cs_dw_a", DAY0 + 10 * M, "paid", { cid: custA, bs: "tabA1" });           // the new visitor pays in their first session
order("sub_dw_m_use", DAY0 + H + M, "subscription", { cid: custM, bs: "tabM1" });
db().prepare("INSERT INTO member_packs (customer_id, session_id, units, currency, amount_minor, created_at) VALUES (?,?,?,?,?,?)").run(custM, "cs_dw_pack", 5, "twd", 30000, DAY0 + 90 * M);
order("cs_dw_p", DAY0 + 3 * H + 5 * M, "paid", { cid: custP, bs: "tabP1" });
order("gr_dw_n", DAY0 + 4 * H + M, "invite_light", { bs: "tabN1" });            // a newcomer's free first light reading
order("cs_dw_test", DAY0 + 2 * H, "paid", { cid: custT });                       // ours: left out
order("cs_dw_flag", DAY0 + 2 * H, "paid", {});
// one more newcomer, in two tabs: pays in the first, casts twice more in the second — one person, one group all day
const Q = "9999000000000001";
tab("tabQ1", Q, DAY0 + 7 * H); tab("tabQ2", Q, DAY0 + 7 * H + 20 * M);
order("cs_dw_q", DAY0 + 7 * H + 5 * M, "paid", { bs: "tabQ1" });
db().prepare("UPDATE orders SET test_flag = 1 WHERE session_id = ?").run("cs_dw_flag");
sub(upsertCustomer("dw-x@example.com", "zh-hant"), "comp_dw_x", "active", DAY0 + 2 * H, null); // complimentary: not money
sub(custF, "sub_dw_incomplete", "incomplete", DAY0 + 2 * H, null);              // checkout never finished
// 10-04: A comes back, then becomes a member
sub(custA, "sub_dw_a", "active", DAY0 + D + H, DAY0 + 31 * D);

const evs: TrackedEvent[] = [
  // 10-02: no browser ids yet
  vd(DAY0 - D, "tabOld"), ev(DAY0 - D + M, "cast_complete", "tabOld"),
  // 10-03
  vd(DAY0, "tabA1", A), ev(DAY0 + M, "cast_complete", "tabA1", A), ev(DAY0 + 2 * M, "cast_complete", "tabA1", A), ev(DAY0 + 3 * M, "reading_click", "tabA1", A), ev(DAY0 + 4 * M, "checkout_start", "tabA1", A),
  ev(DAY0 + 10 * M, "purchase", "cs_dw_a".slice(-12), undefined, { method: "paid" }), // the server's delivery record: not a session
  vd(DAY0 + H, "tabM1", MB), ev(DAY0 + H, "cast_complete", "tabM1", MB), ev(DAY0 + H + M, "sub_redeem", "tabM1", MB),
  vd(DAY0 + 2 * H, "tabF1", F), ev(DAY0 + 2 * H, "cast_complete", "tabF1", F), ev(DAY0 + 2 * H + M, "reading_click", "tabF1", F),
  vd(DAY0 + 3 * H, "tabP1", P), ev(DAY0 + 3 * H, "cast_complete", "tabP1", P), ev(DAY0 + 3 * H + M, "reading_click", "tabP1", P), ev(DAY0 + 3 * H + 2 * M, "checkout_start", "tabP1", P),
  vd(DAY0 + 4 * H, "tabN1", N), ev(DAY0 + 4 * H, "cast_complete", "tabN1", N), ev(DAY0 + 4 * H, "reading_click", "tabN1", N), ev(DAY0 + 4 * H, "gift_claim", "tabN1", N),
  ev(DAY0 + 5 * H, "page_view", "tabU1"), ev(DAY0 + 5 * H + M, "cast_complete", "tabU1"), // cookies blocked
  vd(DAY0 + 6 * H, "tabL1", L), ev(DAY0 + 6 * H, "cast_complete", "tabL1", L),
  vd(DAY0 + 7 * H, "tabQ1", Q), ev(DAY0 + 7 * H + M, "cast_complete", "tabQ1", Q), ev(DAY0 + 7 * H + 2 * M, "reading_click", "tabQ1", Q), ev(DAY0 + 7 * H + 3 * M, "checkout_start", "tabQ1", Q),
  ev(DAY0 + 7 * H + 20 * M, "cast_complete", "tabQ2", Q), ev(DAY0 + 7 * H + 25 * M, "cast_complete", "tabQ2", Q), ev(DAY0 + 7 * H + 26 * M, "reading_click", "tabQ2", Q),
  // 10-04
  vd(DAY0 + D, "tabA2", A), ev(DAY0 + D + M, "cast_complete", "tabA2", A),
];

const zero = { delivered: { paid: 0, pass: 0, member: 0, free: 0 }, money: { readings: 0, passes: 0, memberships: 0, packs: 0 } };

describe("交付拆三种、付费按真金白银", () => {
  it("names why each order was handed over — the old status column when the split is missing", () => {
    expect(w.orderKind({ kind: "purchase", status: "paid" })).toBe("paid");
    expect(w.orderKind({ kind: "membership", status: "subscription" })).toBe("member");
    for (const k of ["painted_door", "joint", "referral_reward", "revisit_reward", "invite_free", "gift_cast", "case_reward", "goodwill"]) expect(w.orderKind({ kind: k, status: "x" })).toBe("free");
    expect(w.orderKind({ kind: null, status: "reward" })).toBe("free");
    expect(w.orderKind({ kind: null, status: "refunded" })).toBe("paid");
  });

  it("per day: the steps in people, deliveries by kind, money from the orders, memberships and packs", () => {
    const rows = w.dailyBreakdown(evs, since);
    expect(rows.map((r) => r.day)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
    const d3 = rows[1]!.all;
    // Q cast in two tabs: one 起卦人, three casts, one tap
    expect(d3).toMatchObject({ visitors: 7, sessions: 9, casters: 8, casts: 11, taps: 5, tapsBlocked: 0, claims: 4 });
    expect(d3.delivered).toEqual({ paid: 3, pass: 0, member: 1, free: 1 });
    expect(d3.money).toEqual({ readings: 3, passes: 0, memberships: 0, packs: 1 }); // the comp month and the unfinished checkout are not money; ours are left out
    expect(w.moneyOf(d3)).toBe(4);
    expect(w.deliveredOf(d3)).toBe(5);
    expect(rows[2]!.all.money.memberships).toBe(1);
    // computeStats counts tabs (and the server's delivery record as one more): 10 sessions, 9 casting tabs — the table now counts people
    const old = computeStats(evs.filter((e) => e.t >= since)).byDay.find((r) => r.day === "2026-10-03")!;
    expect({ visitors: old.visitors, sessions: old.sessions, casters: old.casters, casts: old.casts, taps: old.taps }).toEqual({ visitors: 7, sessions: 10, casters: 9, casts: 11, taps: 6 });
    // a day before browser ids: people are tabs, the numbers as they always were
    const old2 = computeStats(evs.filter((e) => e.t >= since)).byDay.find((r) => r.day === "2026-10-02")!;
    expect({ visitors: rows[0]!.all.visitors, sessions: rows[0]!.all.sessions, casters: rows[0]!.all.casters }).toEqual({ visitors: old2.visitors, sessions: old2.sessions, casters: old2.casters });
  });
});

describe("按身份分开", () => {
  it("each session goes to what its person was when it began; deliveries and money to the session they happened in", () => {
    const rows = w.dailyBreakdown(evs, since);
    expect(rows[0]!.who).toBeNull(); // 10-02: no browser ids, no groups
    const g = rows[1]!.who!;
    // Q stays a newcomer all day, though their second tab came after they paid
    expect(g.none).toMatchObject({ visitors: 4, sessions: 5, casters: 4, casts: 7, taps: 3, claims: 3, delivered: { paid: 2, member: 0, free: 1 }, money: { readings: 2, memberships: 0, packs: 0 } });
    expect(g.member).toMatchObject({ visitors: 1, sessions: 1, casters: 1, taps: 0, delivered: { paid: 0, member: 1, free: 0 }, money: { readings: 0, memberships: 0, packs: 1 } });
    expect(g.free).toMatchObject({ visitors: 1, sessions: 1, casters: 1, taps: 1, claims: 0, ...zero });
    expect(g.paid).toMatchObject({ visitors: 1, sessions: 1, casters: 1, taps: 1, claims: 1, delivered: { paid: 1, member: 0, free: 0 }, money: { readings: 1, memberships: 0, packs: 0 } });
    expect(g.unknown).toMatchObject({ visitors: 0, sessions: 1, casters: 1, casts: 1 });
    // the groups add up to the whole day
    const sum = (k: "visitors" | "sessions" | "casters" | "casts" | "taps" | "claims") => w.WHO_ORDER.reduce((a, x) => a + (g[x][k] ?? 0), 0);
    expect([sum("visitors"), sum("sessions"), sum("casters"), sum("casts"), sum("taps"), sum("claims")]).toEqual([7, 9, 8, 11, 5, 4]);
    // the next day the new visitor who paid is a payer, and the membership they start is counted there
    expect(rows[2]!.who!.paid).toMatchObject({ sessions: 1, casters: 1, money: { readings: 0, memberships: 1, packs: 0 } });
  });

  it("a browser filed under its customer later puts its earlier sessions right", () => {
    expect(w.dailyBreakdown(evs, since)[1]!.who!.none.sessions).toBe(5);
    linkBrowser(L, custL, "signed-in", DAY0 + 2 * D);
    const g = w.dailyBreakdown(evs, since)[1]!.who!;
    expect(g.none.sessions).toBe(4);
    expect(g.paid.sessions).toBe(2);
  });

  it("whoAt: a running membership first, then paid before, then a free reading before", () => {
    const hist = new Map([["p", { paid: 100, free: 50, member: [[200, 300]] as [number, number][] }]]);
    expect(w.whoAt(hist, "p", 250)).toBe("member");
    expect(w.whoAt(hist, "p", 350)).toBe("paid");
    expect(w.whoAt(hist, "p", 80)).toBe("free");
    expect(w.whoAt(hist, "p", 40)).toBe("none");
    expect(w.whoAt(hist, "q", 40)).toBe("none");
    expect(w.whoAt(hist, null, 40)).toBe("unknown");
    expect(w.whoAt(hist, null, 40, true)).toBe("member"); // spent an allowance unit
  });

  it("a signed-in browser is filed under its customer when it is tracked (the sign-in may be older than the browser id)", async () => {
    const cid = upsertCustomer("dw-signed@example.com", "zh-hant");
    const sid = "ab".repeat(32);
    createSession(sid, cid, 30 * D);
    const bid = "abab000000000009";
    const post = () => trackPOST(new NextRequest("http://localhost/api/track", {
      method: "POST", headers: { "content-type": "application/json", cookie: `${BID_COOKIE}=${bid}; yf_session=${sid}` },
      body: JSON.stringify({ e: "page_view", s: "tabsigned001", path: "/zh-hant" }),
    }));
    await post();
    await post();
    expect(db().prepare("SELECT customer_id, how FROM browser_links WHERE bid = ?").all(bid)).toEqual([{ customer_id: cid, how: "signed-in" }]);
  });
});
