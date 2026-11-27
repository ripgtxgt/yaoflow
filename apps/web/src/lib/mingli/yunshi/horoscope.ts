import { Body, Ecliptic, EclipticGeoMoon, GeoVector, MakeTime } from "astronomy-engine";
import CONTENT from "@/data/mingli/horoscope.json";
import { parseYmd } from "@/lib/mingli/calendar/day";
import type { Tier } from "./zodiac";
import type { Foreign } from "@/lib/l10n/core";
import { dayIn, spanIn } from "@/lib/l10n/dates";
import { SIGNS as ASTRO_SIGNS } from "@/lib/mingli/astro/chart";
import { signName } from "@/lib/mingli/astro/page-ui";

/**
 * 10-30 进度表 128 ⑤ (Neil 10-29: 欧美和日本的每日运势加星座) — today for the twelve sun signs, the way daily horoscopes
 * are usually read: where today's Moon is, counted from the reader's sun sign (the solar-house method), and the angle it
 * makes (same sign or trine and sextile = 順手; square, opposition and the hidden 12th / deep 8th = 多留意; the rest
 * 平穩), plus the Moon's phase. The Moon is taken at 12:00 UTC of the day, and changes sign every two and a half days, so
 * a variant is picked by the day (the same house two days running reads differently). Words: data/mingli/horoscope.json
 * (繁體, translated with scripts/l10n: `horoscope`).
 */
export const STAR_SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"] as const;
export type StarSign = (typeof STAR_SIGNS)[number];
export type Phase = "new" | "waxingCrescent" | "firstQuarter" | "waxingGibbous" | "full" | "waningGibbous" | "lastQuarter" | "waningCrescent";
type Line = { line: string; yi: string; ji: string };
export type HoroscopeContent = {
  houses: Record<string, Line[]>;
  plain: Record<string, string[]>;
  phases: Record<Phase, string>;
  signs: Record<StarSign, { name: string; dates: string; element: string; intro: string; faq: { q: string; a: string }[] }>;
  faq: { q: string; a: string }[];
};
export const H = CONTENT as unknown as HoroscopeContent;

/** the house the Moon is in, counted from the sun sign, and the tier it gives */
export const HOUSE_TIER: Record<number, Tier> = { 1: "smooth", 3: "smooth", 5: "smooth", 9: "smooth", 11: "smooth", 2: "steady", 6: "steady", 10: "steady", 4: "careful", 7: "careful", 8: "careful", 12: "careful" };

const norm = (x: number) => ((x % 360) + 360) % 360;
const dayNo = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);

/** the Moon on a day (12:00 UTC): its sign (0 = Aries) and its phase */
export function moonOn(ymd: string): { sign: number; lon: number; phase: Phase } | null {
  const p = parseYmd(ymd);
  if (!p) return null;
  const t = MakeTime(new Date(Date.UTC(p.y, p.m - 1, p.d, 12)));
  const lon = norm(EclipticGeoMoon(t).lon);
  const sun = norm(Ecliptic(GeoVector(Body.Sun, t, true)).elon);
  const el = norm(lon - sun);
  const PH: Phase[] = ["new", "waxingCrescent", "firstQuarter", "waxingGibbous", "full", "waningGibbous", "lastQuarter", "waningCrescent"];
  return { sign: Math.floor(lon / 30), lon, phase: PH[Math.floor(norm(el + 22.5) / 45) % 8]! };
}

export interface Horoscope { sign: StarSign; signIdx: number; ymd: string; moonSign: number; house: number; tier: Tier; line: string; yi: string; ji: string; plain: string; phase: Phase; phaseLine: string }

export function horoscopeFor(signIdx: number, ymd: string, c: HoroscopeContent = H): Horoscope | null {
  const p = parseYmd(ymd), m = moonOn(ymd);
  if (!p || !m || signIdx < 0 || signIdx > 11) return null;
  const house = ((m.sign - signIdx + 12) % 12) + 1;
  const n = dayNo(p.y, p.m, p.d);
  const lines = c.houses[String(house)]!, plains = c.plain[String(house)]!;
  const pick = lines[(n + signIdx) % lines.length]!;
  return {
    sign: STAR_SIGNS[signIdx]!, signIdx, ymd, moonSign: m.sign, house, tier: HOUSE_TIER[house]!,
    line: pick.line, yi: pick.yi, ji: pick.ji, plain: plains[(n + signIdx) % plains.length]!, phase: m.phase, phaseLine: c.phases[m.phase],
  };
}

export const starBySlug = (s: string) => STAR_SIGNS.indexOf(s as StarSign);

/** the sun sign for a birthday (the usual boundaries; a birthday on the cusp is read by the day) */
export function starOfBirth(m: number, d: number): number {
  const START: [number, number][] = [[3, 21], [4, 20], [5, 21], [6, 21], [7, 23], [8, 23], [9, 23], [10, 23], [11, 22], [12, 22], [1, 20], [2, 19]];
  for (let i = 11; i >= 0; i--) {
    const [sm, sd] = START[i]!;
    // walk back from Pisces: the first start that is on or before the birthday, within the sign's own months
    const next = START[(i + 1) % 12]!;
    const onOrAfterStart = m === sm ? d >= sd : false;
    const beforeNext = m === next[0] ? d < next[1] : false;
    if (onOrAfterStart || beforeNext) return i;
  }
  return 0;
}

/** the birth dates of a sign, written the page's way ("Mar 21 – Apr 19", 「3月21日〜4月19日」) */
const START: [number, number][] = [[3, 21], [4, 20], [5, 21], [6, 21], [7, 23], [8, 23], [9, 23], [10, 23], [11, 22], [12, 22], [1, 20], [2, 19]];
export function starDatesIn(l: Foreign, i: number): string {
  const [sm, sd] = START[i]!, [nm, nd] = START[(i + 1) % 12]!;
  const end = new Date(Date.UTC(2001, nm - 1, nd - 1));
  return spanIn(l, dayIn(l, 2001, sm, sd), dayIn(l, 2001, end.getUTCMonth() + 1, end.getUTCDate()));
}
/** a sign's name in the page's language — the same names as the birth-chart pages */
export const starNameIn = (l: Foreign, i: number): string => signName(ASTRO_SIGNS[i]!, l);
