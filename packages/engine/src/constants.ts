import type { Branch, Phase, Stem } from "./types";

/** 十天干 in order. */
export const STEMS: readonly Stem[] = [
  "甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸",
] as const;

/** 十二地支 in order. */
export const BRANCHES: readonly Branch[] = [
  "子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥",
] as const;

/**
 * 地支五行 (branch → phase).
 * 子亥水；寅卯木；巳午火；申酉金；辰戌丑未土。
 * Source: standard correspondences, cross-checked against《卜筮正宗》卷一.
 */
export const BRANCH_PHASE: Readonly<Record<Branch, Phase>> = {
  子: "water",
  丑: "earth",
  寅: "wood",
  卯: "wood",
  辰: "earth",
  巳: "fire",
  午: "fire",
  未: "earth",
  申: "metal",
  酉: "metal",
  戌: "earth",
  亥: "water",
};

export const PHASE_ZH: Readonly<Record<Phase, string>> = {
  wood: "木",
  fire: "火",
  earth: "土",
  metal: "金",
  water: "水",
};

export const PHASE_EN: Readonly<Record<Phase, string>> = {
  wood: "Wood",
  fire: "Fire",
  earth: "Earth",
  metal: "Metal",
  water: "Water",
};
