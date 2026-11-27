import { wallToUtc, type Normalized } from "@/lib/mingli/birth/normalize";
import { placeById } from "@/lib/mingli/birth/places";
import { baziReportOffense, cleanQuestion, QUESTION_MAX } from "@/lib/mingli/bazi/report-facts";
import { ASPECTS, astroOf, houseOf, signOf, type AstroView } from "./chart";
import { CO_RULER, RULER, dignityOf, elementOf, insightOf, modeOf, signIdx, type AstroInsight } from "./insight";
import {
  daysInMonth, eclipsesOf, exactHits, lonAt, noonDays, retrogrades, slowYear, solarReturn, wrap180, type Hit, type RetroPeriod,
} from "./report-sky";

export { cleanQuestion, QUESTION_MAX };

/**
 * 10-20 星盤②③ 付費報告 — the pure half (no database, no model, no Next), mirroring lib/mingli/ziwei/report-facts.ts:
 * the chart facts a report is written from (fixed rules on chart.ts / insight.ts), the 星盤年報 facts and its 12-month
 * curve (report-sky.ts does the astronomy), the banned-word and date checks, and the page's fixed copy. Server half:
 * ./report.ts. Design: docs/mingli/astro-reports.md.
 *
 * chart_json holds ONLY what is computed from the chart: planets by sign, whole degree, house, retrograde and dignity;
 * the 上升／天頂 signs; houses (cusp sign, ruler, where the ruler sits, planets inside); nodes; elements, modes, dominant
 * planets, patterns; every major aspect; and for a 年報 the year's sky against the chart. Never the birth date, the clock
 * time, the place, its coordinates or time zone, a name — and never the date of the solar return (that is the birthday).
 * The time zone is used while the facts are computed (dates are written in the birthplace's own 國曆 dates) and dropped.
 *
 * Years: a 星盤年報 is one calendar year, 國曆 1 月 1 日 to 12 月 31 日 (UTC+8 decides which year "this year" is, as on
 * the other report pages). Every date is 國曆 and labelled so; there are no lunar months anywhere in it.
 */

export type AstroReportKind = "deep" | "year";
export const isAstroKind = (x: unknown): x is AstroReportKind => x === "deep" || x === "year";

/* ------------------------------------------------------------------ years */

export const astroYearAt = (now = Date.now()): number => new Date(now + 8 * 3_600_000).getUTCFullYear();
/** deep → this year; year → ONE year, this or next (as the 八字／紫微 年書) */
export function astroReportYears(kind: AstroReportKind, now = Date.now(), pick?: number): number[] {
  const y = astroYearAt(now);
  return kind === "year" ? [pick === y + 1 ? y + 1 : y] : [y];
}

/* ------------------------------------------------------------------ the natal chart, as the chart page draws it */

export interface Natal { v: AstroView; tz: string; lat: number | null; lon: number | null; moonSplit: [string, string] | null }
/**
 * Same choice as components/mingli/AstroChart.tsx: an exact clock time with a place → the full chart (houses, 上升);
 * anything else → the planets at local noon of the birth date (no houses), the Moon's sign checked at 00:00 and 23:59.
 */
export function natalOf(n: Normalized, system: "placidus" | "whole" = "placidus"): Natal {
  if (n.timeKnown && n.utcMs !== null && n.place && n.clock) {
    return { v: astroOf(n.utcMs, n.place.lat, n.place.lon, true, system), tz: n.place.tz, lat: n.place.lat, lon: n.place.lon, moonSplit: null };
  }
  const place = n.place ?? placeById("tw-tpe")!;
  const d = n.solarDate;
  const v = astroOf(wallToUtc(place.tz, { ...d, h: 12, mi: 0 }), null, null, false);
  const a = astroOf(wallToUtc(place.tz, { ...d, h: 0, mi: 0 }), null, null, false).planets[1]!.sign;
  const b = astroOf(wallToUtc(place.tz, { ...d, h: 23, mi: 59 }), null, null, false).planets[1]!.sign;
  return { v, tz: place.tz, lat: null, lon: null, moonSplit: a !== b ? [a, b] : null };
}

/* ------------------------------------------------------------------ chart facts */

export interface PlanetF { name: string; sign: string; deg: number; retro: boolean; house: number | null; dignity: string | null; element: string; mode: string }
export interface HouseF { n: number; sign: string; ruler: string; co: string | null; rulerSign: string; rulerHouse: number | null; planets: string[] }
export interface AspectF { a: string; b: string; name: string; orb: number; group: "合相" | "和諧" | "張力"; gen: boolean }

