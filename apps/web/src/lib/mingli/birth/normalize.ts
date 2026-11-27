import { LunarDay } from "tyme4ts";
import { placeById, type Place } from "./places";

/**
 * 10-18 进度表 71–74 生辰输入层: a birth record as the reader typed it → one normalized moment that 紫微, 八字 and 星盤
 * all read. Runs in the browser (birth data never leaves the device) and on the server in tests.
 *
 *  - Time zone and daylight saving come from the place's IANA zone through Intl (historical offsets, e.g. Taiwan's DST
 *    years 1945–1979 and Hong Kong's 1941–1979). The clock time is turned into standard time (DST removed) and UTC.
 *  - True solar time (on by default for 紫微／八字) = standard time + 4 min × (longitude − zone meridian) + equation of
 *    time (NOAA fractional-year formula). 星盤 does not use it; it uses UTC and the coordinates.
 *  - 子時: decided once, here, on the corrected time (B1). "next" = 23:00 starts the next day (Neil 10-17 default);
 *    "same" = 晚子時 keeps the day.
 *  - Lunar input is turned into the solar date; a leap-month date stays the leap-month date (紫微 splits the leap month
 *    itself, 八字 is by solar terms and does not care).
 */
export type Gender = "male" | "female";
export type TimeMode = "exact" | "branch" | "unknown";
export type ZiSect = "next" | "same";
export interface BirthInput {
  calendar: "solar" | "lunar";
  y: number; m: number; d: number; leap?: boolean;
  timeMode: TimeMode;
  /** exact: hour 0–23 and minute */
  h?: number; mi?: number;
  /** branch: 0 早子 … 11 亥, 12 晚子 */
  branch?: number;
  placeId?: string;
  /** 10-18 a place picked from the city search (GeoNames); wins over placeId */
  place?: { id: string; name: string; lat: number; lon: number; tz: string };
  gender?: Gender;
  trueSolar?: boolean;
  zi?: ZiSect;
  /** the reader says the clock time already has daylight saving taken off */
  dstAlreadyRemoved?: boolean;
  /** 星盤 house system (Placidus by default, Neil 10-17) */
  houses?: "placidus" | "whole";
}
export interface Ymdhm { y: number; m: number; d: number; h: number; mi: number }
export interface Normalized {
  /** the solar birth date as entered (lunar input converted) */
  solarDate: { y: number; m: number; d: number };
  timeKnown: boolean;
  place: Place | null;
  /** clock time and its UTC moment (exact time only) */
  clock: Ymdhm | null;
  utcMs: number | null;
  dst: boolean;
  /** standard local time (DST removed) */
  standard: Ymdhm | null;
  /** true solar time when on, otherwise the standard time — the time 紫微／八字 use */
  chartTime: Ymdhm | null;
  solarShiftMin: number | null;
  /** 時辰 0 子 … 11 亥 of chartTime (or of the chosen branch) */
  hourBranch: number | null;
  /** the date 紫微／八字 count the day from (moves to the next day for 23:00 under "next") */
  chartDate: { y: number; m: number; d: number };
  /** iztro time index 0–12 (12 = 晚子時 kept on the same day) */
  timeIndex: number | null;
  /** within 15 minutes of an hour boundary */
  nearBoundary: boolean;
  zi: ZiSect; trueSolar: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

export class BirthError extends Error {}

/** UTC offset (minutes, east positive) of an IANA zone at a moment */
export function offsetAt(tz: string, utcMs: number): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parts: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(utcMs))) if (x.type !== "literal") parts[x.type] = +x.value;
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour! % 24, parts.minute!, parts.second!);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** local wall time in a zone → UTC ms */
export function wallToUtc(tz: string, t: Ymdhm): number {
  const wall = Date.UTC(t.y, t.m - 1, t.d, t.h, t.mi);
  let u = wall - offsetAt(tz, wall) * 60000;
  u = wall - offsetAt(tz, u) * 60000;
  return u;
}

/** the zone's standard offset around a year: the smallest offset seen month by month over three years (DST only ever
 * adds, and some DST periods ran across New Year, e.g. Hong Kong 1973-12-30 → 1974-10-20) */
export function standardOffset(tz: string, year: number): number {
  let min = Infinity;
  for (let y = year - 1; y <= year + 1; y++) for (let m = 0; m < 12; m++) min = Math.min(min, offsetAt(tz, Date.UTC(y, m, 15, 12)));
  return min;
}

/** equation of time in minutes (NOAA) */
export function equationOfTime(utcMs: number): number {
  const d = new Date(utcMs);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.floor((utcMs - start) / 86_400_000) + 1;
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  const days = (Date.UTC(d.getUTCFullYear() + 1, 0, 1) - start) / 86_400_000;
  const g = (2 * Math.PI / days) * (doy - 1 + (hour - 12) / 24);
  return 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
}

