import { solarLongitude } from "./calendar";

/**
 * 农历 (Chinese lunisolar calendar), computed — no tables to go stale.
 *
 * 10-05 (Neil: 「這個卦，AI識別不了農曆的準確性嗎？」): a reader asked about
 * 農曆十月 and the timing block read it as Gregorian October. The question words
 * are turned into dates in lib/ask-window.ts; this module is the calendar it
 * needs — which Gregorian days a lunar month covers, today's lunar date, and
 * the dates of the lunar festivals people set deadlines by (過年 / 中秋 / 端午…).
 *
 * Rules (GB/T 33661-2017, the 紫金山天文台 standard; Aslaksen, "The Mathematics
 * of the Chinese Calendar"):
 *   - a month begins on the civil day (UTC+8) of a new moon;
 *   - the month containing the winter solstice is month 11;
 *   - a 岁 (solstice to solstice) with 13 new-moon months gets a leap month: the
 *     first of them that contains no 中气 (solar longitude a multiple of 30°).
 * New moons: Meeus, Astronomical Algorithms ch. 49 (within a minute).
 * Solar terms: the engine's own solarLongitude (±15 min at a boundary).
 * Both are compared by their Beijing civil date, as the almanacs do.
 * Valid ~1950–2050 (the ΔT fit in calendar.ts).
 */

const DAY_MS = 86_400_000;
const BJT_MS = 8 * 3_600_000;
const RAD = Math.PI / 180;
const sin = (deg: number) => Math.sin(deg * RAD);

/** ΔT in seconds — same fit as calendar.ts (Espenak/Meeus 2005–2050). */
function deltaTSeconds(utcMs: number): number {
  const y = new Date(utcMs).getUTCFullYear();
  const t = Math.max(-50, Math.min(50, y - 2000));
  return 62.92 + 0.32217 * t + 0.005589 * t * t;
}

/** Instant (UTC ms) of the k-th new moon from 2000-01-06 (k = 0). Meeus ch. 49. */
export function newMoonUtcMs(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const Om = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
  jde +=
    -0.40720 * sin(Mp) +
    0.17241 * E * sin(M) +
    0.01608 * sin(2 * Mp) +
    0.01039 * sin(2 * F) +
    0.00739 * E * sin(Mp - M) -
    0.00514 * E * sin(Mp + M) +
    0.00208 * E * E * sin(2 * M) -
    0.00111 * sin(Mp - 2 * F) -
    0.00057 * sin(Mp + 2 * F) +
    0.00056 * E * sin(2 * Mp + M) -
    0.00042 * sin(3 * Mp) +
    0.00042 * E * sin(M + 2 * F) +
    0.00038 * E * sin(M - 2 * F) -
    0.00024 * E * sin(2 * Mp - M) -
    0.00017 * sin(Om) -
    0.00007 * sin(Mp + 2 * M) +
    0.00004 * sin(2 * Mp - 2 * F) +
    0.00004 * sin(3 * M) +
    0.00003 * sin(Mp + M - 2 * F) +
    0.00003 * sin(2 * Mp + 2 * F) -
    0.00003 * sin(Mp + M + 2 * F) +
    0.00003 * sin(Mp - M + 2 * F) -
    0.00002 * sin(Mp - M - 2 * F) -
    0.00002 * sin(3 * Mp + M) +
    0.00002 * sin(4 * Mp);
  const A = [
    [299.77, 0.107408, -0.009173, 0.000325], [251.88, 0.016321, 0, 0.000165], [251.83, 26.651886, 0, 0.000164],
    [349.42, 36.412478, 0, 0.000126], [84.66, 18.206239, 0, 0.000110], [141.74, 53.303771, 0, 0.000062],
    [207.14, 2.453732, 0, 0.000060], [154.84, 7.306860, 0, 0.000056], [34.52, 27.261239, 0, 0.000047],
    [207.19, 0.121824, 0, 0.000042], [291.34, 1.844379, 0, 0.000040], [161.72, 24.198154, 0, 0.000037],
    [239.56, 25.513099, 0, 0.000035], [331.55, 3.592518, 0, 0.000023],
  ] as const;
  for (const [a0, a1, a2, c] of A) jde += c * sin(a0 + a1 * k + a2 * T2);
  const utcMs = (jde - 2440587.5) * DAY_MS;
  return utcMs - deltaTSeconds(utcMs) * 1000;
}