export interface AstroFacts {
  v: 1; kind: AstroReportKind;
  /** an exact birth time and place: 上升, 天頂 and houses exist */
  timeKnown: boolean; houseSystem: "placidus" | "whole" | null;
  /** without a birth time the Moon's degree is approximate, and its sign may be one of two */
  moonApprox: boolean; moonSplit: [string, string] | null;
  planets: PlanetF[];
  asc: { sign: string; deg: number } | null; mc: { sign: string; deg: number } | null;
  houses: HouseF[] | null;
  nodes: { north: { sign: string; house: number | null }; south: { sign: string; house: number | null } };
  balance: Pick<AstroInsight, "elements" | "modes" | "total" | "strongEl" | "weakEl" | "strongMode" | "weakMode" | "elementList">;
  dominant: AstroInsight["dominant"]; domSign: AstroInsight["domSign"]; ruler: AstroInsight["ruler"];
  patterns: AstroInsight["patterns"]; hemi: AstroInsight["hemi"];
  aspects: AspectF[];
  years: number[];
  book?: AstroBook;
}

const OUTER = new Set(["天王星", "海王星", "冥王星"]);
const deg = (lon: number) => Math.floor((((lon % 360) + 360) % 360) % 30);
const r1 = (x: number) => Math.round(x * 10) / 10;
export const aspectGroup = (name: string): AspectF["group"] => (name === "合" ? "合相" : name === "六合" || name === "拱" ? "和諧" : "張力");

export function chartFacts(nat: Natal, kind: AstroReportKind, years: number[]): AstroFacts {
  const v = nat.v;
  const time = v.timeKnown && v.asc !== null;
  const ins = insightOf(v);
  const planets: PlanetF[] = v.planets.map((p) => ({
    name: p.name, sign: p.sign, deg: p.deg, retro: p.retro, house: time ? p.house : null, dignity: dignityOf(p.name, p.lon), element: elementOf(p.lon), mode: modeOf(p.lon),
  }));
  let houses: HouseF[] | null = null;
  if (time && v.cusps) {
    houses = v.cusps.map((c, i) => {
      const s = signIdx(c);
      const rp = v.planets.find((p) => p.name === RULER[s])!;
      return { n: i + 1, sign: signOf(c), ruler: RULER[s]!, co: CO_RULER[s] ?? null, rulerSign: rp.sign, rulerHouse: rp.house, planets: v.planets.filter((p) => p.house === i + 1).map((p) => p.name) };
    });
  }
  const south = (v.trueNode.lon + 180) % 360;
  return {
    v: 1, kind, timeKnown: time, houseSystem: time ? v.houseSystem : null,
    moonApprox: !time, moonSplit: time ? null : nat.moonSplit,
    planets,
    asc: time ? { sign: signOf(v.asc!), deg: deg(v.asc!) } : null,
    mc: time && v.mc !== null ? { sign: signOf(v.mc), deg: deg(v.mc) } : null,
    houses,
    nodes: { north: { sign: v.trueNode.sign, house: time ? v.trueNode.house : null }, south: { sign: signOf(south), house: time && v.cusps ? houseOf(south, v.cusps) : null } },
    balance: { elements: ins.elements, modes: ins.modes, total: ins.total, strongEl: ins.strongEl, weakEl: ins.weakEl, strongMode: ins.strongMode, weakMode: ins.weakMode, elementList: ins.elementList },
    dominant: ins.dominant, domSign: ins.domSign, ruler: ins.ruler, patterns: ins.patterns, hemi: ins.hemi,
    aspects: v.aspects.map((a) => ({ a: a.a, b: a.b, name: a.name, orb: r1(a.orb), group: aspectGroup(a.name), gen: OUTER.has(a.a) && OUTER.has(a.b) })),
    years,
  };
}

/** the facts of one report (the server recomputes from the birth input; nothing the browser computed is trusted) */
export function astroFacts(n: Normalized, kind: AstroReportKind, now = Date.now(), pick?: number, system: "placidus" | "whole" = "placidus"): AstroFacts {
  const nat = natalOf(n, system);
  const years = astroReportYears(kind, now, pick);
  const f = chartFacts(nat, kind, years);
  if (kind === "year") f.book = astroBook(nat, years[0]!);
  return f;
}

/* ------------------------------------------------------------------ 年報 facts (fixed rules; the writer only explains them) */

