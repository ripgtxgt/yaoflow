import { ASPECTS, SIGNS } from "./chart";
import { daysInMonth, localYmd, lonAt, noonDays, retrogrades, wrap180, type RetroPeriod } from "./report-sky";
import { ASTRO_CURVE_ORB, type AstroFacts } from "./report-facts";
import { fmt, type Foreign } from "@/lib/l10n/core";
import { LOCALE_META } from "@/lib/locales";
import { ASTRO_NAMES } from "./names";
import { astroReportText, astroUi, planetName } from "./page-ui";

/**
 * 10-22 进度表 92 星盤「這個月的行運」— a member's deep report gets one more section, computed on the page from the sky of
 * the current 國曆 month (Taipei) against the report's natal points; fixed rules, no model call, nothing stored:
 *   - 木星／土星／火星 against 太陽、月亮（only with a birth time）、金星、上升（only with a birth time）: on some day of the
 *     month (local noon) within the orb of 合／六合／刑／拱／沖 — the same orbs as the 年報 curve (木星 2°, 土星 2°, 火星 1.5°);
 *     the day of the closest approach is named
 *   - 水星／金星／火星 retrograde on at least one day of the month, with the stretch's real dates
 * Each one becomes a plain line: what it tends to bring and what to do with it — tendencies, never a verdict.
 */
const TZ = "Asia/Taipei";
const DAY = 86_400_000;
const SOFT = new Set(["六合", "拱"]);
const SLOW = ["土星", "木星", "火星"] as const;

export interface MonthHit { planet: (typeof SLOW)[number]; point: string; aspect: string; peak: string; orb: number }
export interface MonthRetro { planet: string; from: string; to: string }
export interface MonthSky { year: number; month: number; hits: MonthHit[]; retro: MonthRetro[]; points: string[] }

/** the natal points a transit is read against, from the facts' sign and whole degree (the middle of that degree) */
export function natalPoints(af: Pick<AstroFacts, "planets" | "asc" | "moonApprox">): { name: string; lon: number }[] {
  const lon = (sign: string, deg: number) => { const i = (SIGNS as readonly string[]).indexOf(sign); return i < 0 ? null : i * 30 + deg + 0.5; };
  const out: { name: string; lon: number }[] = [];
  for (const name of ["太陽", "月亮", "金星"]) {
    const p = af.planets.find((x) => x.name === name);
    if (!p || (name === "月亮" && af.moonApprox)) continue;
    const l = lon(p.sign, p.deg);
    if (l !== null) out.push({ name, lon: l });
  }
  if (af.asc) { const l = lon(af.asc.sign, af.asc.deg); if (l !== null) out.push({ name: "上升", lon: l }); }
  return out;
}

const retroCache = new Map<string, RetroPeriod[]>();
function retroOf(planet: string, year: number): RetroPeriod[] {
  const k = `${planet}:${year}`;
  let v = retroCache.get(k);
  if (!v) { v = retrogrades(planet, year, TZ, null); retroCache.set(k, v); }
  return v;
}

export function monthSkyFor(af: Pick<AstroFacts, "planets" | "asc" | "moonApprox">, now = Date.now()): MonthSky {
  const t = new Date(now + 8 * 3_600_000);
  const year = t.getUTCFullYear(), month = t.getUTCMonth() + 1;
  const days = noonDays(TZ, { y: year, m: month, d: 1 }, daysInMonth(year, month));
  const pts = natalPoints(af);
  const hits: MonthHit[] = [];
  for (const planet of SLOW) {
    const lons = days.map((d) => lonAt(planet, d.ms));
    for (const pt of pts) {
      let best: { name: string; orb: number; i: number } | null = null;
      lons.forEach((l, i) => {
        const s = Math.abs(wrap180(l - pt.lon));
        for (const a of ASPECTS) { const o = Math.abs(s - a.angle); if (o <= ASTRO_CURVE_ORB[planet]! && (!best || o < best.orb)) best = { name: a.name, orb: o, i }; }
      });
      const b = best as { name: string; orb: number; i: number } | null;
      if (b) hits.push({ planet, point: pt.name, aspect: b.name, peak: `${month}/${days[b.i]!.ymd.d}`, orb: Math.round(b.orb * 10) / 10 });
    }
  }
  hits.sort((a, b) => SLOW.indexOf(a.planet) - SLOW.indexOf(b.planet) || a.orb - b.orb);
  // the month in Taipei, as instants: a stretch counts when it covers any of it
  const m0 = Date.UTC(year, month - 1, 1) - 8 * 3_600_000, m1 = Date.UTC(year, month, 1) - 8 * 3_600_000;
  const when = (ms: number) => { const d = localYmd(ms, TZ); return d.y === year ? `${d.m}/${d.d}` : `${d.y}/${d.m}/${d.d}`; };
  const retro: MonthRetro[] = [];
  for (const planet of ["水星", "金星", "火星"]) {
    let list: RetroPeriod[] = [];
    try { list = retroOf(planet, year); } catch { list = []; }
    for (const r of list) if (r.fromMs < m1 && r.toMs >= m0 && r.toMs - r.fromMs > DAY / 2) retro.push({ planet, from: when(r.fromMs), to: when(r.toMs) });
  }
  return { year, month, hits: hits.slice(0, 6), retro, points: pts.map((p) => p.name) };
}

