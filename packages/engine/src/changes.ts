import { najiaFor } from "./najia";
import { clashes, combines, generates, overcomes, relationTo } from "./relations";
import { RELATION_ZH } from "./palace";
import type { Branch, CalendarContext, CastResult, PalaceInfo, Phase, Relation } from "./types";
import type { ChartLine } from "./chart"; // type-only: erased, so the chart ↔ changes cycle is harmless

/**
 * 动变关系 — what each moving line turns INTO, and what that means.
 *
 * The model used to derive these from two najia columns and got them wrong
 * often enough to matter (回头克 read as 回头生 flips a verdict). So the
 * relations are computed here, once, from the classical rules:
 *
 *   回头生  变爻生本爻          回头克  变爻克本爻
 *   化泄    本爻生变爻（泄气）  化克出  本爻克变爻（耗力）
 *   化进神  同五行，地支顺行    化退神  同五行，地支逆行
 *   伏吟    本变同支            反吟    本变相冲
 *   化合    本变六合            化墓    变爻为本爻之墓库
 *   化空    变爻旬空            化破    变爻月破
 *   化比和  同五行异支非进退（少见）
 */

export type ChangeKind =
  | "huitou_sheng" | "huitou_ke" | "xie" | "ke_chu"
  | "jin" | "tui" | "bihe" | "fuyin" | "fanyin" | "he" | "mu" | "kong" | "po";

export interface LineChange {
  position: number;
  from: { stem: string; branch: Branch; phase: Phase; relation: Relation };
  to: { stem: string; branch: Branch; phase: Phase; relation: Relation };
  kinds: ChangeKind[];
  /** e.g. 三爻妻财卯木动 → 化辰土子孙：化克出（木克土，耗力）；化合（本变相合…） */
  zh: string;
  en: string;
}

/** 进神 pairs (from → to): the branch moves forward within its phase. */
const JIN: Record<string, Branch> = {
  亥: "子", 寅: "卯", 巳: "午", 申: "酉", 丑: "辰", 辰: "未", 未: "戌", 戌: "丑",
};

/** 墓库 of each phase: 木未 火戌 金丑 水辰 土辰. */
const MU: Record<Phase, Branch> = { wood: "未", fire: "戌", metal: "丑", water: "辰", earth: "辰" };

const PHASE_ZH: Record<Phase, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };
const PHASE_EN: Record<Phase, string> = { wood: "wood", fire: "fire", earth: "earth", metal: "metal", water: "water" };
const POS_ZH = ["初", "二", "三", "四", "五", "上"];

const KIND_ZH: Record<ChangeKind, (a: Phase, b: Phase) => string> = {
  huitou_sheng: (a, b) => `化回头生（${PHASE_ZH[b]}生${PHASE_ZH[a]}，得力）`,
  huitou_ke: (a, b) => `化回头克（${PHASE_ZH[b]}克${PHASE_ZH[a]}，受制）`,
  xie: (a, b) => `化泄气（${PHASE_ZH[a]}生${PHASE_ZH[b]}，力量外泄）`,
  ke_chu: (a, b) => `化克出（${PHASE_ZH[a]}克${PHASE_ZH[b]}，耗力）`,
  jin: () => "化进神（同气顺行，越变越旺）",
  tui: () => "化退神（同气逆行，后劲不足）",
  bihe: () => "化比和（同气，平）",
  fuyin: () => "伏吟（本变同支，原地打转）",
  fanyin: () => "反吟（本变相冲，反复颠倒）",
  he: () => "化合（本变相合，牵绊或成局）",
  mu: (a) => `化入墓（变爻为${PHASE_ZH[a]}之墓，困顿）`,
  kong: () => "变爻旬空（所化落空）",
  po: () => "变爻月破（所化被破）",
};
const KIND_EN: Record<ChangeKind, (a: Phase, b: Phase) => string> = {
  huitou_sheng: (a, b) => `fed by its change (${PHASE_EN[b]} feeds ${PHASE_EN[a]}) — gains strength`,
  huitou_ke: (a, b) => `overcome by its change (${PHASE_EN[b]} overcomes ${PHASE_EN[a]}) — checked`,
  xie: (a, b) => `drained by its change (${PHASE_EN[a]} feeds ${PHASE_EN[b]}) — energy leaks away`,
  ke_chu: (a, b) => `spends itself on its change (${PHASE_EN[a]} overcomes ${PHASE_EN[b]}) — effort, little return`,
  jin: () => "advances (same phase, forward branch) — growing stronger",
  tui: () => "retreats (same phase, backward branch) — losing momentum",
  bihe: () => "same phase — level",
  fuyin: () => "same branch (伏吟) — stuck in place",
  fanyin: () => "clashing change (反吟) — reversal, back and forth",
  he: () => "combines with its change — entanglement or a deal",
  mu: (a) => `enters its tomb (the change is the ${PHASE_EN[a]} tomb) — bogged down`,
  kong: () => "the change is void this 旬 — comes to nothing yet",
  po: () => "the change is month-broken — what it turns into is broken",
};

