import { MakeTime, SearchMoonPhase } from "astronomy-engine";
import { SolarDay } from "tyme4ts";
import { huangliDay, parseYmd, ymdOf } from "./day";

/**
 * 10-30 进度表 128 ⑤ (Neil 10-29: 換成當地的玩法 — 日本六曜吉日、韓國손 없는 날) — the calendar facts a Japanese or a
 * Korean almanac prints, from the same day object the 黃曆 uses. Both countries keep the lunar calendar in UTC+9, so the
 * lunar day here starts from the new moon in Japan/Korea time (tyme4ts counts in China time and is a day early when the
 * new moon falls between 23:00 and midnight in Beijing); the solar terms are moved the same way. Days are UTC+9 days.
 */
const pad = (n: number) => String(n).padStart(2, "0");
const DAY = 86_400_000;
const KST = 9 * 3_600_000;

/** today in UTC+9 */
export const eastDay = (ms = Date.now()) => new Date(ms + KST).toISOString().slice(0, 10);

const lunarCache = new Map<string, { month: number; day: number; leap: boolean }>();
/** the lunar date of a day as Japan and Korea count it (new moon in UTC+9) */
export function eastLunar(y: number, m: number, d: number): { month: number; day: number; leap: boolean } {
  const key = ymdOf(y, m, d);
  const hit = lunarCache.get(key);
  if (hit) return hit;
  // the last new moon before the end of this day (UTC+9)
  const end = Date.UTC(y, m - 1, d + 1) - KST;
  const nm = SearchMoonPhase(0, MakeTime(new Date(end - 31 * DAY)), 32);
  let t = nm!.date.getTime();
  // SearchMoonPhase returns the first one after the start; step forward while another falls before the end of the day
  for (let i = 0; i < 2; i++) {
    const n2 = SearchMoonPhase(0, MakeTime(new Date(t + DAY)), 31);
    if (n2 && n2.date.getTime() < end) t = n2.date.getTime(); else break;
  }
  const first = new Date(t + KST);
  const fy = first.getUTCFullYear(), fm = first.getUTCMonth() + 1, fd = first.getUTCDate();
  const day = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(fy, fm - 1, fd)) / DAY) + 1;
  // the month's number: the Chinese count on the first day of the month (same month, or a day later in China)
  const lm = SolarDay.fromYmd(fy, fm, fd).getLunarDay().getLunarMonth();
  const out = { month: Math.abs(lm.getMonth()), day, leap: lm.isLeap() };
  if (lunarCache.size > 3000) lunarCache.clear();
  lunarCache.set(key, out);
  return out;
}

