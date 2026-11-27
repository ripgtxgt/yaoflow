import { SolarDay } from "tyme4ts";
import YL from "@/data/bmg/yueling.zh-hant.json";
import { HEXES, hexByLines, type BmgHex } from "./bmg";

/**
 * 11-05 进度表 137 流月信按「本命卦 × 當月卦」: two public-domain rules for the month's own hexagram —
 *   十二消息卦 (復子、臨丑、泰寅、大壯卯、夬辰、乾巳、姤午、遯未、否申、觀酉、剝戌、坤亥) and
 *   八卦配地支 (坎子、離午、震卯、兌酉；艮丑寅、巽辰巳、坤未申、乾戌亥 — 蕭吉《五行大義》);
 * the 月令 lines and the plain words for each month are 推广's (推广素材/月令/, Neil 11-05).
 * The 節氣月 is the one the 15th of the Gregorian month falls in. Nothing from 《星命定元》 (not for commercial use).
 * Computed; no model.
 */
export interface YuelingMonth { branchMonth: string; jieqi: string[]; xiaoxi: string; trigram: string; yueling: string; tiandi: string; tip: string }
const MONTHS = YL.months as YuelingMonth[];
const BY_NAME = new Map(HEXES.map((h) => [h.name, h]));

export function monthOf(now = Date.now()): { ym: string; month: YuelingMonth; xiaoxi: BmgHex } {
  const t = new Date(now + 8 * 3_600_000);
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
  const branch = SolarDay.fromYmd(y, m, 15).getSixtyCycleDay().getMonth().getName().slice(-1);
  const month = MONTHS.find((x) => x.branchMonth.startsWith(branch))!;
  return { ym: `${y}-${String(m).padStart(2, "0")}`, month, xiaoxi: BY_NAME.get(month.xiaoxi)! };
}

export type MonthFit = "own" | "easy_lower" | "easy_upper" | "reverse" | "mixed";

/** how the reader's 本命卦 meets this month — the rule order of 进度表 137 */
export function monthFit(bmgLines: readonly number[], m: { month: YuelingMonth; xiaoxi: BmgHex }): { fit: MonthFit; same: number } {
  const me = hexByLines(bmgLines);
  const same = bmgLines.reduce((n, x, i) => n + (x === m.xiaoxi.lines[i] ? 1 : 0), 0);
  if (me.kw === m.xiaoxi.kw) return { fit: "own", same };
  if (me.lower === m.month.trigram) return { fit: "easy_lower", same };
  if (me.upper === m.month.trigram) return { fit: "easy_upper", same };
  if (same === 0) return { fit: "reverse", same };
  return { fit: "mixed", same };
}

/** the passage for the letter (繁體; 简体 converts) — the reader's hexagram, the month's, and one plain sentence of fit */
export function monthBmgText(bmgLines: readonly number[], now = Date.now()): { title: string; body: string; yueling: string; tiandi: string; tip: string; hexName: string } {
  const m = monthOf(now);
  const me = hexByLines(bmgLines);
  const { fit, same } = monthFit(bmgLines, m);
  const fitLine = fit === "own"
    ? `這個月的消息卦正是${me.name}——這個月是你的月，平常習慣的做法，這個月特別順手。`
    : fit === "easy_lower"
      ? `這個月屬${m.month.trigram}，和你「本來的你」（下卦${me.lower}）同一個方向：遇事的第一反應，這個月用起來順手。`
      : fit === "easy_upper"
        ? `這個月屬${m.month.trigram}，和你「現在的你」（上卦${me.upper}）同一個方向：這些年練出來的方式，這個月派得上用場。`
        : fit === "reverse"
          ? `這個月的消息卦是${m.xiaoxi.name}，六個爻和你的${me.name}陰陽全反：這個月要用你不習慣的方式，慢一點、多問一句，反而不容易卡。`
          : `這個月的消息卦是${m.xiaoxi.name}，和你的${me.name}有 ${same} 個爻相同、${6 - same} 個不同：相同的那幾件事照你的習慣走，不同的地方換個方式試試。`;
  return {
    title: `你的本命卦：${me.name} × 這個月：${m.xiaoxi.name}`,
    body: fitLine, yueling: m.month.yueling, tiandi: m.month.tiandi, tip: m.month.tip, hexName: me.short,
  };
}
