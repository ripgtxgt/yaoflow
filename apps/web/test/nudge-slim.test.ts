import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-06 瘦身 (Neil: 「我们目前的付费话术学习有起作用吗？」→「在改之前，我在想这么设计是不是合理的」→「好，一起做完吧」).
 * Three days of data: every purchase credited to a block came within 17 minutes, yet "not paid" waited 72 hours while
 * "paid" counted at once — the sampler saw only successes and followed early luck; a brand-new version sat at 50% against
 * incumbents at 5%; the 4th+ slot was 84 people, ten of them half its showings. So: a showing settles after 24 hours
 * (credit still 72), a version starts at its slot's pooled rate, at most two ready versions per slot, the 4th+ cast's
 * block is fixed on the membership (its button goes to the membership page), AI drafts wait for a yes.
 */
const llm = vi.hoisted(() => ({ json: [] as unknown[] }));
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  return {
    ...real,
    chatJson: vi.fn(async () => { const v = llm.json.shift(); if (v === undefined) throw new Error("no model in tests"); return v as string; }),
    chatText: vi.fn(async () => { throw new Error("no model in tests"); }),
  };
});

const { db, recordOrder } = await import("../src/lib/db");
const cl = await import("../src/lib/cast-log");
const nudge = await import("../src/lib/nudge");
const { REWARD_MS, SETTLE_MS } = await import("../src/lib/purchases");
const { stageFunnel } = await import("../src/lib/stage-funnel");
const { LOCALES } = await import("../src/lib/locales");
const { DEEP_PER_MONTH } = await import("../src/lib/sub-plan");

const H = 3_600_000;
const NOW = Date.now();
const V1: LineValue[] = [7, 8, 7, 8, 7, 8];
const V2: LineValue[] = [9, 8, 7, 7, 8, 6];
const inp = (question: string, at: number, values: LineValue[] = V1) => ({ question, values, castAtMs: at, tzOffsetMinutes: 480 });

beforeAll(() => { nudge.variants("n2"); });
afterEach(() => { llm.json.length = 0; delete process.env.NUDGE_PERSONAL; delete process.env.NUDGE_AI_MODE; });

