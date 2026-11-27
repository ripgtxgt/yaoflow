import { DIMS } from "./bmg";

/**
 * 11-05 进度表 138 合卦 (开关 bmg-pair，默认关；等小測上線滿一個月看數據再定細節與收費): two 本命卦 side by side, line by
 * line — the same side is where you click without words (and can get stuck together), opposite sides are where you
 * complement each other and need to say how you work. Computed; no model. Never a verdict on the pair.
 */
export function pairLayers(a: readonly number[], b: readonly number[]): { line: number; label: string; same: boolean; text: string }[] {
  return DIMS.map((d) => {
    const i = d.line - 1;
    const sa = a[i] ? d.yang : d.yin, sb = b[i] ? d.yang : d.yin;
    const same = a[i] === b[i];
    const text = same
      ? `你們都是「${sa.name}」——這一點不用多說就懂，也容易一起卡在同一個地方，偶爾換個方式試試。`
      : `朋友是「${sa.name}」，你是「${sb.name}」——剛好互補；先說清楚各自習慣怎麼做，就不會誤會成對方不在乎。`;
    return { line: d.line, label: d.label, same, text };
  });
}

export const pairScore = (a: readonly number[], b: readonly number[]): number => a.reduce((n, x, i) => n + (x === b[i] ? 1 : 0), 0);
