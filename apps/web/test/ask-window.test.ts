import { describe, expect, it } from "vitest";
import { askWindow, scaleFromWindow } from "../src/lib/ask-window";
import { questionScale, timingPlan } from "../src/lib/timing";
import { fullChart, type LineValue } from "@yaoflow/engine";

// cast: Thursday 2026-09-24, 10:00 in UTC+8
const AT = Date.UTC(2026, 8, 24, 2);
const W = (q: string, tz = 480) => askWindow(q, AT, tz);
const span = (q: string) => { const w = W(q); return w ? `${w.start}~${w.end}` : null; };

describe("问题里的时间范围 → 起卦人自己日历上的具体日期（09-24）", () => {
  it("today / tomorrow / the day after", () => {
    expect(span("今天他会回我消息吗")).toBe("2026-09-24~2026-09-24");
    expect(W("今晚的饭局顺利吗")!.kind).toBe("today");
    expect(span("明天面试能过吗")).toBe("2026-09-25~2026-09-25");
    expect(span("后天的签约顺利吗")).toBe("2026-09-26~2026-09-26");
    expect(span("大後天會下雨嗎")).toBe("2026-09-27~2026-09-27");
    expect(span("Will he text me tomorrow?")).toBe("2026-09-25~2026-09-25");
  });
  it("this week / next week / weekend / named weekdays", () => {
    expect(span("这个星期能收到offer吗")).toBe("2026-09-24~2026-09-27");
    expect(span("這週會有消息嗎")).toBe("2026-09-24~2026-09-27");
    expect(span("本礼拜能谈下来吗")).toBe("2026-09-24~2026-09-27");
    expect(span("下周能入职吗")).toBe("2026-09-28~2026-10-04");
    expect(span("下個禮拜他會回來嗎")).toBe("2026-09-28~2026-10-04");
    expect(span("周末约会顺利吗")).toBe("2026-09-26~2026-09-27");
    expect(span("週五會發薪水嗎")).toBe("2026-09-25~2026-09-25");
    expect(span("下周五的面试")).toBe("2026-10-02~2026-10-02");
    expect(span("星期一能拿到结果吗")).toBe("2026-09-28~2026-09-28");
    expect(span("Will it close by Friday?")).toBe("2026-09-24~2026-09-25");
    expect(span("next week")).toBe("2026-09-28~2026-10-04");
  });
  it("within N days / weeks / months, month and year limits", () => {
    expect(span("三天内会有回复吗")).toBe("2026-09-24~2026-09-27");
    expect(span("他3天內可以完成籌到錢嗎？")).toBe("2026-09-24~2026-09-27");
    expect(span("两周内能谈妥吗")).toBe("2026-09-24~2026-10-08");
    expect(span("一个月内能找到工作吗")).toBe("2026-09-24~2026-10-24");
    expect(span("三個月內會復合嗎")).toBe("2026-09-24~2026-12-23");
    expect(span("这个月能签约吗")).toBe("2026-09-24~2026-09-30");
    expect(span("月底前能还清吗")).toBe("2026-09-24~2026-09-30");
    expect(span("下个月能搬家吗")).toBe("2026-10-01~2026-10-31");
    expect(span("年底前能結婚嗎")).toBe("2026-09-24~2026-12-31");
    expect(span("今年能买房吗")).toBe("2026-09-24~2026-12-31");
    expect(span("明年能出国吗")).toBe("2027-01-01~2027-12-31");
    expect(span("within two weeks")).toBe("2026-09-24~2026-10-08");
    expect(span("by the end of the month")).toBe("2026-09-24~2026-09-30");
  });
  it("explicit dates and holidays", () => {
    expect(span("9月30日前能拿到钱吗")).toBe("2026-09-24~2026-09-30");
    expect(span("10月13号的考试能过吗")).toBe("2026-10-13~2026-10-13");
    expect(span("26/09 的面試")).toBe("2026-09-26~2026-09-26");
    expect(span("30号能到账吗")).toBe("2026-09-30~2026-09-30");
    expect(span("五月能考上吗")).toBe("2027-05-01~2027-05-31");
    expect(span("中秋能见面吗")).toBe("2026-09-25~2026-09-25");
    expect(span("过年前能回家吗")).toBe("2026-09-24~2027-02-05"); // 10-05: up to 除夕, not New Year's Day itself
    expect(span("by October 15")).toBe("2026-09-24~2026-10-15");
  });
  it("the nearest limit wins; a passing 今天 does not beat a named later period; the past is not a deadline", () => {
    expect(span("这周五之前，最晚月底，能签吗")).toBe("2026-09-24~2026-09-25");
    expect(span("今天想问一下明年能不能结婚")).toBe("2027-01-01~2027-12-31");
    expect(W("9/21 他说要考虑，会答应吗")).toBeNull();
    expect(W("9月14日他说会再联系，还会联系吗")).toBeNull();
    expect(span("3月能怀孕吗")).toBe("2027-03-01~2027-03-31");
    expect(span("26/09/2026 的面試")).toBe("2026-09-26~2026-09-26");
    expect(W("有一天他会回来吗")).toBeNull();
    expect(W("他爱我吗")).toBeNull();
  });
  it("other languages: the common words", () => {
    expect(span("明日の面接は大丈夫？")).toBe("2026-09-25~2026-09-25");
    expect(span("내일 연락 올까요")).toBe("2026-09-25~2026-09-25");
    expect(span("Est-ce qu'il m'appellera cette semaine ?")).toBe("2026-09-24~2026-09-27");
    expect(span("Bekomme ich nächsten Monat die Stelle?")).toBe("2026-10-01~2026-10-31");
    expect(span("¿Me llamará mañana?")).toBe("2026-09-25~2026-09-25");
    expect(span("Vou conseguir este ano?")).toBe("2026-09-24~2026-12-31");
  });
  it("uses the caster's own calendar: 23:30 in UTC+8 is still the 24th there", () => {
    const late = Date.UTC(2026, 8, 24, 15, 30); // 23:30 in UTC+8
    expect(askWindow("明天", late, 480)!.start).toBe("2026-09-25");
    expect(askWindow("tomorrow", late, -420)!.start).toBe("2026-09-25"); // 08:30 on the 24th in UTC-7
  });
  it("a window turns an 'open' question into a scale; the plan marks which candidates fall inside", () => {
    expect(questionScale("这个月能签约吗")).toBe("weeks");
    expect(questionScale("三個月內會復合嗎")).toBe("long");
    expect(scaleFromWindow(W("今天")!)).toBe("now");
    const chart = fullChart({ values: [7, 8, 9, 7, 8, 7] as LineValue[], utcMs: AT, tzOffsetMinutes: 480 });
    const p = timingPlan(chart, AT, 480, "career", "这个月能拿到offer吗");
    expect(p.ask_window?.end).toBe("2026-09-30");
    for (const c of p.candidates) for (const w of c.windows) expect(typeof w.in_ask).toBe("boolean");
    const firstIn = p.candidates.findIndex((c) => c.windows.some((w) => w.in_ask));
    const firstOut = p.candidates.findIndex((c) => !c.windows.some((w) => w.in_ask));
    if (firstIn >= 0 && firstOut >= 0) expect(firstIn).toBeLessThan(firstOut);
    expect(p.ask_hit).toBe(p.candidates.some((c) => c.windows.some((w) => w.in_ask)));
  });
});

