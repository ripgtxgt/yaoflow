import { describe, expect, it } from "vitest";
import { normalizeBirth } from "@/lib/mingli/birth/normalize";
import {
  CURVE_W, QUESTION_MAX, baziReportOffense, basisChips, branchRels, chartYearAt, cleanQuestion, factsFromBirth, groupKeys, guardPeriods, gzRels,
  keyMonths, kongOf, monthCurve, monthFlags, reportStaticStrings, reportYears, taisuiOf,
} from "@/lib/mingli/bazi/report-facts";
import { baziReport, createReport, markBaziPaid, paidReportFor, partOffense, shapeBook } from "@/lib/mingli/bazi/report";

const OCT_18_2026 = Date.UTC(2026, 9, 18, 4);

describe("八字報告 years by 立春", () => {
  it("this year and next: 2026 丙午 → 2027 丁未", () => {
    expect(chartYearAt(OCT_18_2026)).toBe(2026);
    expect(reportYears("year", OCT_18_2026)).toEqual([2026]);
    expect(reportYears("year", OCT_18_2026, 2027)).toEqual([2027]);
    expect(reportYears("year", OCT_18_2026, 2031)).toEqual([2026]);
    expect(reportYears("deep", OCT_18_2026)).toEqual([2026]);
    expect(reportYears("love", OCT_18_2026)).toEqual([]);
    // January 2027 is still the 2026 八字 year; 立春 2027 (Feb 4) starts the next
    expect(chartYearAt(Date.UTC(2027, 0, 20))).toBe(2026);
    expect(chartYearAt(Date.UTC(2027, 1, 4, 4))).toBe(2027);
  });
  it("one writing call per year, four for deep, two for love", () => {
    expect(groupKeys("year", [2026, 2027])).toEqual(["y2026", "y2027"]);
    expect(groupKeys("deep", [2026])).toEqual(["A", "B", "C", "D"]);
    expect(groupKeys("love", [])).toEqual(["A", "B"]);
  });
});

describe("12-month curve (fixed rules)", () => {
  const chart = { pillars: ["戊辰", "甲子", "乙丑", "壬午"], favour: ["金", "火", "土"], avoid: ["水", "木"] };
  it("is deterministic for a fixed chart", () => {
    const a = monthCurve(chart, 2026), b = monthCurve(chart, 2026);
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
    expect(a.map((m) => m.gz)).toEqual(["庚寅", "辛卯", "壬辰", "癸巳", "甲午", "乙未", "丙申", "丁酉", "戊戌", "己亥", "庚子", "辛丑"]);
    expect(a[0]!.start).toBe("2/4");
    expect(a.map((m) => m.level).join("")).toBe("324432554335");
  });
  it("scores each month by its rules", () => {
    const m = monthCurve(chart, 2026);
    // 丙申: 丙火 and 申金 both 喜用, no relation with 丑 or 子 → 3 + 0.5 + 1
    expect(m[6]).toMatchObject({ gz: "丙申", score: 4.5, level: 5, tags: ["丙火·喜用", "申金·喜用"] });
    // 乙未: 乙木 偏耗, 未土 喜用, 未 沖 and 刑 日支丑, 害 月支子
    expect(m[5]!.score).toBe(CURVE_W.base + CURVE_W.stemAvoid + CURVE_W.branchFav + CURVE_W.day["冲"] + CURVE_W.day["刑"] + CURVE_W.month["害"]);
    expect(m[5]!.tags).toEqual(["乙木·偏耗", "未土·喜用", "未冲日支丑", "未刑日支丑", "未害月支子"]);
    expect(m[5]!.level).toBe(2);
    // 庚子: 子 合 日支丑
    expect(m[10]!.tags).toContain("子合日支丑");
    for (const x of m) expect(x.level).toBeGreaterThanOrEqual(1), expect(x.level).toBeLessThanOrEqual(5);
  });
  it("a balanced chart is scored by the relations alone", () => {
    const m = monthCurve({ pillars: chart.pillars, favour: [], avoid: [] }, 2026);
    expect(m.every((x) => !x.tags.some((t) => /喜用|偏耗/.test(t)))).toBe(true);
    expect(m.find((x) => x.gz === "丙申")).toMatchObject({ score: 3, tags: ["平稳"] });
  });
  it("branch relations", () => {
    expect(branchRels("午", "子")).toEqual(["冲"]);
    expect(branchRels("未", "丑")).toEqual(["冲", "刑"]);
    expect(branchRels("子", "丑")).toEqual(["合"]);
    expect(branchRels("午", "午")).toEqual(["刑"]);
    expect(branchRels("子", "子")).toEqual([]);
  });
});

