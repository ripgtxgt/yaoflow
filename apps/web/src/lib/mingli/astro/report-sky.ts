import {
  Body, Ecliptic, EclipticGeoMoon, GeoVector, MakeTime, NextGlobalSolarEclipse, NextLunarEclipse, SearchGlobalSolarEclipse, SearchLunarEclipse,
} from "astronomy-engine";
import { wallToUtc } from "@/lib/mingli/birth/normalize";
import { ASPECTS, PLANETS, houseOf, signOf } from "./chart";

/**
 * 10-20 星盤③ 年報 — the sky of one calendar year against a natal chart, pure (astronomy-engine, as chart.ts: geocentric,
 * apparent, ecliptic of date). Every moment is found by bisection on the same longitude function the chart uses, and
 * written as a 國曆 date in the birthplace's own time zone ("M/D"; "YYYY/M/D" outside the report year). The time zone
 * is only used here — it is never stored (report-facts.ts keeps the dates, not the place).
 *   solarReturn   the moment in year Y the Sun comes back to its natal longitude (bisection to 1 s)
 *   retrogrades   stations of 水星…土星 from the sign of the daily speed, refined to the minute
 *   ingresses     sign (and natal house) changes of 木星…冥王星, retrograde back-steps included
 *   exactHits     a transiting planet exactly in aspect to a natal point, with the window inside 1°
 *   eclipses      SearchLunarEclipse / SearchGlobalSolarEclipse, the longitude of the Sun (solar) or Moon (lunar) at peak
 */

const BODIES: Record<string, Body> = {
  太陽: Body.Sun, 月亮: Body.Moon, 水星: Body.Mercury, 金星: Body.Venus, 火星: Body.Mars, 木星: Body.Jupiter, 土星: Body.Saturn,
  天王星: Body.Uranus, 海王星: Body.Neptune, 冥王星: Body.Pluto,
};
const norm = (x: number) => ((x % 360) + 360) % 360;
export const wrap180 = (x: number) => ((x % 360) + 540) % 360 - 180;
const DAY = 86_400_000;

/** apparent geocentric ecliptic longitude of date — exactly chart.ts's lonOf */
export function lonAt(planet: string, ms: number): number {
  const t = MakeTime(new Date(ms));
  if (planet === "月亮") return EclipticGeoMoon(t).lon;
  return Ecliptic(GeoVector(BODIES[planet]!, t, true)).elon;
}
/** degrees per day (centred, ±12 h); negative = retrograde */
export const speedAt = (planet: string, ms: number) => wrap180(lonAt(planet, ms + DAY / 2) - lonAt(planet, ms - DAY / 2));

/* ------------------------------------------------------------------ dates in the birthplace's zone */

