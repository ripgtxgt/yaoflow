import { SixtyCycleYear, SolarTerm } from "tyme4ts";
import { baziOf, yearCycle, type BaziView, type Decade } from "./chart";
import { insightOf } from "./insight";
import { relationsFull, shenshaOf } from "./shensha";
import { tenOf, zhengyuanOf, type Zhengyuan } from "./zhengyuan";
import type { Gender, Normalized } from "@/lib/mingli/birth/normalize";

/**
 * 10-18 八字②③④ 付費報告 — the pure half (no database, no model, no Next): the chart facts a report is written from,
 * the fixed-rule 12-month curve of the 流年 report, the banned-word check, and the page's fixed copy.
 * The server half (table, generation, payment, letter) is ./report.ts. Design note: docs/mingli/bazi-reports.md.
 *
 * chart_json holds ONLY what is computed from the chart: pillars, 十神, 強弱, 喜用, 大運, the report's years, insight,
 * 正緣 traits, the month curve. Never the birth date, the clock time, the place, a name, the lunar date text or the
 * 交運 date — those are what a reader typed and they stay on the reader's device.
 */

export type ReportKind = "deep" | "love" | "year";
export const REPORT_KINDS: readonly ReportKind[] = ["deep", "love", "year"];
export const isReportKind = (x: unknown): x is ReportKind => x === "deep" || x === "love" || x === "year";

const ELS = ["木", "火", "土", "金", "水"] as const;
const ei = (e: string) => ELS.indexOf(e as (typeof ELS)[number]);
const cyc = (dmEl: string, k: number) => ELS[(ei(dmEl) + k) % 5]!;

