import { BRANCH_PHASE } from "./constants";
import type { Branch, LinePosition, NajiaLine, Stem, TrigramKey } from "./types";

/**
 * 京房纳甲 fixed assignments.
 * Stems: 乾纳甲壬、坤纳乙癸、艮纳丙、兑纳丁、坎纳戊、离纳己、震纳庚、巽纳辛。
 * Branches: 阳卦(乾震坎艮)顺行隔位，阴卦(坤巽离兑)逆行隔位。
 * Source:《京氏易传》纳甲体系, cross-checked with《增删卜易》八宫卦爻装配全表。
 * Unit tests pin the full 乾/坤 columns (甲子…壬戌 / 乙未…癸酉).
 */
interface TrigramNajia {
  innerStem: Stem;
  outerStem: Stem;
  /** Branches for lines 1-3 when used as inner (lower) trigram. */
  inner: readonly [Branch, Branch, Branch];
  /** Branches for lines 4-6 when used as outer (upper) trigram. */
  outer: readonly [Branch, Branch, Branch];
}

export const NAJIA: Readonly<Record<TrigramKey, TrigramNajia>> = {
  qian: { innerStem: "甲", outerStem: "壬", inner: ["子", "寅", "辰"], outer: ["午", "申", "戌"] },
  kan:  { innerStem: "戊", outerStem: "戊", inner: ["寅", "辰", "午"], outer: ["申", "戌", "子"] },
  gen:  { innerStem: "丙", outerStem: "丙", inner: ["辰", "午", "申"], outer: ["戌", "子", "寅"] },
  zhen: { innerStem: "庚", outerStem: "庚", inner: ["子", "寅", "辰"], outer: ["午", "申", "戌"] },
  xun:  { innerStem: "辛", outerStem: "辛", inner: ["丑", "亥", "酉"], outer: ["未", "巳", "卯"] },
  li:   { innerStem: "己", outerStem: "己", inner: ["卯", "丑", "亥"], outer: ["酉", "未", "巳"] },
  kun:  { innerStem: "乙", outerStem: "癸", inner: ["未", "巳", "卯"], outer: ["丑", "亥", "酉"] },
  dui:  { innerStem: "丁", outerStem: "丁", inner: ["巳", "卯", "丑"], outer: ["亥", "酉", "未"] },
};

/** Compute the six fixed Stem–Branch–Phase identities for a hexagram. */
export function najiaFor(lower: TrigramKey, upper: TrigramKey): NajiaLine[] {
  const lo = NAJIA[lower];
  const up = NAJIA[upper];
  const lines: NajiaLine[] = [];
  for (let i = 0; i < 3; i++) {
    const branch = lo.inner[i]!;
    lines.push({
      position: (i + 1) as LinePosition,
      stem: lo.innerStem,
      branch,
      phase: BRANCH_PHASE[branch],
    });
  }
  for (let i = 0; i < 3; i++) {
    const branch = up.outer[i]!;
    lines.push({
      position: (i + 4) as LinePosition,
      stem: up.outerStem,
      branch,
      phase: BRANCH_PHASE[branch],
    });
  }
  return lines;
}
