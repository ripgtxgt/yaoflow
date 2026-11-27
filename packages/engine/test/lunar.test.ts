import { describe, expect, it } from "vitest";
import {
  lunarDateOf, lunarLabelZh, lunarMonth, lunarMonthsBetween, lunarNewYear, lunarToIso, lunarYearEnd,
  lunarYearMonths, newMoonUtcMs, solarTermIso,
} from "../src/index";

// Reference dates from the 紫金山天文台 almanac / HK Observatory conversion tables.
describe("农历 (10-05): new moons, months, leap months", () => {
  it("正月初一 (Chinese New Year) 2024–2030", () => {
    expect(lunarNewYear(2024)).toBe("2024-02-10");
    expect(lunarNewYear(2025)).toBe("2025-01-29");
    expect(lunarNewYear(2026)).toBe("2026-02-17");
    expect(lunarNewYear(2027)).toBe("2027-02-06"); // new moon 23:56 Beijing — the tight one
    expect(lunarNewYear(2028)).toBe("2028-01-26");
    expect(lunarNewYear(2029)).toBe("2029-02-13");
    expect(lunarNewYear(2030)).toBe("2030-02-03");
  });

  it("八月十五 (中秋) 2024–2030", () => {
    expect(lunarToIso(2024, 8, 15)).toBe("2024-09-17");
    expect(lunarToIso(2025, 8, 15)).toBe("2025-10-06");
    expect(lunarToIso(2026, 8, 15)).toBe("2026-09-25");
    expect(lunarToIso(2027, 8, 15)).toBe("2027-09-15");
    expect(lunarToIso(2028, 8, 15)).toBe("2028-10-03");
    expect(lunarToIso(2029, 8, 15)).toBe("2029-09-22");
    expect(lunarToIso(2030, 8, 15)).toBe("2030-09-12");
  });

  it("五月初五 (端午) and 正月十五 (元宵)", () => {
    expect(lunarToIso(2024, 5, 5)).toBe("2024-06-10");
    expect(lunarToIso(2025, 5, 5)).toBe("2025-05-31");
    expect(lunarToIso(2026, 5, 5)).toBe("2026-06-19");
    expect(lunarToIso(2027, 5, 5)).toBe("2027-06-09");
    expect(lunarToIso(2026, 1, 15)).toBe("2026-03-03");
  });

  it("leap months: 2023 閏二月, 2025 閏六月, 2028 閏五月; none in 2024 / 2026 / 2027", () => {
    expect(lunarMonth(2023, 2, true)?.start).toBe("2023-03-22");
    expect(lunarMonth(2025, 6, true)?.start).toBe("2025-07-25");
    expect(lunarMonth(2028, 5, true)?.start).toBe("2028-06-23");
    for (const y of [2024, 2026, 2027]) expect(lunarYearMonths(y).some((m) => m.leap)).toBe(false);
    expect(lunarYearMonths(2025)).toHaveLength(13);
    expect(lunarYearMonths(2026)).toHaveLength(12);
  });

  it("the month a reader asked about: 農曆十月 2026 = Nov 9 – Dec 8", () => {
    const m = lunarMonth(2026, 10)!;
    expect(m.start).toBe("2026-11-09");
    expect(m.end).toBe("2026-12-08");
    expect(m.days).toBe(30);
    // and the year's last day
    expect(lunarYearEnd(2026)).toBe("2027-02-05");
  });

  it("today's lunar date: 2026-10-05 is 八月廿五", () => {
    const d = lunarDateOf("2026-10-05");
    expect(d).toMatchObject({ year: 2026, month: 8, leap: false, day: 25, monthStart: "2026-09-11", monthEnd: "2026-10-09" });
    expect(lunarLabelZh(d)).toBe("農曆八月廿五");
    expect(lunarLabelZh(d, "hans")).toBe("农历八月廿五");
    expect(lunarLabelZh({ month: 6, leap: true, day: 1 })).toBe("農曆閏六月初一");
    expect(lunarLabelZh({ month: 1, leap: false })).toBe("農曆正月");
  });

  it("month lengths are 29 or 30 and months are contiguous", () => {
    const ms = lunarMonthsBetween("2024-01-01", "2030-12-31");
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]!;
      expect([29, 30]).toContain(m.days);
      if (i > 0) expect(Date.parse(m.start) - Date.parse(ms[i - 1]!.end)).toBe(86_400_000);
    }
    // a lunar year is 353–355 or 383–385 days
    for (let y = 2024; y <= 2029; y++) {
      const len = (Date.parse(lunarNewYear(y + 1)) - Date.parse(lunarNewYear(y))) / 86_400_000;
      expect(len >= 353 && len <= 355 || len >= 383 && len <= 385).toBe(true);
    }
  });

  it("节气 civil dates: 冬至 / 清明 / 立春", () => {
    expect(solarTermIso(2025, 270)).toBe("2025-12-21");
    expect(solarTermIso(2026, 270)).toBe("2026-12-22");
    expect(solarTermIso(2026, 15)).toBe("2026-04-05");
    expect(solarTermIso(2027, 315)).toBe("2027-02-04");
    expect(solarTermIso(2026, 285)).toBe("2026-01-05");
  });

  it("new moon instants are within minutes of the ephemeris (2026-02-17 12:01 UTC)", () => {
    const feb = newMoonUtcMs(Math.round((2026.12 - 2000) * 12.3685));
    expect(Math.abs(feb - Date.UTC(2026, 1, 17, 12, 1))).toBeLessThan(5 * 60_000);
  });
});
