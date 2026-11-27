import { PHASE_ZH, TRIGRAMS, najiaFor, palaceOf, relationsFor, type HexagramInfo, type PalaceCategory } from "@yaoflow/engine";
import { GUA, guaYangs } from "./gua";
import type { Locale } from "./locales";
import { relationLabel } from "./names";
import { forLocale } from "./hant";
import TX from "@/data/tuanxiang.json";
import LW from "@/data/gua-love-work.json";
import LLW from "@/data/gua-line-lovework.json";

/**
 * 10-16 进度表 64 (外部调研：卦名本身在台湾每月约 38,000 次搜索；我们的卦页缺六爻人真正会查的东西——卦宫、世应、纳甲、
 * 彖传象传——比不过易學網这类站，Google 来抓了也不收): what a 六爻 reader looks up on a hexagram page, computed by the
 * same engine that casts (lib/engine — nothing written by hand that could disagree with a reading), plus the 彖传 and
 * 象传 from 《周易》 (Wikisource 周易/各卦, public domain, fetched 2026-10-16 — data/tuanxiang.json; hans by OpenCC with
 * 乾 protected, as the engine's 经文).
 *
 * Chinese pages only (繁體 / 简体): the terms have no settled names in the other languages, and the research put 繁中 first.
 */

const CATEGORY_ZH: Record<PalaceCategory, string> = {
  pure: "八纯卦（本宫卦）", one: "一世卦", two: "二世卦", three: "三世卦", four: "四世卦", five: "五世卦", youhun: "游魂卦", guihun: "归魂卦",
};
const POS_ZH = ["初", "二", "三", "四", "五", "上"] as const;

export interface LiuyaoLine { pos: number; label: string; yang: boolean; ganzhi: string; phase: string; relation: string; mark: "世" | "应" | null }
export interface LiuyaoChart {
  palace: string;        // 乾宫
  palacePhase: string;   // 金
  category: string;      // 一世卦
  world: number;         // 世爻位置 1–6
  response: number;
  lines: LiuyaoLine[];   // bottom → top
}

const bitsOf = (h: HexagramInfo) => guaYangs(h);
const byYangs = (ys: boolean[]) => GUA.find((h) => guaYangs(h).every((y, i) => y === ys[i]))!;

/** 静卦排盘: 卦宫、五行、世应、每爻纳甲干支、五行、六亲 */
export function liuyaoChart(h: HexagramInfo, l: Locale): LiuyaoChart {
  const p = palaceOf(h.number);
  const na = najiaFor(h.lower, h.upper);
  const rel = relationsFor(h.number, h.lower, h.upper);
  const ys = bitsOf(h);
  const z = (s: string) => forLocale(s, l);
  return {
    palace: z(`${TRIGRAMS[p.palace].zh}宫`),
    palacePhase: z(PHASE_ZH[p.palacePhase]),
    category: z(CATEGORY_ZH[p.category]),
    world: p.world,
    response: p.response,
    lines: na.map((n, i) => ({
      pos: i + 1,
      label: z(i === 0 ? `初${ys[i] ? "九" : "六"}` : i === 5 ? `上${ys[i] ? "九" : "六"}` : `${ys[i] ? "九" : "六"}${POS_ZH[i]}`),
      yang: ys[i]!,
      ganzhi: `${n.stem}${n.branch}`,
      phase: z(PHASE_ZH[n.phase]),
      relation: relationLabel(rel[i]!, l),
      mark: p.world === i + 1 ? "世" : p.response === i + 1 ? "应" : null,
    })),
  };
}

/** 错卦（六爻全变）、综卦（上下颠倒）、互卦（二三四爻为下、三四五爻为上） */
export function relatedHexagrams(h: HexagramInfo): { cuo: HexagramInfo; zong: HexagramInfo; hu: HexagramInfo } {
  const ys = bitsOf(h);
  return {
    cuo: byYangs(ys.map((y) => !y)),
    zong: byYangs([...ys].reverse()),
    hu: byYangs([ys[1]!, ys[2]!, ys[3]!, ys[2]!, ys[3]!, ys[4]!]),
  };
}

export interface TuanXiang { tuan: string; daxiang: string; xiaoxiang: string[] }
type Raw = { tuanHant: string; tuanHans: string; daxiangHant: string; daxiangHans: string; xiaoxiangHant: string[]; xiaoxiangHans: string[] };

/** 彖传、大象、小象（每爻一句；乾坤有用九／用六的第七句） */
export function tuanXiang(n: number, l: Locale): TuanXiang | null {
  const r = (TX as Record<string, Raw>)[String(n)];
  if (!r) return null;
  const hant = l === "zh-hant";
  return { tuan: hant ? r.tuanHant : r.tuanHans, daxiang: hant ? r.daxiangHant : r.daxiangHans, xiaoxiang: hant ? r.xiaoxiangHant : r.xiaoxiangHans };
}

export const hasLiuyaoSection = (l: Locale) => l === "zh-hant" || l === "zh";

/**
 * 10-16 进度表 64: the longer 感情 / 工作 paragraphs for the Chinese pages (280–380 字 each, written against this
 * hexagram's 卦爻辞、彖象 and its still chart — 世应 six relations, 用神 positions; checked by script for the chart's
 * 干支／六亲／生剋冲合 and the banned words). They replace the short two-line notes; 財運 keeps its note.
 */
type LwRaw = { loveHant: string; workHant: string; loveHans: string; workHans: string };
export function loveWork(n: number, l: Locale): { love: string; work: string } | null {
  const r = (LW as Record<string, LwRaw>)[String(n)];
  if (!r || !hasLiuyaoSection(l)) return null;
  return l === "zh-hant" ? { love: r.loveHant, work: r.workHant } : { love: r.loveHans, work: r.workHans };
}

/**
 * 10-28 进度表 117 ④ (GSC: readers search 「地山謙 初」, one 爻 at a time): one plain sentence for 感情 and one for 工作 per
 * line, written by the ops model from the line text and our gloss (scripts/gen-line-lovework.ts), checked there against
 * the banned words. Chinese pages only; null when a hexagram has none yet.
 */
type LlwRaw = { loveHans: string; workHans: string; loveHant: string; workHant: string };
export function lineLoveWork(n: number, l: Locale): { love: string; work: string }[] | null {
  const r = (LLW as Record<string, LlwRaw[]>)[String(n)];
  if (!r || r.length !== 6 || !hasLiuyaoSection(l)) return null;
  return r.map((x) => (l === "zh-hant" ? { love: x.loveHant, work: x.workHant } : { love: x.loveHans, work: x.workHans }));
}
/** the line's heading: 「初六：謙謙君子」 — its label and the text up to the first pause */
export const lineHeading = (label: string, text: string) => `${label}：${text.replace(/^[^：:]*[：:]/, "").split(/[，。；、,;.!?！？]/)[0]!.trim()}`;