describe("结算 24 小时，归因仍 72 小时", () => {
  it("a showing not paid for settles after 24 hours; a purchase up to 72 hours later still credits it", () => {
    expect(SETTLE_MS).toBe(24 * H);
    expect(REWARD_MS).toBe(72 * H);
    const e = (id: number, person: string, t: number) => ({ id, person, t, variant: "a", slot: "n2" as const });
    const credit = nudge.creditExposures(
      [e(1, "p", NOW - 30 * H), e(2, "q", NOW - 30 * H), e(3, "r", NOW - 20 * H), e(4, "s", NOW - 80 * H)],
      new Map([["q", [NOW - 2 * H]], ["s", [NOW - 2 * H]]]),
      NOW,
    );
    expect(credit.get(1)).toBe("no");      // 30 hours, nothing bought: settled
    expect(credit.get(2)).toBe("paid");    // bought 28 hours after seeing it: inside the 72, credited
    expect(credit.get(3)).toBe("pending"); // 20 hours: not yet
    expect(credit.get(4)).toBe("no");      // bought 78 hours later: not this block's doing
  });

  it("the stage funnel's 'still deciding' follows the same 24 hours", () => {
    const put = (bid: string, n: number, ago: number) => db().prepare(
      "INSERT INTO cast_log (bid, s, at, tz, locale, question, values_str, primary_num, thread_n, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(bid, `tabslim${bid.slice(-4)}${n}`, NOW - ago, 480, "zh-hant", "q", "787878", 1, n, NOW - ago, NOW - ago);
    put("slimslimslim0001", 2, 30 * H); // a day and a quarter ago: no longer pending
    put("slimslimslim0002", 2, 5 * H);  // this afternoon: pending
    const fn = stageFunnel(NOW - 7 * 24 * H, NOW);
    expect(fn.stages.find((s) => s.k === "2")!.pending).toBe(1);
  });
});

describe("新版本从卦位的平均率起步", () => {
  it("without a pool the plain Beta(1+paid, 1+not); with one, a prior worth 20 showings at the slot's smoothed rate", () => {
    const s = (paid: number, settled: number) => ({ id: "x", shown: settled, pending: 0, settled, paid, rate: null, pBest: null, payers: [], byTopic: {}, byLean: {} });
    expect(nudge.basePosterior(s(9, 168))).toEqual([10, 160]);
    expect(nudge.basePosterior(undefined)).toEqual([1, 1]);
    const pool = { paid: 10, settled: 200 };
    const m = 11 / 202;
    const [a, b] = nudge.basePosterior(undefined, pool);
    expect(a).toBeCloseTo(20 * m, 9);
    expect(b).toBeCloseTo(20 * (1 - m), 9);
    const [a2, b2] = nudge.basePosterior(s(9, 168), pool);
    expect(a2).toBeCloseTo(9 + 20 * m, 9);
    expect(b2).toBeCloseTo(159 + 20 * (1 - m), 9);
    // a kind-of-question cell shrinks toward that pooled-prior mean, not toward 50%
    const [c, d] = nudge.topicPosterior(undefined, "career", pool);
    expect(c / (c + d)).toBeLessThan(0.2);
    expect(nudge.poolOf([s(1, 10), s(2, 30)])).toEqual({ paid: 3, settled: 40 });
  });

  it("a new version takes about half the draws against an equal incumbent — not nine in ten", () => {
    // the incumbent: 9 paid of 168 settled; the newcomer: nothing yet; the pool is the incumbent's numbers
    const inc = { id: "inc", shown: 168, pending: 0, settled: 168, paid: 9, rate: 9 / 168, pBest: null, payers: [], byTopic: {}, byLean: {} };
    const pool = nudge.poolOf([inc]);
    let wins = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const [a1, b1] = nudge.basePosterior(inc, pool);
      const [a2, b2] = nudge.basePosterior(undefined, pool);
      if (nudge.betaSample(a2, b2) > nudge.betaSample(a1, b1)) wins += 1;
    }
    expect(wins / N).toBeGreaterThan(0.3);
    expect(wins / N).toBeLessThan(0.7);
    // the old prior for comparison: Beta(1,1) against Beta(10,160) wins nearly always
    let old = 0;
    for (let i = 0; i < N; i++) if (nudge.betaSample(1, 1) > nudge.betaSample(10, 160)) old += 1;
    expect(old / N).toBeGreaterThan(0.85);
  });
});

