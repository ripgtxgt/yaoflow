import { describe, expect, it } from "vitest";
import { checkGender, normalizeBirth, offsetAt, BirthError, type BirthInput } from "@/lib/mingli/birth/normalize";
import { baziOf, monthsOf, rel, relations, seasons } from "@/lib/mingli/bazi/chart";
import { baziInfo } from "@/lib/mingli/bazi/info";
import { huangliDay } from "@/lib/mingli/calendar/day";
import { B, PILLARS, pillarOfSlug, pillarSlug } from "@/lib/mingli/bazi/content";

const tp = (y: number, m: number, d: number, h: number, mi: number, extra: Partial<BirthInput> = {}): BirthInput => ({ calendar: "solar", y, m, d, timeMode: "exact", h, mi, placeId: "tw-tpe", ...extra });
const gz = (i: BirthInput) => baziOf(normalizeBirth(i), "male", 2026).pillars.map((p) => p.gz).join(" ");

describe("生辰输入层", () => {
  it("historical daylight saving (Taiwan 1979, Hong Kong 1974) is taken off", () => {
    expect(offsetAt("Asia/Taipei", Date.UTC(1979, 6, 15))).toBe(540);
    const n = normalizeBirth(tp(1979, 7, 15, 10, 0));
    expect(n.dst).toBe(true);
    expect(n.standard!.h).toBe(9);
    const hk = normalizeBirth({ ...tp(1974, 7, 15, 12, 0), placeId: "hk-cw" });
    expect(hk.dst).toBe(true);
    expect(hk.standard!.h).toBe(11);
    expect(normalizeBirth({ ...tp(1979, 7, 15, 10, 0), dstAlreadyRemoved: true }).dst).toBe(false);
  });
  it("Hong Kong noon is about 11:30 true solar time", () => {
    const n = normalizeBirth({ ...tp(1990, 7, 15, 12, 0), placeId: "hk-cw" });
    expect(n.chartTime!.h * 60 + n.chartTime!.mi).toBeLessThanOrEqual(12 * 60 + 2); // 121.01°E: +4 min, 1 Jan equation of time about −3.5 min
    expect(n.chartTime!.mi).toBeGreaterThanOrEqual(25);
    expect(n.chartTime!.mi).toBeLessThanOrEqual(35);
  });
  it("子時 is decided once: 23:00 starts the next day by default, 晚子時 keeps it", () => {
    const a = normalizeBirth(tp(1990, 5, 15, 23, 30));
    expect(a.chartDate).toEqual({ y: 1990, m: 5, d: 16 });
    expect(a.timeIndex).toBe(0);
    const b = normalizeBirth(tp(1990, 5, 15, 23, 30, { zi: "same" }));
    expect(b.chartDate).toEqual({ y: 1990, m: 5, d: 15 });
    expect(b.timeIndex).toBe(12);
    expect(normalizeBirth(tp(1990, 5, 16, 0, 10)).chartDate).toEqual({ y: 1990, m: 5, d: 16 });
  });
  it("rejects dates that do not exist, bad years and bad genders", () => {
    expect(() => normalizeBirth(tp(2023, 2, 29, 9, 0))).toThrow(BirthError);
    expect(() => normalizeBirth(tp(1899, 2, 1, 9, 0))).toThrow(BirthError);
    expect(() => normalizeBirth({ calendar: "lunar", y: 2024, m: 2, d: 1, leap: true, timeMode: "unknown" })).toThrow(BirthError);
    for (const g of ["M", "", undefined]) expect(() => checkGender(g)).toThrow(BirthError);
    expect(normalizeBirth({ calendar: "solar", y: new Date().getFullYear(), m: 1, d: 1, timeMode: "unknown" }).solarDate.d).toBe(1);
  });
  it("lunar input, leap month", () => {
    // 2023 閏二月二十 = 2023-04-10
    expect(normalizeBirth({ calendar: "lunar", y: 2023, m: 2, d: 20, leap: true, timeMode: "unknown" }).solarDate).toEqual({ y: 2023, m: 4, d: 10 });
  });
  it("overseas zones", () => {
    const ny = normalizeBirth({ ...tp(2000, 1, 1, 9, 0), placeId: "us-nyc" });
    expect(ny.utcMs).toBe(Date.UTC(2000, 0, 1, 14, 0));
  });
});