function kindsFor(from: { branch: Branch; phase: Phase }, to: { branch: Branch; phase: Phase }, cal: CalendarContext): ChangeKind[] {
  const k: ChangeKind[] = [];
  const a = from.phase, b = to.phase;
  if (from.branch === to.branch) k.push("fuyin");
  else if (a === b) k.push(JIN[from.branch] === to.branch ? "jin" : JIN[to.branch] === from.branch ? "tui" : "bihe");
  else if (generates(b, a)) k.push("huitou_sheng");
  else if (overcomes(b, a)) k.push("huitou_ke");
  else if (generates(a, b)) k.push("xie");
  else if (overcomes(a, b)) k.push("ke_chu");
  if (from.branch !== to.branch && clashes(from.branch, to.branch)) k.push("fanyin");
  if (combines(from.branch, to.branch)) k.push("he");
  if (MU[a] === to.branch && a !== "earth") k.push("mu"); // 土 has no tomb of its own in practice
  if (cal.voidBranches.includes(to.branch)) k.push("kong");
  if (clashes(to.branch, cal.month.branch)) k.push("po");
  return k;
}

/** Relations of every moving line to what it becomes. Empty when nothing moves. */
export function lineChanges(cast: CastResult, palace: PalaceInfo, calendar: CalendarContext, lines: ChartLine[]): LineChange[] {
  const changed = cast.changed;
  if (!changed) return [];
  const toCol = najiaFor(changed.lower, changed.upper);
  const out: LineChange[] = [];
  for (const l of lines) {
    if (!l.changing) continue;
    const t = toCol[l.position - 1]!;
    const toRel = relationTo(palace.palacePhase, t.phase);
    const from = { stem: l.stem, branch: l.branch, phase: l.phase as Phase, relation: l.relation };
    const to = { stem: t.stem, branch: t.branch, phase: t.phase, relation: toRel };
    const kinds = kindsFor(from, to, calendar);
    const zh = `${POS_ZH[l.position - 1]}爻${RELATION_ZH[l.relation]}${l.branch}${PHASE_ZH[from.phase]}动 → 化${t.branch}${PHASE_ZH[t.phase]}${RELATION_ZH[toRel]}：`
      + kinds.map((kd) => KIND_ZH[kd](from.phase, to.phase)).join("；");
    const en = `Line ${l.position} (${l.relation}, ${l.branch} ${PHASE_EN[from.phase]}) moves → ${t.branch} ${PHASE_EN[t.phase]} (${toRel}): `
      + kinds.map((kd) => KIND_EN[kd](from.phase, to.phase)).join("; ");
    out.push({ position: l.position, from, to, kinds, zh, en });
  }
  return out;
}

/** 六冲/六合 of a hexagram: all three line pairs (1-4, 2-5, 3-6) clash / combine. */
export function hexagramShape(najia: { branch: Branch }[]): "liuchong" | "liuhe" | null {
  const pairs: [number, number][] = [[0, 3], [1, 4], [2, 5]];
  if (pairs.every(([a, b]) => clashes(najia[a]!.branch, najia[b]!.branch))) return "liuchong";
  if (pairs.every(([a, b]) => combines(najia[a]!.branch, najia[b]!.branch))) return "liuhe";
  return null;
}