/** the 八字 year by 立春 (same as the chart page's thisChartYear), in UTC+8 */
export function chartYearAt(now = Date.now()): number {
  const d = new Date(now + 8 * 3_600_000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  const lc = SolarTerm.fromName(y, "立春").getJulianDay().getSolarDay();
  const before = m < lc.getMonth() || (m === lc.getMonth() && day < lc.getDay());
  return before ? y - 1 : y;
}
/** the years a report covers: deep → this year; year → ONE year, this or next (Neil 10-19: 每年分開賣); love → none */
export function reportYears(kind: ReportKind, now = Date.now(), pick?: number): number[] {
  const y = chartYearAt(now);
  if (kind === "year") return [pick === y + 1 ? y + 1 : y];
  return kind === "deep" ? [y] : [];
}

/* ------------------------------------------------------------------ relations used by the curve and the year facts */
const LIUHE = ["子丑", "寅亥", "卯戌", "辰酉", "巳申", "午未"];
const CHONG = ["子午", "丑未", "寅申", "卯酉", "辰戌", "巳亥"];
const XING = ["子卯", "寅巳", "巳申", "寅申", "丑戌", "戌未", "丑未"];
const HAI = ["子未", "丑午", "寅巳", "卯辰", "申亥", "酉戌"];
const ZIXING = "辰午酉亥";
const has = (list: string[], a: string, b: string) => list.includes(a + b) || list.includes(b + a);
export type Rel = "合" | "冲" | "刑" | "害";
/** the 六合／沖／刑／害 between two branches (自刑 when the same branch is one of 辰午酉亥) */
export function branchRels(a: string, b: string): Rel[] {
  const out: Rel[] = [];
  if (a === b) { if (ZIXING.includes(a)) out.push("刑"); return out; }
  if (has(LIUHE, a, b)) out.push("合");
  if (has(CHONG, a, b)) out.push("冲");
  if (has(XING, a, b)) out.push("刑");
  if (has(HAI, a, b)) out.push("害");
  return out;
}

/* ------------------------------------------------------------------ 12-month curve (fixed rules) */
export interface CurveInput { pillars: string[]; favour: string[]; avoid: string[] }
export interface MonthPoint {
  i: number; term: string; start: string; gz: string;
  stemEl: string; branchEl: string; stemTen: string; branchTen: string;
  score: number; level: 1 | 2 | 3 | 4 | 5; tags: string[];
}
const JIE = ["立春", "惊蛰", "清明", "立夏", "芒种", "小暑", "立秋", "白露", "寒露", "立冬", "大雪", "小寒"];
/** rule weights — the whole rule set, kept in one place (docs/mingli/bazi-reports.md) */
export const CURVE_W = {
  base: 3, stemFav: 0.5, stemAvoid: -0.5, branchFav: 1, branchAvoid: -1,
  day: { 合: 0.5, 冲: -1, 刑: -0.5, 害: -0.5 } as Record<Rel, number>,
  month: { 合: 0.5, 冲: -0.5, 刑: -0.5, 害: -0.25 } as Record<Rel, number>,
};

/**
 * The twelve 流月 of a 八字 year (立春 → 小寒) scored against the chart. Start at 3; the month's 天干 element on the
 * 喜用 side +0.5 / 忌 side −0.5; its 地支 本氣 element ±1; the month branch against 日支: 合 +0.5, 沖 −1, 刑 −0.5, 害 −0.5;
 * against 月支: 合 +0.5, 沖 −0.5, 刑 −0.5, 害 −0.25. Level = the score rounded, held to 1–5. A balanced chart (no 喜用)
 * is scored by the relations alone. Tags are the reasons, simplified, for the page and the writer.
 */
export function monthCurve(c: CurveInput, year: number): MonthPoint[] {
  const dm = c.pillars[2]![0]!, db = c.pillars[2]![1]!, mb = c.pillars[1]![1]!;
  return SixtyCycleYear.fromYear(year).getMonths().map((m, i) => {
    const sc = m.getSixtyCycle();
    const s = sc.getHeavenStem(), b = sc.getEarthBranch();
    const sEl = s.getElement().getName(), bMain = b.getHideHeavenStemMain(), bEl = bMain.getElement().getName();
    const sd = m.getFirstDay().getSolarDay();
    let score = CURVE_W.base;
    const tags: string[] = [];
    if (c.favour.includes(sEl)) { score += CURVE_W.stemFav; tags.push(`${s.getName()}${sEl}·喜用`); }
    else if (c.avoid.includes(sEl)) { score += CURVE_W.stemAvoid; tags.push(`${s.getName()}${sEl}·偏耗`); }
    if (c.favour.includes(bEl)) { score += CURVE_W.branchFav; tags.push(`${b.getName()}${bEl}·喜用`); }
    else if (c.avoid.includes(bEl)) { score += CURVE_W.branchAvoid; tags.push(`${b.getName()}${bEl}·偏耗`); }
    for (const r of branchRels(b.getName(), db)) { score += CURVE_W.day[r]; tags.push(`${b.getName()}${r}日支${db}`); }
    for (const r of branchRels(b.getName(), mb)) { score += CURVE_W.month[r]; tags.push(`${b.getName()}${r}月支${mb}`); }
    score = Math.round(score * 100) / 100;
    const level = Math.max(1, Math.min(5, Math.round(score))) as MonthPoint["level"];
    if (!tags.length) tags.push("平稳");
    return {
      i, term: JIE[i]!, start: `${sd.getMonth()}/${sd.getDay()}`, gz: sc.getName(), stemEl: sEl, branchEl: bEl,
      stemTen: tenOf(dm, s.getName()), branchTen: tenOf(dm, bMain.getName()), score, level, tags,
    };
  });
}

/* ------------------------------------------------------------------ chart facts */
export interface YearFacts {
  year: number; gz: string; stemTen: string; branchTen: string; stemEl: string; branchEl: string;
  /** the year branch against 年支 / 月支 / 日支 / 時支 (e.g. "午冲日支子") */
  relations: string[]; favourHits: string[]; avoidHits: string[];
  decade: { gz: string; ten: string; startAge: number; endAge: number } | null;
}
export interface ChartFacts {
  v: 1;
  kind: ReportKind;
  /** 10-22 報告月更: when this reading was written (國曆 year and month) and the 節氣月 it falls in — only on a rewrite */
  asOf?: string; month?: MonthPoint;
  gender: Gender; hasHour: boolean;
  pillars: { label: string; gz: string; ten: string; hidden: { stem: string; ten: string; el: string; main: boolean }[]; nayin: string; terrain: string }[];
  dayMaster: string; dmEl: string;
  strength: { level: string; score: number };
  favour: string[]; avoid: string[];
  counts: Record<string, number>; energy: Record<string, number>; groups: Record<string, number>;
  geju: string | null; shensha: string[]; relations: { stems: string[]; branches: string[]; whole: string[] };
  decades: Decade[];
  years: YearFacts[];
  zhengyuan?: Omit<Zhengyuan, "imagePrompt">;
  /** kept for a later illustration (no image is drawn in v1) */
  imagePrompt?: Zhengyuan["imagePrompt"];
  months?: Record<string, MonthPoint[]>;
  /** 10-19 年書 (one 流年 report = one year): the fixed-rule facts every chapter is written from. Absent on the old two-part format. */
  book?: YearBook;
}

const PLAB = ["年支", "月支", "日支", "时支"];
/** 喜用 / 忌 elements from the chart's strength (same rule as chart.ts: strong → 食伤财官杀 help, weak → 印比劫 help) */
export function avoidOf(v: Pick<BaziView, "strength" | "dmEl">): string[] {
  const lv = v.strength.level;
  if (lv === "偏強" || lv === "稍強") return [cyc(v.dmEl, 4), cyc(v.dmEl, 0)];
  if (lv === "稍弱" || lv === "偏弱") return [cyc(v.dmEl, 3), cyc(v.dmEl, 2), cyc(v.dmEl, 1)];
  return [];
}

export function yearFacts(v: Pick<BaziView, "pillars" | "dayMaster" | "decades" | "favour">, avoid: string[], year: number): YearFacts {
  const sc = yearCycle(year);
  const s = sc.getHeavenStem(), b = sc.getEarthBranch(), bMain = b.getHideHeavenStemMain();
  const relations: string[] = [];
  v.pillars.forEach((p, i) => { for (const r of branchRels(b.getName(), p.branch)) relations.push(`${b.getName()}${r}${PLAB[i]}${p.branch}`); });
  const els = [s.getElement().getName(), bMain.getElement().getName()];
  const d = v.decades.find((x) => year >= x.startYear && year < x.startYear + 10) ?? null;
  return {
    year, gz: sc.getName(), stemTen: tenOf(v.dayMaster, s.getName()), branchTen: tenOf(v.dayMaster, bMain.getName()),
    stemEl: els[0]!, branchEl: els[1]!, relations,
    favourHits: [...new Set(els.filter((e) => v.favour.includes(e)))], avoidHits: [...new Set(els.filter((e) => avoid.includes(e)))],
    decade: d ? { gz: d.gz, ten: d.ten, startAge: d.startAge, endAge: d.endAge } : null,
  };
}

/**
 * The facts of one report, from a chart drawn with hans = true (simplified names throughout; the writer turns them
 * into the reader's script). Only computed values are copied — see the note at the top.
 */
export function chartFacts(v: BaziView, kind: ReportKind, years: number[], opt: { partner?: Gender } = {}): ChartFacts {
  const gz = v.pillars.map((p) => p.gz);
  const ins = insightOf(gz, v.gender);
  const avoid = avoidOf(v);
  const f: ChartFacts = {
    v: 1, kind, gender: v.gender, hasHour: v.hasHour,
    pillars: v.pillars.map((p) => ({ label: p.label, gz: p.gz, ten: p.ten, hidden: p.hidden.map((h) => ({ stem: h.stem, ten: h.ten, el: h.el, main: h.main })), nayin: p.nayin, terrain: p.terrain })),
    dayMaster: v.dayMaster, dmEl: v.dmEl,
    strength: { level: v.strength.level, score: v.strength.score },
    favour: [...v.favour], avoid,
    counts: { ...v.counts }, energy: { ...ins.energy }, groups: { ...ins.groups },
    geju: ins.geju?.name ?? null, shensha: ins.shensha.flatMap((g) => g.names), relations: relationsFull(gz),
    decades: v.decades.map((d) => ({ gz: d.gz, ten: d.ten, startAge: d.startAge, endAge: d.endAge, startYear: d.startYear })),
    years: years.map((y) => yearFacts(v, avoid, y)),
  };
  if (kind === "love") {
    f.decades = []; // the portrait reads no 大運 (and the first decade's start year is the birth year)
    const z = zhengyuanOf({ pillars: gz, gender: v.gender, partner: opt.partner });
    const { imagePrompt, ...rest } = z;
    f.zhengyuan = rest;
    f.imagePrompt = imagePrompt;
  }
  if (kind === "year") {
    f.months = Object.fromEntries(years.map((y) => [String(y), monthCurve({ pillars: gz, favour: f.favour, avoid }, y)]));
    if (years.length === 1) f.book = yearBook({ pillars: gz, gender: v.gender, favour: f.favour, avoid, decades: f.decades }, years[0]!, f.months[String(years[0])]!);
  }
  return f;
}

/** a normalized birth → the report's facts (the server recomputes; nothing the browser computed is trusted) */
export function factsFromBirth(n: Normalized, gender: Gender, kind: ReportKind, now = Date.now(), pick?: number, opt: { partner?: Gender } = {}): ChartFacts {
  const years = reportYears(kind, now, pick);
  const v = baziOf(n, gender, chartYearAt(now), true);
  return chartFacts(v, kind, years, opt);
}

/* ------------------------------------------------------------------ 年書 facts (10-19, fixed rules; the writer only explains them) */
const STEM_HE5 = ["甲己", "乙庚", "丙辛", "丁壬", "戊癸"];
const STEM_CHONG4 = ["甲庚", "乙辛", "丙壬", "丁癸"];
const PO6 = ["子酉", "午卯", "巳申", "寅亥", "辰丑", "戌未"];
const STEMS = "甲乙丙丁戊己庚辛壬癸", BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const stemEl = (s: string) => ELS[Math.floor(STEMS.indexOf(s) / 2)]!;
const BR_EL: Record<string, string> = { 寅: "木", 卯: "木", 巳: "火", 午: "火", 辰: "土", 戌: "土", 丑: "土", 未: "土", 申: "金", 酉: "金", 亥: "水", 子: "水" };
const keEl = (a: string, b: string) => (ei(b) - ei(a) + 5) % 5 === 2;
export const ZODIAC: Record<string, string> = { 子: "鼠", 丑: "牛", 寅: "虎", 卯: "兔", 辰: "龙", 巳: "蛇", 午: "马", 未: "羊", 申: "猴", 酉: "鸡", 戌: "狗", 亥: "猪" };
const TIANYI_T: Record<string, string> = { 甲: "丑未", 乙: "子申", 丙: "亥酉", 丁: "亥酉", 戊: "丑未", 己: "子申", 庚: "丑未", 辛: "寅午", 壬: "卯巳", 癸: "卯巳" };
const LIUHE_OF: Record<string, string> = { 子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯", 辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午" };
const SANHE_G = ["申子辰", "亥卯未", "寅午戌", "巳酉丑"];
/** the everyday side of an element (same table as the chart page's 喜用方向) — habits, not objects to buy */
export const EL_DAILY: Record<string, { colours: string[]; direction: string; numbers: number[] }> = {
  木: { colours: ["绿色", "青色"], direction: "东方", numbers: [3, 8] },
  火: { colours: ["红色", "紫色"], direction: "南方", numbers: [2, 7] },
  土: { colours: ["黄色", "咖啡色"], direction: "中央", numbers: [5, 0] },
  金: { colours: ["白色", "金色"], direction: "西方", numbers: [4, 9] },
  水: { colours: ["黑色", "蓝色"], direction: "北方", numbers: [1, 6] },
};
/** what each natal pillar stands for in a year reading */
export const PALACE = ["长辈与外部大环境", "工作环境与同事", "配偶宫与居所", "子女、晚辈与长期计划"];

/**
 * How two 干支 meet (流年 vs 大運, 流年 vs a natal pillar): 伏吟 (same 干支) · 反吟 (天克地冲) · 天干 五合 / 相冲 ·
 * 地支 六合 / 相冲 / 相刑 / 相害 / 相破 (自刑 for the same 辰午酉亥). Simplified, fixed order.
 */
export function gzRels(a: string, b: string): string[] {
  if (a === b) return ["伏吟"];
  const out: string[] = [];
  const [as, ab] = [a[0]!, a[1]!], [bs, bb] = [b[0]!, b[1]!];
  if (has(CHONG, ab, bb) && (keEl(stemEl(as), stemEl(bs)) || keEl(stemEl(bs), stemEl(as)))) out.push("反吟");
  if (has(STEM_HE5, as, bs)) out.push(`天干${as}${bs}相合`);
  if (has(STEM_CHONG4, as, bs)) out.push(`天干${as}${bs}相冲`);
  if (ab === bb) { if (ZIXING.includes(ab)) out.push(`地支${ab}${bb}自刑`); return out; }
  if (has(LIUHE, ab, bb)) out.push(`地支${ab}${bb}六合`);
  if (has(CHONG, ab, bb)) out.push(`地支${ab}${bb}相冲`);
  if (has(XING, ab, bb)) out.push(`地支${ab}${bb}相刑`);
  if (has(HAI, ab, bb)) out.push(`地支${ab}${bb}相害`);
  if (has(PO6, ab, bb)) out.push(`地支${ab}${bb}相破`);
  return out;
}
/** the year branch against the branch of the birth year: 值 (same) / 冲 / 刑 / 害 / 破 — a plain fact, nothing to do about it */
export function taisuiOf(yearBranch: string, birthYearBranch: string): string[] {
  if (yearBranch === birthYearBranch) return ["值太岁"];
  const out: string[] = [];
  if (has(CHONG, yearBranch, birthYearBranch)) out.push("冲太岁");
  if (has(XING, yearBranch, birthYearBranch)) out.push("刑太岁");
  if (has(HAI, yearBranch, birthYearBranch)) out.push("害太岁");
  if (has(PO6, yearBranch, birthYearBranch)) out.push("破太岁");
  return out;
}
export type ElRole = "喜用" | "忌" | "中性";
const roleOf = (el: string, favour: string[], avoid: string[]): ElRole => (favour.includes(el) ? "喜用" : avoid.includes(el) ? "忌" : "中性");

/** the 空亡 pair of a 干支 (旬空) */
export function kongOf(gz: string): string {
  const k = (BRANCHES.indexOf(gz[1]!) - STEMS.indexOf(gz[0]!) + 12) % 12; // branch index of the 旬's first day (甲)
  return BRANCHES[(k + 10) % 12]! + BRANCHES[(k + 11) % 12]!;
}
const MONTH_STARS: [string, string][] = [["天乙贵人", "天乙贵人"], ["文昌贵人", "文昌"], ["禄神", "禄神"], ["桃花", "桃花"], ["驿马", "驿马"]];
/**
 * The marks of each 流月, fixed order: the month branch against 日支 / 月支 (合 / 冲 / 刑 / 害), 旬空 (the month branch in the
 * 日柱's 空亡), the month stem 五合 the day master (合日干), 天乙贵人 / 文昌 / 禄神 / 桃花 / 驿马 (shensha.ts, from the natal
 * chart), 伏吟流年 / 伏吟大运 (the month's 干支 equal to the year's / the 大運's).
 */
export function monthFlags(pillars: string[], gender: Gender, year: number, decadeGz: string | null): string[][] {
  const db = pillars[2]![1]!, mb = pillars[1]![1]!, ds = pillars[2]![0]!;
  const kong = kongOf(pillars[2]!);
  const yg = yearCycle(year).getName();
  const natal = { year: pillars[0]!, month: pillars[1]!, day: pillars[2]!, hour: pillars[3] };
  return SixtyCycleYear.fromYear(year).getMonths().map((m) => {
    const gz = m.getSixtyCycle().getName(), s = gz[0]!, b = gz[1]!;
    const out: string[] = [];
    for (const [lab, nb] of [["日支", db], ["月支", mb]] as const) for (const r of branchRels(b, nb)) out.push(`${r}${lab}`);
    if (kong.includes(b)) out.push("旬空");
    if (has(STEM_HE5, s, ds)) out.push("合日干");
    const ss = shenshaOf(gz, natal, gender, "fortune");
    for (const [k, name] of MONTH_STARS) if (ss.includes(k)) out.push(name);
    if (gz === yg) out.push("伏吟流年");
    if (decadeGz && gz === decadeGz) out.push("伏吟大运");
    return out;
  });
}

/** how much a mark weighs when choosing the months (negative: a month to go easy; pivot: a month where something moves) */
export const MONTH_W = {
  ease: { 冲日支: 3, 冲月支: 2, 刑日支: 1, 害日支: 1, 刑月支: 1, 害月支: 0.5, 旬空: 1, 伏吟大运: 1, 伏吟流年: 1 } as Record<string, number>,
  pivot: { 冲日支: 3, 合日支: 2.5, 合日干: 2, 冲月支: 2, 伏吟大运: 2, 伏吟流年: 2, 天乙贵人: 1.5, 合月支: 1, 禄神: 1, 刑日支: 1, 旬空: 0.5, 桃花: 0.5, 驿马: 0.5, 文昌: 0.5 } as Record<string, number>,
};
const wOf = (t: Record<string, number>, flags: string[]) => flags.reduce((a, f) => a + (t[f] ?? 0), 0);

/**
 * The three months the year turns on: smooth = the highest score (ties: fewer 'ease' marks, then earlier); slow = the
 * lowest of the rest (ties: more 'ease' marks, then earlier); pivot = the most 'pivot' weight among the other ten
 * (ties: further from level 3, then earlier).
 */
export function keyMonths(curve: Pick<MonthPoint, "score">[], flags: string[][]): { smooth: number; slow: number; pivot: number } {
  const idx = curve.map((_, i) => i);
  const ease = (i: number) => wOf(MONTH_W.ease, flags[i] ?? []);
  const smooth = [...idx].sort((a, b) => curve[b]!.score - curve[a]!.score || ease(a) - ease(b) || a - b)[0]!;
  const slow = idx.filter((i) => i !== smooth).sort((a, b) => curve[a]!.score - curve[b]!.score || ease(b) - ease(a) || a - b)[0]!;
  const pv = (i: number) => wOf(MONTH_W.pivot, flags[i] ?? []);
  const pivot = idx.filter((i) => i !== smooth && i !== slow)
    .sort((a, b) => pv(b) - pv(a) || Math.abs(curve[b]!.score - 3) - Math.abs(curve[a]!.score - 3) || a - b)[0]!;
  return { smooth, slow, pivot };
}

/**
 * Two or three stretches to go easy: runs of consecutive months at level ≤ 2 or marked 冲日支, lowest first (at most
 * three); topped up to two with the lowest single months left (never the smooth month); returned in time order.
 */
export function guardPeriods(curve: Pick<MonthPoint, "score" | "level" | "tags">[], flags: string[][], smooth: number): { from: number; to: number; why: string[] }[] {
  const hit = curve.map((m, i) => m.level <= 2 || (flags[i] ?? []).includes("冲日支"));
  const runs: [number, number][] = [];
  hit.forEach((h, i) => { if (!h) return; const last = runs[runs.length - 1]; if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]); });
  const minScore = ([a, b]: [number, number]) => Math.min(...curve.slice(a, b + 1).map((m) => m.score));
  const picked = [...runs].sort((x, y) => minScore(x) - minScore(y) || x[0] - y[0]).slice(0, 3);
  const used = new Set(picked.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k)));
  const rest = curve.map((_, i) => i).filter((i) => !used.has(i) && i !== smooth).sort((a, b) => curve[a]!.score - curve[b]!.score || a - b);
  while (picked.length < 2 && rest.length) { const i = rest.shift()!; picked.push([i, i]); }
  return picked.sort((x, y) => x[0] - y[0]).map(([from, to]) => {
    const why: string[] = [];
    for (let i = from; i <= to; i++) {
      for (const t of curve[i]!.tags) if (/偏耗|冲|刑|害/.test(t)) why.push(t);
      for (const f of flags[i] ?? []) if (MONTH_W.ease[f] && !/支$/.test(f)) why.push(f); // the 支 relations are in the tags already
    }
    return { from, to, why: [...new Set(why)].slice(0, 5) };
  });
}