/** Approximate lunation number for an instant (the new moon at or just before it). */
function lunationAt(utcMs: number): number {
  const yearFrac = 2000 + (utcMs - Date.UTC(2000, 0, 6)) / (365.25 * DAY_MS);
  let k = Math.floor((yearFrac - 2000) * 12.3685);
  while (newMoonUtcMs(k + 1) <= utcMs) k += 1;
  while (newMoonUtcMs(k) > utcMs) k -= 1;
  return k;
}

/** Beijing civil day number (days since epoch) of an instant — the calendar's own day. */
const bjtDay = (utcMs: number) => Math.floor((utcMs + BJT_MS) / DAY_MS);
const dayToIso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const isoToDay = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** Instant at which the apparent solar longitude reaches `target` (deg), searched in [t0, t1]. */
function solarTermMs(target: number, t0: number, t1: number): number {
  const f = (t: number) => ((solarLongitude(t) - target + 540) % 360) - 180; // signed distance, −180..180
  let lo = t0, hi = t1;
  let flo = f(lo);
  if (flo > 0) { // wrapped: the crossing is before t0 — widen
    lo = t0 - 40 * DAY_MS; flo = f(lo);
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0 === flo < 0) { lo = mid; flo = f(mid); } else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The 节气 civil date (UTC+8) for solar longitude `lambda` (multiple of 15) in Gregorian year `y`. */
export function solarTermIso(y: number, lambda: number): string {
  // λ 285 (小寒) … 345 (驚蟄) fall in Jan–Mar; 0 (春分) … 270 (冬至) in Mar–Dec. Rough day-of-year anchor:
  const l = ((lambda % 360) + 360) % 360;
  const doy = l >= 285 ? (l - 285) / 15 * 15.2 + 5 : l / 15 * 15.2 + 80; // 小寒≈Jan 5; 春分≈Mar 20
  const guess = Date.UTC(y, 0, 1) + doy * DAY_MS;
  const t = solarTermMs(l, guess - 25 * DAY_MS, guess + 25 * DAY_MS);
  return dayToIso(bjtDay(t));
}

export interface LunarMonth {
  /** the Chinese year this month belongs to, named by the Gregorian year its 正月 starts in */
  year: number;
  /** 1 = 正月 … 12 = 臘月 */
  month: number;
  leap: boolean;
  /** first day, ISO (Beijing civil date) */
  start: string;
  /** last day, ISO */
  end: string;
  days: number;
}

const cache = new Map<number, LunarMonth[]>();

/**
 * The months of one 岁: from the month holding the winter solstice of year
 * y−1 (month 11 of Chinese year y−1) up to, not including, the month holding
 * the solstice of year y.
 */
function suiMonths(y: number): LunarMonth[] {
  const hit = cache.get(y);
  if (hit) return hit;
  const ws0 = bjtDay(solarTermMs(270, Date.UTC(y - 1, 11, 10), Date.UTC(y - 1, 11, 31)));
  const ws1 = bjtDay(solarTermMs(270, Date.UTC(y, 11, 10), Date.UTC(y, 11, 31)));
  const kOnOrBefore = (day: number) => {
    let k = lunationAt((day + 1) * DAY_MS - BJT_MS); // last new moon up to the end of that civil day
    while (bjtDay(newMoonUtcMs(k)) > day) k -= 1;
    while (bjtDay(newMoonUtcMs(k + 1)) <= day) k += 1;
    return k;
  };
  const k0 = kOnOrBefore(ws0), k1 = kOnOrBefore(ws1);
  const starts: number[] = [];
  for (let k = k0; k <= k1; k++) starts.push(bjtDay(newMoonUtcMs(k)));
  const n = k1 - k0; // months in the 岁: 12, or 13 with a leap month
  let leapIdx = -1;
  if (n === 13) {
    // 中气 civil days across the 岁 (the solstice at each end included)
    const zhongqi: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const target = (270 + 30 * i) % 360;
      const approx = ws0 * DAY_MS + i * 30.44 * DAY_MS;
      zhongqi.push(bjtDay(solarTermMs(target, approx - 20 * DAY_MS, approx + 20 * DAY_MS)));
    }
    for (let i = 1; i < n; i++) {
      const s = starts[i]!, e = starts[i + 1]! - 1;
      if (!zhongqi.some((z) => z >= s && z <= e)) { leapIdx = i; break; }
    }
  }
  const out: LunarMonth[] = [];
  let month = 11, year = y - 1;
  for (let i = 0; i < n; i++) {
    const leap = i === leapIdx;
    if (i > 0 && !leap) {
      const prev = out[out.length - 1]!;
      month = prev.month === 12 ? 1 : prev.month + 1;
      if (month === 1) year += 1;
    }
    const s = starts[i]!, e = starts[i + 1]! - 1;
    out.push({ year, month, leap, start: dayToIso(s), end: dayToIso(e), days: e - s + 1 });
  }
  cache.set(y, out);
  return out;
}

