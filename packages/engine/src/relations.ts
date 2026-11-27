import { BRANCHES } from "./constants";
import type { Branch, Phase, Relation } from "./types";

/** 五行相生: 木→火→土→金→水→木. */
const GENERATES: Readonly<Record<Phase, Phase>> = {
  wood: "fire",
  fire: "earth",
  earth: "metal",
  metal: "water",
  water: "wood",
};

/** 五行相克: 木克土, 土克水, 水克火, 火克金, 金克木. */
const OVERCOMES: Readonly<Record<Phase, Phase>> = {
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal",
  metal: "wood",
};

export function generates(a: Phase, b: Phase): boolean {
  return GENERATES[a] === b;
}

export function overcomes(a: Phase, b: Phase): boolean {
  return OVERCOMES[a] === b;
}

/**
 * 六亲定例: 同我者兄弟, 生我者父母, 我生者子孙, 克我者官鬼, 我克者妻财。
 * "我" = palace phase. Source:《卜筮正宗》卷二 / 《增删卜易》六亲章.
 */
export function relationTo(palacePhase: Phase, linePhase: Phase): Relation {
  if (palacePhase === linePhase) return "sibling";
  if (generates(linePhase, palacePhase)) return "parent";
  if (generates(palacePhase, linePhase)) return "child";
  if (overcomes(linePhase, palacePhase)) return "officer";
  return "wealth";
}

function branchIndex(b: Branch): number {
  return BRANCHES.indexOf(b);
}

/** 六冲: 子午/丑未/寅申/卯酉/辰戌/巳亥 — indices six apart. */
export function clashes(a: Branch, b: Branch): boolean {
  return (branchIndex(a) - branchIndex(b) + 12) % 12 === 6;
}

/** 六合: 子丑/寅亥/卯戌/辰酉/巳申/午未. */
export function combines(a: Branch, b: Branch): boolean {
  const s = branchIndex(a) + branchIndex(b);
  return s === 1 || s === 13;
}