export interface YearBook {
  year: number; gz: string; stemTen: string; branchTen: string; stemEl: string; branchEl: string;
  /** whether the year's 天干 / 地支 element is on the 喜用 side of this chart */
  roles: { stem: ElRole; branch: ElRole };
  /** the 大運 the year falls in and how the year meets it (gzRels) */
  decade: { gz: string; ten: string; startAge: number; endAge: number; rels: string[] } | null;
  /** the year against each natal pillar, with what that pillar stands for */
  natal: { label: string; gz: string; palace: string; rels: string[] }[];
  /** 值／冲／刑／害／破太岁 — the year branch against the birth-year branch */
  taisui: string[];
  /** the marks of each 流月 (monthFlags), same order as the curve */
  flags: string[][];
  key: { smooth: number; slow: number; pivot: number };
  guards: { from: number; to: number; why: string[] }[];
  /** 天乙貴人 branches (day and year stem) → 生肖; 六合 / 三合 with the 日支 → 生肖 easier to work with */
  noble: { branches: string[]; zodiac: string[] };
  allies: { liuhe: string[]; sanhe: string[] };
  /** the 喜用 elements in daily terms (empty for a balanced chart) */
  daily: { el: string; colours: string[]; direction: string; numbers: number[] }[];
}

export function yearBook(c: { pillars: string[]; gender: Gender; favour: string[]; avoid: string[]; decades: Pick<Decade, "gz" | "ten" | "startAge" | "endAge" | "startYear">[] }, year: number, curve: MonthPoint[]): YearBook {
  const yg = yearCycle(year).getName(), ys = yg[0]!, yb = yg[1]!;
  const dm = c.pillars[2]![0]!, db = c.pillars[2]![1]!;
  const bMain = yearCycle(year).getEarthBranch().getHideHeavenStemMain().getName();
  const d = c.decades.find((x) => year >= x.startYear && year < x.startYear + 10) ?? null;
  const flags = monthFlags(c.pillars, c.gender, year, d?.gz ?? null);
  const key = keyMonths(curve, flags);
  const nobleB = [...new Set([...(TIANYI_T[dm] ?? ""), ...(TIANYI_T[c.pillars[0]![0]!] ?? "")])].sort((a, b) => BRANCHES.indexOf(a) - BRANCHES.indexOf(b));
  const trio = SANHE_G.find((g) => g.includes(db))!;
  return {
    year, gz: yg, stemTen: tenOf(dm, ys), branchTen: tenOf(dm, bMain), stemEl: stemEl(ys), branchEl: BR_EL[yb]!,
    roles: { stem: roleOf(stemEl(ys), c.favour, c.avoid), branch: roleOf(BR_EL[yb]!, c.favour, c.avoid) },
    decade: d ? { gz: d.gz, ten: d.ten, startAge: d.startAge, endAge: d.endAge, rels: gzRels(yg, d.gz) } : null,
    natal: c.pillars.map((p, i) => ({ label: ["年柱", "月柱", "日柱", "时柱"][i]!, gz: p, palace: PALACE[i]!, rels: gzRels(yg, p) })),
    taisui: taisuiOf(yb, c.pillars[0]![1]!),
    flags, key, guards: guardPeriods(curve, flags, key.smooth),
    noble: { branches: nobleB, zodiac: nobleB.map((b) => ZODIAC[b]!) },
    allies: { liuhe: [ZODIAC[LIUHE_OF[db]!]!], sanhe: [...trio].filter((b) => b !== db).map((b) => ZODIAC[b]!) },
    daily: c.favour.slice(0, 2).map((el) => ({ el, ...EL_DAILY[el]! })),
  };
}