export interface MonthA {
  n: number; label: string; from: string; to: string;
  score: number; level: 1 | 2 | 3 | 4 | 5; tags: string[]; flags: string[];
  /** the dated events of the month, already in words: 「國曆 2/26 水星開始逆行（雙魚座）」 */
  sky: string[];
}
export interface SlowF { planet: string; start: { sign: string; house: number | null }; end: { sign: string; house: number | null }; ingresses: { date: string; kind: "sign" | "house"; to: string; back: boolean }[]; retro: { from: string; to: string }[] }
export interface HitF { planet: string; point: string; aspect: string; exact: string[]; from: string; to: string }
export interface EclipseF { date: string; type: "solar" | "lunar"; kind: string; sign: string; deg: number; house: number | null; touches: string[] }
export interface RetroF { planet: string; from: string; to: string; signs: string[]; houses: number[] }
export interface SolarReturnF { asc: string; mc: string; ascNatalHouse: number | null; sunHouse: number | null; moon: { sign: string; house: number | null }; angular: { planet: string; house: number }[] }
export interface AstroBook {
  year: number;
  /** 太陽回歸盤 at the birthplace (birth time needed); never its date */
  sr: SolarReturnF | null;
  slow: SlowF[];
  /** exact aspects of 木星／土星 (also to their own natal place = 回歸) and the outer planets to natal 太陽／月亮／上升／天頂 */
  hits: HitF[];
  eclipses: EclipseF[];
  retro: RetroF[];
  months: MonthA[];
  key: { smooth: number; slow: number; pivot: number };
}

/** rule weights of the monthly curve — the whole rule set in one place (docs/mingli/astro-reports.md) */
export const ASTRO_CURVE_W = {
  base: 3, jupSoft: 1, jupHard: 0.5, satSoft: 0.5, satHard: -1, marsSoft: 0.5, marsHard: -0.5, mercRx: -0.5, venusRx: -0.5, marsRx: -0.5,
};
/** orb (degrees) for a transit to count in a month; a retrograde counts from 7 days inside the month */
export const ASTRO_CURVE_ORB: Record<string, number> = { 木星: 2, 土星: 2, 火星: 1.5 };
export const RX_MIN_DAYS = 7;
const SOFT = new Set(["六合", "拱"]);
const sep = (a: number, b: number) => Math.abs(wrap180(a - b));

export interface CurveInput {
  year: number; tz: string;
  /** natal points the curve looks at: 太陽 always, 月亮 and 上升 with a birth time */
  points: { name: string; lon: number }[];
  retro: RetroPeriod[]; eclipses: EclipseF[]; hits: (HitF & { exactMs?: number[] })[]; slow: SlowF[];
}
/**
 * The twelve 國曆 months. Start at 3. Each of 木星／土星／火星 against each natal point (太陽; with a birth time also
 * 月亮 and 上升), counted once a month when, on some day of it (local noon), the transit is within the orb of an aspect:
 * 木星 合／六合／拱 +1, 刑／沖 +0.5 · 土星 六合／拱 +0.5, 合／刑／沖 −1 · 火星 六合／拱 +0.5, 合／刑／沖 −0.5.
 * 水星／金星／火星 retrograde on 7 or more days of the month −0.5 each. Level = the score rounded, held to 1–5.
 * Flags (no score): 日食／月食, 食點觸及本命, 外行星正相位, 土星回歸／木星回歸, 木星換座／土星換座, 木星換宮／土星換宮, 外行星換座.
 */
