import { describe, expect, it } from "vitest";

/**
 * 10-03 按阶段的转化 (Neil: 「这个面板上面能把每个阶段的所有付费客户都写上去吗？我要看具体的转化率」).
 * Nine people, written straight into the cast log and the orders, so every number on the panel can be checked by hand.
 */
const { db, upsertCustomer, recordOrder } = await import("../src/lib/db");
const { linkBrowser } = await import("../src/lib/browsers");
const { stageFunnel, personLabels, stageOf } = await import("../src/lib/stage-funnel");
const { variantStats } = await import("../src/lib/nudge");

const H = 3_600_000;
const T = Date.now();
const SINCE = T - 10 * 24 * H;

let castSeq = 0;
function cast(bid: string, n: number, ago: number, o: { thread?: number; nudge?: string; seen?: boolean; paidSid?: string; question?: string } = {}): number {
  castSeq += 1;
  const r = db().prepare(
    `INSERT INTO cast_log (bid, s, at, tz, locale, question, values_str, primary_num, thread_id, thread_n, nudge, nudge_seen, paid_sid, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(bid, `sfs${String(castSeq).padStart(6, "0")}`, T - ago, 480, "zh-hant", o.question ?? `問題 ${castSeq}`, "787878", 63, o.thread ?? null, n, o.nudge ?? null, o.seen ? 1 : null, o.paidSid ?? null, T - ago, T - ago);
  return Number(r.lastInsertRowid);
}
function thread(bid: string, title: string, n: number, firstAgo: number): number {
  return Number(db().prepare("INSERT INTO cast_threads (bid, title, topic, how, first_at, last_at, n) VALUES (?,?,?,?,?,?,?)").run(bid, title, "career", "rule", T - firstAgo, T, n).lastInsertRowid);
}
function pay(sessionId: string, ago: number, o: { tab?: string; bid?: string; customerId?: number | null; tier?: string; cents?: number; state?: "paid" | "refunded"; castId?: number } = {}): void {
  if (o.tab && o.bid) db().prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run(o.tab, o.bid, T - ago - H);
  recordOrder({ sessionId, customerId: o.customerId ?? null, castId: o.castId ?? null, tier: o.tier ?? "deep", amountCents: o.cents ?? 7500, currency: "twd", email: null, status: o.state ?? "paid", firstDeep: true, browserSid: o.tab ?? null });
  db().prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(T - ago, sessionId);
}

// A: 1st and 2nd cast on a matter, saw the block on the 2nd, bought THAT cast an hour later
const A = "a0000000000000a1";
const tA = thread(A, "換工作", 2, 10 * H);
cast(A, 1, 10 * H, { thread: tA });
cast(A, 2, 8 * H, { thread: tA, nudge: "n2-plain", seen: true, paidSid: "cs_sf_a" });
pay("cs_sf_a", 7 * H, { tab: "tabsfA", bid: A });
// B: one cast, bought a reading an hour later (not that cast's)
const B = "b0000000000000b1";
cast(B, 1, 6 * H);
pay("cs_sf_b", 5 * H, { tab: "tabsfB", bid: B });
// C: three casts on one matter, saw the block twice, never paid — still deciding at the 3rd
const C = "c0000000000000c1";
cast(C, 1, 9 * H);
cast(C, 2, 8 * H, { nudge: "n2-plain", seen: true });
cast(C, 3, 7 * H, { nudge: "n3-merge", seen: true });
// D: a customer who paid with no cast logged anywhere
const dCust = upsertCustomer("stage-d@example.com", "zh-hant");
pay("cs_sf_d", 3 * H, { customerId: dCust });
// E: one customer on two browsers — 1st cast on one, 2nd on the other, then a membership
const eCust = upsertCustomer("stage-e@example.com", "zh-hant");
const E1 = "e0000000000000e1", E2 = "e0000000000000e2";
linkBrowser(E1, eCust, "login");
linkBrowser(E2, eCust, "pay");
cast(E1, 1, 30 * H);
cast(E2, 2, 4 * H, { nudge: "n2-merge", seen: true });
db().prepare("INSERT INTO subscriptions (customer_id, stripe_customer_id, stripe_subscription_id, status, plan, created_at, updated_at, synced_at) VALUES (?,?,?,?,?,?,?,?)")
  .run(eCust, "cus_sf_e", "sub_sf_e", "active", "monthly", T - 3 * H, T - 3 * H, T - 3 * H);
// F: the 2nd cast on matter X, then a 1st cast on matter Y — and then bought matter X's cast
const F = "f0000000000000f1";
cast(F, 1, 13 * H);
cast(F, 2, 12 * H, { paidSid: "cs_sf_f" });
cast(F, 1, 11 * H);
pay("cs_sf_f", 10 * H, { tab: "tabsfF", bid: F });
// G: one cast two days ago, paid an hour ago
const G = "a0000000000000g1";
cast(G, 1, 50 * H);
pay("cs_sf_g", 1 * H, { tab: "tabsfG", bid: G });
// H: four casts on one matter in the last five hours, nothing bought
const Hb = "a0000000000000h1";
for (const [n, ago] of [[1, 5], [2, 4], [3, 3], [4, 2]] as const) cast(Hb, n, ago * H);
/** the saved cast a paid reading writes (its instant is the cast's own) */
function savedCast(ago: number): number {
  return Number(db().prepare("INSERT INTO casts (customer_id, created_at, cast_at, tz_offset, locale, question, values_str, primary_num, primary_name, chart_json) VALUES (NULL,?,?,?,?,?,?,?,?,?)")
    .run(T, T - ago, 480, "zh-hant", "q", "787878", 63, "既濟", "{}").lastInsertRowid);
}
// J: one cast — the free light reading first (the log remembers that one), then the full reading bought for the same cast
const J = "a0000000000000j1";
cast(J, 1, 15 * H, { paidSid: "gr_sf_j" });
pay("cs_sf_j", 14 * H, { tab: "tabsfJ", bid: J, castId: savedCast(15 * H) });
// I: one cast, a reading bought and refunded — still listed, still counted
const I = "a0000000000000i1";
cast(I, 1, 20 * H);
pay("cs_sf_i", 19 * H, { tab: "tabsfI", bid: I, state: "refunded" });

describe("按阶段的转化", () => {
  const fn = stageFunnel(SINCE, T);
  const st = (k: string) => fn.stages.find((s) => s.k === k)!;

  it("counts people, not casts, at every stage — and places each payment where it was made", () => {
    expect(fn.casters).toBe(9);
    expect(st("1")).toMatchObject({ reached: 9, paid: 4, cumulative: 4 });
    expect(st("2")).toMatchObject({ reached: 5, saw: 3, paid: 3, sawPaid: 2, cumulative: 7 });
    expect(st("3")).toMatchObject({ reached: 2, saw: 1, paid: 0, pending: 1, cumulative: 7 });
    expect(st("4+")).toMatchObject({ reached: 1, paid: 0, pending: 1, cumulative: 7 });
    expect(st("1").pending + st("2").pending).toBe(0); // everyone at those stages has paid since or moved on
    expect(fn.payersInCohort).toBe(7);
    expect(fn.payments).toBe(8);
  });

  it("lists every paying customer under their stage, with what they bought and how it came about", () => {
    const two = st("2").payers;
    expect(two.map((p) => p.purchase.sessionId ?? p.purchase.kind).sort()).toEqual(["cs_sf_a", "cs_sf_f", "membership"]);
    const a = two.find((p) => p.purchase.sessionId === "cs_sf_a")!;
    expect(a).toMatchObject({ forThisCast: true, gapMs: H, n: 2, matter: { title: "換工作", casts: 2 } });
    expect(a.cast).toMatchObject({ nudge: "n2-plain", nudgeSeen: true });
    // F bought matter X's 2nd cast although its last cast was a 1st one on matter Y
    expect(two.find((p) => p.purchase.sessionId === "cs_sf_f")).toMatchObject({ forThisCast: true, n: 2 });
    const e = two.find((p) => p.purchase.kind === "membership")!;
    expect(e).toMatchObject({ forThisCast: false, customerId: eCust, n: 2 });
    const one = st("1").payers;
    expect(one.map((p) => p.purchase.sessionId).sort()).toEqual(["cs_sf_b", "cs_sf_g", "cs_sf_i", "cs_sf_j"]);
    // the full reading of a cast that had a free light reading first: still "this very cast" (found by its instant)
    expect(one.find((p) => p.purchase.sessionId === "cs_sf_j")).toMatchObject({ forThisCast: true, gapMs: H });
    expect(one.find((p) => p.purchase.sessionId === "cs_sf_g")!.gapMs).toBe(49 * H); // no time limit on the stage
    expect(one.find((p) => p.purchase.sessionId === "cs_sf_i")!.purchase.state).toBe("refunded");
    expect(one.find((p) => p.purchase.sessionId === "cs_sf_b")!.forThisCast).toBe(false);
    // the one with no cast before paying is still on the panel
    expect(fn.noCast.map((p) => p.purchase.sessionId)).toEqual(["cs_sf_d"]);
  });

  it("names a customer by their address and a visitor by their browser, each linking to their trail", () => {
    const label = personLabels([{ bid: E2, customerId: null }, { bid: A, customerId: null }, { bid: null, customerId: dCust }]);
    expect(label(E2, null)).toEqual({ who: "stage-e", href: `/admin/people/c${eCust}`, known: true });
    expect(label(A, null)).toEqual({ who: "访客 a00000", href: `/admin/people/${A}`, known: false });
    expect(label(null, dCust).who).toBe("stage-d");
  });

  it("each block version lists the people who paid after seeing it", () => {
    const n2 = variantStats("n2", T, true);
    expect(n2.get("n2-plain")!.payers.map((p) => p.bid)).toEqual([A]);
    expect(n2.get("n2-merge")!.payers).toMatchObject([{ bid: E2, purchase: { kind: "membership" } }]);
    expect(variantStats("n3", T, true).get("n3-merge")!.payers).toEqual([]);
  });

  it("a narrower window is a narrower cohort: only casts made inside it count", () => {
    const today = stageFunnel(T - 6 * H, T);
    // B, C's 3rd, E2, G? (no: 50h ago), H's four casts; A's and F's casts are older than six hours
    expect(today.stages.find((s) => s.k === "1")!.reached).toBe(2); // B and H
    expect(today.stages.find((s) => s.k === "2")!.reached).toBe(2); // E and H
    expect(today.stages.find((s) => s.k === "2")!.payers.map((p) => p.purchase.kind)).toEqual(["membership"]);
    expect(stageOf(7)).toBe("4+");
  });
});

/** 10-14 按人的行为分组 (Neil: 「好，做吧」): a person's own facts — casts, the deepest matter, nights, the lines seen, the price funnel. */
describe("按人的行为分组", () => {
  it("reads each person's behaviour off their casts and events, and the table counts them once per group", async () => {
    const { cohort, personFeatures, segmentTable } = await import("../src/lib/stage-funnel");
    const co = cohort(SINCE);
    const evs = [
      { e: "price_seen", b: A, t: T - 9 * H }, { e: "reading_click", b: A, t: T - 8 * H },
      { e: "price_seen", b: "b0000000000000b1", t: T - 5 * H },
    ];
    const f = personFeatures(co, SINCE, evs);
    const a = f.get(co.person(A, null)!)!;
    expect(a.casts).toBe(2);
    expect(a.matterMax).toBe(2);
    expect(a.price).toBe("paid"); // the purchase outranks the click
    expect(["good", "mixed", "bad", "none", "mixed-bag"]).toContain(a.leanSeen);
    const t = segmentTable(SINCE, "pPrice", co, f);
    const paidRow = t.all.paid!;
    expect(paidRow.paid).toBeGreaterThan(0);
    expect(paidRow.paid).toBeLessThanOrEqual(paidRow.reached);
    // every person lands in exactly one row of a person table
    const people = new Set([...co.byPerson.entries()].filter(([, l]) => l.some((c) => c.t >= SINCE)).map(([p]) => p));
    expect(Object.values(t.all).reduce((s, c) => s + c.reached, 0)).toBe(people.size);
    const m = segmentTable(SINCE, "pMatterMax", co, f);
    expect(Object.values(m.all).reduce((s, c) => s + c.reached, 0)).toBe(people.size);
  });
});
