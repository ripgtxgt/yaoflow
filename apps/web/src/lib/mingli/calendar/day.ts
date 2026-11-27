import { SolarDay, SolarTerm, type SixtyCycleDay } from "tyme4ts";
import TERMS from "@/data/mingli/terms.json";
import { toHant } from "@/lib/hant";

/**
 * 10-17 进度表 69 黃曆 (需求-命理六项 §69): one day of the almanac from tyme4ts (6tail, MIT). Everything the almanac
 * shows — lunar date, the day's 干支, the solar term, 宜／忌, 神煞, 沖煞, 彭祖百忌, 建除, 二十八宿, 九星, 胎神, the
 * directions and the twelve hours — comes out of the library in simplified Chinese; the page turns it into Taiwan
 * wording through a reviewed term table (data/mingli/terms.json), never through guesswork. Days are Taipei days.
 *
 * 70 擇日 and 73 每日運勢 read the same object.
 */
type TermRow = { tw: string; hk: string };
const T = TERMS as Record<string, TermRow>;

export type HlLocale = "zh-hant" | "zh";
/** a simplified source term in the reader's script (simplified pages keep the library's own words) */
export const term = (s: string, locale: HlLocale = "zh-hant"): string => (locale === "zh" ? s : T[s]?.tw ?? toHant(s));

export interface HlHour { branch: string; ganzhi: string; huangdao: boolean; god: string; yi: string[]; ji: string[] }
export interface HuangliDay {
  ymd: string; y: number; m: number; d: number; weekday: number;
  lunar: { yearGz: string; month: string; day: string; leap: boolean; monthNum: number; dayNum: number };
  gz: { year: string; month: string; day: string };
  zodiacYear: string;
  /** the term the day sits in; `today` when it begins on this day, with its moment (UTC+8) */
  term: { name: string; today: boolean; at: string | null; dayIndex: number };
  nextTerm: { name: string; at: string };
  yi: string[]; ji: string[];
  /** 宜 ends with 餘事勿取: only what is listed is suitable */
  onlyListed: boolean;
  /** 忌 says 諸事不宜 */
  nothing: boolean;
  gods: { name: string; lucky: boolean }[];
  chong: { branch: string; zodiac: string };
  sha: string;
  pengzu: [string, string];
  duty: string;
  xiu: { name: string; lucky: boolean };
  nineStar: string;
  twelveGod: { name: string; huangdao: boolean };
  fetus: string;
  dirs: { xi: string; fu: string; cai: string; yangGui: string; yinGui: string };
  nayin: string;
  hours: HlHour[];
  festivals: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymdOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1]!, mo = +m[2]!, d = +m[3]!;
  if (y < 1901 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
  return { y, m: mo, d };
}

/** Taiwan dates the library does not carry (lunar month, day) — shown as small marks */
const TW_LUNAR: Record<string, string> = { "1-9": "天公生", "2-2": "頭牙", "3-23": "媽祖生", "7-1": "開鬼門", "7-29": "關鬼門", "12-16": "尾牙", "12-24": "送神" };
const TW_SOLAR: Record<string, string> = { "2-28": "和平紀念日", "4-4": "兒童節", "10-10": "國慶日", "12-25": "行憲紀念日" };
// library festivals that are PRC-only are left out of the Taiwan page
const SKIP_SOLAR = new Set(["建党节", "建军节", "国庆节", "劳动节", "青年节", "妇女节", "植树节", "儿童节", "教师节"]);

const timeStr = (st: { getYear(): number; getMonth(): number; getDay(): number; getHour(): number; getMinute(): number }) =>
  `${st.getYear()}-${pad(st.getMonth())}-${pad(st.getDay())} ${pad(st.getHour())}:${pad(st.getMinute())}`;

const cache = new Map<string, HuangliDay>();

