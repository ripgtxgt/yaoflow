import { lunarDateOf, lunarMonth, lunarNewYear, lunarToIso, lunarYearEnd, solarTermIso } from "@yaoflow/engine";

/**
 * 问题自带的时间范围 (09-24, Neil: 「今天、明天、后天、这个星期等词汇有做优化提取吗」).
 *
 * questionScale() only sorted a question into now / day / long. "明天会联系我吗",
 * "这个月能签吗", "年底前能还清吗" all carried a real window the reader cares
 * about, and 97 of 144 such questions on record were read as "open" — the
 * chart then picked a date that could fall outside what was asked.
 *
 * This turns the words into the actual dates in the caster's own calendar, so
 * the timing block can say which candidate falls INSIDE the window, and the
 * reading can answer the question that was really asked ("明天不太会，更可能是
 * 9月30日前后") instead of a date that ignores it.
 *
 * 10-05 农历与港台说法 (Neil: 「這個卦，AI識別不了農曆的準確性嗎？香港和台灣都有各的說法」):
 * a reader asked about 農曆十月 and got Gregorian October back. Now:
 *   - 農曆/舊曆/陰曆 + month (正月 … 臘月, 閏月, 初一 … 三十) is converted with the
 *     engine's lunar calendar, and the window says so (`calendar`), so the
 *     reading can repeat the conversion once;
 *   - 國曆 (Taiwan) / 新曆·西曆 (Hong Kong) / 公曆·陽曆 (mainland, Singapore,
 *     Malaysia) are the Gregorian calendar — the plain month they qualify;
 *     民國 years (115年 = 2026, 115/10/15) are understood;
 *   - the lunar festivals people set deadlines by — 過年/春節/新年/年初一/除夕/
 *     年廿八/元宵/端午/七夕/中元/中秋/重陽/臘八 — and the 24 節氣 (清明/冬至/寒露…)
 *     are computed, not tabled; 國慶 is 10月1日 in Hong Kong and 雙十 in Taiwan;
 *   - "三天前" / "3年前" / "一年前" are the past, not a window (two deep readings
 *     had answered "你問的是三天內 / 年前");
 *   - "2027 年底" names its year (it had been read as this year's end).
 *
 * Pure: question + cast instant + caster's UTC offset → window or null.
 * Runs in the browser too (CastFlow): no regex lookbehind anywhere in here.
 */

export interface AskWindow {
  /** ISO local dates, inclusive */
  start: string;
  end: string;
  /** the words that set it, as the reader wrote them */
  phrase: string;
  /** today | day (one named day) | span (from today up to a limit) | period (a later stretch, e.g. 下个月 / 明年) */
  kind: "today" | "day" | "span" | "period";
  /** days from the cast date to the window's end (0 = today) */
  days: number;
  label_zh: string;
  label_en: string;
  /**
   * 10-05: the phrase named a lunar month/day, a festival, a 節氣 or a 民國
   * year, and was converted — what it was read as, for the reading to say once.
   */
  calendar?: { kind: "lunar" | "festival" | "solar_term"; zh: string; en: string };
}

const DAY = 86_400_000;

interface D { y: number; m: number; d: number } // m 1-12