export function monthCurveA(c: CurveInput): MonthA[] {
  const W = ASTRO_CURVE_W;
  const days = noonDays(c.tz, { y: c.year, m: 1, d: 1 }, daysInMonth(c.year, 2) === 29 ? 366 : 365);
  const lons: Record<string, number[]> = {};
  for (const p of ["木星", "土星", "火星"]) lons[p] = days.map((d) => lonAt(p, d.ms));
  const rxDays = (planet: string, idx: number[]) => idx.filter((i) => c.retro.some((r) => r.planet === planet && days[i]!.ms >= r.fromMs && days[i]!.ms <= r.toMs)).length;
  return Array.from({ length: 12 }, (_, mi) => {
    const m = mi + 1;
    const idx = days.map((d, i) => (d.ymd.m === m ? i : -1)).filter((i) => i >= 0);
    let score = W.base;
    const tags: string[] = [], flags: string[] = [];
    const flag = (f: string) => { if (!flags.includes(f)) flags.push(f); };
    for (const pl of ["木星", "土星", "火星"]) {
      for (const pt of c.points) {
        let best: { name: string; orb: number } | null = null;
        for (const i of idx) {
          const s = sep(lons[pl]![i]!, pt.lon);
          for (const a of ASPECTS) { const o = Math.abs(s - a.angle); if (o <= ASTRO_CURVE_ORB[pl]! && (!best || o < best.orb)) best = { name: a.name, orb: o }; }
        }
        if (!best) continue;
        const soft = SOFT.has(best.name);
        const tag = `${pl}${best.name}本命${pt.name}`;
        if (pl === "木星") { score += soft || best.name === "合" ? W.jupSoft : W.jupHard; flag("木星助力"); }
        else if (pl === "土星") { score += soft ? W.satSoft : W.satHard; flag(soft ? "土星支撐" : "土星壓力"); }
        else { score += soft ? W.marsSoft : W.marsHard; flag(soft ? "火星助推" : "火星衝勁"); }
        tags.push(tag);
      }
    }
    for (const [pl, w, f] of [["水星", W.mercRx, "水逆"], ["金星", W.venusRx, "金星逆行"], ["火星", W.marsRx, "火星逆行"]] as const) {
      if (rxDays(pl, idx) >= RX_MIN_DAYS) { score += w; tags.push(`${pl}逆行`); flag(f); }
    }
    const inMonth = (d: string) => !d.includes("/") ? false : d.split("/").length === 2 && Number(d.split("/")[0]) === m;
    const sky: string[] = [];
    for (const e of c.eclipses) if (inMonth(e.date)) {
      flag(e.type === "solar" ? "日食" : "月食");
      if (e.touches.length) flag("食點觸及本命");
      sky.push(`國曆 ${e.date} ${e.kind}（${e.sign}座${e.deg}°${e.house ? `，落第${e.house}宮` : ""}${e.touches.length ? `，${e.touches.join("、")}` : ""}）`);
    }
    for (const r of c.retro) {
      if (inMonth(r.from)) sky.push(`國曆 ${r.from} ${r.planet}開始逆行（${r.signs[0]}座）`);
      if (inMonth(r.to)) sky.push(`國曆 ${r.to} ${r.planet}恢復順行`);
    }
    for (const s of c.slow) for (const g of s.ingresses) if (inMonth(g.date)) {
      const outer = OUTER.has(s.planet);
      if (g.kind === "sign") { flag(outer ? "外行星換座" : `${s.planet}換座`); sky.push(`國曆 ${g.date} ${s.planet}${g.back ? "退回" : "進入"}${g.to}座`); }
      else if (!outer) { flag(`${s.planet}換宮`); sky.push(`國曆 ${g.date} ${s.planet}${g.back ? "退回" : "進入"}第${g.to}宮`); }
    }
    for (const h of c.hits) for (const d of h.exact) if (inMonth(d)) {
      if (OUTER.has(h.planet)) { flag("外行星正相位"); tags.push(`${h.planet}${h.aspect}本命${h.point}（正相位）`); }
      if (h.point === h.planet && h.aspect === "合") flag(`${h.planet}回歸`);
      sky.push(`國曆 ${d} ${h.planet}${h.aspect}本命${h.point}（正相位）`);
    }
    score = Math.round(score * 100) / 100;
    const level = Math.max(1, Math.min(5, Math.round(score))) as MonthA["level"];
    if (!tags.length) tags.push("平穩");
    const last = daysInMonth(c.year, m);
    const dayOf = (x: string) => Number(/國曆 \d{1,2}\/(\d{1,2})/.exec(x)?.[1] ?? 0);
    return { n: m, label: `國曆 ${m} 月`, from: `${m}/1`, to: `${m}/${last}`, score, level, tags: [...new Set(tags)], flags, sky: [...new Set(sky)].sort((a, b) => dayOf(a) - dayOf(b)) };
  });
}