/** the buyer's own question (optional): plain text, one line of whitespace, at most 200 characters, or null */
export const QUESTION_MAX = 200;
export function cleanQuestion(x: unknown): string | null {
  if (typeof x !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const s = x.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  return s ? [...s].slice(0, QUESTION_MAX).join("").trim() : null;
}

/* ------------------------------------------------------------------ banned words */
/**
 * What no report text — written or fixed — may contain. 準／准 only as a claim of accuracy: 準備、標準、水準、準時 are
 * ordinary words (10-17: banning them failed good readings). 他／她 only in the 正緣 portrait (it says TA).
 */
/** built on first use, so a browser bundle that only needs the chart helpers never carries these lookbehinds */
let bannedCache: [string, RegExp][] | null = null;
const bannedList = (): [string, RegExp][] => (bannedCache ??= [
  ["accuracy", /(?<![標标水基])[準准](?![備备時时許许])/],
  ["certainty", /保證|保证|一定會|一定会|必定|必然|命中注定|注定/],
  ["ai", /(?<![A-Za-z])AI(?![A-Za-z])|人工智慧|人工智能/],
  ["deity", /神明說|神明说|神說|神说|神諭|神谕|靈驗|灵验/],
  ["remedy", /改運|改运|化解|開運|开运|風水|风水|擺件|摆件|護身符|护身符|符咒|旺運物|旺运物/],
  ["master", /大師|大师/],
  ["verdict", /[吉凶]/],
  ["fear", /血光|破財|破财|剋夫|剋妻|克夫|克妻|刑克|刑剋|婚姻失敗|婚姻失败|離婚|离婚|災禍|灾祸|厄運|厄运|[犯安拜]太[歲岁]|太[歲岁]星君|沖犯|冲犯/],
  ["medical", /診斷|诊断|治療|治疗|藥物|药物|服藥|服药|吃藥|吃药|處方|处方|就醫|就医|疾病|病症|癌|手術|手术|保健品/],
  ["invest", /股票|股市|基金|期貨|期货|加密貨幣|加密货币|比特幣|比特币|虛擬幣|虚拟币|投資標的|投资标的|理財產品|理财产品|買進|买进/],
  ["legal", /律師|律师|訴訟|诉讼|官司|官非/],
  ["mechanics", /(?:按|依|根據|根据|照|固定的?)(?:規則|规则)|(?:規則|规则)(?:是|來算|来算|判斷|判断)|演算法|算法|模型|資料庫|数据库|本報告|本报告|這份報告的|这份报告的|根據你提供|根据你提供|JSON|系統判斷|系统判断/],
]);
/** the first banned word in a text, as "kind:word", or null */
export function baziReportOffense(text: string, kind?: ReportKind): string | null {
  for (const [k, re] of bannedList()) { const m = text.match(re); if (m) return `${k}:${m[0]}`; }
  // 10-19 年書: 值／沖太歲 may be named in a 流年 report as a plain fact (never 犯／安／拜太歲, above); nowhere else
  if (kind !== "year") { const m = text.match(/太[歲岁]/); if (m) return `fear:${m[0]}`; }
  if (kind === "love") { const m = text.match(/[他她]/); if (m) return `pronoun:${m[0]}`; }
  return null;
}
/** dates and ages have no place in the portrait (no "you will meet TA at 28") */
export const LOVE_TIMING = /\d{2,4}\s*[年歲岁]|[一二三四五六七八九十]+歲|[一二三四五六七八九十]+岁|幾歲|几岁|明年|後年|后年/;

/* ------------------------------------------------------------------ the page's fixed copy (Traditional; zh pages go through toHans) */
export const DEEP_CHAPTERS: { key: string; title: string }[] = [
  { key: "geju", title: "格局與五行" },
  { key: "xingge", title: "性格的兩面" },
  { key: "tianfu", title: "天賦與事業方向" },
  { key: "caifu", title: "財富模式" },
  { key: "ganqing", title: "感情與相處" },
  { key: "renji", title: "人際與家庭" },
  { key: "shenxin", title: "身心節奏" },
  { key: "dayun", title: "一生大運，一步一步看" },
  { key: "dangqian", title: "現在這步大運與今年" },
  { key: "xiyong", title: "喜用五行的日常用法" },
  { key: "xingdong", title: "行動指南" },
];
export const LOVE_SECTIONS: { key: string; title: string }[] = [
  { key: "qiyun", title: "氣韻" },
  { key: "titai", title: "體態與氣質" },
  { key: "dise", title: "底色" },
  { key: "shentai", title: "神態" },
  { key: "xiangchu", title: "相處的節奏" },
  { key: "yuanfen", title: "緣分氣息" },
  { key: "xiangyu", title: "相遇的場景" },
];
/** 年書 chapter four: the six areas (love has a 單身 and a 有伴 part) */
export const BOOK_AREAS: { key: "career" | "wealth" | "love" | "rhythm" | "people" | "home"; title: string }[] = [
  { key: "career", title: "事業" },
  { key: "wealth", title: "財運" },
  { key: "love", title: "感情" },
  { key: "rhythm", title: "健康作息" },
  { key: "people", title: "人際貴人" },
  { key: "home", title: "家宅出行" },
];
export const YEAR_AREAS: { key: "career" | "wealth" | "love" | "rhythm"; title: string }[] = [
  { key: "career", title: "事業" },
  { key: "wealth", title: "財運" },
  { key: "love", title: "感情" },
  { key: "rhythm", title: "健康作息" },
];
export const REPORT_UI = {
  back: "八字排盤",
  kindLabel: { deep: "八字深度報告", love: "正緣畫像", year: "流年報告" } as Record<ReportKind, string>,
  kindSub: { deep: "十一章，從格局到行動", love: "你會被哪一種人吸引、和哪一種人走得長", year: "這一年，逐月來看" } as Record<ReportKind, string>,
  writing: "報告正在寫，一章一章出來，寫好的會先出現在這裡。大約一兩分鐘，頁面會自己更新。",
  writingChapter: "這一章正在寫……",
  failedChapter: "這一章這次沒寫成，我們會補上，寫好會寄信通知你。",
  loveIntro: "TA 的樣子",
  loveTips: "相處時可以留意的",
  loveSelf: "給你自己的一句",
  loveBasis: "依據",
  loveNote: "畫的是一種氣質類型，不是某一個具體的人。",
  yearOverview: "這一年的整體",
  yearMonths: "十二個月",
  yearCurve: "每月的能量起伏",
  yearThree: "這一年可以做的三件事",
  levelWord: { 1: "放慢", 2: "收著走", 3: "平穩", 4: "順手", 5: "有勢" } as Record<number, string>,
  // 10-19 年書 (one year, eight chapters)
  kindSubBook: "一整年的年書：總判、關鍵月、逐月宜忌、六大領域、貴人與季度行動",
  bookVerdict: "年度總判",
  bookKeyword: "今年的關鍵字",
  bookTenLine: "流年十神",
  bookDecade: "與大運",
  bookNatal: "與四柱",
  bookTaisui: "與生年",
  bookRole: "流年五行",
  bookNoRel: "沒有特別的合沖",
  bookKeyMonths: "三個關鍵月份",
  keySmooth: "最順手的月",
  keySlow: "最需要放慢的月",
  keyPivot: "最重要的一個月",
  bookMonths: "十二個月逐月",
  monthYi: "宜",
  monthJi: "不宜",
  bookAreas: "六大領域",
  areaSingle: "單身",
  areaPaired: "有伴",
  bookAllies: "貴人與合作",
  alliesNoble: "貴人生肖",
  alliesEasy: "好合作的生肖",
  alliesColour: "今年多用的顏色",
  alliesDirection: "方位",
  alliesNumber: "數字",
  alliesNote: "顏色、方位和數字是日常小習慣的參考，用得自在就好。",
  bookGuards: "需要守的時段",
  bookQuarters: "季度行動清單",
  quarter: { 1: "第一季", 2: "第二季", 3: "第三季", 4: "第四季" } as Record<number, string>,
  bookQuestion: "答你的問題",
  questionYou: "你問的是",
  questionCast: "想看這件事接下來的走向，可以為它起一卦 →",
  monthFrom: "起",
  pillarsHead: "四柱",
  unpaidHead: "這份報告還沒付款",
  unpaidBody: "付款完成後，報告會直接寫在這一頁，也會寄到你的信箱。",
  emailSubject: { deep: "你的八字深度報告寫好了", love: "你的正緣畫像寫好了", year: "你的流年報告寫好了" } as Record<ReportKind, string>,
  emailBody: { deep: "十一章的八字深度報告已經寫好了，之後也能隨時從這封信回去看。", love: "你的正緣畫像已經寫好了，之後也能隨時從這封信回去看。", year: "你的流年報告已經寫好了，十二個月逐月都在裡面，之後也能隨時從這封信回去看。" } as Record<ReportKind, string>,
  emailButton: "打開我的報告",
  emailFoot: "有問題直接回覆這封信。",
  productName: "YaoFlow 八字流年報告：{y} 年，逐月來看（數位內容）",
  productNameHans: "YaoFlow 八字流年报告：{y} 年，逐月来看（数字内容）",
};
/** every fixed string above, for the banned-word test */
export function reportStaticStrings(): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => { if (typeof x === "string") out.push(x); else if (x && typeof x === "object") Object.values(x).forEach(walk); };
  walk(REPORT_UI); walk(DEEP_CHAPTERS); walk(LOVE_SECTIONS); walk(YEAR_AREAS); walk(BOOK_AREAS); walk(PALACE); walk(EL_DAILY);
  return out;
}

