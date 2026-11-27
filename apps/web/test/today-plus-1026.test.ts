import { describe, expect, it } from "vitest";
import { addDays, dayPlus, goodHours, isPeachDay, pairLine, yiJi } from "../src/lib/mingli/bazi/today-plus";
import { chartFromBirth, type MyChart } from "../src/lib/mingli/bazi/today";
import { buildMemberLetter, type LetterPieces } from "../src/lib/member-letter";

/** 10-26 (Neil: 每日信「全部做吧」): seven more things the member's own 八字 says about today — rules only */
const place = { id: "1668341", name: "Taipei Daan", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" };
const me = chartFromBirth({ calendar: "solar", y: 1991, m: 3, d: 9, leap: false, timeMode: "exact", h: 8, mi: 15, place } as never, "female")!;
const ta = chartFromBirth({ calendar: "solar", y: 1989, m: 11, d: 2, leap: false, timeMode: "exact", h: 20, mi: 0, place } as never, "male")!;
const BANNED = /吉|凶|準|化解|改運|注定|一定會/;

describe("你的今天 · 七項", () => {
  it("宜忌 follow the day's 十神 and the 沖合", () => {
    const calm = yiJi({ ten: "正財", rels: [] });
    expect(calm.yi).toContain("整理帳目");
    const clash = yiJi({ ten: "正財", rels: ["冲"] });
    expect(clash.ji[0]).toBe("搬家、簽約、做大決定");
    expect(yiJi({ ten: "食神", rels: ["合"] }).yi[0]).toBe("約見、談合作");
  });

  it("the good hours are waking hours and never 沖 the 日支", () => {
    const c: MyChart = { dayMaster: "甲", dmEl: "木", dayBranch: "子", monthBranch: "寅", favour: ["水"], avoid: ["金"] };
    const h = goodHours(c);
    expect(h.length).toBeGreaterThan(0);
    expect(h.join()).not.toContain("午時"); // 午 沖 子
    expect(h.join()).not.toMatch(/子時|丑時|寅時/);
  });

  it("桃花日 from the 年支 or 日支", () => {
    expect(isPeachDay({ dayBranch: "子" }, "丁酉")).toBe(true); // 申子辰 → 酉
    expect(isPeachDay({ dayBranch: "丑", yearBranch: "寅" }, "己卯")).toBe(true); // 寅午戌 → 卯
    expect(isPeachDay({ dayBranch: "丑" }, "己卯")).toBe(false);
  });

  it("all seven for a real chart: seven days, at most three 宜／忌, no verdict words", () => {
    const x = dayPlus(me, "2026-10-26", ta)!;
    expect(x.week).toHaveLength(7);
    expect(x.week[0]!.ymd).toBe("2026-10-26");
    expect(x.week[6]!.ymd).toBe(addDays("2026-10-26", 6));
    expect(x.yi.length).toBeGreaterThan(0); expect(x.yi.length).toBeLessThanOrEqual(3); expect(x.ji.length).toBeLessThanOrEqual(3);
    expect(x.pair).toBeTruthy();
    // a 沖 day in the week reads 逢沖, the same day the 沖日預告 names
    for (const d of x.week) if (d.word === "逢沖") expect(d.level).toBeLessThanOrEqual(2);
    const all = [x.yi.join(), x.ji.join(), x.habits, x.hours, x.peach, x.pair, x.weekLine, x.clashAhead].filter(Boolean).join("|");
    expect(all).not.toMatch(BANNED);
    // a whole month, so every 十神 and relation is met once
    for (let i = 0; i < 60; i++) {
      const y = dayPlus(me, addDays("2026-10-01", i), ta)!;
      expect([y.yi.join(), y.ji.join(), y.peach, y.pair, y.clashAhead, y.weekLine].filter(Boolean).join("|")).not.toMatch(BANNED);
    }
    expect(pairLine({ dayBranch: "子" }, { dayBranch: "丑" }, "甲午")).toContain("心浮氣躁"); // 午 沖 子
  });

  it("the letter carries them in 「你的今天」, plus 桃花日, 你們倆 and 這七天", () => {
    const x = dayPlus(me, "2026-10-26", ta)!;
    const p: LetterPieces = {
      day: "2026-10-26", locale: "zh-hant", lot: null, yunshi: null, note: null, due: [], month: null,
      me: { dayGz: "甲子", word: "平穩的一天", line: "今天是你的「正財」日。", tip: null, almanac: "照平常的步調。" },
      plus: { ...x, peach: "今天落在你的桃花上：適合約人。", hasLove: false },
    };
    const m = buildMemberLetter(p, "https://yaoflow.com", "a@example.com");
    expect(m.html).toContain("今日宜");
    expect(m.html).toContain("桃花日");
    expect(m.html).toContain("/zh-hant/zhengyuan?c=mletter");
    expect(m.html).toContain("你們倆的今天");
    expect(m.html).toContain("這七天");
    expect(m.text).toContain("這七天");
  });
});