describe("瘦身：每格最多两个版本，第 4 卦起固定推会员", () => {
  it("the one-time cut retired what it should, once, with the words kept; the live set per slot is what was decided", () => {
    const status = (id: string) => nudge.variantById(id)?.status;
    for (const id of ["n3-merge", "n2-bad", "n4-ask", "n4-bad"]) expect(status(id), id).toBe("retired");
    expect(status("n4-personal")).toBe("active"); // 11-06: back on — the written block is the default (personal_1106)
    for (const id of ["n2-merge", "n2-plain", "n2-personal", "n3-settle", "n3-bad", "n3-personal"]) expect(status(id), id).toBe("active");
    // 11-05 进度表 141: the 4th+ cast — n4-member out (1.2%), n4-merge back, n4-pass new; n1-full out (written for no line)
    for (const id of ["n4-member", "n1-full"]) expect(status(id), id).toBe("retired");
    for (const id of ["n4-merge", "n4-pass", "n1-line", "n1-answer"]) expect(status(id), id).toBe("active");
    expect(nudge.recentRuns(100).filter((r) => r.kind === "upgrade_1105")).toHaveLength(1);
    expect(nudge.variantById("n4-merge")!.texts["zh-hant"]!.title).toBe("這件事已經問了 {n} 次");
    // applied once per database (the owner's later switches on the dashboard stand), and written in the diary
    expect(nudge.lastRun("slim_1006")).not.toBeNull();
    expect(nudge.recentRuns(100).filter((r) => r.kind === "slim_1006")).toHaveLength(1);
    expect(nudge.recentRuns(100).find((r) => r.kind === "slim_1006")!.detail).toContain("n4-personal");
    const live = (slot: "n2" | "n3" | "n4") => nudge.variants(slot).filter((v) => v.status === "active").map((v) => v.id).sort();
    expect(live("n2")).toEqual(["n2-merge", "n2-personal", "n2-plain"]);
    expect(live("n3")).toEqual(["n3-bad", "n3-personal", "n3-settle"]);
    expect(live("n4")).toEqual(["n4-merge", "n4-pass", "n4-personal"]);
  });

  it("n4-member: nine languages within the guards, names the membership's prices by placeholder, and its button goes to the membership page", () => {
    const v = nudge.variantById("n4-member")!;
    expect(v).toMatchObject({ slot: "n4", source: "seed", segment: null });
    for (const l of LOCALES) {
      const t = v.texts[l]!;
      expect(nudge.nudgeOffenses(t, l), l).toEqual([]);
      expect(t.cta, l).toContain("{month}");
      expect(t.body, l).toContain("{deep}");
      expect(t.title, l).toContain("{n}");
    }
    expect(nudge.variantGoal(v)).toBe("member");
    expect(nudge.variantGoal(nudge.variantById("n2-merge")!)).toBe("deep");
    expect(nudge.variantGoal(nudge.variantById("n2-personal")!)).toBe("deep");
    // {deep} is filled on the server, {month} / {pass} / {price} by the page (it knows the buyer's currency)
    const f = nudge.fillNudge(v.texts["zh-hant"]!, { n: 5, span: 3 }, "zh-hant");
    expect(f.title).toBe("這件事你問了 5 卦");
    expect(f.body).toContain(`${DEEP_PER_MONTH} 份深斷`);
    expect(f.body).toContain("{month}");
    expect(f.cta).toBe("開會員 {month}/月");
    // the guards: a block may name one price on its button — the reading's or the membership's, never none, never two
    expect(nudge.nudgeOffenses({ title: "t", body: "會員每月 {month}：輕解讀不限次、{deep} 份深斷，想問幾次都行。", cta: "開會員" }, "zh-hant")).toContain("cta needs {price} once");
    expect(nudge.nudgeOffenses({ title: "t", body: "會員每月 {month}：輕解讀不限次、{deep} 份深斷，想問幾次都行。", cta: "開會員 {month} 或 {price}" }, "zh-hant")).toContain("cta needs {price} once");
    expect(nudge.nudgeOffenses({ title: "t", body: "會員每月 {month}：輕解讀不限次、{deep} 份深斷，想問幾次都行。", cta: "開會員 {month}/月" }, "zh-hant")).toEqual([]);
  });

  it("11-05: the 4th cast of a matter gets a reading block (1 日通卡 or read-together), goal 'deep'; so does the 2nd", async () => {
    process.env.NUDGE_PERSONAL = "off";
    const bid = "slimslimslim0010";
    const t0 = NOW - 6 * H;
    let info: NonNullable<Awaited<ReturnType<typeof cl.logCast>>> | null = null;
    for (let i = 0; i < 4; i++) info = (await cl.logCast({ bid, input: inp("他還會回來嗎", t0 + i * H, i % 2 ? V2 : V1), locale: "zh-hant" }))!;
    expect(info!.n).toBe(4);
    const out = (await nudge.nudgeFor(info!, "zh-hant", NOW))!;
    // 11-05 进度表 141: a reading block (the 1 日通卡 or the casts read together), not the membership
    expect(out.goal).toBe("deep");
    expect(["n4-merge", "n4-pass"]).toContain(out.id);
    expect(out.title).toContain("4");
    expect(out.cta).toContain("{price}");
    // the same person, a 5th cast: still a block
    const fifth = (await cl.logCast({ bid, input: inp("他還會回來嗎", t0 + 4 * H, V2), locale: "zh-hant" }))!;
    db().prepare("UPDATE cast_log SET nudge = ?, nudge_seen = 1 WHERE id = ?").run(out.id, info!.logId);
    expect((await nudge.nudgeFor(fifth, "zh-hant", NOW))?.goal).toBe("deep");
    // a 2nd cast elsewhere: a reading block
    const other = "slimslimslim0011";
    await cl.logCast({ bid: other, input: inp("這份工作該不該換", t0), locale: "zh-hant" });
    const second = (await cl.logCast({ bid: other, input: inp("這份工作該不該換", t0 + H, V2), locale: "zh-hant" }))!;
    const o2 = (await nudge.nudgeFor(second, "zh-hant", NOW))!;
    expect(o2.goal).toBe("deep");
    expect(["n2-merge", "n2-plain"]).toContain(o2.id);
    expect(o2.cta).toContain("{price}");
  });

  it("NUDGE_AI_MODE=review parks AI drafts for a yes; auto (the 10-17 default) is where a draft goes live by itself", async () => {
    process.env.NUDGE_AI_MODE = "review";
    expect(nudge.aiMode()).toBe("review");
    llm.json.push(JSON.stringify({ variants: [{ title: "這份工作，一次看清楚", body: "工作的事每卦各說一句，深斷把幾卦合起來讀，告訴你現在卡在哪、接下來看哪幾天。", cta: "合起來看 · {price}", idea: "x" }] }), JSON.stringify({ ok: true }));
    const r = await nudge.draftVariants("n3", "zh-hant", { by: "test", count: 1, now: NOW });
    expect(r.created).toHaveLength(1);
    expect(r.created[0]!.status).toBe("draft");
    expect(nudge.variantById(r.created[0]!.id)!.status_why).toBe("review mode: waiting for a yes");
    delete process.env.NUDGE_AI_MODE;
    expect(nudge.aiMode()).toBe("auto");
  });
});