describe("八字", () => {
  it("year turns at 立春 (2004-02-04 19:56)", () => {
    expect(gz(tp(2004, 2, 4, 19, 30)).split(" ")[0]).toBe("癸未");
    expect(gz(tp(2004, 2, 4, 20, 30)).split(" ")[0]).toBe("甲申");
  });
  it("day pillar matches the almanac", () => {
    for (const [y, m, d] of [[1990, 5, 15], [2026, 3, 5], [2026, 10, 18]] as const) {
      expect(gz(tp(y, m, d, 12, 0)).split(" ")[2]).toBe(huangliDay(y, m, d).gz.day);
    }
  });
  it("23:30 moves the day pillar by default, not under 晚子時", () => {
    const next = gz(tp(1990, 5, 15, 23, 30)).split(" ");
    const same = gz(tp(1990, 5, 15, 23, 30, { zi: "same" })).split(" ");
    expect(next[2]).toBe(huangliDay(1990, 5, 16).gz.day);
    expect(same[2]).toBe(huangliDay(1990, 5, 15).gz.day);
  });
  it("three pillars without an hour", () => {
    const v = baziOf(normalizeBirth({ calendar: "solar", y: 1985, m: 8, d: 3, timeMode: "unknown" }), "female", 2026);
    expect(v.pillars).toHaveLength(3);
    expect(v.hasHour).toBe(false);
  });
  it("element relations and strength levels", () => {
    expect(rel("木", "水")).toBe("gen");
    expect(rel("木", "火")).toBe("out");
    expect(rel("木", "土")).toBe("wealth");
    expect(rel("木", "金")).toBe("power");
    const v = baziOf(normalizeBirth(tp(1990, 5, 15, 10, 30)), "male", 2026);
    expect(["偏強", "稍強", "中和", "稍弱", "偏弱"]).toContain(v.strength.level);
    expect(v.decades).toHaveLength(8);
  });
  it("content: sixty pillars, slugs round-trip, no banned words", () => {
    expect(PILLARS).toHaveLength(60);
    for (const p of PILLARS) expect(pillarOfSlug(pillarSlug(p))).toBe(p);
    expect(JSON.stringify(B)).not.toMatch(/[準准]|大吉|大凶|血光|破財|剋|改運|這裡|靈驗|AI/);
  });
  it("matches 問真八字 for 1990-01-01 00:00 Beijing (no true solar time)", () => {
    const v = baziOf(normalizeBirth({ calendar: "solar", y: 1990, m: 1, d: 1, timeMode: "exact", h: 0, mi: 0, placeId: "cn-bj", trueSolar: false }), "male", 2026);
    expect(v.pillars.map((p) => p.gz).join(" ")).toBe("己巳 丙子 丙寅 戊子");
    expect(v.pillars.map((p) => p.kong)).toEqual(["戌亥", "申酉", "戌亥", "午未"]);
    expect(v.pillars.map((p) => p.terrain)).toEqual(["臨官", "胎", "長生", "胎"]);
    expect(v.start).toMatchObject({ years: 8, months: 2, days: 3, at: "1998-03-04" });
    expect(v.decades[0]!.gz).toBe("乙亥");
    expect(v.extra).toEqual({ fetal: "丁卯", own: "己巳", body: "丁丑" });
    expect(v.lunarText).toBe("1989年臘月初五 子時");
    expect(relations(v.pillars.map((p) => p.stem), v.pillars.map((p) => p.branch)).branches).toEqual(["巳寅相刑", "巳寅相害"]);
    expect(seasons("子").map((x) => x.el + x.state).join(" ")).toBe("水旺 木相 金休 土囚 火死");
    expect(monthsOf(2026, "丙")[0]).toMatchObject({ term: "立春", date: "2/4", gz: "庚寅", stemTen: "才", branchTen: "梟" });
  });
  it("基本信息 and 交運 match 問真八字 for 1990-01-01 00:00 男", () => {
    const n = normalizeBirth({ calendar: "solar", y: 1990, m: 1, d: 1, timeMode: "exact", h: 0, mi: 0, placeId: "cn-bj", trueSolar: false });
    const v = baziOf(n, "male", 2026, true);
    expect(v.jiaoyun).toBe("逢戊、癸年 立春后27天 交大运");
    expect(v.siling).toBe("癸");
    const f = baziInfo(n, v, 2026, true);
    expect(f).toMatchObject({ zodiac: "蛇", age: 38, yin: true, constellation: "摩羯座", xiu: "心宿东方苍龙", kong: "戌亥 戌亥", gua: { name: "坤", east: false }, silingEl: "癸水" });
    expect(f.term).toEqual({ prev: "大雪", prevAt: "1989-12-07 11:20:57", next: "小寒", nextAt: "1990-01-05 22:33:14", afterD: 24, afterH: 12, beforeD: 4, beforeH: 22 });
    expect(f.palaces).toEqual({ fetal: "丁卯（炉中火）", breath: "辛亥（钗钏金）", own: "己巳（大林木）", body: "丁丑（涧下水）" });
  });
  it("a place from the city search carries its own coordinates", () => {
    const n = normalizeBirth({ calendar: "solar", y: 1990, m: 1, d: 1, timeMode: "exact", h: 12, mi: 0, place: { id: "1", name: "竹北", lat: 24.83, lon: 121.01, tz: "Asia/Taipei" } });
    expect(n.place?.name).toBe("竹北");
    expect(n.chartTime!.h * 60 + n.chartTime!.mi).toBeLessThanOrEqual(12 * 60 + 2); // 121.01°E: +4 min, 1 Jan equation of time about −3.5 min
    expect(() => normalizeBirth({ calendar: "solar", y: 1990, m: 1, d: 1, timeMode: "exact", h: 12, mi: 0, place: { id: "x", name: "x", lat: 1, lon: 1, tz: "Not/AZone" } })).toThrow(BirthError);
  });
});
