import { describe, expect, it } from "vitest";
import { normalizeBirth } from "@/lib/mingli/birth/normalize";
import {
  ASTRO_CURVE_W, astroDateOffense, astroFacts, astroReportOffense, astroReportStaticStrings, astroReportYears, astroYearAt, asDeepChapters,
  asGroupKeys, keyMonthsA,
} from "@/lib/mingli/astro/report-facts";
import { eclipsesOf, lonAt, retrogrades, solarReturn } from "@/lib/mingli/astro/report-sky";
import { asPartOffense, createAstroReport, astroReport, paidAstroReportFor, shapeAstroBook, shapeAstroDeep } from "@/lib/mingli/astro/report";

/**
 * 10-20 星盤②③ 付費報告: the sky of a year (solar return, retrogrades, eclipses), facts free of birth data, the banned-word
 * and 國曆 date checks, the writing calls, and 同一年只收一次錢.
 */
const OCT_20_2026 = Date.UTC(2026, 9, 20, 4);
const place = { id: "1668341", name: "Taipei Daan", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" };
const birth = () => normalizeBirth({ calendar: "solar", y: 1990, m: 5, d: 17, timeMode: "exact", h: 12, mi: 30, place });
const noTime = () => normalizeBirth({ calendar: "solar", y: 1990, m: 5, d: 17, timeMode: "unknown", placeId: "tw-tpe" });
const ymd = (s: string) => { const [m, d] = s.split("/").map(Number); return Date.UTC(2026, m! - 1, d!); };

describe("years are calendar years (UTC+8)", () => {
  it("this year and next", () => {
    expect(astroYearAt(OCT_20_2026)).toBe(2026);
    expect(astroYearAt(Date.UTC(2026, 11, 31, 17))).toBe(2027); // 01:00 on 1 January in Taipei
    expect(astroReportYears("year", OCT_20_2026, 2027)).toEqual([2027]);
    expect(astroReportYears("year", OCT_20_2026, 2031)).toEqual([2026]);
    expect(astroReportYears("deep", OCT_20_2026)).toEqual([2026]);
  });
});

describe("the sky of 2026", () => {
  it("solar return: within a minute of a minute-by-minute search", () => {
    const sun = lonAt("太陽", Date.UTC(1990, 4, 17, 4, 30));
    const t = solarReturn(sun, 2026, "Asia/Taipei")!;
    let best = 0, bd = 9;
    for (let ms = t - 2 * 86_400_000; ms < t + 2 * 86_400_000; ms += 60_000) {
      const d = Math.abs(((lonAt("太陽", ms) - sun + 540) % 360) - 180);
      if (d < bd) { bd = d; best = ms; }
    }
    expect(Math.abs(t - best)).toBeLessThanOrEqual(60_000);
  });
  it("水星 retrograde: 2/26–3/20, 6/29–7/23, 10/24–11/13 (±1 day)", () => {
    const r = retrogrades("水星", 2026, "UTC", null);
    const want = [["2/26", "3/20"], ["6/29", "7/23"], ["10/24", "11/13"]];
    expect(r).toHaveLength(3);
    r.forEach((x, i) => {
      expect(Math.abs(ymd(x.from) - ymd(want[i]![0]!))).toBeLessThanOrEqual(86_400_000);
      expect(Math.abs(ymd(x.to) - ymd(want[i]![1]!))).toBeLessThanOrEqual(86_400_000);
    });
  });
  it("eclipses: 2/17 annular solar, 3/3 total lunar, 8/12 total solar, 8/28 partial lunar", () => {
    expect(eclipsesOf(2026, "UTC").map((e) => `${e.date} ${e.kind}`)).toEqual(["2/17 日環食", "3/3 月全食", "8/12 日全食", "8/28 月偏食"]);
  });
});

describe("chart_json carries computed facts only", () => {
  for (const kind of ["deep", "year"] as const) {
    it(`${kind}: deterministic, no birth date, time, place or name`, () => {
      const a = astroFacts(birth(), kind, OCT_20_2026), b = astroFacts(birth(), kind, OCT_20_2026);
      expect(a).toEqual(b);
      const j = JSON.stringify(a);
      for (const bad of ["1990", "5/17", "5月17", "12:30", "Taipei", "Daan", "121.5", "25.03", "Asia/", "utcMs", "lon\""]) expect(j).not.toContain(bad);
      for (const key of ["solarDate", "clock", "place", "tz", "name", "utcMs"]) expect(Object.keys(a)).not.toContain(key);
      expect(a.timeKnown).toBe(true);
      expect(a.planets).toHaveLength(10);
      expect(a.houses).toHaveLength(12);
    });
  }
  it("a year report: twelve 國曆 months, the eclipses in natal houses, a solar return without its date", () => {
    const b = astroFacts(birth(), "year", OCT_20_2026).book!;
    expect(b.months.map((m) => m.label)).toEqual(Array.from({ length: 12 }, (_, i) => `國曆 ${i + 1} 月`));
    expect(b.eclipses.map((e) => e.date)).toEqual(["2/17", "3/3", "8/13", "8/28"]); // Taipei dates
    for (const e of b.eclipses) expect(e.house).not.toBeNull();
    expect(b.sr).not.toBeNull();
    expect(Object.keys(b.sr!)).not.toContain("date");
    for (const m of b.months) { expect(m.level).toBeGreaterThanOrEqual(1); expect(m.level).toBeLessThanOrEqual(5); }
    expect(b.slow.find((s) => s.planet === "土星")!.ingresses.some((g) => g.kind === "sign" && g.to === "牡羊")).toBe(true);
  });
  it("without a birth time: no houses, no 上升, no solar return, the 上升 chapter left out", () => {
    const f = astroFacts(noTime(), "year", OCT_20_2026);
    expect(f.timeKnown).toBe(false);
    expect(f.asc).toBeNull();
    expect(f.houses).toBeNull();
    expect(f.book!.sr).toBeNull();
    expect(f.book!.hits.every((h) => h.point === "太陽" || h.point === h.planet)).toBe(true);
    expect(asDeepChapters(false).map((c) => c.key)).not.toContain("shangsheng");
    expect(asDeepChapters(true)).toHaveLength(10);
  });
});

describe("curve rules", () => {
  it("weights are the documented ones", () => {
    expect(ASTRO_CURVE_W.base).toBe(3);
    expect(ASTRO_CURVE_W.jupSoft).toBe(1);
    expect(ASTRO_CURVE_W.satHard).toBe(-1);
  });
  it("key months", () => {
    const m = (score: number, flags: string[] = []) => ({ score, flags });
    const months = [m(2, ["土星壓力"]), m(2.5), m(4), m(4.5), m(3, ["外行星正相位"]), m(3), m(1.5), m(3), m(3), m(3), m(3), m(3)];
    expect(keyMonthsA(months)).toEqual({ smooth: 3, slow: 6, pivot: 4 });
  });
});

describe("banned words and dates", () => {
  it("catches the 八字 list plus fate words and English", () => {
    for (const s of ["這張盤很精準", "今年大吉", "要化解", "前世的業力", "宿命", "水逆很倒楣", "你的ASC在雙子", "保證成功"]) expect(astroReportOffense(s)).not.toBeNull();
    for (const s of ["準備好再出發", "土星刑太陽，壓力會逼你行動", "T三角讓你很有衝勁"]) expect(astroReportOffense(s)).toBeNull();
  });
  it("everything is 國曆: months and dates labelled, dates from the facts", () => {
    const b = astroFacts(birth(), "year", OCT_20_2026).book!;
    const merc = b.retro.find((r) => r.planet === "水星")!;
    expect(astroDateOffense({ a: `國曆 ${merc.from}–${merc.to} 水星逆行，國曆 3 月要多確認，國曆 1–3 月放慢。` }, b)).toBeNull();
    expect(astroDateOffense({ a: "這三個月、十二個月、每個月都一樣" }, b)).toBeNull();
    expect(astroDateOffense({ a: "三月要放慢" }, b)).toMatch(/^lunar/);
    expect(astroDateOffense({ a: "農曆新年前後" }, b)).toMatch(/^lunar/);
    expect(astroDateOffense({ a: "3月要放慢" }, b)).toMatch(/^undated/);
    expect(astroDateOffense({ a: "5月5日起" }, b)).toMatch(/^format/);
    expect(astroDateOffense({ a: `${merc.from} 開始` }, b)).toMatch(/^undated/);
    expect(astroDateOffense({ a: "國曆 4/2 之前" }, b)).toMatch(/^date/);
    expect(astroDateOffense({ a: "公历 2/17 日环食" }, b)).toBeNull();
  });
  it("a stored 年報 part goes through both checks", () => {
    const f = astroFacts(birth(), "year", OCT_20_2026);
    expect(asPartOffense("year", { x: "三月要放慢" }, f)).toMatch(/^lunar/);
    expect(asPartOffense("year", { x: "今年凶" }, f)).toMatch(/^verdict/);
    expect(asPartOffense("deep", { x: "三月要放慢" }, f)).toBeNull();
  });
  it("the page's fixed copy is clean", () => {
    for (const s of astroReportStaticStrings()) expect(astroReportOffense(s.replace("YaoFlow", "")), s).toBeNull();
  });
});

describe("writing calls and shapes", () => {
  it("five deep calls; the 年報 groups (+qa with a question)", () => {
    expect(asGroupKeys("deep")).toEqual(["A", "B", "C", "D", "E"]);
    expect(asGroupKeys("year")).toEqual(["ov", "m1", "m2", "m3", "m4", "js", "ecl", "ar", "ar2"]);
    expect(asGroupKeys("year", { question: true })).toContain("qa");
  });
  it("sends thin text back; no 上升 chapter needed without a birth time", () => {
    expect(shapeAstroDeep("A", { zhongxin: "短", taiyang: "短" }, { timeKnown: true })).toMatchObject({ ok: false });
    const long = "這顆行星落在這裡，做事有自己的節奏。".repeat(20);
    expect(shapeAstroDeep("A", { zhongxin: long, taiyang: long }, { timeKnown: true })).toMatchObject({ ok: true });
    expect(shapeAstroDeep("B", { yueliang: long, shangsheng: "" }, { timeKnown: true })).toMatchObject({ ok: false });
    expect(shapeAstroDeep("B", { yueliang: long, shangsheng: "" }, { timeKnown: false })).toMatchObject({ ok: true });
    expect(shapeAstroBook("ov", { keyword: "扎根", verdict: "短", keyMonths: {} })).toMatchObject({ ok: false });
  });
});

describe("same year bought once", () => {
  it("a new question is answered in the same paid report", () => {
    const facts = astroFacts(birth(), "year", OCT_20_2026);
    const cust = 990201;
    const t = createAstroReport({ kind: "year", locale: "zh-hant", register: null, customerId: cust, email: null, facts, question: "換工作？", paid: { session: "tester:1" } });
    expect(createAstroReport({ kind: "year", locale: "zh-hant", register: null, customerId: cust, email: null, facts, question: "換工作？", paid: { session: "tester:1" } }).token).toBe(t.token);
    const again = createAstroReport({ kind: "year", locale: "zh-hant", register: null, customerId: cust, email: null, facts, question: "要搬家嗎？", paid: { session: "tester:1" } });
    expect(again).toEqual({ token: t.token, created: false });
    expect(astroReport(t.token)?.question).toBe("要搬家嗎？");
    expect(paidAstroReportFor(cust, facts, "year", "zh-hant", "完全不同的事")).toBe(t.token);
    expect(astroReport(t.token)?.question).toBe("完全不同的事");
    const next = astroFacts(birth(), "year", OCT_20_2026, 2027);
    expect(paidAstroReportFor(cust, next, "year", "zh-hant")).toBeNull();
  });
  it("a deep report never keeps a question", () => {
    const d = createAstroReport({ kind: "deep", locale: "zh-hant", register: null, customerId: null, email: null, facts: astroFacts(birth(), "deep", OCT_20_2026), question: "x" });
    expect(astroReport(d.token)?.question ?? null).toBeNull();
  });
});
