import { BRANCHES, STEMS } from "./constants";
import type { Branch, CalendarContext, Phase, Pillar, Strength } from "./types";

/**
 * Calendar layer: day/month/year pillars, 旬空, seasonal strength.
 *
 * - Day pillar anchor: 1949-10-01 was 甲子日 (cross-checked with 2000-01-01 戊午日).
 * - Month pillar follows 节气 (solar terms), computed from apparent solar
 *   longitude (Meeus low-precision series, ~0.01° ≈ ±15 min at boundaries).
 *   立春 315° → 寅月, each 节 every 30°.
 * - Traditional day boundary: 子时 begins at 23:00 local ("zi23", default).
 *   Valid range for solar-term math: ~1950–2050.
 */

export interface CalendarOptions {
  /** "zi23": day changes at 23:00 local (traditional, default). "midnight": 00:00. */
  dayBoundary?: "zi23" | "midnight";
}

const DAY_MS = 86400000;

/** Gregorian calendar date → Julian Day Number (at noon). */
export function jdnFromDate(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return (
    d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 +
    Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045
  );
}

function pillarFromIndex(i: number): Pillar {
  const n = ((i % 60) + 60) % 60;
  return { stem: STEMS[n % 10]!, branch: BRANCHES[n % 12]! };
}

/** Sexagenary index (0 = 甲子) of the local civil day containing the instant. */
export function dayIndexAt(utcMs: number, tzOffsetMinutes: number, opts: CalendarOptions = {}): number {
  const boundary = opts.dayBoundary ?? "zi23";
  let local = utcMs + tzOffsetMinutes * 60000;
  const probe = new Date(local);
  if (boundary === "zi23" && probe.getUTCHours() === 23) local += 3600000; // 23:xx belongs to next day
  const d = new Date(local);
  const jdn = jdnFromDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return (((jdn - 2433191) % 60) + 60) % 60; // 2433191 = JDN of 1949-10-01 (甲子日)
}

/** 旬空: the two branches missing from the day's 旬. */
export function voidBranches(dayIndex: number): [Branch, Branch] {
  const xunStartBranch = (dayIndex - (dayIndex % 10)) % 12;
  return [BRANCHES[(xunStartBranch + 10) % 12]!, BRANCHES[(xunStartBranch + 11) % 12]!];
}

const RAD = Math.PI / 180;

/** ΔT estimate in seconds (Espenak/Meeus 2005–2050 polynomial, clamped ±50y). */
function deltaTSeconds(utcMs: number): number {
  const y = new Date(utcMs).getUTCFullYear();
  const t = Math.max(-50, Math.min(50, y - 2000));
  return 62.92 + 0.32217 * t + 0.005589 * t * t;
}

/** Apparent solar longitude in degrees [0, 360). Meeus AA ch.25 low precision. */
export function solarLongitude(utcMs: number): number {
  const jd = utcMs / DAY_MS + 2440587.5 + deltaTSeconds(utcMs) / 86400;
  const T = (jd - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M * RAD) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M * RAD) +
    0.000289 * Math.sin(3 * M * RAD);
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const apparent = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  return ((apparent % 360) + 360) % 360;
}

/** Month branch from solar longitude: 立春 315° → 寅, every 30°. */
export function monthBranchFromLongitude(lambda: number): Branch {
  const idx = Math.floor((((lambda - 315) % 360) + 360) % 360 / 30);
  return BRANCHES[(idx + 2) % 12]!;
}

/** Year pillar (changes at 立春). (year − 4) mod 60, e.g. 1984 → 甲子. */
export function yearPillarAt(utcMs: number): Pillar {
  const d = new Date(utcMs);
  let y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (m <= 2 && solarLongitude(utcMs) < 315 && solarLongitude(utcMs) >= 180) {
    // Jan/Feb before 立春 (λ in [255,315) around then) → still previous year
    y -= 1;
  }
  return pillarFromIndex(y - 4);
}

/**
 * Month pillar. Branch from 节气; stem by 五虎遁:
 * 甲己之年丙作首, 乙庚之岁戊为头, 丙辛必定寻庚起, 丁壬壬位顺行流, 戊癸何方发, 甲寅之上好追求。
 */
export function monthPillarAt(utcMs: number): Pillar {
  const lambda = solarLongitude(utcMs);
  const branch = monthBranchFromLongitude(lambda);
  const yearStemIdx = STEMS.indexOf(yearPillarAt(utcMs).stem);
  const yinStem = ((yearStemIdx % 5) * 2 + 2) % 10; // stem of 寅月
  const offset = (BRANCHES.indexOf(branch) - 2 + 12) % 12;
  return { stem: STEMS[(yinStem + offset) % 10]!, branch };
}

/** Season phase governed by the month branch: 寅卯木, 巳午火, 申酉金, 亥子水, 辰戌丑未土. */
export function seasonPhase(monthBranch: Branch): Phase {
  switch (monthBranch) {
    case "寅": case "卯": return "wood";
    case "巳": case "午": return "fire";
    case "申": case "酉": return "metal";
    case "亥": case "子": return "water";
    default: return "earth";
  }
}

const GEN: Readonly<Record<Phase, Phase>> = {
  wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood",
};
const OVER: Readonly<Record<Phase, Phase>> = {
  wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood",
};

/** 旺相休囚死: 当令旺, 令生相, 生令休, 克令囚, 令克死。《卜筮正宗·旺相休囚论》. */
export function strengthOf(phase: Phase, monthBranch: Branch): Strength {
  const s = seasonPhase(monthBranch);
  if (phase === s) return "wang";
  if (GEN[s] === phase) return "xiang";
  if (GEN[phase] === s) return "xiu";
  if (OVER[phase] === s) return "qiu";
  return "si";
}

export const STRENGTH_ZH: Readonly<Record<Strength, string>> = {
  wang: "旺", xiang: "相", xiu: "休", qiu: "囚", si: "死",
};

/** Full calendar context for a cast instant. */
export function calendarContextAt(
  utcMs: number,
  tzOffsetMinutes: number,
  opts: CalendarOptions = {},
): CalendarContext {
  const dayIndex = dayIndexAt(utcMs, tzOffsetMinutes, opts);
  return {
    year: yearPillarAt(utcMs),
    month: monthPillarAt(utcMs),
    day: pillarFromIndex(dayIndex),
    dayIndex,
    voidBranches: voidBranches(dayIndex),
    solarLongitude: solarLongitude(utcMs),
  };
}