// 10-05 (Neil: 「這個卦，AI識別不了農曆的準確性嗎？香港和台灣都有各的說法」)
describe("农历与港台历法说法 → 公历窗口（10-05）", () => {
  // the reading that raised it: cast 2026-10-05 10:00 UTC+8, 農曆八月廿五
  const OCT5 = Date.UTC(2026, 9, 5, 2);
  const W5 = (q: string) => askWindow(q, OCT5, 480);
  const span5 = (q: string) => { const w = W5(q); return w ? `${w.start}~${w.end}` : null; };

  it("農曆十月 is Nov 9 – Dec 8, not October", () => {
    const w = W5("農曆10月紫微命盤的動像是不是可以有offer、確定入職？")!;
    expect(`${w.start}~${w.end}`).toBe("2026-11-09~2026-12-08");
    expect(w.kind).toBe("period");
    expect(w.phrase).toBe("農曆10月");
    expect(w.label_zh).toBe("11月9日–12月8日（農曆十月）");
    expect(w.calendar?.kind).toBe("lunar");
    expect(w.calendar?.zh).toContain("11月9日至12月8日");
    expect(scaleFromWindow(w)).toBe("weeks"); // a month-long window two months out is weeks, not a long matter
    expect(span5("农历十月能拿到offer吗")).toBe("2026-11-09~2026-12-08");
    expect(span5("舊曆十月初八之前會有消息嗎")).toBe("2026-10-05~2026-11-16");
    expect(W5("陰曆十月初八的面試")!.label_zh).toBe("11月16日（農曆十月初八）");
    expect(span5("農曆8月結束前是否能收到他主動聯繫的消息？")).toBe("2026-10-05~2026-10-09"); // 八月 runs to Oct 9
    expect(span5("在農曆九月，我可以和我喜歡的女孩在一起嗎？")).toBe("2026-10-10~2026-11-08");
    expect(span5("農曆十月底前能簽約嗎")).toBe("2026-10-05~2026-12-08");
    expect(span5("農曆十月前能簽約嗎")).toBe("2026-10-05~2026-11-08");
    expect(span5("農曆十月中旬他會聯絡我嗎")).toBe("2026-11-19~2026-11-28");
  });
  it("named lunar months and the lunar year: 正月 / 臘月 / 閏月 / 明年農曆三月 / 十月初八", () => {
    expect(span5("正月能結婚嗎")).toBe("2027-02-06~2027-03-07");
    expect(span5("臘月前能還清嗎")).toBe("2026-10-05~2027-01-07");
    expect(span5("明年農曆三月會搬家嗎")).toBe("2027-04-07~2027-05-05");
    expect(W5("閏五月會有變化嗎")!.start).toBe("2028-06-23"); // the next year that has one
    expect(W5("閏六月會有變化嗎")).toBeNull(); // none until 2036
    expect(span5("十月初八那天能見面嗎")).toBe("2026-11-16~2026-11-16");
  });
  it("國曆 / 新曆 / 西曆 / 公曆 are the Gregorian calendar; 民國 years", () => {
    expect(span5("我國曆10月會不會拿到劍橋的conditional offer?")).toBe("2026-10-05~2026-10-31");
    expect(span5("這個月底前（國曆10月）李會跟我聯絡嗎")).toBe("2026-10-05~2026-10-31");
    expect(span5("今年國曆年底，我到底能否找到適合的人在一起？")).toBe("2026-10-05~2026-12-31");
    expect(span5("西曆年前能找到工作嗎")).toBe("2026-10-05~2026-12-31");
    expect(span5("新曆新年會不會有消息")).toBe("2027-01-01~2027-01-01");
    expect(span5("115年底前能升職嗎")).toBe("2026-10-05~2026-12-31");
    expect(span5("民國116年3月能考上嗎")).toBe("2027-03-01~2027-03-31");
    expect(span5("115/10/20 的面試會過嗎")).toBe("2026-10-20~2026-10-20");
    expect(W5("在國曆今年結束前他會跟我復合嗎")!.end).toBe("2026-12-31");
  });
  it("過年 / 年前 / 新年 / 除夕 / 年廿八 / 年初二: the lunar new year", () => {
    expect(span5("迎接新農曆新年前我們會正式成為男女朋友嗎？")).toBe("2026-10-05~2027-02-05");
    expect(span5("在過年前他會主動聯繫我嗎？")).toBe("2026-10-05~2027-02-05");
    expect(span5("年前能找到工作嗎")).toBe("2026-10-05~2027-02-05");
    expect(W5("年前能找到工作嗎")!.calendar?.zh).toContain("除夕");
    expect(span5("現在到明年過年 前任會回頭嗎")).toBe("2026-10-05~2027-02-05");
    expect(span5("過年會不會回來")).toBe("2027-02-06~2027-02-12"); // 初一到初七
    expect(span5("年初一會回來嗎")).toBe("2027-02-06~2027-02-06");
    expect(span5("過年後會不會有新工作")).toBe("2027-02-13~2027-03-14"); // after the holiday week
    expect(span5("新年會有對象嗎")).toBe("2027-02-06~2027-02-12");
    expect(span5("除夕會團圓嗎")).toBe("2027-02-05~2027-02-05");
    expect(span5("年廿八前會收到嗎")).toBe("2026-10-05~2027-02-04");
    expect(span5("年初二能見到他嗎")).toBe("2027-02-07~2027-02-07");
    expect(span5("Will he come back before Chinese New Year?")).toBe("2026-10-05~2027-02-05");
    expect(span5("설날 전에 연락 올까요")).toBe("2027-02-06~2027-02-12");
  });
  it("festivals: 元宵 / 端午 / 中秋 (computed) / 重陽 / 冬至 / 清明 / 聖誕 / 元旦 / 國慶 by place", () => {
    expect(span5("元宵前會復合嗎")).toBe("2026-10-05~2027-02-20");
    expect(span5("端午能見面嗎")).toBe("2027-06-09~2027-06-09");
    expect(span5("重陽那天會回來嗎")).toBe("2026-10-18~2026-10-18");
    expect(span5("冬至前能搬進去嗎")).toBe("2026-10-05~2026-12-22");
    expect(span5("清明前能談妥嗎")).toBe("2026-10-05~2027-04-05");
    expect(span5("寒露之後兩個人關係會有轉變嗎")).toBe("2026-10-09~2026-11-07");
    expect(span5("聖誕節他會不會單獨約我出去")).toBe("2026-12-24~2026-12-25");
    expect(span5("元旦前能收到嗎")).toBe("2026-10-05~2027-01-01");
    expect(span5("國慶連假我們會實際見面嗎")).toBe("2026-10-09~2026-10-11"); // Taiwan 雙十 weekend
    expect(span5("国庆假期能见面吗")).toBe("2026-10-05~2026-10-07"); // mainland, under way
    expect(span5("中秋過後兩週內，我們會不會再見上一面？")).toBe("2027-09-16~2027-09-29"); // next year's, this one has passed
    expect(askWindow("中秋過後兩週內，我們會不會再見上一面？", Date.UTC(2026, 8, 25, 2), 480)?.end).toBe("2026-10-09");
    expect(W5("小雪會不會回來找我")).toBeNull(); // a person, not the 節氣
    expect(span5("小雪前會有消息嗎")).toBe("2026-10-05~2026-11-22");
  });
  it("the past is not a window: 三天前 / 3年前 / 一年前 / two weeks ago; 2027 年底 names its year", () => {
    expect(span5("三天前他说自己适合独处我也不想再找他了，今年年底前，wzy还会主动找我吗？")).toBe("2026-10-05~2026-12-31");
    expect(W5("Mel有覺得我跟3年前有變化嗎")).toBeNull();
    expect(W5("3年前分手的前任，我們會怎樣呢？會有聯絡嗎")).toBeNull();
    expect(W5("訊息是一年前傳的，今年還會有下落嗎")!.end).toBe("2026-12-31");
    expect(W5("He left two weeks ago, will he write?")).toBeNull();
    expect(span5("我和他在 2027 年底以前會重新建立戀愛關係嗎？")).toBe("2026-10-05~2027-12-31");
    expect(span5("2027年底會結婚嗎")).toBe("2027-10-01~2027-12-31");
    expect(span5("明年年底前能買房嗎")).toBe("2026-10-05~2027-12-31");
    expect(span5("明年10月能出國嗎")).toBe("2027-10-01~2027-10-31");
    expect(span5("10月底前能拿到offer嗎")).toBe("2026-10-05~2026-10-31");
    expect(span5("11月底前能拿到offer嗎")).toBe("2026-10-05~2026-11-30");
  });
  it("the plan carries the lunar calendar and finds the rule's days inside a far window", () => {
    const chart = fullChart({ values: [7, 8, 9, 7, 8, 7] as LineValue[], utcMs: OCT5, tzOffsetMinutes: 480 });
    const p = timingPlan(chart, OCT5, 480, "career", "農曆10月能不能確定入職？");
    expect(p.ask_window?.start).toBe("2026-11-09");
    expect(p.ask_hit).toBe(true);
    const inside = p.candidates.flatMap((c) => c.windows.filter((w) => w.in_ask));
    expect(inside.length).toBeGreaterThan(0);
    for (const w of inside) expect(w.core ? w.core >= "2026-11-09" && w.core <= "2026-12-08" : w.start <= "2026-12-08" && w.end >= "2026-11-09").toBe(true);
    expect(inside.some((w) => w.core)).toBe(true); // real 值日/冲日 inside the lunar month, not only the month window
    expect(p.lunar.today_hant).toBe("農曆八月廿五");
    expect(p.lunar.months_hant).toContain("十月＝11月9日–12月8日");
    expect(p.today_label_zh).toContain("农历八月廿五");
  });
});