const AREA: Record<string, string> = { 太陽: "你想做的事與方向", 月亮: "情緒與生活節奏", 金星: "感情與財物", 上升: "給人的印象與日常作息" };

/** the section's lines, 繁體 (the page converts for 简体); every date 國曆 */
export function monthSkyLines(sky: MonthSky): string[] {
  const out: string[] = [];
  for (const h of sky.hits) {
    const area = AREA[h.point] ?? h.point;
    const head = `${h.planet}${h.aspect}你本命的${h.point}（國曆 ${h.peak} 前後最明顯）：`;
    const soft = SOFT.has(h.aspect);
    if (h.planet === "木星") out.push(head + (soft || h.aspect === "合" ? `${area}比較容易遇到機會和幫忙，適合主動開口、往外多走一步。` : `${area}容易想做得太多、答應得太快，量力而行。`));
    else if (h.planet === "土星") out.push(head + (soft ? `${area}適合把基礎打穩、做長一點的安排，這時花的功夫留得住。` : `${area}會覺得事情慢、責任重；放慢腳步、把要做的拆小，比硬推好。`));
    else out.push(head + (soft ? `${area}行動力足，適合動手處理拖了一陣子的事。` : `${area}容易急、容易起摩擦，說話和做決定前多停一下。`));
  }
  for (const r of sky.retro) {
    const span = `（國曆 ${r.from}–${r.to}）：`;
    if (r.planet === "水星") out.push(`水星逆行${span}溝通、文件、交通容易出小差錯；簽約、寄送、買 3C 前多核對一次，適合回頭整理舊事。`);
    else if (r.planet === "金星") out.push(`金星逆行${span}感情和花錢容易回頭看，舊人舊事可能再出現；大筆的消費可以緩一緩。`);
    else out.push(`火星逆行${span}行動容易卡住或要重來；適合修正計畫，不急著硬推新的大事。`);
  }
  if (!out.length) out.push(`這個月木星、土星、火星沒有和你本命的${sky.points.join("、")}形成緊密的相位，水星、金星、火星也都順行：是比較平穩的一個月，照自己的步調走就好。`);
  return out;
}

/**
 * 10-30 进度表 128 ④: the same section on a page in another language — the same rules, the lines from the report
 * page's words (lib/mingli/astro/page-ui.ts REPORT.sky), the names the page shows, dates written the reader's way
 */
export function monthSkyLinesIn(sky: MonthSky, l: Foreign): { label: string; lines: string[] } {
  const t = astroReportText(l).sky;
  const lang = LOCALE_META[l].htmlLang;
  const date = (s: string) => {
    const p = s.split("/").map(Number);
    const [y, m, d] = p.length === 3 ? (p as [number, number, number]) : [sky.year, p[0]!, p[1]!];
    try { return new Intl.DateTimeFormat(lang, { ...(p.length === 3 ? { year: "numeric" as const } : {}), month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d))); } catch { return s; }
  };
  const pn = (p: string) => planetName(p, l);
  const asp = (a: string) => ASTRO_NAMES[l].aspects[(["合", "六合", "刑", "拱", "沖"] as string[]).indexOf(a)] ?? a;
  const lines: string[] = [];
  for (const h of sky.hits) {
    const head = fmt(t.head, { p: pn(h.planet), a: asp(h.aspect), pt: (t.pt as Record<string, string>)[h.point] ?? h.point, d: date(h.peak) });
    const area = (t.area as Record<string, string>)[h.point] ?? h.point;
    const soft = SOFT.has(h.aspect);
    const body = h.planet === "木星" ? (soft || h.aspect === "合" ? t.jupSoft : t.jupHard) : h.planet === "土星" ? (soft ? t.satSoft : t.satHard) : soft ? t.marsSoft : t.marsHard;
    lines.push(`${head.trim()} ${fmt(body, { area })}`);
  }
  for (const r of sky.retro) lines.push(fmt(r.planet === "水星" ? t.retroMercury : r.planet === "金星" ? t.retroVenus : t.retroMars, { from: date(r.from), to: date(r.to) }));
  if (!lines.length) lines.push(fmt(t.quiet, { pts: sky.points.map((p) => (p === "上升" ? t.asc : pn(p))).join(astroUi(l).listSep ?? ", ") }));
  let m = `${sky.year}-${sky.month}`;
  try { m = new Intl.DateTimeFormat(lang, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(sky.year, sky.month - 1, 15))); } catch { /* the numbers */ }
  return { label: fmt(t.label, { m }), lines };
}
