import { describe, expect, it } from "vitest";
import { normalizeBirth } from "@/lib/mingli/birth/normalize";
import { nianshuFacts, nianshuSale, nianshuYears, nsGroupKeys, nsOffense, readingsOf, shapeNianshu } from "@/lib/mingli/nianshu/report";
import { NIANSHU_EARLY_PRICES, NIANSHU_PRICES, nianshuMinor } from "@/lib/money";
import { NS_UI } from "@/lib/mingli/nianshu/ui";
import { baziReportOffense } from "@/lib/mingli/bazi/report-facts";

const n = normalizeBirth({ calendar: "solar", y: 1989, m: 9, d: 26, timeMode: "exact", h: 12, mi: 0, placeId: "tw-tpe" } as never);
const long = (k: number) => "今年的節奏偏向整理與扎根，國曆 3 月適合把手上的事收好。".repeat(k);

describe("三合一年書", () => {
  it("one year on sale: this year until 10/31, next year from 11/1 (台北時間); early bird 11/1–1/31", () => {
    // 10-21 Neil: 11 月起只賣明年，早鳥價也做
    const tpe = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h - 8);
    expect(nianshuSale(tpe(2026, 10, 21))).toEqual({ year: 2026, early: false });
    expect(nianshuSale(tpe(2026, 10, 31, 23))).toEqual({ year: 2026, early: false });
    expect(nianshuSale(tpe(2026, 11, 1, 0))).toEqual({ year: 2027, early: true });
    expect(nianshuSale(tpe(2026, 12, 31))).toEqual({ year: 2027, early: true });
    expect(nianshuSale(tpe(2027, 1, 31, 23))).toEqual({ year: 2027, early: true });
    expect(nianshuSale(tpe(2027, 2, 1, 0))).toEqual({ year: 2027, early: false });
    expect(nianshuSale(tpe(2027, 6, 15))).toEqual({ year: 2027, early: false });
    expect(nianshuSale(tpe(2027, 11, 3))).toEqual({ year: 2028, early: true });
    // all three systems can write the year on sale, at every point of the year (立春 / 正月初一 / 1-1 differ)
    for (const t of [tpe(2026, 10, 21), tpe(2026, 11, 1), tpe(2027, 1, 15), tpe(2027, 2, 3), tpe(2027, 2, 5), tpe(2027, 2, 7), tpe(2027, 8, 1), tpe(2027, 12, 20)]) {
      expect(nianshuYears(t)).toEqual([nianshuSale(t).year]);
    }
  });

  it("the prices: regular NT$1,190 / HK$298 / US$36.99 / ¥168, early bird NT$890 / HK$228 / US$27.99 / ¥128", () => {
    expect([nianshuMinor("TWD"), nianshuMinor("HKD"), nianshuMinor("USD"), nianshuMinor("CNY")]).toEqual([119000, 29800, 3699, 16800]);
    expect([nianshuMinor("TWD", true), nianshuMinor("HKD", true), nianshuMinor("USD", true), nianshuMinor("CNY", true)]).toEqual([89000, 22800, 2799, 12800]);
    for (const c of Object.keys(NIANSHU_PRICES) as (keyof typeof NIANSHU_PRICES)[]) expect(NIANSHU_EARLY_PRICES[c]).toBeLessThan(NIANSHU_PRICES[c]);
  });

  it("the facts carry the three systems for one year and no birth date, time or place", () => {
    const f = nianshuFacts(n, "male", "placidus", 2026, Date.UTC(2026, 9, 21));
    expect(f.year).toBe(2026);
    expect(f.bazi.years[0]?.year).toBe(2026);
    expect(f.ziwei.years).toEqual([2026]);
    expect(f.astro.years).toEqual([2026]);
    const s = JSON.stringify(f);
    expect(s).not.toMatch(/1989-09-26|"y":1989|tw-tpe|台北/);
  });

  it("the writing calls: Z, J, X and qa only with a question", () => {
    expect(nsGroupKeys()).toEqual(["Z", "J", "X"]);
    expect(nsGroupKeys({ question: true })).toEqual(["Z", "J", "X", "qa"]);
  });

  it("shapes and checks the parts", () => {
    const z = shapeNianshu("Z", { keyword: "扎根", zong: long(30), tong: long(20), yi: long(16) });
    expect(z.ok).toBe(true);
    expect(shapeNianshu("Z", { keyword: "扎根", zong: "太短", tong: long(20), yi: long(16) })).toEqual({ ok: false, why: "short:zong" });
    const x = shapeNianshu("X", { areas: { career: long(14), money: long(12), love: long(12), rhythm: long(10), people: long(10) }, jianyi: [long(5), long(5)] });
    expect(x).toEqual({ ok: false, why: "jianyi:2" });
    expect(nsOffense({ a: "國曆 6/5 適合出發" })).toMatch(/^date:/);
    expect(nsOffense({ a: "農曆三月比較忙" })).toMatch(/^lunar:/);
    expect(nsOffense({ a: "今年很 lucky" })).toMatch(/^latin:/);
    expect(nsOffense({ a: "今年大吉" })).toMatch(/^verdict:/);
    expect(nsOffense({ a: "國曆 4–6 月適合起步，初步整理手上的事。" })).toBeNull();
  });

  it("readings keep each system's own chapters, shortened", () => {
    const r = readingsOf([
      { sys: "bazi", token: "x", status: "done", parts: { ov: { keyword: "收束", verdict: long(80) }, m1: { months: [] } } },
      { sys: "ziwei", token: "y", status: "done", parts: {} },
      { sys: "astro", token: "z", status: "done", parts: { ar: { career: "事業" } } },
    ]);
    expect(r.bazi.keyword).toBe("收束");
    expect([...(r.bazi.verdict as string)].length).toBeLessThanOrEqual(1101);
    expect(r.bazi.months).toBeUndefined();
    expect(r.astro.career).toBe("事業");
  });

  it("the page words pass the banned-word check", () => {
    for (const v of Object.values(NS_UI)) expect(baziReportOffense(v, "year")).toBeNull();
  });
});