describe("10-17 全自动：数据看完直接操作", () => {
  const put = (bid: string, variant: string, n: number, i: number) => db().prepare(
    `INSERT INTO cast_log (bid, s, at, tz, locale, question, values_str, primary_num, thread_n, nudge, nudge_seen, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`,
  ).run(bid, `tabauto${String(i).padStart(5, "0")}`, NOW - 5 * 24 * H - i, 480, "zh-hant", "q", "787878", 1, n, variant, NOW - 5 * 24 * H, NOW - 5 * 24 * H);
  const pay = (bid: string, i: number) => {
    db().prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run(`tabauto${String(i).padStart(5, "0")}`, bid, NOW - 5 * 24 * H);
    recordOrder({ sessionId: `cs_auto_${i}`, customerId: null, castId: null, tier: "deep", amountCents: 7500, currency: "twd", email: null, status: "paid", firstDeep: true, browserSid: `tabauto${String(i).padStart(5, "0")}` });
    db().prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(NOW - 5 * 24 * H + H, `cs_auto_${i}`);
  };

  it("11-06: the per-reader version is never retired by the sweep (it is the default, compared with the control browsers); a slot keeps two", () => {
    // n3: settle 100 showings 5 paid, bad 100 showings 5 paid (5%); personal 160 showings 10 paid (6.25% < 7.5%)
    for (let i = 0; i < 100; i++) { put(`aaaaaaaaaa10${String(i).padStart(4, "0")}`, "n3-settle", 3, 1000 + i); if (i < 5) pay(`aaaaaaaaaa10${String(i).padStart(4, "0")}`, 1000 + i); }
    for (let i = 0; i < 100; i++) { put(`aaaaaaaaaa11${String(i).padStart(4, "0")}`, "n3-bad", 3, 2000 + i); if (i < 5) pay(`aaaaaaaaaa11${String(i).padStart(4, "0")}`, 2000 + i); }
    for (let i = 0; i < 160; i++) { put(`aaaaaaaaaa12${String(i).padStart(4, "0")}`, "n3-personal", 3, 3000 + i); if (i < 10) pay(`aaaaaaaaaa12${String(i).padStart(4, "0")}`, 3000 + i); }
    expect(nudge.retireLosers(NOW)).not.toContain("n3-personal");
    expect(nudge.variantById("n3-personal")!.status).toBe("active");
    // the two ready versions stay whatever their numbers: a slot keeps two
    expect(nudge.variantById("n3-settle")!.status).toBe("active");
    expect(nudge.variantById("n3-bad")!.status).toBe("active");
    // n2: personal 160 showings 16 paid (10%) against ready 200 showings 10 paid (5%): exactly 2× — it stays
    for (let i = 0; i < 100; i++) { put(`aaaaaaaaaa20${String(i).padStart(4, "0")}`, "n2-merge", 2, 4000 + i); if (i < 5) pay(`aaaaaaaaaa20${String(i).padStart(4, "0")}`, 4000 + i); }
    for (let i = 0; i < 100; i++) { put(`aaaaaaaaaa21${String(i).padStart(4, "0")}`, "n2-plain", 2, 5000 + i); if (i < 5) pay(`aaaaaaaaaa21${String(i).padStart(4, "0")}`, 5000 + i); }
    for (let i = 0; i < 160; i++) { put(`aaaaaaaaaa22${String(i).padStart(4, "0")}`, "n2-personal", 2, 6000 + i); if (i < 16) pay(`aaaaaaaaaa22${String(i).padStart(4, "0")}`, 6000 + i); }
    expect(nudge.retireLosers(NOW)).not.toContain("n2-personal");
    expect(nudge.variantById("n2-personal")!.status).toBe("active");
  });

  it("in auto mode a draft is live or dropped, never parked: the first passing one takes the slot's one AI seat, a doubted one and a surplus one are rejected with the reason", async () => {
    expect(nudge.aiMode()).toBe("auto");
    expect(nudge.aiMax()).toBe(1);
    llm.json.push(JSON.stringify({ variants: [
      { title: "問了這麼多次，答案在變", body: "同一件事問到現在，免費句每次只露出一角。深斷把這幾卦一起讀完，說清楚整體怎麼走。", cta: "讀完這幾卦 · {price}", idea: "x" },
      { title: "先看這件事卡在哪", body: "問到第二次，想知道的多半是這件事有沒有變。深斷會對照兩卦說清楚：哪一環卡住、現在能做的一步、哪幾天要留意。", cta: "看卡在哪 · {price}", idea: "x" },
      { title: "這件事，一次看完整", body: "前面幾卦各說了一句，深斷把它們放在一起讀，告訴你現在走到哪一步。", cta: "合起來看 · {price}", idea: "x" },
    ] }), JSON.stringify({ ok: false, why: "「答案在变」不一定成立" }), JSON.stringify({ ok: true })); // two claim checks: the third candidate finds no seat and is not read
    const r = await nudge.draftVariants("n2", "zh-hant", { by: "test", count: 3 });
    expect(r.created).toHaveLength(1);
    expect(r.created[0]!.status).toBe("active");
    expect(r.rejected.map((x) => x.why[0])).toEqual([expect.stringContaining("说法核对"), "slot full"]);
    expect(nudge.variants("n2").filter((v) => v.status === "draft")).toHaveLength(0);
    // the hourly re-read: a live AI block the check comes to doubt is retired, not parked
    db().prepare("UPDATE nudge_variants SET checked_at = NULL WHERE id = ?").run(r.created[0]!.id);
    llm.json.push(JSON.stringify({ ok: false, why: "对某些人不成立" }));
    expect(await nudge.recheckLive(NOW)).toEqual([r.created[0]!.id]);
    expect(nudge.variantById(r.created[0]!.id)!.status).toBe("retired");
    expect(nudge.variantById(r.created[0]!.id)!.status_why).toContain("说法核对拦下");
  });

  it("the weekly drafting fills only a free seat in n2 / n3 / style — never the fixed 4th+ block — and the old parked drafts were cleared once", () => {
    expect(nudge.DRAFT_SLOTS).toEqual(["n2", "n3", "style"]);
    expect(nudge.recentRuns(200).filter((r) => r.kind === "auto_1017")).toHaveLength(1); // ran once when this database was seeded
  });
});
