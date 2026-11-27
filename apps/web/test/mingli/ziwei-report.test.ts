import { describe, expect, it } from "vitest";
import { normalizeBirth } from "@/lib/mingli/birth/normalize";
import {
  ZW_CURVE_W, guardPeriodsZ, keyMonthsZ, monthRanges, ziweiDateOffense, ziweiFacts, ziweiReportOffense, ziweiReportStaticStrings,
  ziweiReportYears, ziweiYearAt, zwGroupKeys,
} from "@/lib/mingli/ziwei/report-facts";
import { createZiweiReport, paidZiweiReportFor, shapeZiweiBook, shapeZiweiDeep, ziweiReport, zwPartOffense } from "@/lib/mingli/ziwei/report";

/**
 * 10-20 紫微②③ 付費報告: years by 正月初一, facts deterministic and free of birth data, every month labelled 農曆 + 國曆,
 * the banned-word and date checks, the writing calls, and 同一年只收一次錢.
 */
const OCT_20_2026 = Date.UTC(2026, 9, 20, 4);
const birth = () => normalizeBirth({ calendar: "solar", y: 1990, m: 5, d: 17, timeMode: "exact", h: 12, mi: 30, place: { id: "1668341", name: "Taipei Daan", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" } });

describe("紫微 years turn at 正月初一", () => {
  it("this year and next", () => {
    expect(ziweiYearAt(OCT_20_2026)).toBe(2026);
    // 2027-01-20 is still 農曆 2026 (正月初一 2027 is Feb 6)
    expect(ziweiYearAt(Date.UTC(2027, 0, 20, 4))).toBe(2026);
    expect(ziweiYearAt(Date.UTC(2027, 1, 7, 4))).toBe(2027);
    expect(ziweiReportYears("year", OCT_20_2026)).toEqual([2026]);
    expect(ziweiReportYears("year", OCT_20_2026, 2027)).toEqual([2027]);
    expect(ziweiReportYears("year", OCT_20_2026, 2031)).toEqual([2026]);
    expect(ziweiReportYears("deep", OCT_20_2026)).toEqual([2026]);
  });
});

describe("month labels: 農曆 month + 國曆 range", () => {
  it("2026: twelve months, each labelled", () => {
    const r = monthRanges(2026);
    expect(r).toHaveLength(12);
    expect(r[0]!.label).toBe("農曆正月（國曆 2/17–3/18）");
    for (const m of r) { expect(m.label).toMatch(/^農曆.+月（國曆 \d{1,2}\/\d{1,2}–\d{1,2}\/\d{1,2}/); expect(m.label).toContain("農曆"); expect(m.label).toContain("國曆"); }
    expect(r[11]!.to).toBe("2/5");
  });
  it("a leap month is split as iztro splits it (1–15 with the month before, 16 on with the month after)", () => {
    const r = monthRanges(2025); // 閏六月 2025-07-25 … 2025-08-22
    expect(r[5]!.label).toBe("農曆六月（國曆 6/25–8/8，含閏六月上半月）");
    expect(r[6]!.label).toBe("農曆七月（國曆 8/9–9/21，含閏六月下半月）");
  });
});

describe("chart_json carries computed facts only", () => {
  for (const kind of ["deep", "year"] as const) {
    it(`${kind}: deterministic, no birth date, time, place or name`, () => {
      const a = ziweiFacts(birth(), "male", kind, OCT_20_2026), b = ziweiFacts(birth(), "male", kind, OCT_20_2026);
      expect(a).toEqual(b);
      const j = JSON.stringify(a);
      for (const bad of ["1990-05-17", "1990-5-17", "19900517", "1990年", "5月17日", "12:30", "Taipei", "Daan", "121.5", "25.03", "Asia/Taipei", "四月廿三", "lunarDate", "solarDate", "chineseDate"]) expect(j).not.toContain(bad);
      for (const key of ["solarDate", "chartDate", "clock", "chartTime", "place", "lunarDate", "chineseDate", "time", "name"]) expect(Object.keys(a)).not.toContain(key);
      expect(a.palaces).toHaveLength(12);
      expect(a.soulBranch).toBe("亥");
      expect(a.natalMut.map((m) => `${m.star}化${m.m}`)).toEqual(["太陽化祿", "武曲化權", "太陰化科", "天同化忌"]);
      expect(a.decades.find((d) => d.when === "now")?.palace).toBe("田宅");
      expect(a.cross.map((c) => c.area)).toEqual(["自我", "事業", "財", "感情", "才華表達", "人際"]);
    });
  }
  it("a year report carries the 年書 facts: 流年命宮, 四化, twelve labelled months", () => {
    const f = ziweiFacts(birth(), "male", "year", OCT_20_2026);
    const b = f.book!;
    expect(b.gz).toBe("丙午");
    expect(b.palace.name).toBe("疾厄");
    expect(b.mut.map((m) => `${m.star}${m.m}${m.palace}`)).toEqual(["天同祿官祿", "天機權財帛", "文昌科交友", "廉貞忌父母"]);
    expect(b.months.map((m) => m.gz)).toEqual(["庚寅", "辛卯", "壬辰", "癸巳", "甲午", "乙未", "丙申", "丁酉", "戊戌", "己亥", "庚子", "辛丑"]);
    expect(b.months.map((m) => m.level).join("")).toBe("234533444433");
    for (const m of b.months) expect(m.label).toMatch(/^農曆.+（國曆 /);
    expect(b.key).toEqual({ smooth: 3, slow: 0, pivot: 6 });
  });
});

describe("curve rules", () => {
  it("weights are the documented ones", () => {
    expect(ZW_CURVE_W.base).toBe(3);
    expect(ZW_CURVE_W.luSoul).toBe(1);
    expect(ZW_CURVE_W.jiSoul).toBe(-1);
  });
  it("key months and the stretches to go easy", () => {
    const m = (score: number, flags: string[] = []) => ({ score, level: Math.max(1, Math.min(5, Math.round(score))) as 1 | 2 | 3 | 4 | 5, flags, tags: [] as string[] });
    const months = [m(2, ["忌入流月命宮"]), m(2.5), m(4), m(4.5), m(3, ["疊流年命宮"]), m(3), m(1.5), m(3), m(3), m(3), m(3), m(3)];
    expect(keyMonthsZ(months)).toEqual({ smooth: 3, slow: 6, pivot: 4 });
    expect(guardPeriodsZ(months, 3).map((g) => [g.from, g.to])).toEqual([[0, 0], [6, 6]]);
  });
});

describe("banned words and dates", () => {
  it("catches the 八字 list plus 小人 and English", () => {
    for (const s of ["這張盤很準", "今年大吉", "要化解", "犯太歲", "小心小人", "pace可以自己拿", "保證成功", "AI 判斷"]) expect(ziweiReportOffense(s)).not.toBeNull();
    for (const s of ["準備好再出發", "化忌在官祿，工作上多想一步", "破軍在疾厄，作息要規律"]) expect(ziweiReportOffense(s)).toBeNull();
  });
  it("months must say 農曆, dates must say 國曆 and be real month edges", () => {
    const months = monthRanges(2026).map((r) => ({ n: r.n, lunar: r.lunar, from: r.from, to: r.to }));
    expect(ziweiDateOffense({ a: "農曆正月（國曆 2/17–3/18）適合起步。" }, months)).toBeNull();
    expect(ziweiDateOffense({ a: "農曆三月要放慢，閏月不在今年。" }, months)).toBeNull();
    expect(ziweiDateOffense({ a: "三月要放慢。" }, months)).toMatch(/^undated/);
    expect(ziweiDateOffense({ a: "正月適合起步" }, months)).toMatch(/^undated/);
    expect(ziweiDateOffense({ a: "5月5日起要小心" }, months)).toMatch(/^undated/);
    expect(ziweiDateOffense({ a: "3/18 前完成" }, months)).toMatch(/^undated/);
    expect(ziweiDateOffense({ a: "國曆 3/20 前完成" }, months)).toMatch(/^date/);
    expect(ziweiDateOffense({ a: "農曆二月（國曆 2/17–3/18）" }, months)).toMatch(/^date/);
    expect(ziweiDateOffense({ a: "农历正月（公历 2/17–3/18）" }, months)).toBeNull();
    expect(ziweiDateOffense({ a: "這三個月、十二個月、每個月都一樣" }, months)).toBeNull();
  });
  it("a stored 年書 part goes through both checks", () => {
    const f = ziweiFacts(birth(), "male", "year", OCT_20_2026);
    expect(zwPartOffense("year", { x: "三月要放慢" }, f)).toMatch(/^undated/);
    expect(zwPartOffense("year", { x: "今年凶" }, f)).toMatch(/^verdict/);
    expect(zwPartOffense("deep", { x: "三月要放慢" }, f)).toBeNull();
  });
  it("the page's and the letter's fixed copy is clean", () => {
    // the brand name in the Stripe product name is the only Latin text
    for (const s of ziweiReportStaticStrings()) expect(ziweiReportOffense(s.replace("YaoFlow", "")), s).toBeNull();
  });
});

describe("writing calls and shapes", () => {
  it("five deep calls; the 年書 groups (+qa with a question)", () => {
    expect(zwGroupKeys("deep")).toEqual(["A", "B", "C", "D", "E"]);
    expect(zwGroupKeys("year")).toEqual(["ov", "m1", "m2", "m3", "m4", "ar", "ar2", "gx"]);
    expect(zwGroupKeys("year", { question: true })).toContain("qa");
  });
  it("sends thin text back", () => {
    expect(shapeZiweiDeep("A", { zonglan: "短", minggong: "短", shengong: "短" }, { decades: [] })).toMatchObject({ ok: false });
    const long = "這一宮的星很亮，做事有力。".repeat(30);
    expect(shapeZiweiDeep("A", { zonglan: long, minggong: long, shengong: long }, { decades: [] })).toMatchObject({ ok: true });
    expect(shapeZiweiBook("ov", { keyword: "整理", verdict: "短", keyMonths: {} }, { guards: [] })).toMatchObject({ ok: false });
  });
});

describe("same year bought once", () => {
  it("a new question is answered in the same paid report", () => {
    const facts = ziweiFacts(birth(), "male", "year", OCT_20_2026);
    const cust = 990101;
    const t = createZiweiReport({ kind: "year", locale: "zh-hant", register: null, customerId: cust, email: null, facts, question: "換工作？", paid: { session: "tester:1" } });
    expect(createZiweiReport({ kind: "year", locale: "zh-hant", register: null, customerId: cust, email: null, facts, question: "換工作？", paid: { session: "tester:1" } }).token).toBe(t.token);
    const again = createZiweiReport({ kind: "year", locale: "zh-hant", register: null, customerId: cust, email: null, facts, question: "要搬家嗎？", paid: { session: "tester:1" } });
    expect(again).toEqual({ token: t.token, created: false });
    expect(ziweiReport(t.token)?.question).toBe("要搬家嗎？");
    expect(paidZiweiReportFor(cust, facts, "year", "zh-hant", "完全不同的事")).toBe(t.token);
    expect(ziweiReport(t.token)?.question).toBe("完全不同的事");
    expect(paidZiweiReportFor(cust, facts, "year", "zh-hant")).toBe(t.token);
    // next year is a different report
    const next = ziweiFacts(birth(), "male", "year", OCT_20_2026, 2027);
    expect(paidZiweiReportFor(cust, next, "year", "zh-hant")).toBeNull();
  });
  it("a deep report never keeps a question", () => {
    const d = createZiweiReport({ kind: "deep", locale: "zh-hant", register: null, customerId: null, email: null, facts: ziweiFacts(birth(), "female", "deep", OCT_20_2026), question: "x" });
    expect(ziweiReport(d.token)?.question ?? null).toBeNull();
  });
});