const toUtc = (x: D) => Date.UTC(x.y, x.m - 1, x.d);
const fromUtc = (ms: number): D => { const t = new Date(ms); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const add = (x: D, n: number): D => fromUtc(toUtc(x) + n * DAY);
const iso = (x: D) => `${x.y}-${String(x.m).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;
const diff = (a: D, b: D) => Math.round((toUtc(b) - toUtc(a)) / DAY);
const dow = (x: D) => (new Date(toUtc(x)).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
const monthEnd = (y: number, m: number): D => fromUtc(Date.UTC(y, m, 0));
const EN_MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const zhDay = (x: D) => `${x.m}月${x.d}日`;
const enDay = (x: D) => `${EN_MON[x.m - 1]} ${x.d}`;
const parseIso = (s: string): D => ({ y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10) });

/** 復活節 (Easter Sunday) — Hong Kong keeps Good Friday to Easter Monday. */
const EASTER: Record<number, string> = { 2026: "2026-04-05", 2027: "2027-03-28", 2028: "2028-04-16", 2029: "2029-04-01", 2030: "2030-04-21", 2031: "2031-04-13", 2032: "2032-03-28" };

const CN_NUM: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };
/** 一 … 九十九, 两, 半, or digits */
function num(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  if (s === "半") return 0.5;
  if (s === "十") return 10;
  const m = /^([一二两兩三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (m) return (m[1] ? CN_NUM[m[1]]! : 1) * 10 + (m[2] ? CN_NUM[m[2]]! : 0);
  if (s.length === 1 && s in CN_NUM) return CN_NUM[s]!;
  return null;
}
const EN_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, few: 3 };
const enNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : EN_NUM[s.toLowerCase()] ?? null);

/** 正月 → 1, 冬月 → 11, 臘月 → 12; 十一 / 十二 / 一 … 十 / digits */
function lunarMonthNum(s: string): number | null {
  if (s === "正") return 1;
  if (s === "冬") return 11;
  if (s === "臘" || s === "腊") return 12;
  return num(s);
}
/** 初一 … 初十, 十一 … 二十, 廿一 … 廿九, 三十, or digits */
function lunarDayNum(s: string): number | null {
  const bare = s.replace(/[日号號]$/, "");
  if (/^\d+$/.test(bare)) return Number(bare);
  let m = /^初([一二三四五六七八九十])$/.exec(bare);
  if (m) return CN_NUM[m[1]!]!;
  m = /^廿([一二三四五六七八九])?$/.exec(bare);
  if (m) return 20 + (m[1] ? CN_NUM[m[1]]! : 0);
  if (bare === "卅") return 30;
  return num(bare);
}
const ZH_MON = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];

const WD_ZH: Record<string, number> = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };
const WD_EN: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

type Win = Omit<AskWindow, "days" | "label_zh" | "label_en"> & { label_zh?: string; label_en?: string };
type Hit = { at: number; len: number; w: Win };

/* ---- 10-05: building blocks for the lunar / festival rules (all non-capturing) ---- */
const LUNAR_Q = "(?:農曆|农历|農歷|农歷|陰曆|阴历|陰歷|舊曆|旧历|舊歷|夏曆|夏历|華曆|华历|老曆|老历|唐曆|唐历|lunar\\s*)";
const YEARW = "(?:今年|明年|來年|来年|後年|后年|20\\d\\d\\s*年)";
const LDAY = "(?:初[一二三四五六七八九十]|廿[一二三四五六七八九]?|卅|二十[一二三四五六七八九]?|十[一二三四五六七八九]|\\d{1,2}(?:日|号|號))";
const PART = "(?:初|中|底|末|尾|上旬|中旬|下旬)";
const BEFORE = "(?:之前|以前|前|为止|為止|[内內]|之[内內]|以[内內]|结束前|結束前|底前|末前|完結前|完结前)";
const AFTER = "(?:過後|过后|之後|之后|以後|以后|後|后)";
const DUR = "(\\d+|[一二两兩三四五六七八九十]+|半)\\s*(?:个|個)?(天|日|星期|礼拜|禮拜|周|週|月)(?:[内內]|之[内內]|以[内內])?";
const UNTIL = "(到|至|直到|直至)?\\s*";
const isBefore = (s: string | undefined) => Boolean(s) && new RegExp(`^${BEFORE}$`).test(s!);

/** Every rule returns start/end relative to `t` (the caster's local date). */
/** What follows a month that names a past event: someone did something then, or "since then / until now" */
const PAST_TALE = /^\s*[，,、]?\s*(?:的時候|的时候|那時|那时|時|时|開始|开始|以來|以来|之後|之后|[後后](?![會会能])|到現在|到现在|至今|就|他|她|我|我們|我们|對方|对方|男友|女友|前任|老公|老婆|提|分手|認識|认识|在一起|吵架|離職|离职|搬|說|说)/;

function rules(q: string, t: D): Hit[] {
  const hits: Hit[] = [];
  const push = (re: RegExp, f: (m: RegExpExecArray) => Win | null) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(q))) {
      const w = f(m);
      if (w) hits.push({ at: m.index, len: m[0].length, w });
      if (m[0].length === 0) g.lastIndex += 1;
    }
  };
  const span = (end: D, phrase: string): Win => ({ start: iso(t), end: iso(end), phrase, kind: "span" });
  const period = (a: D, b: D, phrase: string): Win => ({ start: iso(a), end: iso(b), phrase, kind: "period" });
  const one = (x: D, phrase: string): Win => (diff(t, x) === 0 ? { start: iso(x), end: iso(x), phrase, kind: "today" } : { start: iso(x), end: iso(x), phrase, kind: "day" });
  /** a stretch that may already be under way: from today to its end, or the whole of it if still ahead */
  const stretch = (a: D, b: D, phrase: string): Win => (diff(t, a) <= 0 ? span(b, phrase) : period(a, b, phrase));
  const BY = "(?:之前|以前|前|为止|為止|内|內|之内|之內|以内|以內)?";
  /** rules that match one character of context before the date (no lookbehind — older Safari) drop it here */
  const lead = (m: RegExpExecArray): string => {
    const k = m[0].search(/[\d一二三四五六七八九十]/);
    if (k > 0) { m.index += k; m[0] = m[0].slice(k); }
    return m[0];
  };
  const sunday = add(t, 6 - dow(t));
  const today = iso(t);
  const lunarToday = lunarDateOf(today);
  const durDays = (n: number, unit: string) => Math.round(n * (unit === "天" || unit === "日" ? 1 : unit === "月" ? 30 : 7));
  /** 到X / X前 → up to the anchor; X後 (+ optional duration) → from the anchor on; else the anchor itself */
  const around = (a: D, b: D, phrase: string, until: string | undefined, suffix: string | undefined, dn: string | undefined, du: string | undefined, whole: (p: string) => Win): Win => {
    if (suffix && /[内內]/.test(suffix)) return whole(phrase); // "農曆十月內" / "假期內" — the stretch itself
    if (isBefore(suffix) || (until && !suffix)) return span(b, phrase);
    if (suffix) { // after
      const n = dn ? num(dn) : null;
      const days = n && du ? durDays(n, du) : 30;
      return period(add(b, 1), add(b, days), phrase);
    }
    return whole(phrase);
  };

  /* ---- Chinese (简 / 繁) ---- */
  push(/今天|今日|今晚|今早|今夜|今天[内內]|当天|當天/, (m) => one(t, m[0]));
  push(/(大)?[后後]天(?![内內])/, (m) => one(add(t, m[1] ? 3 : 2), m[0]));
  push(/明天|明日|明早|明晚/, (m) => one(add(t, 1), m[0]));
  push(/(这|這|本)(?:个|個)?(?:周|週|星期|礼拜|禮拜)(?![一二三四五六日天])|(?:这|這)(?:周|週)[内內]/, (m) => span(sunday, m[0]));
  push(/下(?:个|個)?(?:周|週|星期|礼拜|禮拜)(?![一二三四五六日天])/, (m) => period(add(sunday, 1), add(sunday, 7), m[0]));
  push(/(?:这|這|本)?(?:个|個)?(?:周末|週末)/, (m) => {
    const sat = dow(t) >= 5 ? t : add(t, 5 - dow(t));
    return period(sat, dow(t) === 6 ? t : add(sat, 1), m[0]);
  });
  push(/(下(?:个|個)?|这|這|本)?(?:周|週|星期|礼拜|禮拜)([一二三四五六日天])(之前|以前|前|为止|為止)?/, (m) => {
    const wd = WD_ZH[m[2]!]!;
    let x = add(t, (wd - dow(t) + 7) % 7);
    if (m[1]?.startsWith("下")) x = add(sunday, 1 + wd);
    return m[3] ? span(x, m[0]) : one(x, m[0]);
  });
  push(/(?:这|這|近|最近)(?:几|幾|两|兩)天/, (m) => span(add(t, /[两兩]/.test(m[0]) ? 2 : 4), m[0]));
  push(new RegExp(`(?:[几幾]天)${BY}`), (m) => span(add(t, 4), m[0]));
  // N天/N个星期/N周/N个月 — 内/之内 = a span from today; 后/後 = around that day
  push(/(\d+|[一二两兩三四五六七八九十]+|半)\s*(?:个|個)?(天|日|星期|礼拜|禮拜|周|週|月)(内|內|之内|之內|以内|以內|[后後]|之[后後]|以[后後])?/, (m) => {
    const n = num(m[1]!);
    if (n === null || n <= 0) return null;
    // "五月" "三月" are months, not durations — handled below; "一个月" / "3个月" / "半个月" are durations
    if (m[2] === "月" && !/[个個]/.test(m[0]) && m[1] !== "半") return null;
    if (m[2] === "日" && !m[3]) return null; // "9日" is a date
    // "有一天他会回来吗" / "一天到晚" — a bare 一天 is not a deadline
    if (n === 1 && (m[2] === "天" || m[2] === "日") && !m[3]) return null;
    const days = durDays(n, m[2]!);
    if (days > 800) return null;
    if (m[3] && /[后後]/.test(m[3])) { const x = add(t, days); return period(add(x, -Math.ceil(days / 10)), add(x, Math.ceil(days / 10)), m[0]); }
    return span(add(t, days), m[0]);
  });
  push(/(?:这|這|本)(?:个|個)?月(?:[内內]|底|底前|之内|之內)?|月底(?:前|之前)?/, (m) => span(monthEnd(t.y, t.m), m[0]));
  push(/下(?:个|個)?月(初|底|中)?/, (m) => {
    const y = t.m === 12 ? t.y + 1 : t.y, mo = t.m === 12 ? 1 : t.m + 1;
    const end = monthEnd(y, mo);
    if (m[1] === "初") return period({ y, m: mo, d: 1 }, { y, m: mo, d: 10 }, m[0]);
    if (m[1] === "中") return period({ y, m: mo, d: 11 }, { y, m: mo, d: 20 }, m[0]);
    if (m[1] === "底") return period({ y, m: mo, d: 21 }, end, m[0]);
    return period({ y, m: mo, d: 1 }, end, m[0]);
  });
  // 年底 / 年尾 (HK) / 年末 / 歲末 / 年內 — the Gregorian year's end. "2027 年底", "明年年底" name their year
  // (10-05: a "2027 年底以前" question had been read as this year's end)
  const yearOf = (word: string | undefined): number => {
    if (!word) return t.y;
    const n = /(20\d\d)/.exec(word);
    return n ? Number(n[1]) : /[後后]年/.test(word) ? t.y + 2 : /明年|來年|来年/.test(word) ? t.y + 1 : t.y;
  };
  const yearEnd = (word: string | undefined, phrase: string, before: boolean, whole: boolean): Win | null => {
    const y = yearOf(word);
    if (y < t.y || y > t.y + 10) return null;
    if (before || y === t.y) return span({ y, m: 12, d: 31 }, phrase);
    return whole ? period({ y, m: 1, d: 1 }, { y, m: 12, d: 31 }, phrase) : period({ y, m: 10, d: 1 }, { y, m: 12, d: 31 }, phrase);
  };
  push(new RegExp(`(${YEARW}\\s*|20\\d\\d\\s*)?(年底|年尾|年末|歲末|岁末|年[内內]|年终|年終)(前|之前|以前)?`), (m) => yearEnd(m[1], m[0], Boolean(m[3]), /年[内內]/.test(m[2]!)));
  push(/(明年|來年|来年|後年|后年|20\d\d年)(底|尾|末)(前|之前|以前)?/, (m) => yearEnd(m[1], m[0], Boolean(m[3]), false));
  push(/今年(?![内內底年前尾末])/, (m) => span({ y: t.y, m: 12, d: 31 }, m[0]));
  push(/(明年|來年|来年|後年|后年|20\d\d年)(初|上半年|下半年|年中|中)?(?![底尾末内內前月\d一二三四五六七八九十])/, (m) => {
    const y = yearOf(m[1]);
    if (y < t.y || y > t.y + 10) return null;
    const part = m[2];
    if (part === "初") return period({ y, m: 1, d: 1 }, { y, m: 3, d: 31 }, m[0]);
    if (part === "上半年") return period({ y, m: 1, d: 1 }, { y, m: 6, d: 30 }, m[0]);
    if (part === "下半年") return period({ y, m: 7, d: 1 }, { y, m: 12, d: 31 }, m[0]);
    if (part === "年中" || part === "中") return period({ y, m: 6, d: 1 }, { y, m: 7, d: 31 }, m[0]);
    return period({ y, m: 1, d: 1 }, { y, m: 12, d: 31 }, m[0]);
  });

  /* ---- 10-05: 农历 — lunar months and days, converted by the engine's calendar ---- */
  const lunarWin = (phrase: string, until: string | undefined, yearWord: string | undefined, leapWord: string | undefined, monWord: string, dayWord: string | undefined, part: string | undefined, suffix: string | undefined, dn?: string, du?: string): Win | null => {
    const mo = lunarMonthNum(monWord);
    if (!mo || mo < 1 || mo > 12) return null;
    const leap = Boolean(leapWord);
    // a Chinese year is named by the Gregorian year its 正月 starts in, so 今年/明年/2027年 map straight across
    let y = yearWord ? yearOf(yearWord) : lunarToday.year;
    let lm = lunarMonth(y, mo, leap);
    if (!yearWord) {
      // a leap month that this year does not have: the next year that has it
      if (leap && !lm) for (let k = 1; k <= 8 && !lm; k++) { const cand = lunarMonth(y + k, mo, true); if (cand) { lm = cand; y += k; } }
      // the month has already run out this lunar year → the reader means next year's
      if (lm && lm.end < today) { y += 1; lm = lunarMonth(y, mo, leap); }
    }
    if (!lm) return null;
    const zhMon = `${leap ? "閏" : ""}${ZH_MON[mo - 1]}月`;
    const enMon = `${leap ? "leap " : ""}lunar month ${mo}`;
    const s = parseIso(lm.start), e = parseIso(lm.end);
    const cal = (zhDates: string, enDates: string, zhTail: string, enTail: string): NonNullable<AskWindow["calendar"]> => ({
      kind: "lunar",
      zh: `「${phrase}」＝公曆${zhDates}（農曆${y}年${zhMon}${zhTail}）`,
      en: `"${phrase}" = ${enDates} (${enMon}${enTail}, lunar year ${y})`,
    });
    if (dayWord) {
      const d = lunarDayNum(dayWord);
      if (!d || d < 1 || d > 30) return null;
      const di = lunarToIso(y, mo, Math.min(d, lm.days), leap);
      if (!di) return null;
      const x = parseIso(di);
      const w = around(x, x, phrase, until, suffix, dn, du, (p) => one(x, p));
      const out: Win = { ...w, calendar: cal(`${x.y}年${zhDay(x)}`, `${enDay(x)}, ${x.y}`, dayWord, ` day ${d}`) };
      if (w.start === w.end) out.label_zh = `${zhDay(x)}（農曆${zhMon}${dayWord}）`;
      return out;
    }
    let a = s, b = e;
    if (part === "初" || part === "上旬") b = add(s, 9);
    else if (part === "中" || part === "中旬") { a = add(s, 10); b = add(s, 19); }
    else if (part === "底" || part === "末" || part === "尾" || part === "下旬") a = add(s, 20);
    const datesZh = `${a.y}年${zhDay(a)}至${zhDay(b)}`;
    const datesEn = `${enDay(a)} – ${enDay(b)}, ${b.y}`;
    // "農曆十月前" = before the month starts; "農曆十月底前 / 結束前 / 內" = up to its end
    if (!part && suffix && /^(?:之前|以前|前)$/.test(suffix)) {
      return { ...span(add(a, -1), phrase), calendar: cal(datesZh, datesEn, "", "") };
    }
    const w = around(a, b, phrase, until, suffix, dn, du, (p) => stretch(a, b, p));
    const out: Win = { ...w, calendar: cal(datesZh, datesEn, part ?? "", part ? ` (${part})` : "") };
    if (w.kind === "period" || w.kind === "span") out.label_zh = `${zhDay(parseIso(w.start))}–${zhDay(parseIso(w.end))}（農曆${zhMon}${part ?? ""}）`;
    return out;
  };
  const TAIL = `(?:\\s*(${LDAY})|(${PART}))?\\s*(${BEFORE}|${AFTER})?(?:\\s*${DUR})?`; // groups: day, part, suffix, dn, du
  // (明年)農曆(2027年)(閏)十月(初八 | 初/中/底)(前/後 …)
  push(new RegExp(`${UNTIL}(${YEARW}\\s*)?${LUNAR_Q}\\s*(${YEARW}\\s*)?(閏|闰)?(正|臘|腊|冬|十[一二]?|[一二三四五六七八九]|\\d{1,2})月${TAIL}`), (m) =>
    lunarWin(m[0], m[1], m[2] ?? m[3], m[4], m[5]!, m[6], m[7], m[8], m[9], m[10]));
  // 正月 / 臘月 / 冬月 / 閏六月 — lunar by name, no qualifier needed
  push(new RegExp(`${UNTIL}(${YEARW}\\s*)?(閏|闰)?(正|臘|腊|冬)月${TAIL}`), (m) =>
    lunarWin(m[0], m[1], m[2], m[3], m[4]!, m[5], m[6], m[7], m[8], m[9]));
  push(new RegExp(`${UNTIL}(${YEARW}\\s*)?(閏|闰)(十[一二]?|[一二三四五六七八九]|\\d{1,2})月${TAIL}`), (m) =>
    lunarWin(m[0], m[1], m[2], m[3], m[4]!, m[5], m[6], m[7], m[8], m[9]));
  // "十月初八" / "八月廿三" — 初X / 廿X is a lunar day by itself
  push(new RegExp(`(?:^|[^个個\\d一二三四五六七八九十两兩半曆历閏闰])${UNTIL}(${YEARW}\\s*)?(十[一二]?|[一二三四五六七八九]|\\d{1,2})月\\s*(初[一二三四五六七八九十]|廿[一二三四五六七八九]?)\\s*(${BEFORE}|${AFTER})?(?:\\s*${DUR})?`), (m) => {
    const k = m[0].search(/[到至直\d一二三四五六七八九十]/);
    if (k > 0) { m.index += k; m[0] = m[0].slice(k); }
    return lunarWin(m[0], m[1], m[2], undefined, m[3]!, m[4], undefined, m[5], m[6], m[7]);
  });

  /* ---- festivals: lunar ones computed, 節氣 computed, Gregorian ones fixed ---- */
  const nextCny = parseIso(lunarNewYear(lunarToday.year + 1));
  const eve = parseIso(lunarYearEnd(lunarToday.year));
  /** the next occurrence of lunar month/day (this lunar year if still ahead, else next) */
  const nextLunar = (mo: number, d: number): D => {
    const a = lunarToIso(lunarToday.year, mo, d) ?? lunarToIso(lunarToday.year, mo, d - 1);
    if (a && a >= today) return parseIso(a);
    return parseIso((lunarToIso(lunarToday.year + 1, mo, d) ?? lunarToIso(lunarToday.year + 1, mo, d - 1))!);
  };
  /** the next occurrence of a solar term (λ in degrees) */
  const nextTerm = (lambda: number): D => {
    for (let y = t.y; y <= t.y + 1; y++) { const d = solarTermIso(y, lambda); if (d >= today) return parseIso(d); }
    return parseIso(solarTermIso(t.y + 1, lambda));
  };
  const fest = (phrase: string, name: string, until: string | undefined, suffix: string | undefined, dn: string | undefined, du: string | undefined, a: D, b: D, zh: string, en: string, kind: "festival" | "solar_term" = "festival"): Win => {
    const w = around(a, b, phrase, until, suffix, dn, du, (p) => (diff(a, b) === 0 ? one(a, p) : stretch(a, b, p)));
    const dates = diff(a, b) === 0 ? `${a.y}年${zhDay(a)}` : `${a.y}年${zhDay(a)}至${zhDay(b)}`;
    const datesEn = diff(a, b) === 0 ? `${enDay(a)}, ${a.y}` : `${enDay(a)} – ${enDay(b)}, ${b.y}`;
    return { ...w, calendar: { kind, zh: `「${name}」＝公曆${dates}${zh ? `（${zh}）` : ""}`, en: `"${name}" = ${datesEn}${en ? ` (${en})` : ""}` } };
  };
  const nextMd = (mo: number, d: number): D => { let y = t.y; if (diff(t, { y, m: mo, d }) < 0) y += 1; return { y, m: mo, d }; };
  const FEST = "(農曆新年|农历新年|舊曆新年|旧历新年|華人新年|华人新年|中國新年|中国新年|農曆年|农历年|舊曆年|旧历年|過年|过年|春[节節]|新春|新年|大年初一|年初一|大年初[二三四五六七]|年初[二三四五六七]|年廿[一二三四五六七八九]|年二十[一二三四五六七八九]|大年三十|年三十|年卅|除夕|年[关關]|元宵|端午|七夕|中元|盂[蘭兰]|中秋|重[陽阳]|臘八|腊八|佛[誕诞]|元旦|跨年|情人[节節]|[圣聖][诞誕]|復活[节節]|复活[节節]|萬聖|万圣|雙十(?!一)|双十(?!一)|國慶|国庆)(?:[节節])?(?:翌日)?(?:假期|連假|连假|長假|长假)?(?![快好])";
  push(new RegExp(`${UNTIL}${FEST}\\s*(${BEFORE}|${AFTER})?(?:\\s*${DUR})?`), (m) => {
    const until = m[1], name = m[2]!, full = m[0], suffix = m[3], dn = m[4], du = m[5];
    const holiday = /假期|連假|连假|長假|长假/.test(full);
    if (/新年|農曆年|农历年|舊曆年|旧历年|過年|过年|春[节節]|新春|年初一|年[关關]/.test(name)) {
      // 過年前 / 年關前 / 到過年 = up to 除夕 (the year's last day), never New Year's Day itself
      if (isBefore(suffix) || (until && !suffix)) return { ...span(eve, full), calendar: { kind: "festival", zh: `「${name}」前＝公曆${eve.y}年${zhDay(eve)}（除夕）之前`, en: `before "${name}" = by ${enDay(eve)}, ${eve.y} (lunar New Year's Eve)` } };
      // 年初一 is the day; 過年 / 春節 / 新年 is the week from it (初一 to 初七)
      const b = /年初一/.test(name) ? nextCny : add(nextCny, 6);
      return fest(full, name, until, suffix, dn, du, nextCny, b, `農曆正月初一${/年初一/.test(name) ? "" : "起一週"}，${nextCny.y}年`, "Chinese New Year");
    }
    let md: RegExpExecArray | null;
    if ((md = /^(?:大年)?年?初([二三四五六七])$/.exec(name))) { const x = add(nextCny, CN_NUM[md[1]!]! - 1); return fest(full, name, until, suffix, dn, du, x, x, `農曆正月初${md[1]}`, "lunar New Year holiday"); }
    if ((md = /^年(?:廿|二十)([一二三四五六七八九])$/.exec(name))) { const x = nextLunar(12, 20 + CN_NUM[md[1]!]!); return fest(full, name, until, suffix, dn, du, x, x, `農曆十二月廿${md[1]}`, "lunar 12/2x"); }
    if (/年三十|年卅|除夕/.test(name)) return fest(full, name, until, suffix, dn, du, eve, eve, "農曆年最後一天", "lunar New Year's Eve");
    if (/元宵/.test(name)) { const x = nextLunar(1, 15); return fest(full, name, until, suffix, dn, du, x, x, "農曆正月十五", "lunar 1/15"); }
    if (/端午/.test(name)) { const x = nextLunar(5, 5); return fest(full, name, until, suffix, dn, du, x, x, "農曆五月初五", "lunar 5/5"); }
    if (/七夕/.test(name)) { const x = nextLunar(7, 7); return fest(full, name, until, suffix, dn, du, x, x, "農曆七月初七", "lunar 7/7"); }
    if (/中元|盂[蘭兰]/.test(name)) { const x = nextLunar(7, 15); return fest(full, name, until, suffix, dn, du, x, x, "農曆七月十五", "lunar 7/15"); }
    if (/中秋/.test(name)) {
      const x = nextLunar(8, 15);
      if (/翌日/.test(full)) { const y = add(x, 1); return fest(full, name, until, suffix, dn, du, y, y, "農曆八月十六", "the day after Mid-Autumn"); }
      return fest(full, name, until, suffix, dn, du, x, holiday ? add(x, 2) : x, "農曆八月十五", "lunar 8/15");
    }
    if (/重[陽阳]/.test(name)) { const x = nextLunar(9, 9); return fest(full, name, until, suffix, dn, du, x, x, "農曆九月初九", "lunar 9/9"); }
    if (/臘八|腊八/.test(name)) { const x = nextLunar(12, 8); return fest(full, name, until, suffix, dn, du, x, x, "農曆十二月初八", "lunar 12/8"); }
    if (/佛[誕诞]/.test(name)) { const x = nextLunar(4, 8); return fest(full, name, until, suffix, dn, du, x, x, "農曆四月初八", "lunar 4/8"); }
    // Gregorian festivals
    if (/元旦/.test(name)) { const x = nextMd(1, 1); return fest(full, name, until, suffix, dn, du, x, x, "", "New Year's Day"); }
    if (/跨年/.test(name)) { const x = nextMd(12, 31); return fest(full, name, until, suffix, dn, du, x, add(x, 1), "", "New Year's Eve"); }
    if (/情人/.test(name)) { const x = nextMd(2, 14); return fest(full, name, until, suffix, dn, du, x, x, "", "Valentine's Day"); }
    if (/[圣聖][诞誕]/.test(name)) { const x = nextMd(12, 25); return fest(full, name, until, suffix, dn, du, add(x, -1), holiday ? add(x, 1) : x, "", "Christmas"); }
    if (/復活|复活/.test(name)) { const y = Object.keys(EASTER).map(Number).find((yy) => diff(t, parseIso(EASTER[yy]!)) >= -1); if (!y) return null; const x = parseIso(EASTER[y]!); return fest(full, name, until, suffix, dn, du, add(x, -2), add(x, 1), "", "Easter"); }
    if (/萬聖|万圣/.test(name)) { const x = nextMd(10, 31); return fest(full, name, until, suffix, dn, du, x, x, "", "Halloween"); }
    if (/雙十|双十/.test(name)) { const x = nextMd(10, 10); return fest(full, name, until, suffix, dn, du, holiday ? add(x, -1) : x, holiday ? add(x, 1) : x, "台灣國慶", "Taiwan National Day"); }
    if (/國慶|国庆/.test(name)) {
      // 國慶 differs by place: mainland 10月1日起七天; Hong Kong 10月1日; Taiwan 雙十 10月10日 — Traditional script covers HK and TW
      const hant = /國慶/.test(name);
      const endDay = hant ? (holiday ? 11 : 10) : 7;
      const y = diff(t, { y: t.y, m: 10, d: endDay }) < 0 ? t.y + 1 : t.y; // the whole stretch has passed → next year's
      const a = { y, m: 10, d: hant && holiday ? 9 : 1 };
      const b = { y, m: 10, d: endDay };
      return fest(full, name, until, suffix, dn, du, a, b, hant ? "香港10月1日／台灣雙十10月10日" : "10月1日起七天", hant ? "Oct 1 in Hong Kong, Oct 10 in Taiwan" : "Oct 1–7");
    }
    return null;
  });
  // bare 年前 (not "三年前"): before the lunar new year — Taiwan, Hong Kong and the mainland all mean 過年 by it
  push(/(?:^|[^\d一二三四五六七八九十几幾两兩多半今明去前曆历])年前(?![后後])/, (m) => {
    if (!m[0].startsWith("年前")) { m.index += m[0].length - 2; m[0] = "年前"; }
    return { ...span(eve, m[0]), calendar: { kind: "festival", zh: `「年前」按農曆新年前讀＝公曆${eve.y}年${zhDay(eve)}（除夕）之前`, en: `"年前" read as before Chinese New Year = by ${enDay(eve)}, ${eve.y}` } };
  });
  // 二十四節氣 by name (readers do ask "寒露之後" / "小寒前")
  const TERMS = ["立春", "雨水", "驚蟄", "春分", "清明", "穀雨", "立夏", "小滿", "芒種", "夏至", "小暑", "大暑", "立秋", "處暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒"];
  push(new RegExp(`${UNTIL}(立春|雨水|驚蟄|惊蛰|春分|清明|穀雨|谷雨|立夏|小滿|小满|芒種|芒种|夏至|小暑|大暑|立秋|處暑|处暑|白露|秋分|寒露|霜降|立冬|小雪|大雪|冬至|小寒|大寒)(?:[节節])?\\s*(${BEFORE}|${AFTER})?(?:\\s*${DUR})?`), (m) => {
    const hant = m[2]!.replace("惊蛰", "驚蟄").replace("谷雨", "穀雨").replace("小满", "小滿").replace("芒种", "芒種").replace("处暑", "處暑");
    const i = TERMS.indexOf(hant); if (i < 0) return null;
    // 小雪 / 白露 / 立夏 … are also people's names: only a 前/後/到 around them makes them a date
    if (/^(?:小雪|大雪|白露|立夏|立秋|雨水|小滿|小暑)$/.test(hant) && !m[1] && !m[3]) return null;
    const x = nextTerm((315 + 15 * i) % 360);
    return fest(m[0], m[2]!, m[1], m[3], m[4], m[5], x, x, "節氣", "solar term", "solar_term");
  });

  // explicit dates: 9月30日 / 9月30号 / 9/30 / 30号 — the next occurrence (a date a few days past is still this year's)
  const nextOcc = (mo: number, d: number, year?: number): D | null => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    if (year) return year >= t.y && year <= t.y + 10 ? { y: year, m: mo, d } : null;
    let x: D = { y: t.y, m: mo, d };
    const back = diff(t, x);
    // a date a few weeks back is the reader talking about the past ("9月14日他说…"), not a deadline;
    // only a date well behind us (asking in September about "3月30日") means next year
    if (back < 0 && back >= -60) return null;
    if (back < -60) x = { y: t.y + 1, m: mo, d };
    return x;
  };
  push(new RegExp(`(?:(20\\d\\d)\\s*年\\s*)?(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*(?:日|号|號)?${BY}`), (m) => {
    const x = nextOcc(+m[2]!, +m[3]!, m[1] ? +m[1] : undefined); if (!x) return null;
    return /(?:前|为止|為止|[内內])$/.test(m[0]) ? span(x, m[0]) : one(x, m[0]);
  });
  push(new RegExp(`(?:^|[^\\d/])(?:(20\\d\\d)/)?(\\d{1,2})\\s*/\\s*(\\d{1,2})(?:/(?:20)?\\d{2})?(?![\\d/])${BY}`), (m) => {
    lead(m);
    const a = +m[2]!, b = +m[3]!;
    // 2026/10/15 (year first) · 26/09 (day/month) when the first number cannot be a month
    const x = m[1] ? nextOcc(a, b, +m[1]) : a > 12 ? nextOcc(b, a) : nextOcc(a, b); if (!x) return null;
    return /前|为止|為止|[内內]/.test(m[0]) ? span(x, m[0]) : one(x, m[0]);
  });
  push(new RegExp(`(?:^|[^月\\d/])(\\d{1,2})\\s*(?:号|號)${BY}`), (m) => {
    lead(m);
    const d = +m[1]!; if (d < 1 || d > 31) return null;
    let x: D = { y: t.y, m: t.m, d }; if (diff(t, x) < 0) x = t.m === 12 ? { y: t.y + 1, m: 1, d } : { y: t.y, m: t.m + 1, d };
    return /前|为止|為止|[内內]/.test(m[0]) ? span(x, m[0]) : one(x, m[0]);
  });
  // a named month: 五月 / 5月 / 十二月 / 明年3月 / 2027年3月 (not 5月3日, not 一个月, not 農曆十月) → that month, next occurrence
  push(new RegExp(`(?:^|[^个個\\d一二三四五六七八九十两兩半曆历閏闰])(${YEARW}\\s*)?(\\d{1,2}|十[一二]?|[一二三四五六七八九])月(?![\\d份]*[日号號\\d]|初[一二三四五六七八九十]|廿)(份)?(底前|底之前|前|之前|以前|底|中旬|中|初)?`), (m) => {
    const k = m[0].search(/[今明來来後后\d一二三四五六七八九十]/);
    if (k > 0) { m.index += k; m[0] = m[0].slice(k); }
    const mo = num(m[2]!); if (!mo || mo < 1 || mo > 12) return null;
    // 10-18 (#1928, 10-12): "七月他提分手，到現在…" — a bare month already gone this year, followed by what happened
    // then, tells the story; it is not the time asked about (the reading answered 「你問的七月」 and dated next July).
    // A month that is asked about is followed by a question (「三月會升職嗎」) or carries a year (明年3月).
    if (!m[1] && mo < t.m && !/[底前初中]$/.test(m[0]) && PAST_TALE.test(q.slice(m.index + m[0].length, m.index + m[0].length + 8))) return null;
    const y = m[1] ? yearOf(m[1]) : mo < t.m ? t.y + 1 : t.y;
    if (y < t.y || y > t.y + 10) return null;
    const end = monthEnd(y, mo);
    if (/底前$|底之前$/.test(m[0])) return span(end, m[0]);
    if (/前$/.test(m[0])) return span(add({ y, m: mo, d: 1 }, -1), m[0]);
    if (/初$/.test(m[0])) return stretch({ y, m: mo, d: 1 }, { y, m: mo, d: 10 }, m[0]);
    if (/中旬$|中$/.test(m[0])) return stretch({ y, m: mo, d: 11 }, { y, m: mo, d: 20 }, m[0]);
    if (/底$/.test(m[0])) return stretch({ y, m: mo, d: 21 }, end, m[0]);
    return y === t.y && mo === t.m ? span(end, m[0]) : period({ y, m: mo, d: 1 }, end, m[0]);
  });

  /* ---- English ---- */
  push(/\b(?:today|tonight|this (?:morning|afternoon|evening))\b/i, (m) => one(t, m[0]));
  push(/\bday after tomorrow\b/i, (m) => one(add(t, 2), m[0]));
  push(/\btomorrow\b/i, (m) => one(add(t, 1), m[0]));
  push(/\b(?:by the end of|by end of|end of|within|during)? ?this week\b/i, (m) => span(sunday, m[0]));
  push(/\bnext week\b/i, (m) => period(add(sunday, 1), add(sunday, 7), m[0]));
  push(/\b(?:this )?weekend\b/i, (m) => { const sat = dow(t) >= 5 ? t : add(t, 5 - dow(t)); return period(sat, dow(t) === 6 ? t : add(sat, 1), m[0]); });
  push(/\b(by |on |before |this |next )?(mon|tues|wednes|thurs|fri|satur|sun)day\b/i, (m) => {
    const wd = WD_EN[m[2]!.slice(0, 3).toLowerCase()]!;
    let x = add(t, (wd - dow(t) + 7) % 7);
    if (/next/i.test(m[1] ?? "")) x = add(sunday, 1 + wd);
    return /by|before/i.test(m[1] ?? "") ? span(x, m[0]) : one(x, m[0]);
  });
  push(/\b(?:within|in|over) (?:the next )?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a few) (day|week|month)s?\b/i, (m) => {
    const n = enNum(m[1]!.replace(/^a (couple|few) of$/i, "$1")) ?? (/couple/i.test(m[1]!) ? 2 : /few/i.test(m[1]!) ? 3 : null);
    if (!n) return null;
    const days = n * (/day/i.test(m[2]!) ? 1 : /week/i.test(m[2]!) ? 7 : 30);
    if (/^in\b/i.test(m[0])) { const x = add(t, days); return period(add(x, -Math.ceil(days / 10)), add(x, Math.ceil(days / 10)), m[0]); }
    return span(add(t, days), m[0]);
  });
  push(/\b(?:this month|(?:by )?(?:the )?end of (?:the |this )?month)\b/i, (m) => span(monthEnd(t.y, t.m), m[0]));
  push(/\bnext month\b/i, (m) => { const y = t.m === 12 ? t.y + 1 : t.y, mo = t.m === 12 ? 1 : t.m + 1; return period({ y, m: mo, d: 1 }, monthEnd(y, mo), m[0]); });
  push(/\b(?:this year|(?:by )?(?:the )?end of (?:the |this )?year|before (?:the )?new year)\b/i, (m) => span({ y: t.y, m: 12, d: 31 }, m[0]));
  push(/\bnext year\b/i, (m) => period({ y: t.y + 1, m: 1, d: 1 }, { y: t.y + 1, m: 12, d: 31 }, m[0]));
  push(/\b(by |before |on )?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?\b/i, (m) => {
    const mo = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2]!.slice(0, 3).toLowerCase()) + 1;
    const x = nextOcc(mo, +m[3]!); if (!x) return null;
    return /by|before/i.test(m[1] ?? "") ? span(x, m[0]) : one(x, m[0]);
  });
  push(/\b(before |by |until |after )?(?:chinese|lunar) new year\b/i, (m) => {
    const w = /after/i.test(m[1] ?? "") ? period(add(nextCny, 1), add(nextCny, 30), m[0]) : m[1] ? span(eve, m[0]) : period(nextCny, add(nextCny, 6), m[0]);
    return { ...w, calendar: { kind: "festival", zh: `「${m[0]}」＝農曆正月初一，公曆${nextCny.y}年${zhDay(nextCny)}`, en: `Chinese New Year = ${enDay(nextCny)}, ${nextCny.y}` } };
  });

  /* ---- ja / ko / fr / de / es / pt: the common ones ---- */
  const L = (re: RegExp, f: (m: RegExpExecArray) => Win | null) => push(re, f);
  L(/今日|本日|今夜|今晩|오늘|오늘밤|aujourd'hui|ce soir|\bheute\b|\bhoy\b|esta noche|esta tarde|\bhoje\b|esta noite/i, (m) => one(t, m[0]));
  L(/明後日|모레|après-demain|übermorgen|pasado mañana|depois de amanhã/i, (m) => one(add(t, 2), m[0]));
  // "heute morgen" / "esta mañana" (this morning) are normalised away in askWindow(); the longer
  // "übermorgen" / "pasado mañana" / "depois de amanhã" hits swallow the plain one (containment)
  L(/明日|あした|내일|\bdemain\b|\bmorgen\b|\bmañana\b|amanhã/i, (m) => one(add(t, 1), m[0]));
  L(/今週|이번 ?주|cette semaine|diese woche|esta semana/i, (m) => span(sunday, m[0]));
  L(/来週|다음 ?주|semaine prochaine|nächste woche|próxima semana|semana que viene|semana que vem/i, (m) => period(add(sunday, 1), add(sunday, 7), m[0]));
  L(/今月|이번 ?달|ce mois-ci|diesen monat|este mes|este mês|fin du mois|ende des monats|fin de mes|fim do mês/i, (m) => span(monthEnd(t.y, t.m), m[0]));
  L(/来月|다음 ?달|le mois prochain|nächsten monat|el mes que viene|el próximo mes|o próximo mês|mês que vem/i, (m) => { const y = t.m === 12 ? t.y + 1 : t.y, mo = t.m === 12 ? 1 : t.m + 1; return period({ y, m: mo, d: 1 }, monthEnd(y, mo), m[0]); });
  L(/年内|올해|연말|cette année|fin de l'année|dieses jahr|ende des jahres|este año|fin de año|este ano|fim do ano/i, (m) => span({ y: t.y, m: 12, d: 31 }, m[0]));
  L(/来年|내년|l'année prochaine|nächstes jahr|el año que viene|el próximo año|o próximo ano|ano que vem/i, (m) => period({ y: t.y + 1, m: 1, d: 1 }, { y: t.y + 1, m: 12, d: 31 }, m[0]));
  L(/(\d+)\s*(?:日|일)\s*(?:以内|이내|안에)|(?:dans les|d'ici|innerhalb von|en los próximos|nos próximos|dentro de)\s*(\d+)\s*(?:jours|tagen|días|dias)/i, (m) => {
    const n = Number(m[1] ?? m[2]); return n > 0 && n < 400 ? span(add(t, n), m[0]) : null;
  });
  // 旧暦 / 음력 (Japanese / Korean lunar months), 旧正月 / 설날, 추석 — the same calendar
  L(/(?:旧暦|음력)\s*(\d{1,2})\s*(?:月|월)/, (m) => lunarWin(m[0], undefined, undefined, undefined, m[1]!, undefined, undefined, undefined));
  L(/旧正月|설날|구정/, (m) => ({ ...period(nextCny, add(nextCny, 6), m[0]), calendar: { kind: "festival", zh: `「${m[0]}」＝農曆正月初一，公曆${nextCny.y}年${zhDay(nextCny)}`, en: `"${m[0]}" = Lunar New Year, ${enDay(nextCny)}, ${nextCny.y}` } }));
  L(/추석/, (m) => { const x = nextLunar(8, 15); return { ...one(x, m[0]), calendar: { kind: "festival", zh: `「추석」＝農曆八月十五，公曆${x.y}年${zhDay(x)}`, en: `"추석" = lunar 8/15, ${enDay(x)}, ${x.y}` } }; });

  return hits;
}

/**
 * Words that put a stretch of the question in the past — "三天前他說…", "3年前分手",
 * "一年前傳的訊息", "兩個月前", "two weeks ago" — so no duration or date inside them
 * becomes a window. "10月前" (before October) has no 個, "30日前" is a date: neither is the past.
 */
function pastSpans(q: string): { at: number; end: number }[] {
  const out: { at: number; end: number }[] = [];
  const re = /(?:\d{1,3}|[一二两兩三四五六七八九十几幾半]+)\s*(?:多)?\s*(?:(?:个|個)\s*月|天|星期|礼拜|禮拜|周|週|年)\s*(?:多)?\s*(?:之前|以前|前)(?![后後])|\b(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|a few|a couple of) (?:days?|weeks?|months?|years?) ago\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) out.push({ at: m.index, end: m.index + m[0].length });
  return out;
}

/**
 * 10-05: calendar words of Taiwan, Hong Kong and the mainland, before the rules run.
 * 民國 years: 115年 → 2026年, 115/10/15 → 2026/10/15. A Gregorian qualifier on the
 * year (新曆年 / 西曆年底 / 國曆年前) keeps the year Gregorian; qualifiers on a
 * month (國曆10月) are dropped — the plain month is Gregorian already.
 */
function normalizeCalendarWords(q: string): string {
  const G = "(?:國曆|国历|公曆|公历|公厝|陽曆|阳历|新曆|新历|西曆|西历|公元|solar\\s*)";
  return q
    .replace(/(?:民國|民国)\s*(\d{2,3})\s*年/g, (_, n) => `${1911 + Number(n)}年`)
    .replace(/(^|[^\d])(1[01]\d)年(?=[底前初中年\d一二三四五六七八九十])/g, (_, p, n) => `${p}${1911 + Number(n)}年`)
    .replace(/(^|[^\d])(1[01]\d)\/(\d{1,2})\/(\d{1,2})/g, (_, p, y, mo, d) => `${p}${1911 + Number(y)}/${mo}/${d}`)
    .replace(new RegExp(`${G}\\s*(?:新年|年)(之前|以前|前)`, "g"), "今年年底前")
    .replace(new RegExp(`${G}\\s*年(底|尾|末)`, "g"), "今年年$1")
    .replace(new RegExp(`${G}\\s*新年`, "g"), "元旦")
    .replace(new RegExp(`${G}\\s*年初`, "g"), "明年初")
    .replace(new RegExp(G, "gi"), "");
}

/**
 * The window the reader named, or null. When several time words appear, the
 * nearest limit wins ("这周五之前，最晚月底" → this Friday), except that a
 * named later period (下个月 / 明年) outranks a bare "今天" said in passing
 * ("今天想问明年能不能结婚").
 */
export function askWindow(question: string, castMs: number, tzOffsetMinutes: number): AskWindow | null {
  const local = castMs + (Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0) * 60_000;
  const t = fromUtc(Math.floor(local / DAY) * DAY);
  // "this morning" is not "tomorrow" (heute morgen / esta mañana / la mañana)
  const q = normalizeCalendarWords(question.replace(/heute morgen/gi, "heute nachmittag").replace(/\b(esta|la) mañana/gi, "$1 tarde"));
  let hits = rules(q, t);
  if (hits.length === 0) return null;
  // the past is not a window: "三天前他说", "3年前分手的前任", "一年前传的讯息"
  const past = pastSpans(q);
  hits = hits.filter((h) => !past.some((p) => h.at < p.end && h.at + h.len > p.at));
  // drop hits contained in a longer hit ("下周五" beats "周五", "9月30日前" beats "30日", "農曆10月" beats "10月")
  hits = hits.filter((h) => !hits.some((o) => o !== h && o.len > h.len && o.at <= h.at && o.at + o.len >= h.at + h.len));
  // a window that ended before the cast date is a reference to the past ("上周他说…") — not a deadline
  hits = hits.filter((h) => diff(t, parseIso(h.w.end)) >= 0);
  if (hits.length === 0) return null;
  const nonToday = hits.filter((h) => h.w.kind !== "today");
  const pool = nonToday.length > 0 && hits.some((h) => h.w.kind === "today") && nonToday.some((h) => h.w.kind === "period") ? nonToday : hits;
  pool.sort((a, b) => diff(t, parseIso(a.w.end)) - diff(t, parseIso(b.w.end)) || a.at - b.at);
  const w = pool[0]!.w;
  const s = parseIso(w.start), e = parseIso(w.end);
  const label_zh = w.label_zh ?? (w.start === w.end ? zhDay(s) : `${zhDay(s)}–${zhDay(e)}`);
  const label_en = w.label_en ?? (w.start === w.end ? enDay(s) : `${enDay(s)} – ${enDay(e)}`);
  const out: AskWindow = { start: w.start, end: w.end, phrase: w.phrase, kind: w.kind, days: diff(t, e), label_zh, label_en };
  if (w.calendar) out.calendar = w.calendar;
  return out;
}

/**
 * The window as a question scale, for questions the scale words did not catch.
 * 10-05: a later stretch is judged by its own length, not its distance — "農曆十月"
 * two months out is a month-long window (weeks), not a long matter.
 */
export function scaleFromWindow(w: AskWindow): "now" | "day" | "weeks" | "long" {
  if (w.kind === "today") return "now";
  const len = w.kind === "period" || w.kind === "day" ? Math.round((Date.parse(w.end) - Date.parse(w.start)) / DAY) : w.days;
  if (len <= 10) return "day";
  if (len <= 62) return "weeks";
  return "long";
}

/** Does a candidate window [start, end] overlap the asked window? */
export function overlapsAsk(w: AskWindow, start: string, end: string): boolean {
  return start <= w.end && end >= w.start;
}