describe("chart_json carries computed facts only", () => {
  const n = normalizeBirth({ calendar: "solar", y: 1989, m: 1, d: 5, timeMode: "exact", h: 11, mi: 30, place: { id: "1668341", name: "Taipei Daan", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" } });
  for (const kind of ["deep", "love", "year"] as const) {
    it(`${kind}: no birth date, time, place or name`, () => {
      const f = factsFromBirth(n, "male", kind, OCT_18_2026);
      const j = JSON.stringify(f);
      for (const bad of ["1989-01-05", "1989-1-5", "19890105", "1989年", "1月5日", "11:30", "11:3", "Taipei", "Daan", "121.5", "25.03", "Asia/Taipei", "臘月", "腊月"]) expect(j).not.toContain(bad);
      for (const key of ["solarDate", "chartDate", "clock", "utcMs", "standard", "chartTime", "place", "lunarText", "lunarYear", "start", "jiaoyun", "name"]) expect(Object.keys(f)).not.toContain(key);
      expect(f.pillars.map((p) => p.gz)).toEqual(["戊辰", "甲子", "乙丑", "壬午"]);
    });
  }
  it("love carries the 正緣 traits and no 大運; a year report carries one year (this or next, Neil 10-19: 每年分開)", () => {
    const love = factsFromBirth(n, "male", "love", OCT_18_2026);
    expect(love.decades).toEqual([]);
    expect(love.zhengyuan?.traits.map((t) => t.key)).toEqual(["qiyun", "titai", "dise", "shentai", "xiangchu", "yuanfen", "xiangyu"]);
    expect(love.imagePrompt?.scene).toBeTruthy();
    const year = factsFromBirth(n, "male", "year", OCT_18_2026);
    expect(year.years.map((y) => `${y.year}${y.gz}`)).toEqual(["2026丙午"]);
    expect(Object.keys(year.months ?? {})).toEqual(["2026"]);
    const next = factsFromBirth(n, "male", "year", OCT_18_2026, 2027);
    expect(next.years.map((y) => `${y.year}${y.gz}`)).toEqual(["2027丁未"]);
    expect(year.years[0]!.relations).toContain("午冲月支子");
  });
});

describe("banned words", () => {
  it("catches the banned words", () => {
    for (const s of ["這個八字很準", "算得准", "保證會成", "你一定會發財", "這是 AI 寫的", "改運的方法", "可以化解", "大師說", "今年大吉", "小心血光", "容易破財", "剋夫", "克妻", "婚姻失敗", "犯太歲", "流年凶", "記得吃藥", "可以買股票", "請教律師", "這份報告的規則是", "根據你提供的資料", "擺放風水擺件"]) {
      expect(baziReportOffense(s), s).not.toBeNull();
    }
  });
  it("lets ordinary words pass", () => {
    for (const s of ["先做好準備", "提前准备", "照自己的標準", "水準很高", "準時睡覺", "TA 的氣質很溫和", "今年適合把節奏放慢"]) expect(baziReportOffense(s), s).toBeNull();
  });
  it("他／她 only in the portrait", () => {
    expect(baziReportOffense("她會照顧人")).toBeNull();
    expect(baziReportOffense("她會照顧人", "love")).toBe("pronoun:她");
    expect(baziReportOffense("TA 會照顧人", "love")).toBeNull();
  });
  it("the page's and the letter's fixed copy is clean", () => {
    const all = reportStaticStrings();
    expect(all.length).toBeGreaterThan(40);
    for (const s of all) expect(baziReportOffense(s), s).toBeNull();
  });
});

describe("basis chips", () => {
  it("splits the 正緣 basis into chips", () => {
    expect(basisChips("配偶星 偏财·水")).toEqual(["偏财·水"]);
    expect(basisChips("月干、日支藏 · 鲜明 · 坐配偶宫")).toEqual(["月干", "日支藏", "鲜明", "坐配偶宫"]);
    expect(basisChips("夫妻宫 丑 · 丑午相害")).toEqual(["丑", "丑午相害"]);
    expect(basisChips("桃花")).toEqual(["桃花"]);
  });
});

/* ------------------------------------------------------------------ 10-19 年書 */
describe("年書 rule facts", () => {
  const pillars = ["戊辰", "甲子", "乙丑", "壬午"];
  it("流年 against 大運 / a pillar: 伏吟, 反吟, 天干合／冲, 地支六合／冲／刑／害／破", () => {
    expect(gzRels("丙午", "丙午")).toEqual(["伏吟"]);
    expect(gzRels("丙午", "壬子")).toEqual(["反吟", "天干丙壬相冲", "地支午子相冲"]);
    expect(gzRels("丙午", "辛未")).toEqual(["天干丙辛相合", "地支午未六合"]);
    expect(gzRels("丙午", "乙丑")).toEqual(["地支午丑相害"]);
    expect(gzRels("丙午", "壬午")).toEqual(["天干丙壬相冲", "地支午午自刑"]);
    expect(gzRels("丙午", "丁卯")).toEqual(["地支午卯相破"]);
    expect(gzRels("丙午", "戊辰")).toEqual([]);
  });
  it("太歲 relation: the year branch against the birth-year branch", () => {
    expect(taisuiOf("午", "午")).toEqual(["值太岁"]);
    expect(taisuiOf("午", "子")).toEqual(["冲太岁"]);
    expect(taisuiOf("午", "丑")).toEqual(["害太岁"]);
    expect(taisuiOf("午", "卯")).toEqual(["破太岁"]);
    expect(taisuiOf("寅", "巳")).toEqual(["刑太岁", "害太岁"]);
    expect(taisuiOf("午", "辰")).toEqual([]);
  });
  it("旬空 of a 干支", () => {
    expect(kongOf("甲子")).toBe("戌亥");
    expect(kongOf("乙丑")).toBe("戌亥");
    expect(kongOf("壬午")).toBe("申酉");
    expect(kongOf("癸亥")).toBe("子丑");
  });
  it("month flags: 日支／月支 relations, 旬空, 合日干, 天乙貴人 and the other stars, 伏吟", () => {
    const fl = monthFlags(pillars, "male", 2026, "戊辰");
    expect(fl).toHaveLength(12);
    expect(fl[0]).toEqual(["合日干", "驿马"]); // 庚寅: 乙庚合; 寅 is 驛馬 for 辰
    expect(fl[1]).toEqual(["刑月支", "禄神"]); // 辛卯: 卯刑子; 乙祿在卯
    expect(fl[5]).toEqual(["冲日支", "刑日支", "害月支", "天乙贵人"]); // 乙未
    expect(fl[8]).toEqual(["刑日支", "旬空"]); // 戊戌: 戌 in 乙丑's 空亡 戌亥
    expect(fl[9]).toContain("旬空");
    expect(fl[10]).toEqual(["合日支", "合日干", "天乙贵人"]); // 庚子
    // a month whose 干支 is the 大運's / the year's own
    expect(monthFlags(pillars, "male", 2026, "甲午")[4]).toContain("伏吟大运");
    expect(monthFlags(pillars, "male", 2027, null)[5]).toContain("伏吟流年"); // 丁未 month of the 丁未 year
  });
  it("key months and the stretches to go easy are deterministic for a fixed chart", () => {
    const curve = monthCurve({ pillars, favour: [], avoid: [] }, 2026);
    const fl = monthFlags(pillars, "male", 2026, "戊辰");
    const k = keyMonths(curve, fl);
    expect(k).toEqual({ smooth: 10, slow: 5, pivot: 4 });
    expect(keyMonths(curve, fl)).toEqual(k);
    expect(new Set([k.smooth, k.slow, k.pivot]).size).toBe(3);
    const g = guardPeriods(curve, fl, k.smooth);
    expect(g.map((x) => [x.from, x.to])).toEqual([[1, 1], [4, 5]]);
    expect(g[1]!.why).toContain("未冲日支丑");
    // with 喜用 the same picks follow the scores
    const c2 = monthCurve({ pillars, favour: ["金", "火", "土"], avoid: ["水", "木"] }, 2026);
    const k2 = keyMonths(c2, fl);
    expect(k2.smooth).toBe(11); // 辛丑 5 (辛金 and 丑土 喜用, 丑 合 月支子)
    expect(c2[k2.slow]!.score).toBe(Math.min(...c2.filter((_, i) => i !== k2.smooth).map((m) => m.score)));
  });
  it("a year report carries the 年書 facts", () => {
    const n = normalizeBirth({ calendar: "solar", y: 1989, m: 1, d: 5, timeMode: "exact", h: 11, mi: 30, place: { id: "1668341", name: "Taipei Daan", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" } });
    const f = factsFromBirth(n, "male", "year", OCT_18_2026);
    const b = f.book!;
    expect(b).toBeTruthy();
    expect(b.gz).toBe("丙午");
    expect(b.decade).toMatchObject({ gz: "戊辰", rels: [] });
    expect(b.natal.map((p) => p.rels)).toEqual([[], ["地支午子相冲"], ["地支午丑相害"], ["天干丙壬相冲", "地支午午自刑"]]);
    expect(b.natal[2]!.palace).toContain("配偶宫");
    expect(b.taisui).toEqual([]);
    expect(b.flags).toHaveLength(12);
    expect(b.noble).toEqual({ branches: ["子", "丑", "未", "申"], zodiac: ["鼠", "牛", "羊", "猴"] }); // 乙 → 子申, 戊 → 丑未
    expect(b.allies).toEqual({ liuhe: ["鼠"], sanhe: ["蛇", "鸡"] }); // 日支丑: 子丑合, 巳酉丑
    expect(b.guards.length).toBeGreaterThanOrEqual(2);
    expect(b.guards.length).toBeLessThanOrEqual(3);
    expect(factsFromBirth(n, "male", "deep", OCT_18_2026).book).toBeUndefined();
  });
  it("writing calls: the 年書 groups (+qa with a question); the old format keeps one per year", () => {
    expect(groupKeys("year", [2026], { book: true })).toEqual(["ov", "m1", "m2", "m3", "m4", "ar", "ar2", "gx"]);
    expect(groupKeys("year", [2026], { book: true, question: true })).toEqual(["ov", "m1", "m2", "m3", "m4", "ar", "ar2", "gx", "qa"]);
    expect(groupKeys("year", [2026])).toEqual(["y2026"]);
  });
  it("太歲 is a plain fact in a 流年 report only; 犯／安／拜太歲 never", () => {
    expect(baziReportOffense("今年值太歲，適合整理", "year")).toBeNull();
    expect(baziReportOffense("今年值太歲")).not.toBeNull();
    expect(baziReportOffense("今年值太歲", "deep")).not.toBeNull();
    for (const s of ["今年犯太歲", "記得安太歲", "去拜太歲", "太歲星君"]) expect(baziReportOffense(s, "year"), s).not.toBeNull();
    expect(partOffense("year", { a: ["沖太歲的一年，節奏放慢"] })).toBeNull();
  });
  it("shapes each 年書 call", () => {
    const z = (k: number) => "字".repeat(k);
    const guards = [{ from: 1, to: 1, why: [] }, { from: 4, to: 5, why: [] }];
    expect(shapeBook("ov", { keyword: "「整理」", verdict: z(400), keyMonths: { smooth: z(120), slow: z(120), pivot: z(120) } }, { guards })).toMatchObject({ ok: true, value: { keyword: "整理" } });
    expect(shapeBook("ov", { keyword: "整理", verdict: z(100), keyMonths: {} }, { guards })).toEqual({ ok: false, why: "short:verdict" });
    const mo = Array.from({ length: 3 }, () => ({ read: z(160), focus: { work: z(40), money: z(40), love: z(40), rest: z(40) }, yi: ["談合作。", "整理帳目", "見老朋友", "多一個"], ji: ["衝動簽約"] }));
    const m = shapeBook("m1", { months: mo }, { guards });
    expect(m.ok && (m.value.months as { yi: string[] }[])[0]!.yi).toEqual(["談合作", "整理帳目", "見老朋友"]);
    expect(shapeBook("m2", { months: mo.slice(0, 2) }, { guards })).toEqual({ ok: false, why: "months:2" });
    expect(shapeBook("ar", { career: z(300), wealth: z(300), love: { single: z(170) } }, { guards })).toEqual({ ok: false, why: "missing:love.paired" });
    expect(shapeBook("ar2", { rhythm: z(300), people: z(300), home: z(300) }, { guards }).ok).toBe(true);
    const q = [z(20), z(20), z(20)];
    expect(shapeBook("gx", { allies: z(220), guards: [z(120)], quarters: { q1: q, q2: q, q3: q, q4: q } }, { guards })).toEqual({ ok: false, why: "guards:1/2" });
    expect(shapeBook("gx", { allies: z(220), guards: [z(120), z(120)], quarters: { q1: q, q2: q, q3: q, q4: q } }, { guards }).ok).toBe(true);
    expect(shapeBook("qa", { answer: z(600) }, { guards }).ok).toBe(true);
  });
});

describe("年書 question", () => {
  const n = normalizeBirth({ calendar: "solar", y: 1990, m: 6, d: 15, timeMode: "exact", h: 8, mi: 0, place: { id: "1668341", name: "Taipei", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" } });
  it("is cleaned and capped at 200 characters", () => {
    expect(cleanQuestion("  今年\n適合  換工作嗎？ ")).toBe("今年 適合 換工作嗎？");
    expect([...cleanQuestion("問".repeat(300))!].length).toBe(QUESTION_MAX);
    expect(cleanQuestion("   ")).toBeNull();
    expect(cleanQuestion(42)).toBeNull();
  });
  it("is stored on the report row, capped, and part of what makes a report", () => {
    const facts = factsFromBirth(n, "female", "year", OCT_18_2026);
    const a = createReport({ kind: "year", locale: "zh-hant", register: null, customerId: null, email: null, facts, question: "會".repeat(250) });
    expect(baziReport(a.token)?.question).toBe("會".repeat(200));
    const none = createReport({ kind: "year", locale: "zh-hant", register: null, customerId: null, email: null, facts });
    expect(baziReport(none.token)?.question ?? null).toBeNull();
    // a deep report never keeps a question
    const deep = createReport({ kind: "deep", locale: "zh-hant", register: null, customerId: null, email: null, facts: factsFromBirth(n, "female", "deep", OCT_18_2026), question: "x" });
    expect(baziReport(deep.token)?.question ?? null).toBeNull();
  });
  it("a year is bought once: a new question is answered in the same report (Neil 10-19)", () => {
    const facts = factsFromBirth(n, "male", "year", OCT_18_2026);
    const cust = 990001;
    const t = createReport({ kind: "year", locale: "zh-hant", register: null, customerId: cust, email: null, facts, question: "換工作？", paid: { session: "tester:1" } });
    expect(createReport({ kind: "year", locale: "zh-hant", register: null, customerId: cust, email: null, facts, question: "換工作？", paid: { session: "tester:1" } }).token).toBe(t.token);
    const again = createReport({ kind: "year", locale: "zh-hant", register: null, customerId: cust, email: null, facts, question: "要搬家嗎？", paid: { session: "tester:1" } });
    expect(again).toEqual({ token: t.token, created: false });
    expect(baziReport(t.token)?.question).toBe("要搬家嗎？");
    expect(paidReportFor(cust, facts, "year", "zh-hant", "完全不同的事")).toBe(t.token);
    expect(baziReport(t.token)?.question).toBe("完全不同的事");
    expect(paidReportFor(cust, facts, "year", "zh-hant")).toBe(t.token);
    markBaziPaid(t.token, { session: "tester:1", email: null, currency: "TWD", amountMinor: 0, customerId: cust });
  });
});