/** which chapters each writing call produces (the page shows a placeholder for a group still being written) */
export const DEEP_GROUPS: Record<string, string[]> = {
  A: ["geju", "xingge", "tianfu"],
  B: ["caifu", "ganqing", "renji", "shenxin"],
  C: ["dayun"],
  D: ["dangqian", "xiyong", "xingdong"],
};
export const LOVE_GROUPS: Record<string, string[]> = { A: ["intro", "traits"], B: ["tips", "self"] };
/**
 * 10-19 年書 writing calls: ov 總判 + 三個關鍵月 · m1 months 1–6 · m2 months 7–12 · ar 六大領域 · gx 貴人、守的時段、季度
 * · qa the buyer's question (only when there is one). Reports made before (no `book` in the facts) keep one call per year.
 */
// 10-19 v2 (the first 年書 came out at half the asked length): smaller calls write fuller — months three at a time, areas in two
export const BOOK_GROUPS = ["ov", "m1", "m2", "m3", "m4", "ar", "ar2", "gx"] as const;
/** the writing calls of a report: deep A–D, love A–B, year: the 年書 groups, or one per year ("y2026") on the old format */
export function groupKeys(kind: ReportKind, years: number[], opt: { book?: boolean; question?: boolean } = {}): string[] {
  if (kind === "deep") return Object.keys(DEEP_GROUPS);
  if (kind === "love") return Object.keys(LOVE_GROUPS);
  return opt.book ? [...BOOK_GROUPS, ...(opt.question ? ["qa"] : [])] : years.map((y) => `y${y}`);
}
/** the quarter (0–3) a 流月 index belongs to, and a quarter's months */
export const quarterMonths = (q: number): number[] => [q * 3, q * 3 + 1, q * 3 + 2];
export const deepGroupOf = (chapter: string): string => Object.keys(DEEP_GROUPS).find((g) => DEEP_GROUPS[g]!.includes(chapter)) ?? "A";

/** "配偶星 偏财·水" / "年干、日支藏 · 鲜明 · 坐配偶宫" → chips */
export const basisChips = (basis: string): string[] => basis.split(/\s+·\s+|、/).map((x) => x.replace(/^(配偶星|夫妻宫|夫妻宮)\s+/, "").trim()).filter(Boolean);
