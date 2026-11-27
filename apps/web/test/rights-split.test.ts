import { describe, expect, it } from "vitest";
import { db, setPause, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { setFeature } from "../src/lib/features";
import { can, rightsFor, PASS_KEEPS_BEFORE_SPLIT } from "../src/lib/entitlements";
import { PASS_SPLIT_AT } from "../src/lib/sub-plan";
import { flowRightsOf } from "../src/lib/subscription";
import { flowView, madeUnder, teaser, writtenMonth } from "../src/lib/mingli/flow-view";
import { almanacLine, chartFromBirth, clashOf, myToday, type MyChart } from "../src/lib/mingli/bazi/today";
import { huangliDay } from "../src/lib/mingli/calendar/day";
import { matterBySlug, zeriDays } from "../src/lib/mingli/calendar/zeri";
import { monthSkyFor, monthSkyLines, natalPoints } from "../src/lib/mingli/astro/month-sky";
import { buildMemberLetter, letterPieces, memberLetterEligible } from "../src/lib/member-letter";
import { saveProfiles } from "../src/lib/birth-profiles";
import { myChart, myDay } from "../src/lib/my-chart";
import { priceTable, SERVICES } from "../src/lib/services";
import type { AstroFacts } from "../src/lib/mingli/astro/report-facts";

process.env.TONGKA_MODEL = "on";

/**
 * 10-22 进度表 92 「通卡看本命，會員看流年」 and 93 (a membership that ends): who sees what — the rights table, the
 * report's 運勢 chapters, the 每天 things read against a member's own chart, and the paused member's letters.
 */
const D = 86_400_000, H = 3_600_000;
const now = Date.now();
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const sub = (cid: number, id: string, o: { created?: number; status?: string; end?: number; passDays?: number } = {}) => {
  const row = upsertSubscription({
    customerId: cid, stripeCustomerId: id.startsWith("sub_") ? `cus_${id}` : null, stripeSubscriptionId: id, status: o.status ?? "active", plan: "month",
    periodStart: now - D, periodEnd: o.end ?? now + 20 * D, cancelAtPeriodEnd: !id.startsWith("sub_"), currency: "twd", amountMinor: 26900,
    passDays: id.startsWith("pass_") ? (o.passDays ?? 7) : null,
  });
  if (o.created != null) db().prepare("UPDATE subscriptions SET created_at = ? WHERE id = ?").run(o.created, row.id);
  return row;
};

describe("92 權益表：通卡看本命，會員看流年", () => {
  it("a pass bought after the split has neither the full lot nor the 運勢 chapters; one bought before keeps both to its end; a member has all", async () => {
    const fresh = upsertCustomer("rs-pass-new@example.com", "zh-hant"); sub(fresh, "pass_rs_new", { created: PASS_SPLIT_AT + H });
    const old = upsertCustomer("rs-pass-old@example.com", "zh-hant"); sub(old, "pass_rs_old", { created: PASS_SPLIT_AT - H });
    const mem = upsertCustomer("rs-member@example.com", "zh-hant"); sub(mem, "sub_rs_member", { created: PASS_SPLIT_AT + H });
    const rf = await rightsFor(fresh), ro = await rightsFor(old), rm = await rightsFor(mem);
    expect(rf.standing).toBe("pass"); expect(ro.standing).toBe("pass");
    for (const r of ["daily_qian_full", "chart_flow", "daily_personal", "member_letter"] as const) expect(can(rf, r), r).toBe(false);
    for (const r of ["deep_reading", "chart_report", "chart_qa", "tarot_reading", "qian_personal"] as const) expect(can(rf, r), r).toBe(true);
    for (const r of PASS_KEEPS_BEFORE_SPLIT) expect(can(ro, r), r).toBe(true);
    expect(can(ro, "daily_personal")).toBe(false); // it never had it
    for (const r of ["daily_qian_full", "chart_flow", "daily_personal", "chart_rewrite", "member_letter", "bigs_discount"] as const) expect(can(rm, r), r).toBe(true);
    expect(flowRightsOf({ stripe_subscription_id: "pass_x", created_at: PASS_SPLIT_AT })).toBe(false);
    expect(flowRightsOf({ stripe_subscription_id: "comp_x", created_at: PASS_SPLIT_AT + D })).toBe(true);
  });
});

describe("92／93 報告的運勢章", () => {
  it("made under a 通卡 → locked until the owner is a member; made under a membership that ended → dated; older or bought → open", () => {
    const owner = upsertCustomer("rs-flow-pass@example.com", "zh-hant");
    const pass = sub(owner, "pass_rs_flow", { created: PASS_SPLIT_AT + H });
    const row = { customer_id: owner, paid_session: `member:${pass.id}`, created_at: PASS_SPLIT_AT + 2 * H, chart_json: "{}" };
    expect(madeUnder(row.paid_session)).toBe("pass");
    expect(flowView(row)).toMatchObject({ mode: "locked", live: false });
    // the same reader becomes a member: the same report opens at once, nothing rewritten
    sub(owner, "sub_rs_flow_after");
    db().prepare("UPDATE subscriptions SET updated_at = ? WHERE stripe_subscription_id = 'sub_rs_flow_after'").run(Date.now() + 60_000);
    expect(flowView(row)).toMatchObject({ mode: "open", live: true });

    const lapsed = upsertCustomer("rs-flow-lapsed@example.com", "zh-hant");
    const m = sub(lapsed, "sub_rs_flow_lapsed", { status: "canceled", end: now - 10 * D });
    const mrow = { customer_id: lapsed, paid_session: `member:${m.id}`, created_at: now - 40 * D, chart_json: JSON.stringify({ asOf: "國曆 2026 年 9 月" }) };
    expect(madeUnder(mrow.paid_session)).toBe("member");
    expect(flowView(mrow)).toEqual({ mode: "dated", month: "2026 年 9 月", live: false });
    expect(writtenMonth({ created_at: Date.UTC(2026, 9, 31, 17), chart_json: "{}" })).toBe("2026 年 11 月"); // 11/1 01:00 台北

    // a pass bought before the split: its reports stay whole; a tester's and a bought one are open
    const early = upsertCustomer("rs-flow-early@example.com", "zh-hant");
    const ep = sub(early, "pass_rs_flow_early", { created: PASS_SPLIT_AT - 5 * D, status: "canceled", end: PASS_SPLIT_AT - 4 * D });
    expect(flowView({ customer_id: early, paid_session: `member:${ep.id}`, created_at: PASS_SPLIT_AT - 5 * D }).mode).toBe("open");
    expect(flowView({ customer_id: early, paid_session: "tester:1", created_at: now }).mode).toBe("open");
    expect(flowView({ customer_id: early, paid_session: "cs_test_abc", created_at: now }).mode).toBe("open");
    expect(madeUnder("member:ent")).toBe("member"); expect(madeUnder(null)).toBe("other");
  });

  it("the locked chapter shows two lines, never the whole text", () => {
    const long = "這一步大運走的是正財，前五年偏重在把手上的事做穩，收入來自固定的工作；後五年轉到地支，人際往來變多，合作的機會也多了起來，但要留意花費。";
    const t = teaser(long);
    expect(t.endsWith("……")).toBe(true);
    expect([...t].length).toBeLessThanOrEqual(66);
    expect(teaser("短短一句。")).toBe("短短一句。");
  });
});

describe("92 會員「你的今天」與擇日按八字再篩", () => {
  const ymd = "2026-10-22";
  const dayGz = huangliDay(2026, 10, 22).gz.day;
  const clashBranch = BRANCHES[(BRANCHES.indexOf(dayGz[1]!) + 6) % 12]!;
  const chart: MyChart = { dayMaster: "甲", dmEl: "木", dayBranch: clashBranch, monthBranch: dayGz[1]!, favour: ["水", "木"], avoid: ["金", "土"] };

  it("reads the day against the 日主 and the 日支: the 十神, 合沖刑害, a level 1–5, and 黃曆「今天對你」", () => {
    const t = myToday(chart, ymd)!;
    expect(t.dayGz).toBe(dayGz);
    expect(t.rels).toContain("冲");
    expect(t.tip).toContain("相沖");
    expect(t.level).toBeGreaterThanOrEqual(1); expect(t.level).toBeLessThanOrEqual(5);
    expect(t.line).toContain(`「${t.ten}」日`);
    expect(t.almanac).toContain("沖你的日支");
    expect(almanacLine(dayGz, { dayBranch: dayGz[1]! })).toContain("沒有沖合");
    for (const x of [t.line, t.tip ?? "", t.almanac]) expect(x).not.toMatch(/準|AI|靈驗|神明|吉凶|化解|改運|凶/);
    expect(clashOf(dayGz, clashBranch)).toEqual(["冲"]);
  });

  it("擇日: every day carries its 日柱 so a member's list can leave out the days that 沖／刑 their own", () => {
    const r = zeriDays(matterBySlug("banjia")!, ymd, 120, "zh-hant");
    expect(r.days.length).toBeGreaterThan(0);
    for (const d of r.days) expect(d.gz).toMatch(/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/);
  });

  it("a member's chart: the 生辰檔案 marked 自己 first; the page block is a teaser for anyone else", async () => {
    const cid = upsertCustomer("rs-today@example.com", "zh-hant"); sub(cid, "sub_rs_today");
    expect((await myDay(cid, ymd)).state).toBe("need");
    saveProfiles(cid, [{ id: "rsself01", who: "self", name: "我", gender: "female", input: { calendar: "solar", y: 1990, m: 5, d: 17, timeMode: "unknown" }, at: now }]);
    const c = myChart(cid)!;
    expect(c).toEqual(chartFromBirth({ calendar: "solar", y: 1990, m: 5, d: 17, timeMode: "unknown" }, "female"));
    const day = await myDay(cid, ymd);
    expect(day.state).toBe("show");
    const pass = upsertCustomer("rs-today-pass@example.com", "zh-hant"); sub(pass, "pass_rs_today", { created: PASS_SPLIT_AT + H });
    expect((await myDay(pass, ymd)).state).toBe("teaser");
    expect((await myDay(null, ymd)).state).toBe("teaser");
    // the daily letter carries it
    const p = await letterPieces(cid, "zh-hant", now);
    expect(p.me?.dayGz).toMatch(/^.{2}$/);
    expect(buildMemberLetter(p, "https://yaoflow.com", "rs-today@example.com").text).toContain("你的今天");
  });
});

describe("92 星盤「這個月的行運」", () => {
  it("the month's transits to the natal points and the retrograde stretches, in plain lines", () => {
    const af = {
      planets: [
        { name: "太陽", sign: "天秤", deg: 12 }, { name: "月亮", sign: "金牛", deg: 3 }, { name: "金星", sign: "處女", deg: 20 },
      ],
      asc: null, moonApprox: true,
    } as unknown as AstroFacts;
    expect(natalPoints(af).map((p) => p.name)).toEqual(["太陽", "金星"]);
    const sky = monthSkyFor(af, Date.UTC(2026, 9, 22, 4));
    expect(sky).toMatchObject({ year: 2026, month: 10 });
    const lines = monthSkyLines(sky);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).not.toMatch(/準|AI|靈驗|神明|吉凶|化解|改運/);
    for (const h of sky.hits) expect(["木星", "土星", "火星"]).toContain(h.planet);
  });
});

describe("92 ⑤ 暫停中的會員不收每日信與流月信", () => {
  it("memberLetterEligible follows activeMembership, which leaves a paused month out", () => {
    setFeature("tongka", "on");
    const cid = upsertCustomer("rs-paused@example.com", "zh-hant");
    const row = sub(cid, "sub_rs_paused");
    expect(memberLetterEligible(cid, "zh-hant", now)).toBe(true);
    setPause(row.id, now - D, now + 20 * D);
    expect(memberLetterEligible(cid, "zh-hant", now)).toBe(false);
    setPause(row.id, null, null);
  });
});

describe("92 價格與服務頁", () => {
  it("the membership is shown as 首月 then 之後; the 今日一籤 card carries no price (the 籤卡 is no longer sold)", () => {
    const t = priceTable();
    expect(t["month:first"]!.TWD).toBe(34900); expect(t.month!.TWD).toBe(26900);
    const tq = SERVICES.find((s) => s.id === "today-qian")!;
    expect(tq.prices ?? []).toEqual([]);
    expect(tq.line["zh-hant"]).not.toContain("籤卡");
    for (const id of ["bazi", "ziwei"]) expect(SERVICES.find((s) => s.id === id)!.priceNote!["zh-hant"]).toContain("會員");
  });
});