/** Lunar months whose span touches [fromIso, toIso], in order. */
export function lunarMonthsBetween(fromIso: string, toIso: string): LunarMonth[] {
  const y0 = +fromIso.slice(0, 4), y1 = +toIso.slice(0, 4);
  const all: LunarMonth[] = [];
  for (let y = y0; y <= y1 + 1; y++) all.push(...suiMonths(y));
  return all.filter((m) => m.end >= fromIso && m.start <= toIso);
}

export interface LunarDate {
  year: number;
  month: number;
  leap: boolean;
  /** 1–30 */
  day: number;
  monthStart: string;
  monthEnd: string;
}

/** The lunar date of a Gregorian civil date (ISO). */
export function lunarDateOf(iso: string): LunarDate {
  const m = lunarMonthsBetween(iso, iso)[0]!;
  return { year: m.year, month: m.month, leap: m.leap, day: isoToDay(iso) - isoToDay(m.start) + 1, monthStart: m.start, monthEnd: m.end };
}

/** The months of Chinese year `year` (正月 … 臘月, leap month in place). */
export function lunarYearMonths(year: number): LunarMonth[] {
  return [...suiMonths(year), ...suiMonths(year + 1)].filter((m) => m.year === year);
}

/** One lunar month of a Chinese year; `leap` true asks for the leap month (null when that year has none). */
export function lunarMonth(year: number, month: number, leap = false): LunarMonth | null {
  return lunarYearMonths(year).find((m) => m.month === month && m.leap === leap) ?? null;
}

/** Gregorian date of a lunar date, or null when the day does not exist (e.g. 三十 in a 29-day month). */
export function lunarToIso(year: number, month: number, day: number, leap = false): string | null {
  const m = lunarMonth(year, month, leap);
  if (!m || day < 1 || day > m.days) return null;
  return dayToIso(isoToDay(m.start) + day - 1);
}

/** 正月初一 of Chinese year `year`. */
export function lunarNewYear(year: number): string {
  return lunarMonth(year, 1)!.start;
}

/** 除夕 — the last day of Chinese year `year`. */
export function lunarYearEnd(year: number): string {
  const months = lunarYearMonths(year);
  return months[months.length - 1]!.end;
}

export const LUNAR_MONTH_ZH = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"] as const;
const DAY_ZH = [
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
] as const;

/** 農曆八月廿四 (hant) / 农历八月廿四 (hans); the month alone when `day` is omitted. */
export function lunarLabelZh(d: { month: number; leap: boolean; day?: number }, script: "hant" | "hans" = "hant"): string {
  const cal = script === "hant" ? "農曆" : "农历";
  const leap = d.leap ? (script === "hant" ? "閏" : "闰") : "";
  const mon = d.month === 12 && script === "hant" ? "十二" : LUNAR_MONTH_ZH[d.month - 1]!;
  return `${cal}${leap}${mon}月${d.day ? DAY_ZH[d.day - 1] ?? "" : ""}`;
}