export function huangliDay(y: number, m: number, d: number): HuangliDay {
  const key = ymdOf(y, m, d);
  const hit = cache.get(key);
  if (hit) return hit;
  const sd = SolarDay.fromYmd(y, m, d);
  const ld = sd.getLunarDay();
  const sc: SixtyCycleDay = sd.getSixtyCycleDay();
  const day = sc.getSixtyCycle();
  const eb = day.getEarthBranch(), hs = day.getHeavenStem();
  const yi = sc.getRecommends().map((t) => t.getName());
  const ji = sc.getAvoids().map((t) => t.getName());
  const td = sd.getTermDay();
  const curTerm = td.getSolarTerm();
  const startsToday = td.getDayIndex() === 0;
  const nt = sd.getTerm().next(1);
  const lm = ld.getLunarMonth();
  const tg = sc.getTwelveStar();
  const festivals: string[] = [];
  const lf = ld.getFestival(); if (lf) festivals.push(lf.getName());
  const sf = sd.getFestival(); if (sf && !SKIP_SOLAR.has(sf.getName())) festivals.push(sf.getName());
  const tl = TW_LUNAR[`${Math.abs(lm.getMonth())}-${ld.getDay()}`]; if (tl && !lm.isLeap()) festivals.push(tl);
  const ts = TW_SOLAR[`${m}-${d}`]; if (ts) festivals.push(ts);
  const out: HuangliDay = {
    ymd: key, y, m, d, weekday: sd.getWeek().getIndex(),
    lunar: { yearGz: ld.getYearSixtyCycle().getName(), month: lm.getName(), day: ld.getName(), leap: lm.isLeap(), monthNum: Math.abs(lm.getMonth()), dayNum: ld.getDay() },
    gz: { year: sc.getYear().getName(), month: sc.getMonth().getName(), day: day.getName() },
    zodiacYear: ld.getYearSixtyCycle().getEarthBranch().getZodiac().getName(),
    term: { name: curTerm.getName(), today: startsToday, at: startsToday ? timeStr(curTerm.getJulianDay().getSolarTime()) : null, dayIndex: td.getDayIndex() },
    nextTerm: { name: nt.getName(), at: timeStr(nt.getJulianDay().getSolarTime()) },
    yi: yi.filter((x) => x !== "馀事勿取"), ji: ji.filter((x) => x !== "诸事不宜"),
    onlyListed: yi.includes("馀事勿取"), nothing: ji.includes("诸事不宜"),
    gods: sc.getGods().map((g) => ({ name: g.getName(), lucky: g.getLuck().getName() === "吉" })),
    chong: { branch: eb.getOpposite().getName(), zodiac: eb.getOpposite().getZodiac().getName() },
    sha: eb.getOminous().getName(),
    pengzu: [hs.getPengZuHeavenStem().getName(), eb.getPengZuEarthBranch().getName()],
    duty: sc.getDuty().getName(),
    xiu: { name: sc.getTwentyEightStar().getName(), lucky: sc.getTwentyEightStar().getLuck().getName() === "吉" },
    nineStar: sc.getNineStar().toString(),
    twelveGod: { name: tg.getName(), huangdao: tg.getEcliptic().getName() === "黄道" },
    fetus: sc.getFetusDay().getName(),
    dirs: { xi: hs.getJoyDirection().getName(), fu: hs.getMascotDirection().getName(), cai: hs.getWealthDirection().getName(), yangGui: hs.getYangDirection().getName(), yinGui: hs.getYinDirection().getName() },
    nayin: day.getSound().getName(),
    hours: sc.getHours().filter((_, i) => i < 12).map((h) => {
      const g = h.getTwelveStar();
      return { branch: h.getSixtyCycle().getEarthBranch().getName(), ganzhi: h.getSixtyCycle().getName(), huangdao: g.getEcliptic().getName() === "黄道", god: g.getName(), yi: h.getRecommends().map((t) => t.getName()), ji: h.getAvoids().map((t) => t.getName()) };
    }),
    festivals,
  };
  if (cache.size > 2000) cache.clear();
  cache.set(key, out);
  return out;
}

/** the solar term moment for a year and a term name (for the term pages and tests) */
export function termMoment(year: number, name: string): string {
  return timeStr(SolarTerm.fromName(year, name).getJulianDay().getSolarTime());
}

export const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];
/** the hour names, 子 first */
export const HOUR_SPANS: Record<string, string> = { 子: "23–01", 丑: "01–03", 寅: "03–05", 卯: "05–07", 辰: "07–09", 巳: "09–11", 午: "11–13", 未: "13–15", 申: "15–17", 酉: "17–19", 戌: "19–21", 亥: "21–23" };