/** how much a mark weighs when choosing the months */
export const ASTRO_MONTH_W = {
  ease: { 土星壓力: 2, 水逆: 1, 火星衝勁: 1, 金星逆行: 1, 火星逆行: 1, 食點觸及本命: 1 } as Record<string, number>,
  pivot: { 外行星正相位: 3, 食點觸及本命: 2, 土星回歸: 2, 日食: 1.5, 月食: 1.5, 木星換座: 1, 土星換座: 1, 木星換宮: 1, 土星換宮: 1, 土星壓力: 1, 木星助力: 1, 木星回歸: 1, 外行星換座: 0.5, 水逆: 0.5 } as Record<string, number>,
};
const wOf = (t: Record<string, number>, flags: string[]) => flags.reduce((a, f) => a + (t[f] ?? 0), 0);
/** smooth = the highest score (ties: fewer ease marks, earlier); slow = the lowest of the rest; pivot = the most pivot weight of the other ten */
export function keyMonthsA(months: Pick<MonthA, "score" | "flags">[]): { smooth: number; slow: number; pivot: number } {
  const idx = months.map((_, i) => i);
  const ease = (i: number) => wOf(ASTRO_MONTH_W.ease, months[i]!.flags);
  const smooth = [...idx].sort((a, b) => months[b]!.score - months[a]!.score || ease(a) - ease(b) || a - b)[0]!;
  const slow = idx.filter((i) => i !== smooth).sort((a, b) => months[a]!.score - months[b]!.score || ease(b) - ease(a) || a - b)[0]!;
  const pv = (i: number) => wOf(ASTRO_MONTH_W.pivot, months[i]!.flags);
  const pivot = idx.filter((i) => i !== smooth && i !== slow).sort((a, b) => pv(b) - pv(a) || Math.abs(months[b]!.score - 3) - Math.abs(months[a]!.score - 3) || a - b)[0]!;
  return { smooth, slow, pivot };
}

const POINT_ORDER = ["太陽", "月亮", "上升", "天頂"];
/** the 年報 facts for calendar year `year` */
export function astroBook(nat: Natal, year: number): AstroBook {
  const v = nat.v, tz = nat.tz;
  const time = v.timeKnown && v.asc !== null;
  const cusps = time ? v.cusps : null;
  const L = (name: string) => v.planets.find((p) => p.name === name)!.lon;
  const points = [{ name: "太陽", lon: L("太陽") }, ...(time ? [{ name: "月亮", lon: L("月亮") }, { name: "上升", lon: v.asc! }, ...(v.mc !== null ? [{ name: "天頂", lon: v.mc }] : [])] : [])];

  // 太陽回歸盤 (birth time needed: without it the natal Sun, and so the return moment, is only known to the day)
  let sr: SolarReturnF | null = null;
  if (time && nat.lat !== null && nat.lon !== null) {
    const t = solarReturn(L("太陽"), year, tz);
    if (t !== null) {
      const s = astroOf(t, nat.lat, nat.lon, true, v.houseSystem === "whole" ? "whole" : "placidus");
      if (s.asc !== null) sr = {
        asc: signOf(s.asc), mc: s.mc !== null ? signOf(s.mc) : "", ascNatalHouse: cusps ? houseOf(s.asc, cusps) : null,
        sunHouse: s.planets[0]!.house, moon: { sign: s.planets[1]!.sign, house: s.planets[1]!.house },
        angular: s.planets.filter((p) => p.house !== null && [1, 4, 7, 10].includes(p.house)).map((p) => ({ planet: p.name, house: p.house! })),
      };
    }
  }

  const retroAll = ["水星", "金星", "火星", "木星", "土星"].flatMap((p) => retrogrades(p, year, tz, cusps));
  const slow: SlowF[] = ["木星", "土星", "天王星", "海王星", "冥王星"].map((p) => {
    const s = slowYear(p, year, tz, cusps);
    return { planet: p, start: s.start, end: s.end, ingresses: s.ingresses.map(({ date, kind, to, back }) => ({ date, kind, to, back })), retro: retroAll.filter((r) => r.planet === p).map((r) => ({ from: r.from, to: r.to })) };
  });
  const hitsRaw: Hit[] = [
    ...["木星", "土星"].flatMap((p) => exactHits(p, [...points, { name: p, lon: L(p) }], year, tz, 1)),
    ...["天王星", "海王星", "冥王星"].flatMap((p) => exactHits(p, points, year, tz, 1)),
  ];
  // own-place hits: only the returns (合) and, for 土星, the square and opposition
  const hits = hitsRaw.filter((h) => h.point !== h.planet || h.aspect === "合" || (h.planet === "土星" && (h.aspect === "刑" || h.aspect === "沖")));
  const hitsF: (HitF & { exactMs: number[] })[] = hits.map((h) => ({ planet: h.planet, point: h.point, aspect: h.aspect, exact: h.exact, from: h.from, to: h.to, exactMs: h.exactMs }));

  const touchPts = [...points, ...["水星", "金星", "火星"].map((p) => ({ name: p, lon: L(p) }))];
  const eclipses: EclipseF[] = eclipsesOf(year, tz).map((e) => ({
    date: e.date, type: e.type, kind: e.kind, sign: e.sign, deg: e.deg, house: cusps ? houseOf(e.lon, cusps) : null,
    touches: touchPts.flatMap((p) => {
      const s = sep(e.lon, p.lon);
      if (s <= 3) return [`合本命${p.name}`];
      if (POINT_ORDER.includes(p.name) && Math.abs(s - 180) <= 3) return [`沖本命${p.name}`];
      return [];
    }),
  }));
  const retro = retroAll.filter((r) => ["水星", "金星", "火星"].includes(r.planet));
  const curvePts = points.filter((p) => p.name !== "天頂");
  const months = monthCurveA({ year, tz, points: curvePts, retro, eclipses, hits: hitsF, slow });
  return {
    year, sr, slow,
    hits: hitsF.map(({ exactMs: _x, ...h }) => h),
    eclipses, retro: retro.map(({ planet, from, to, signs, houses }) => ({ planet, from, to, signs, houses })),
    months, key: keyMonthsA(months),
  };
}

