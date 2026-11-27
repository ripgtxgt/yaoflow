import { cycleOf, baziOf } from "./chart";
import { avoidOf, branchRels, CURVE_W, type ChartFacts } from "./report-facts";
import { tenOf } from "./zhengyuan";
import { huangliDay } from "../calendar/day";
import { normalizeBirth, type BirthInput, type Gender } from "../birth/normalize";

/**
 * 10-22 进度表 92 會員「你的今天」— the day read against the member's own 八字, by fixed rules (no model call):
 *   - the 十神 of the day's 天干 for their 日主 — what kind of day it tends to be
 *   - the day's 地支 against their 日支 (and 月支): 合／沖／刑／害
 *   - a level 1–5, the 流月 curve's rule applied to one day: start at 3; the day's 天干 element 喜用 +0.5 / 忌 −0.5;
 *     its 地支 本氣 element ±1; against 日支 合 +0.5, 沖 −1, 刑 −0.5, 害 −0.5; against 月支 合 +0.5, 沖 −0.5, 刑 −0.5,
 *     害 −0.25 (CURVE_W) — rounded, held to 1–5
 * And 黃曆「今天對你」: one line on the day's 日柱 against theirs. 擇日 uses `clashOf` to take out the days whose 地支 沖 or
 * 刑 their 日支. Every line is a tendency and what to do with it — never a verdict.
 */
export type Rel = "合" | "冲" | "刑" | "害";
export interface MyChart { dayMaster: string; dmEl: string; dayBranch: string; monthBranch: string; favour: string[]; avoid: string[]; /** 10-26 for the 桃花 day */ yearBranch?: string }
export interface MyToday {
  ymd: string; dayGz: string;
  /** the day stem's 十神 for this 日主, 繁體 */
  ten: string;
  /** the day branch against the 日支 */
  rels: Rel[];
  level: 1 | 2 | 3 | 4 | 5; word: string;
  /** the day in one or two sentences; then what to watch */
  line: string; tip: string | null;
  /** 黃曆「今天對你」 */
  almanac: string;
}

const hant = (s: string) => s.replace(/财/g, "財").replace(/伤/g, "傷").replace(/杀/g, "殺");

/** the chart from a 八字 report's facts (no birth data is in them) */
export function chartFromFacts(f: Pick<ChartFacts, "dayMaster" | "dmEl" | "pillars" | "favour" | "avoid">): MyChart | null {
  const day = f.pillars?.[2]?.gz, month = f.pillars?.[1]?.gz, year = f.pillars?.[0]?.gz;
  if (!day || !month || !f.dayMaster) return null;
  return { dayMaster: f.dayMaster, dmEl: f.dmEl, dayBranch: day[1]!, monthBranch: month[1]!, favour: f.favour ?? [], avoid: f.avoid ?? [], yearBranch: year?.[1] };
}

/** the chart from a stored birth profile (computed here; nothing of it is kept) */
export function chartFromBirth(input: BirthInput, gender: Gender = "male", now = Date.now()): MyChart | null {
  try {
    const v = baziOf(normalizeBirth(input), gender, new Date(now + 8 * 3_600_000).getUTCFullYear(), true);
    const day = v.pillars[2], month = v.pillars[1];
    if (!day || !month) return null;
    return { dayMaster: v.dayMaster, dmEl: v.dmEl, dayBranch: day.branch, monthBranch: month.branch, favour: v.favour, avoid: avoidOf(v), yearBranch: v.pillars[0]?.branch };
  } catch { return null; }
}