const fromMs = (ms: number): Ymdhm => { const d = new Date(ms); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
const toMs = (t: Ymdhm) => Date.UTC(t.y, t.m - 1, t.d, t.h, t.mi);
export const fmt = (t: Ymdhm) => `${t.y}-${pad(t.m)}-${pad(t.d)} ${pad(t.h)}:${pad(t.mi)}`;
/** 時辰 of a clock hour: 23–01 子(0), 01–03 丑(1) … */
export const branchOfHour = (h: number) => Math.floor(((h + 1) % 24) / 2);

export function solarDateOf(i: BirthInput): { y: number; m: number; d: number } {
  const maxYear = new Date().getUTCFullYear() + 1;
  if (!Number.isInteger(i.y) || i.y < 1900 || i.y > maxYear) throw new BirthError("year");
  if (i.calendar === "lunar") {
    try {
      const sd = LunarDay.fromYmd(i.y, i.leap ? -i.m : i.m, i.d).getSolarDay();
      return { y: sd.getYear(), m: sd.getMonth(), d: sd.getDay() };
    } catch { throw new BirthError("lunar-date"); }
  }
  const last = new Date(Date.UTC(i.y, i.m, 0)).getUTCDate();
  if (!Number.isInteger(i.m) || i.m < 1 || i.m > 12 || !Number.isInteger(i.d) || i.d < 1 || i.d > last) throw new BirthError("date");
  return { y: i.y, m: i.m, d: i.d };
}

export function checkGender(g: unknown): Gender {
  if (g === "male" || g === "female") return g;
  throw new BirthError("gender");
}

function geoPlace(g: BirthInput["place"]): Place | null {
  if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lon) || Math.abs(g.lat) > 90 || Math.abs(g.lon) > 180 || !g.tz) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: g.tz }); } catch { return null; }
  return { id: `geo-${g.id}`, name: String(g.name).slice(0, 60), group: "intl", lat: g.lat, lon: g.lon, tz: g.tz };
}

export function normalizeBirth(i: BirthInput): Normalized {
  const solarDate = solarDateOf(i);
  const zi: ZiSect = i.zi ?? "next";
  const trueSolar = i.trueSolar ?? true;
  const place = geoPlace(i.place) ?? (i.placeId ? placeById(i.placeId) : null);
  const base: Normalized = { solarDate, timeKnown: false, place, clock: null, utcMs: null, dst: false, standard: null, chartTime: null, solarShiftMin: null, hourBranch: null, chartDate: solarDate, timeIndex: null, nearBoundary: false, zi, trueSolar };

  if (i.timeMode === "unknown") return base;

  if (i.timeMode === "branch") {
    const b = i.branch ?? -1;
    if (!Number.isInteger(b) || b < 0 || b > 12) throw new BirthError("branch");
    const hourBranch = b === 12 ? 0 : b;
    // 晚子 (23–24): under "next" the day moves on and it is 子 of the next day
    let chartDate = solarDate, timeIndex = b;
    if (b === 12 && zi === "next") { const n = fromMs(toMs({ ...solarDate, h: 12, mi: 0 }) + 86_400_000); chartDate = { y: n.y, m: n.m, d: n.d }; timeIndex = 0; }
    // a representative time inside the branch, for 八字 (子 early 00:30, 丑 02:00 … 晚子 23:30)
    const h = b === 0 ? 0 : b === 12 ? 23 : b * 2, mi = b === 0 || b === 12 ? 30 : 0;
    const t = { ...solarDate, h, mi };
    return { ...base, timeKnown: true, chartTime: t, hourBranch, chartDate, timeIndex };
  }

  const h = i.h ?? -1, mi = i.mi ?? 0;
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(mi) || mi < 0 || mi > 59) throw new BirthError("time");
  if (!place) throw new BirthError("place");
  const clock: Ymdhm = { ...solarDate, h, mi };
  const utcMs = wallToUtc(place.tz, clock);
  const off = offsetAt(place.tz, utcMs);
  const std = standardOffset(place.tz, solarDate.y);
  const dst = off > std && !i.dstAlreadyRemoved;
  const stdMs = dst ? toMs(clock) - (off - std) * 60000 : toMs(clock);
  const utc = dst ? utcMs : stdMs - std * 60000;
  const standard = fromMs(stdMs);
  let shift: number | null = null, chartMs = stdMs;
  if (trueSolar) {
    shift = 4 * (place.lon - std / 4) + equationOfTime(utc);
    chartMs = stdMs + Math.round(shift * 60000);
  }
  const chartTime = fromMs(chartMs);
  const minsInDay = chartTime.h * 60 + chartTime.mi;
  const toBoundary = Math.min(...[-60, 60, 180, 300, 420, 540, 660, 780, 900, 1020, 1140, 1260, 1380, 1500].map((b) => Math.abs(minsInDay - b)));
  const hourBranch = branchOfHour(chartTime.h);
  let chartDate = { y: chartTime.y, m: chartTime.m, d: chartTime.d }, timeIndex = hourBranch;
  if (chartTime.h === 23) {
    if (zi === "next") { const n = fromMs(chartMs + 3_600_000); chartDate = { y: n.y, m: n.m, d: n.d }; timeIndex = 0; }
    else timeIndex = 12;
  }
  return { ...base, timeKnown: true, clock, utcMs: utc, dst, standard, chartTime, solarShiftMin: shift, hourBranch, chartDate, timeIndex, nearBoundary: toBoundary <= 15 };
}