/* ------------------------------------------------------------------ checks */

/**
 * The 八字 banned list (準 as accuracy, 保證, AI, 吉／凶, 化解, 太歲, medical, investment, legal, mechanics …) plus what a
 * 星盤 report adds: fate words about the nodes and Saturn (宿命, 業力, 前世, 報應), fear words about retrogrades and
 * eclipses (倒楣, 災難, 水逆退散 …), and any English word (上升 not ASC, 天頂 not MC; the single letter of T三角 passes).
 */
export function astroReportOffense(text: string): string | null {
  const b = baziReportOffense(text, "deep");
  if (b) return b;
  const m = text.match(/小人|宿命|業力|业力|前世|報應|报应|命不好|命苦|苦命|倒楣|倒霉|災難|灾难|劫數|劫数|水逆退散|犯水逆|衰運|衰运/);
  if (m) return `fear:${m[0]}`;
  const en = text.match(/[A-Za-z]{2,}/);
  if (en) return `latin:${en[0]}`;
  return null;
}

export const allStrings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(allStrings) : v && typeof v === "object" ? Object.values(v).flatMap(allStrings) : []);

/** every date the 年報 facts name, as "Y/M/D" (in-year dates are stored "M/D") */
export function astroFactDates(b: Pick<AstroBook, "year" | "slow" | "hits" | "eclipses" | "retro" | "months">): Set<string> {
  const out = new Set<string>();
  const add = (d: string) => { const p = d.split("/"); if (p.length === 2) out.add(`${b.year}/${Number(p[0])}/${Number(p[1])}`); else if (p.length === 3) out.add(`${Number(p[0])}/${Number(p[1])}/${Number(p[2])}`); };
  for (const s of b.slow) { s.ingresses.forEach((g) => add(g.date)); s.retro.forEach((r) => { add(r.from); add(r.to); }); }
  for (const h of b.hits) { h.exact.forEach(add); add(h.from); add(h.to); }
  for (const e of b.eclipses) add(e.date);
  for (const r of b.retro) { add(r.from); add(r.to); }
  for (const m of b.months) { add(m.from); add(m.to); }
  return out;
}

const LUNAR_RE = /[農农][曆历]|閏|闰|(?:十一|十二|正|冬|臘|腊|十|[一二三四五六七八九])月|初[一二三四五六七八九十]/;
const SOLAR_RE = /(?:國曆|国历|公历)\s?(?:(\d{4})\s?\/\s?)?(\d{1,2})\/(\d{1,2})(?:\s?[–\-~至到]\s?(?:(\d{4})\s?\/\s?)?(\d{1,2})\/(\d{1,2}))?/g;
const SOLAR_MONTH_RE = /(?:國曆|国历|公历)\s?(\d{1,2})\s?(?:[–\-~至到、]\s?(\d{1,2})\s?)?月/g;
/**
 * 10-20 (Neil: 日期一定要標注清楚) — a 星盤年報 is all 國曆. A month only as 「國曆 N 月」 (a span 「國曆 3–5 月」); a date
 * only as 「國曆 M/D」 (a span 「國曆 M/D–M/D」, another year's 「國曆 2025/12/10」), and only a date the facts name.
 * Lunar words (農曆, 正月, 三月, 閏, 初一 …), 「M月D日」, unlabelled 「3月」 and bare 「3/18」 are sent back.
 */