const LEVEL_WORD: Record<number, string> = { 5: "順手的一天", 4: "偏順的一天", 3: "平穩的一天", 2: "要放慢的一天", 1: "最需要放慢的一天" };
const TEN_DAY: Record<string, string> = {
  比肩: "適合自己動手、和同輩一起把事做完；別替人扛下不屬於你的事。",
  劫財: "人多事雜，錢也容易花得快；合作的事先講清楚，花錢前想一下。",
  食神: "心情比較鬆，表達、創作、吃頓好的都順；把想法寫下來或做出來。",
  傷官: "想法多、話也容易快；有意見放在做事上，開口前多想一下。",
  正財: "適合處理帳務、做實際的事，一步一步來最穩。",
  偏財: "機會和人脈比較活絡，花費也容易多；看到想買的先放一放再決定。",
  正官: "規矩和責任多一點，適合把答應過的事做完，和上面的人好好溝通。",
  七殺: "事情推著你走、壓力大一些；集中做最要緊的一件，別同時開太多頭。",
  正印: "適合學習、整理、請教有經驗的人；休息也是正事。",
  偏印: "直覺強、想往內收；適合想事情、做要專注的事，應酬少一點。",
};
const REL_TIP: Record<Rel, string> = {
  冲: "今天的日支和你的日支相沖：容易有變動或臨時的事，重要的決定可以緩一天。",
  合: "今天的日支和你的日支相合：和人相處比較順，適合約見、談事。",
  刑: "今天的日支和你的日支相刑：小摩擦多，說話留一點餘地。",
  害: "今天的日支和你的日支相害：容易有誤會，事情多確認一次。",
};

export function myToday(c: MyChart, ymd: string): MyToday | null {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  let dayGz: string;
  try { dayGz = huangliDay(y, m, d).gz.day; } catch { return null; }
  const sc = cycleOf(dayGz);
  const stem = sc.getHeavenStem(), branch = sc.getEarthBranch();
  const sEl = stem.getElement().getName(), bEl = branch.getHideHeavenStemMain().getElement().getName();
  let score = CURVE_W.base;
  if (c.favour.includes(sEl)) score += CURVE_W.stemFav; else if (c.avoid.includes(sEl)) score += CURVE_W.stemAvoid;
  if (c.favour.includes(bEl)) score += CURVE_W.branchFav; else if (c.avoid.includes(bEl)) score += CURVE_W.branchAvoid;
  const rels = branchRels(branch.getName(), c.dayBranch) as Rel[];
  for (const r of rels) score += CURVE_W.day[r];
  for (const r of branchRels(branch.getName(), c.monthBranch) as Rel[]) score += CURVE_W.month[r];
  const level = Math.max(1, Math.min(5, Math.round(score))) as MyToday["level"];
  const ten = hant(tenOf(c.dayMaster, stem.getName()));
  const first = rels.includes("冲") ? "冲" : rels[0];
  return {
    ymd, dayGz, ten, rels, level, word: LEVEL_WORD[level]!,
    line: `今天是你的「${ten}」日：${TEN_DAY[ten] ?? "照自己的步調走。"}`,
    tip: first ? REL_TIP[first] : null,
    almanac: almanacLine(dayGz, c, rels),
  };
}

/** 黃曆「今天對你」: the day's 日柱 against the reader's */
export function almanacLine(dayGz: string, c: Pick<MyChart, "dayBranch">, rels = branchRels(dayGz[1]!, c.dayBranch) as Rel[]): string {
  const b = dayGz[1]!, mine = c.dayBranch;
  if (rels.includes("冲")) return `今天${dayGz}日，日支${b}沖你的日支${mine}：搬家、簽約這類大事可以挑別天。`;
  if (rels.includes("合")) return `今天${dayGz}日，日支${b}合你的日支${mine}：和人約、談事比較順。`;
  if (rels.includes("刑")) return `今天${dayGz}日，日支${b}刑你的日支${mine}：小事多留意，說話留餘地。`;
  if (rels.includes("害")) return `今天${dayGz}日，日支${b}害你的日支${mine}：容易有誤會，多確認一次。`;
  return `今天${dayGz}日，和你的日柱沒有沖合，照平常的步調。`;
}

/** 擇日: does a day's 日柱 沖 or 刑 this 日支? (the days a member's list leaves out) */
export function clashOf(dayGz: string, dayBranch: string): ("冲" | "刑")[] {
  return (branchRels(dayGz[1]!, dayBranch) as Rel[]).filter((r): r is "冲" | "刑" => r === "冲" || r === "刑");
}