export interface Ymd { y: number; m: number; d: number }
const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function localYmd(ms: number, tz: string): Ymd {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" }); fmtCache.set(tz, f); }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}
/** "M/D" inside the report year, "YYYY/M/D" outside it */
export const dateKey = (d: Ymd, year: number) => (d.y === year ? `${d.m}/${d.d}` : `${d.y}/${d.m}/${d.d}`);
export const dateOf = (ms: number, tz: string, year: number) => dateKey(localYmd(ms, tz), year);
/** local noon of each day from (y0,m0,d0) for n days */
export function noonDays(tz: string, from: Ymd, n: number): { ms: number; ymd: Ymd }[] {
  const out: { ms: number; ymd: Ymd }[] = [];
  const base = Date.UTC(from.y, from.m - 1, from.d);
  for (let i = 0; i < n; i++) {
    const u = new Date(base + i * DAY);
    const ymd = { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate() };
    out.push({ ms: wallToUtc(tz, { ...ymd, h: 12, mi: 0 }), ymd });
  }
  return out;
}
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** bisection: f(a) and f(b) differ in sign → the moment it turns, to `tolMs` */
function bisect(f: (ms: number) => number, a: number, b: number, tolMs = 1000): number {
  let fa = f(a);
  for (let k = 0; k < 80 && b - a > tolMs; k++) {
    const m = (a + b) / 2, fm = f(m);
    if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

/* ------------------------------------------------------------------ solar return */

/**
 * The moment in calendar year `year` (birthplace time) the Sun's longitude equals `natalSun`. Daily steps over the year
 * find the day it crosses (the Sun never goes backwards), then bisection to one second. null only if the year has none.
 */
export function solarReturn(natalSun: number, year: number, tz: string): number | null {
  const start = wallToUtc(tz, { y: year, m: 1, d: 1, h: 0, mi: 0 }), end = wallToUtc(tz, { y: year + 1, m: 1, d: 1, h: 0, mi: 0 });
  const f = (ms: number) => wrap180(lonAt("太陽", ms) - natalSun);
  let a = start, fa = f(a);
  for (let b = start + DAY; a < end; b = Math.min(b + DAY, end)) {
    const fb = f(b);
    if (fa < 0 && fb >= 0 && fb - fa < 10) {
      const t = bisect(f, a, b, 1000);
      return t >= start && t < end ? t : null;
    }
    if (b >= end) break;
    a = b; fa = fb;
  }
  return null;
}

/* ------------------------------------------------------------------ retrograde periods */

export interface RetroPeriod { planet: string; fromMs: number; toMs: number; from: string; to: string; signs: string[]; houses: number[] }
/**
 * Retrograde stretches of a planet that overlap calendar year `year`: daily speed at local noon from 120 days before the
 * year to 120 days after it, each change of sign refined to the minute. A stretch begun last year or ending next year
 * keeps its real dates (written with their year).
 */
export function retrogrades(planet: string, year: number, tz: string, cusps: number[] | null): RetroPeriod[] {
  const days = noonDays(tz, { y: year - 1, m: 9, d: 1 }, 365 + 245);
  const sp = days.map((d) => speedAt(planet, d.ms));
  const stations: { ms: number; dir: "R" | "D" }[] = [];
  for (let i = 1; i < days.length; i++) {
    if ((sp[i - 1]! < 0) === (sp[i]! < 0)) continue;
    stations.push({ ms: bisect((ms) => speedAt(planet, ms), days[i - 1]!.ms, days[i]!.ms, 60_000), dir: sp[i]! < 0 ? "R" : "D" });
  }
  const y0 = wallToUtc(tz, { y: year, m: 1, d: 1, h: 0, mi: 0 }), y1 = wallToUtc(tz, { y: year + 1, m: 1, d: 1, h: 0, mi: 0 });
  const out: RetroPeriod[] = [];
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i]!;
    if (s.dir !== "R") continue;
    const e = stations.slice(i + 1).find((x) => x.dir === "D");
    if (!e || e.ms < y0 || s.ms >= y1) continue;
    const l1 = lonAt(planet, s.ms), l2 = lonAt(planet, e.ms);
    out.push({
      planet, fromMs: s.ms, toMs: e.ms, from: dateOf(s.ms, tz, year), to: dateOf(e.ms, tz, year),
      signs: [...new Set([signOf(l1), signOf(l2)])], houses: cusps ? [...new Set([houseOf(l1, cusps), houseOf(l2, cusps)])] : [],
    });
  }
  return out;
}

/* ------------------------------------------------------------------ ingresses */

export interface Ingress { ms: number; date: string; kind: "sign" | "house"; to: string; back: boolean }
export interface SlowYear { planet: string; start: { sign: string; house: number | null }; end: { sign: string; house: number | null }; ingresses: Ingress[] }
/** where a slow planet is at the start and end of the year, and every sign / natal-house change inside it */
export function slowYear(planet: string, year: number, tz: string, cusps: number[] | null): SlowYear {
  const days = noonDays(tz, { y: year, m: 1, d: 1 }, 365 + (daysInMonth(year, 2) === 29 ? 1 : 0) + 1);
  const y0 = wallToUtc(tz, { y: year, m: 1, d: 1, h: 0, mi: 0 }), y1 = wallToUtc(tz, { y: year + 1, m: 1, d: 1, h: 0, mi: 0 });
  const where = (ms: number) => { const l = lonAt(planet, ms); return { l, sign: Math.floor(norm(l) / 30), house: cusps ? houseOf(l, cusps) : null }; };
  const ingresses: Ingress[] = [];
  // a slow planet crosses at most one sign edge and one cusp in a day: bisect on "still where it was at a"
  const scan = (a: number, b: number) => {
    const pa = where(a), pb = where(b);
    const back = wrap180(pb.l - pa.l) < 0;
    if (pa.sign !== pb.sign) {
      const t = bisect((ms) => (where(ms).sign === pa.sign ? -1 : 1), a, b, 60_000);
      if (t >= y0 && t < y1) ingresses.push({ ms: t, date: dateOf(t, tz, year), kind: "sign", to: signOf(pb.l), back });
    }
    if (cusps && pa.house !== pb.house) {
      const t = bisect((ms) => (where(ms).house === pa.house ? -1 : 1), a, b, 60_000);
      if (t >= y0 && t < y1) ingresses.push({ ms: t, date: dateOf(t, tz, year), kind: "house", to: String(pb.house), back });
    }
  };
  for (let i = 0; i < days.length - 1; i++) scan(i === 0 ? y0 : days[i]!.ms, days[i + 1]!.ms);
  const s = where(y0), e = where(y1 - 1);
  return {
    planet, start: { sign: signOf(s.l), house: s.house }, end: { sign: signOf(e.l), house: e.house },
    ingresses: ingresses.sort((a, b) => a.ms - b.ms),
  };
}

/* ------------------------------------------------------------------ exact aspects to natal points */

export interface Hit { planet: string; point: string; aspect: string; exact: string[]; exactMs: number[]; from: string; to: string; fromMs: number; toMs: number }
/**
 * Every time `planet` (transiting) makes one of the five aspects exactly to a natal point inside the year, plus the
 * window around it while the orb stays within `orb`° (daily resolution, clipped to 120 days either side of the year).
 * A window that touches the year without an exact hit inside it (exact last year, still within orb in January) is kept
 * with an empty `exact`.
 */
export function exactHits(planet: string, points: { name: string; lon: number }[], year: number, tz: string, orb = 1): Hit[] {
  const days = noonDays(tz, { y: year - 1, m: 9, d: 1 }, 365 + 245);
  const lons = days.map((d) => lonAt(planet, d.ms));
  const y0 = wallToUtc(tz, { y: year, m: 1, d: 1, h: 0, mi: 0 }), y1 = wallToUtc(tz, { y: year + 1, m: 1, d: 1, h: 0, mi: 0 });
  const out: Hit[] = [];
  for (const p of points) for (const a of ASPECTS) {
    for (const off of a.angle === 0 || a.angle === 180 ? [a.angle] : [a.angle, -a.angle]) {
      const h = (l: number) => wrap180(l - p.lon - off);
      const hs = lons.map(h);
      // windows where |h| ≤ orb
      let i = 0;
      while (i < hs.length) {
        if (Math.abs(hs[i]!) > orb) { i++; continue; }
        let j = i;
        while (j + 1 < hs.length && Math.abs(hs[j + 1]!) <= orb) j++;
        const fromMs = days[i]!.ms, toMs = days[j]!.ms;
        if (toMs >= y0 && fromMs < y1) {
          const exactMs: number[] = [];
          for (let k = Math.max(1, i - 1); k <= Math.min(hs.length - 1, j + 1); k++) {
            const x = hs[k - 1]!, y = hs[k]!;
            if ((x < 0) !== (y < 0) && Math.abs(x - y) < 10) {
              const t = bisect((ms) => h(lonAt(planet, ms)), days[k - 1]!.ms, days[k]!.ms, 60_000);
              if (t >= y0 && t < y1) exactMs.push(t);
            }
          }
          const lo = Math.max(fromMs, y0), hi = Math.min(toMs, y1 - 1);
          out.push({ planet, point: p.name, aspect: a.name, exactMs, exact: exactMs.map((t) => dateOf(t, tz, year)), fromMs: lo, toMs: hi, from: dateOf(lo, tz, year), to: dateOf(hi, tz, year) });
        }
        i = j + 1;
      }
    }
  }
  return out.sort((x, y) => (x.exactMs[0] ?? x.fromMs) - (y.exactMs[0] ?? y.fromMs));
}

/* ------------------------------------------------------------------ eclipses */

const ECL_NAME: Record<string, string> = { "solar:total": "日全食", "solar:annular": "日環食", "solar:partial": "日偏食", "solar:hybrid": "日全環食", "lunar:total": "月全食", "lunar:partial": "月偏食", "lunar:penumbral": "半影月食" };
export interface Eclipse { ms: number; date: string; type: "solar" | "lunar"; kind: string; lon: number; sign: string; deg: number }
/** the solar and lunar eclipses whose peak falls in calendar year `year` (birthplace dates), in time order */
export function eclipsesOf(year: number, tz: string): Eclipse[] {
  const y0 = wallToUtc(tz, { y: year, m: 1, d: 1, h: 0, mi: 0 }), y1 = wallToUtc(tz, { y: year + 1, m: 1, d: 1, h: 0, mi: 0 });
  const out: Eclipse[] = [];
  const add = (type: "solar" | "lunar", kind: string, ms: number) => {
    if (ms < y0 || ms >= y1) return;
    const lon = lonAt(type === "solar" ? "太陽" : "月亮", ms);
    out.push({ ms, date: dateOf(ms, tz, year), type, kind: ECL_NAME[`${type}:${kind}`] ?? (type === "solar" ? "日食" : "月食"), lon, sign: signOf(lon), deg: Math.floor(norm(lon) % 30) });
  };
  const from = new Date(y0 - 40 * DAY);
  for (let e = SearchLunarEclipse(from); e.peak.date.getTime() < y1; e = NextLunarEclipse(e.peak)) add("lunar", e.kind, e.peak.date.getTime());
  for (let e = SearchGlobalSolarEclipse(from); e.peak.date.getTime() < y1; e = NextGlobalSolarEclipse(e.peak)) add("solar", e.kind, e.peak.date.getTime());
  return out.sort((a, b) => a.ms - b.ms);
}

export { PLANETS };