export function astroDateOffense(value: unknown, book: Pick<AstroBook, "year" | "slow" | "hits" | "eclipses" | "retro" | "months">): string | null {
  const ok = astroFactDates(book);
  for (const s of allStrings(value)) {
    const lunar = s.match(LUNAR_RE);
    if (lunar) return `lunar:${lunar[0]}`;
    const md = s.match(/\d{1,2}\s?月\s?\d{1,2}\s?[日號号]/);
    if (md) return `format:${md[0]}`;
    const covered: [number, number][] = [];
    for (const hit of s.matchAll(SOLAR_RE)) {
      covered.push([hit.index!, hit.index! + hit[0].length]);
      const keys = [`${hit[1] ? Number(hit[1]) : book.year}/${Number(hit[2])}/${Number(hit[3])}`];
      if (hit[5]) keys.push(`${hit[4] ? Number(hit[4]) : hit[1] ? Number(hit[1]) : book.year}/${Number(hit[5])}/${Number(hit[6])}`);
      for (const k of keys) if (!ok.has(k)) return `date:${k}`;
    }
    for (const hit of s.matchAll(/(?:\d{4}\s?\/\s?)?\d{1,2}\/\d{1,2}/g)) if (!covered.some(([a, b]) => hit.index! >= a && hit.index! < b)) return `undated:${hit[0]}`;
    const mCovered: [number, number][] = [];
    for (const hit of s.matchAll(SOLAR_MONTH_RE)) {
      mCovered.push([hit.index!, hit.index! + hit[0].length]);
      for (const x of [hit[1], hit[2]]) if (x && (Number(x) < 1 || Number(x) > 12)) return `date:${hit[0]}`;
    }
    // not the 「28 月」 of 「8/28 月偏食」: a month is a number not glued to a date, and not 月食／月偏食
    for (const hit of s.matchAll(/(?<![\d\/])\d{1,2}\s?月(?![偏全環环半食])/g)) if (!mCovered.some(([a, b]) => hit.index! >= a && hit.index! < b)) return `undated:${s.slice(Math.max(0, hit.index! - 8), hit.index! + hit[0].length + 2)}`;
  }
  return null;
}

/* ------------------------------------------------------------------ chapters, writing calls, page copy (Traditional; zh pages go through toHans) */