/** the solar term that begins on this day in UTC+9, if any: its index (0 = 立春 … 23 = 大寒) and time "HH:MM" */
export function eastTerm(y: number, m: number, d: number): { idx: number; at: string } | null {
  const key = ymdOf(y, m, d);
  for (const off of [0, -1]) {
    const t = new Date(Date.UTC(y, m - 1, d) + off * DAY);
    const h = huangliDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    if (!h.term.today || !h.term.at) continue;
    // UTC+8 → UTC+9
    const [dt, hm] = h.term.at.split(" ") as [string, string];
    const [hh, mm] = hm.split(":").map(Number) as [number, number];
    const p = parseYmd(dt)!;
    const ms = Date.UTC(p.y, p.m - 1, p.d, hh + 1, mm);
    const jd = new Date(ms).toISOString();
    if (jd.slice(0, 10) !== key) continue;
    return { idx: TERM_IDX[h.term.name] ?? 0, at: jd.slice(11, 16) };
  }
  return null;
}
/** the term the day sits in (index), UTC+9 */
export function eastTermNow(y: number, m: number, d: number): number {
  for (let i = 0; i < 20; i++) {
    const t = new Date(Date.UTC(y, m - 1, d) - i * DAY);
    const e = eastTerm(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    if (e) return e.idx;
  }
  return TERM_IDX[huangliDay(y, m, d).term.name] ?? 0;
}
const TERM_ZH = ["立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒"];
const TERM_IDX: Record<string, number> = Object.fromEntries(TERM_ZH.map((n, i) => [n, i]));
export const TERMS_JA = ["立春", "雨水", "啓蟄", "春分", "清明", "穀雨", "立夏", "小満", "芒種", "夏至", "小暑", "大暑", "立秋", "処暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒"];
export const TERMS_KO = ["입춘", "우수", "경칩", "춘분", "청명", "곡우", "입하", "소만", "망종", "하지", "소서", "대서", "입추", "처서", "백로", "추분", "한로", "상강", "입동", "소설", "대설", "동지", "소한", "대한"];

/* ------------------------------------------------------------------ 日本：六曜と選日 */

export const ROKUYO = ["大安", "赤口", "先勝", "友引", "先負", "仏滅"] as const;
export type Rokuyo = (typeof ROKUYO)[number];
/** 六曜: (旧暦の月 + 日) を 6 で割った余り */
export const rokuyo = (lunarMonth: number, lunarDay: number): Rokuyo => ROKUYO[(lunarMonth + lunarDay) % 6]!;

// 一粒万倍日: 節月（月の地支）ごとの日の地支
const ICHIRYU: Record<string, string> = { 寅: "丑午", 卯: "酉寅", 辰: "子卯", 巳: "卯辰", 午: "巳午", 未: "酉午", 申: "子未", 酉: "卯申", 戌: "酉午", 亥: "酉戌", 子: "亥子", 丑: "卯子" };
// 天赦日: 季節（節月）ごとの日の干支
const TENSHA: Record<string, string> = { 寅: "戊寅", 卯: "戊寅", 辰: "戊寅", 巳: "甲午", 午: "甲午", 未: "甲午", 申: "戊申", 酉: "戊申", 戌: "戊申", 亥: "甲子", 子: "甲子", 丑: "甲子" };
// 不成就日: 旧暦の月ごとの日
const FUJOJU: number[][] = [[3, 11, 19, 27], [2, 10, 18, 26], [1, 9, 17, 25], [4, 12, 20, 28], [5, 13, 21, 29], [6, 14, 22, 30]];

export type Senjitsu = "一粒万倍日" | "天赦日" | "不成就日" | "寅の日" | "巳の日" | "己巳の日" | "甲子の日";
export interface JaDay {
  ymd: string; y: number; m: number; d: number; weekday: number;
  lunar: { month: number; day: number; leap: boolean };
  rokuyo: Rokuyo;
  marks: Senjitsu[];
  /** 日の干支 */
  gz: string;
  /** 十二直 */
  choku: string;
  term: { idx: number; at: string } | null;
  termNow: number;
}
const CHOKU: Record<string, string> = { 建: "建", 除: "除", 满: "満", 平: "平", 定: "定", 执: "執", 破: "破", 危: "危", 成: "成", 收: "納", 开: "開", 闭: "閉" };

export function jaDay(y: number, m: number, d: number): JaDay {
  const h = huangliDay(y, m, d);
  const lunar = eastLunar(y, m, d);
  const gz = h.gz.day;
  const dayBranch = gz[1]!, monthBranch = h.gz.month[1]!;
  // the 節月 in Japan time: the month pillar of the day (a term moment within the hour around midnight is rare and ignored)
  const marks: Senjitsu[] = [];
  if (TENSHA[monthBranch] === gz) marks.push("天赦日");
  if (ICHIRYU[monthBranch]?.includes(dayBranch)) marks.push("一粒万倍日");
  if (gz === "甲子") marks.push("甲子の日");
  if (gz === "己巳") marks.push("己巳の日");
  else if (dayBranch === "巳") marks.push("巳の日");
  if (dayBranch === "寅") marks.push("寅の日");
  if (FUJOJU[(lunar.month - 1) % 6]!.includes(lunar.day)) marks.push("不成就日");
  return {
    ymd: ymdOf(y, m, d), y, m, d, weekday: h.weekday, lunar, rokuyo: rokuyo(lunar.month, lunar.day), marks, gz,
    choku: CHOKU[h.duty] ?? h.duty, term: eastTerm(y, m, d), termNow: eastTermNow(y, m, d),
  };
}

/* ------------------------------------------------------------------ 한국：손 없는 날·일진 */

const STEM_KO: Record<string, string> = { 甲: "갑", 乙: "을", 丙: "병", 丁: "정", 戊: "무", 己: "기", 庚: "경", 辛: "신", 壬: "임", 癸: "계" };
const BRANCH_KO: Record<string, string> = { 子: "자", 丑: "축", 寅: "인", 卯: "묘", 辰: "진", 巳: "사", 午: "오", 未: "미", 申: "신", 酉: "유", 戌: "술", 亥: "해" };
const ANIMAL_KO: Record<string, string> = { 子: "쥐", 丑: "소", 寅: "호랑이", 卯: "토끼", 辰: "용", 巳: "뱀", 午: "말", 未: "양", 申: "원숭이", 酉: "닭", 戌: "개", 亥: "돼지" };
// 손(太白殺)이 있는 방위: 음력 끝자리 1·2 동, 3·4 남, 5·6 서, 7·8 북, 9·0 없음
const SON_DIR = ["", "동쪽", "동쪽", "남쪽", "남쪽", "서쪽", "서쪽", "북쪽", "북쪽", ""];
export const koGz = (gz: string) => `${STEM_KO[gz[0]!] ?? ""}${BRANCH_KO[gz[1]!] ?? ""}`;
export const koAnimal = (branch: string) => ANIMAL_KO[branch] ?? "";

export interface KoDay {
  ymd: string; y: number; m: number; d: number; weekday: number;
  lunar: { month: number; day: number; leap: boolean };
  /** 손 없는 날 (음력 9·10·19·20·29·30일) */
  sonEomneun: boolean;
  /** 손이 있는 방위 ("" on 손 없는 날) */
  sonDir: string;
  gz: string; gzKo: string;
  /** 그날 일진과 충이 되는 띠 */
  chongAnimal: string;
  term: { idx: number; at: string } | null;
  termNow: number;
  yearAnimal: string;
}
export function koDay(y: number, m: number, d: number): KoDay {
  const h = huangliDay(y, m, d);
  const lunar = eastLunar(y, m, d);
  const last = lunar.day % 10;
  const gz = h.gz.day;
  const opp = "子丑寅卯辰巳午未申酉戌亥"[("子丑寅卯辰巳午未申酉戌亥".indexOf(gz[1]!) + 6) % 12]!;
  // the year's animal by the lunar new year (as Koreans say the 띠 of a year)
  const yearBranch = h.lunar.yearGz[1]!;
  return {
    ymd: ymdOf(y, m, d), y, m, d, weekday: h.weekday, lunar,
    sonEomneun: last === 9 || last === 0, sonDir: SON_DIR[last]!, gz, gzKo: koGz(gz),
    chongAnimal: ANIMAL_KO[opp]!, term: eastTerm(y, m, d), termNow: eastTermNow(y, m, d), yearAnimal: ANIMAL_KO[yearBranch]!,
  };
}

/** the days of a month (for calendars), UTC+9 */
export const monthDays = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const ymdKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/* ------------------------------------------------------------------ 吉日カレンダー（用途別）と 손 없는 날 목록 */

export type JaPurpose = "wedding" | "move" | "opening";
export const JA_PURPOSES: JaPurpose[] = ["wedding", "move", "opening"];
const WEIGHT: Record<JaPurpose, Partial<Record<Rokuyo | Senjitsu, number>>> = {
  wedding: { 天赦日: 3, 大安: 2, 一粒万倍日: 2, 友引: 1 },
  move: { 天赦日: 3, 大安: 2, 先勝: 1, 友引: 1, 一粒万倍日: 1 },
  opening: { 天赦日: 3, 一粒万倍日: 2, 大安: 2, 己巳の日: 1.5, 寅の日: 1, 巳の日: 1 },
};
const AVOID = new Set<string>(["仏滅", "赤口", "不成就日"]);
/** the days in the next `n` days (from `from`) that suit a purpose, with a score (higher = more good marks together) */
export function jaCandidates(p: JaPurpose, from: string, n = 92): { day: JaDay; score: number }[] {
  const s = parseYmd(from)!;
  const out: { day: JaDay; score: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(Date.UTC(s.y, s.m - 1, s.d) + i * DAY);
    const j = jaDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    if (AVOID.has(j.rokuyo) || j.marks.some((x) => AVOID.has(x))) continue;
    const w = WEIGHT[p];
    // 先勝 and 友引 count for weddings and moves, but only lift a day that has something else too
    const score = (w[j.rokuyo] ?? 0) + j.marks.reduce((a, x) => a + (w[x] ?? 0), 0);
    const strong = j.rokuyo === "大安" || j.marks.some((x) => (w[x] ?? 0) >= 1);
    if (score >= 1 && (strong || p !== "opening")) out.push({ day: j, score });
  }
  return out;
}
/** 손 없는 날 in the next `n` days */
export function koSonDays(from: string, n = 92): KoDay[] {
  const s = parseYmd(from)!;
  const out: KoDay[] = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(Date.UTC(s.y, s.m - 1, s.d) + i * DAY);
    const k = koDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    if (k.sonEomneun) out.push(k);
  }
  return out;
}