describe("起卦页也在浏览器里跑这套识别：不能有 lookbehind（老 Safari 会整页报错）", () => {
  it("ask-window / scale-words / keywords / topic carry no lookbehind", async () => {
    const fs = await import("node:fs");
    for (const f of ["ask-window.ts", "scale-words.ts", "keywords.ts", "topic.ts"]) {
      const src = fs.readFileSync(new URL(`../src/lib/${f}`, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/\(\?<[=!]/);
    }
  });
  it("Traditional Chinese reads the same in the browser (no OpenCC there) as Simplified on the server", () => {
    for (const [hant, hans] of [["這週會有消息嗎", "这周会有消息吗"], ["什麼時候開始比較好", "什么时候开始比较好"], ["明年能結婚嗎", "明年能结婚吗"], ["現在去找他好嗎", "现在去找他好吗"]]) {
      expect(questionScale(hant!, AT, 480), hant).toBe(questionScale(hans!, AT, 480));
    }
  });
  it("'this morning' is not 'tomorrow' in German and Spanish", () => {
    expect(W("Ruft er heute Morgen an?")?.kind).toBe("today");
    expect(W("¿Me escribirá esta mañana?")?.kind).toBe("today");
    expect(span("Kommt die Antwort übermorgen?")).toBe("2026-09-26~2026-09-26");
    expect(span("¿Llegará pasado mañana?")).toBe("2026-09-26~2026-09-26");
    expect(span("Vai chegar depois de amanhã?")).toBe("2026-09-26~2026-09-26");
    expect(W("明天之前 9/30")?.end).toBe("2026-09-25");
    expect(W("在10月3号之前能到吗")?.phrase).toBe("10月3号之前");
  });
});

// 10-18 (Karen / #1928): "七月他提分手…" asked in October was answered 「你問的七月」 with next July as the window
describe("问题里提到的过去月份是在讲经过，不是问的时间（10-18）", () => {
  const OCT = Date.UTC(2026, 9, 12, 14, 54); // 2026-10-12 22:54 UTC+8
  const Wo = (q: string) => askWindow(q, OCT, 480);
  it("过去的月份后面接着发生的事：不算窗口", () => {
    expect(Wo("七月他提分手，到現在我跟他媽媽還是有互動，請問我們兩人有可能再復合嗎？")).toBeNull();
    expect(Wo("我們3月認識，他會跟我告白嗎")).toBeNull();
    expect(Wo("五月開始冷戰，還有機會嗎")).toBeNull();
    expect(Wo("八月的時候他說要考慮，現在會回頭嗎")).toBeNull();
    expect(Wo("从6月到现在他都没联系我，他还会找我吗")).toBeNull();
  });
  it("问的是未来的月份：照旧算", () => {
    expect(Wo("三月會升職嗎")!.start).toBe("2027-03-01");
    expect(Wo("明年7月能結婚嗎")!.start).toBe("2027-07-01");
    expect(Wo("七月前能找到工作嗎")!.end).toBe("2027-06-30");
    expect(Wo("十二月他會回來嗎")!.start).toBe("2026-12-01");
  });
});