export const AS_DEEP_CHAPTERS: { key: string; title: string; titleNoTime?: string; needsTime?: boolean }[] = [
  { key: "zhongxin", title: "盤的重心" },
  { key: "taiyang", title: "太陽：想走的方向" },
  { key: "yueliang", title: "月亮：讓你安心的方式" },
  { key: "shangsheng", title: "上升與命主星", needsTime: true },
  { key: "shuixing", title: "思考與表達（水星）" },
  { key: "ganqing", title: "感情與相處（金星、火星、第5／7宮）", titleNoTime: "感情與相處（金星、火星）" },
  { key: "shiye", title: "事業與方向（天頂、第10／6／2宮）", titleNoTime: "事業與方向" },
  { key: "jinqian", title: "金錢與資源（第2／8宮）", titleNoTime: "金錢與資源" },
  { key: "gongke", title: "人生功課（土星、南北交點）" },
  { key: "xiangwei", title: "全部主要相位" },
];
export const asDeepChapters = (timeKnown: boolean) => AS_DEEP_CHAPTERS.filter((c) => timeKnown || !c.needsTime).map((c) => ({ key: c.key, title: !timeKnown && c.titleNoTime ? c.titleNoTime : c.title }));
/** which chapters each writing call produces (five calls; without a birth time B writes the Moon only) */
export const AS_DEEP_GROUPS: Record<string, string[]> = {
  A: ["zhongxin", "taiyang"],
  B: ["yueliang", "shangsheng"],
  C: ["shuixing", "ganqing"],
  D: ["shiye", "jinqian"],
  E: ["gongke", "xiangwei"],
};
export const asDeepGroupOf = (chapter: string): string => Object.keys(AS_DEEP_GROUPS).find((g) => AS_DEEP_GROUPS[g]!.includes(chapter)) ?? "A";
export const AS_BOOK_GROUPS = ["ov", "m1", "m2", "m3", "m4", "js", "ecl", "ar", "ar2"] as const;
export function asGroupKeys(kind: AstroReportKind, opt: { question?: boolean } = {}): string[] {
  return kind === "deep" ? Object.keys(AS_DEEP_GROUPS) : [...AS_BOOK_GROUPS, ...(opt.question ? ["qa"] : [])];
}
export const AS_BOOK_AREAS: { key: "career" | "wealth" | "love" | "rhythm" | "people" | "home"; title: string }[] = [
  { key: "career", title: "事業" },
  { key: "wealth", title: "財運" },
  { key: "love", title: "感情" },
  { key: "rhythm", title: "健康作息" },
  { key: "people", title: "人際貴人" },
  { key: "home", title: "家宅出行" },
];
export const AS_REPORT_UI = {
  back: "我的星盤",
  kindLabel: { deep: "星盤深度報告", year: "星盤年報" } as Record<AstroReportKind, string>,
  kindSub: { deep: "十章：盤的重心、日月與上升、思考、感情、事業、金錢、人生功課，到全部主要相位", year: "一整年的星盤年報：太陽回歸盤、三個關鍵月、十二個月逐月、木星土星、外行星、日月食與水逆、六大領域、季度行動" } as Record<AstroReportKind, string>,
  writing: "報告正在寫，一章一章出來，寫好的會先出現在這裡。大約一兩分鐘，頁面會自己更新。",
  writingChapter: "這一章正在寫……",
  failedChapter: "這一章這次沒寫成，我們會補上，寫好會寄信通知你。",
  head: "星盤",
  headSun: "太陽", headMoon: "月亮", headAsc: "上升", headDom: "主導行星",
  noTime: "沒有出生時間：上升、天頂和宮位都不看，月亮只寫到星座。",
  moonOr: "或",
  aspectGroups: { 合相: "合相", 和諧: "和諧（六合、拱）", 張力: "張力（刑、沖）" } as Record<string, string>,
  genNote: "世代相位",
  levelWord: { 1: "放慢", 2: "收著走", 3: "平穩", 4: "順手", 5: "有勢" } as Record<number, string>,
  datesNote: "這份年報從國曆 1 月 1 日到 12 月 31 日，文中所有日期都是國曆（陽曆），依出生地的當地日期。",
  bookVerdict: "年度總判", bookKeyword: "今年的關鍵字",
  srHead: "太陽回歸盤", srAsc: "回歸上升", srAscIn: "落在本命第{n}宮", srSun: "回歸太陽", srMoon: "回歸月亮", srAngular: "角宮行星",
  srNone: "太陽回歸盤要有出生時間才排得出來。",
  houseN: "第{n}宮",
  bookCurve: "每月的能量起伏",
  bookKeyMonths: "三個關鍵月份", keySmooth: "最順手的月", keySlow: "最需要放慢的月", keyPivot: "最重要的一個月",
  bookMonths: "十二個月逐月", monthYi: "宜", monthJi: "不宜",
  bookJs: "木星與土星這一年", jsFrom: "年初", jsTo: "年底", jsRetro: "逆行",
  bookOuter: "外行星的長期功課", outerNone: "今年外行星沒有和你的太陽、月亮、上升、天頂成正相位。",
  bookEcl: "日月食與水逆提醒", eclHead: "日月食", retroHead: "逆行期",
  bookAreas: "六大領域", areaSingle: "單身", areaPaired: "有伴",
  bookQuarters: "季度行動清單",
  quarter: { 1: "第一季", 2: "第二季", 3: "第三季", 4: "第四季" } as Record<number, string>,
  bookQuestion: "答你的問題", questionYou: "你問的是", questionCast: "想看這件事接下來的走向，可以為它起一卦 →",
  unpaidHead: "這份報告還沒付款", unpaidBody: "付款完成後，報告會直接寫在這一頁，也會寄到你的信箱。",
  productName: "YaoFlow 星盤年報：{y} 年，逐月來看（數位內容）",
  productNameHans: "YaoFlow 星盘年报：{y} 年，逐月来看（数字内容）",
};
/** every fixed string above, for the banned-word test */
export function astroReportStaticStrings(): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => { if (typeof x === "string") out.push(x); else if (x && typeof x === "object") Object.values(x).forEach(walk); };
  walk(AS_REPORT_UI); walk(AS_DEEP_CHAPTERS.map((c) => [c.title, c.titleNoTime ?? ""])); walk(AS_BOOK_AREAS.map((c) => c.title));
  return out.filter(Boolean);
}
export const asQuarterMonths = (q: number): number[] => [q * 3, q * 3 + 1, q * 3 + 2];
