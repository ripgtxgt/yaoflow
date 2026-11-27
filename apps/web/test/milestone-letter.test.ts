import { describe, expect, it } from "vitest";
import { normalizeBirth } from "../src/lib/mingli/birth/normalize";
import { factsFromBirth } from "../src/lib/mingli/bazi/report";
import { nsOffense } from "../src/lib/mingli/nianshu/report";
import { TEN_WORDS, buildDecadeLetter, buildKeyMonthLetter, decadeChange, hantTen, keyMonthDue } from "../src/lib/milestone-letter";

/** 10-22 进度表 75 ⑦ 「在報告裡埋回來的日子」: the 大運交接 and 年書關鍵月 letters, from the facts alone */
const tpe = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h - 8);
const birth = normalizeBirth({ calendar: "solar", y: 1989, m: 9, d: 26, timeMode: "exact", h: 12, mi: 0, placeId: "tw-tpe" } as never);
const deep = factsFromBirth(birth, "male", "deep", tpe(2026, 10, 21));
const book = factsFromBirth(birth, "male", "year", tpe(2026, 10, 21), 2026);

describe("回來的日子 · 大運交接與年書關鍵月", () => {
  it("knows the year a 大運 changes and which one it steps into", () => {
    process.env.UNSUB_SECRET ??= "test-secret";
    const years = deep.decades.map((d) => d.startYear);
    const y = years[2]!;
    const ch = decadeChange(deep, y)!;
    expect(ch.to.startYear).toBe(y); expect(ch.from?.gz).toBe(deep.decades[1]!.gz);
    expect(decadeChange(deep, y + 1)).toBeNull();
    expect(decadeChange(deep, years[0]!)!.from).toBeNull();
    const m = buildDecadeLetter({ year: y, ...ch, dayMaster: deep.dayMaster }, "zh-hant", "https://yaoflow.com", "x@example.com");
    expect(m.subject).toContain(ch.to.gz); expect(m.subject).toContain(`國曆 ${y} 年起`);
    expect(m.html).toContain(`管到 ${y + 9} 年`); expect(m.html).toContain("/api/member-letter/unsub?e=x%40example.com");
    expect(m.html).not.toMatch(/undefined|财|伤|杀|1989/);
    expect(nsOffense({ a: m.text.replace(/https?:\S+/g, "") })).toBeNull();
    const hans = buildDecadeLetter({ year: y, ...ch, dayMaster: deep.dayMaster }, "zh", "https://yaoflow.com", "x@example.com");
    expect(hans.subject).toContain("你的大运换了");
  });

  it("the ten 十神 words, in 繁體, reachable from tyme4ts's 简体 names", () => {
    for (const k of ["比肩", "劫財", "食神", "傷官", "正財", "偏財", "正官", "七殺", "正印", "偏印"]) expect(TEN_WORDS[k]).toBeTruthy();
    expect(hantTen("正财")).toBe("正財"); expect(hantTen("七杀")).toBe("七殺"); expect(hantTen("伤官")).toBe("傷官");
    for (const w of Object.values(TEN_WORDS)) expect(nsOffense({ w })).toBeNull();
  });

  it("a key month is due in the first three days of its 節氣月, once per kind; nothing on other days", () => {
    const b = book.book!, months = book.months!["2026"]!;
    const starts = (i: number) => { const [mm, dd] = months[i]!.start.split("/").map(Number); return tpe(mm! >= 2 ? 2026 : 2027, mm!, dd!); };
    for (const kind of ["pivot", "slow", "smooth"] as const) {
      const i = b.key[kind];
      const due = keyMonthDue(book, 2026, starts(i) + 36 * 3600_000); // the second day
      expect(due?.i).toBe(i);
      expect(keyMonthDue(book, 2026, starts(i) - 2 * 86_400_000)?.i).not.toBe(i);
      expect(keyMonthDue(book, 2026, starts(i) + 4 * 86_400_000)?.i).not.toBe(i);
      const m = buildKeyMonthLetter({ year: 2026, km: due!, token: "0123456789abcdef01234567" }, "zh-hant", "https://yaoflow.com", "x@example.com");
      expect(m.subject).toContain(`${months[i]!.term}月`); expect(m.html).toContain("/zh-hant/nianshu/r/0123456789abcdef01234567?c=km-letter");
      expect(m.html).not.toMatch(/undefined|财|伤|杀/);
    }
    expect(keyMonthDue(deep, 2026, tpe(2026, 10, 22))).toBeNull(); // a deep report has no year book
    expect(keyMonthDue(book, 2027, tpe(2027, 3, 6))).toBeNull(); // another year's book
  });
});
