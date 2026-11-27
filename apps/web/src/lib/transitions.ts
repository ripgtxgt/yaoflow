import {
  fullChart, PHASE_EN, textsFor, TRIGRAMS,
  type Branch, type ChangeKind, type HexagramInfo, type HexShape, type LineValue, type PalaceInfo, type Phase, type Relation,
} from "@yaoflow/engine";
import { GUA, guaSlug, guaYangs } from "./gua";
import { RELATION_EN } from "./labels";

/**
 * 本卦 → 之卦 programmatic pages (总方案 §6 复利 / §14 ⑨): every ordered pair of
 * hexagrams is one cast — the lines that differ are the moving lines — so
 * 64 × 64 = 4,096 pages, each describing a change the reader may actually
 * have thrown. Everything here is date-free: najia, 六亲, 世应, the relation of
 * each moving line to what it becomes, 六冲/六合. 旬空, 月破 and seasonal
 * strength need the day of the cast and are deliberately left off.
 */

/** Relations between a moving line and its change that do not depend on the calendar. */
export const STATIC_KINDS: readonly ChangeKind[] = ["huitou_sheng", "huitou_ke", "xie", "ke_chu", "jin", "tui", "bihe", "fuyin", "fanyin", "he", "mu"];

/** The six line values that turn `a` into `b`: 9 old yang / 6 old yin where the two figures differ. */
export function transitionValues(a: HexagramInfo, b: HexagramInfo): LineValue[] {
  const ya = guaYangs(a);
  const yb = guaYangs(b);
  return ya.map((y, i) => (y ? (yb[i] ? 7 : 9) : (yb[i] ? 6 : 8))) as LineValue[];
}

export interface TransitionLine {
  position: number;
  yang: boolean;
  changing: boolean;
  branch: Branch;
  phase: Phase;
  relation: Relation;
  isWorld: boolean;
  isResponse: boolean;
}

export interface TransitionChange {
  position: number;
  from: { branch: Branch; phase: Phase; relation: Relation };
  to: { branch: Branch; phase: Phase; relation: Relation };
  kinds: ChangeKind[];
}

export interface Transition {
  a: HexagramInfo;
  b: HexagramInfo;
  values: LineValue[];
  /** share-code style six digits, e.g. 787979 */
  code: string;
  /** moving positions, bottom-up, 1–6 */
  moving: number[];
  palace: PalaceInfo;
  lines: TransitionLine[];
  changes: TransitionChange[];
  shape: { primary: HexShape; changed: HexShape };
}

// any instant will do: the date layer is dropped before anything is read
const FIXED_INSTANT = Date.UTC(2026, 0, 1, 4);

export function transition(aNum: number, bNum: number): Transition | null {
  if (!Number.isInteger(aNum) || !Number.isInteger(bNum) || aNum < 1 || aNum > 64 || bNum < 1 || bNum > 64) return null;
  const a = GUA[aNum - 1]!;
  const b = GUA[bNum - 1]!;
  const values = transitionValues(a, b);
  const chart = fullChart({ values, utcMs: FIXED_INSTANT, tzOffsetMinutes: 0 });
  const lines: TransitionLine[] = chart.lines.map((l) => ({
    position: l.position, yang: l.polarity === "yang", changing: l.changing,
    branch: l.branch, phase: l.phase as Phase, relation: l.relation, isWorld: l.isWorld, isResponse: l.isResponse,
  }));
  const changes: TransitionChange[] = chart.changes.map((c) => ({
    position: c.position,
    from: { branch: c.from.branch, phase: c.from.phase, relation: c.from.relation },
    to: { branch: c.to.branch, phase: c.to.phase, relation: c.to.relation },
    kinds: c.kinds.filter((k) => STATIC_KINDS.includes(k)),
  }));
  return {
    a, b, values, code: values.join(""), moving: lines.filter((l) => l.changing).map((l) => l.position),
    palace: chart.palace, lines, changes, shape: chart.shape,
  };
}

export const transitionPath = (locale: string, a: HexagramInfo, b: HexagramInfo) => `/${locale}/gua/${guaSlug(a)}/to/${guaSlug(b)}`;

/** Resolve the `to` segment against the same slug rule as the hexagram pages. */
export function hexBySlug(slug: string): HexagramInfo | null {
  const n = Number(slug.split("-")[0]);
  if (!Number.isInteger(n) || n < 1 || n > 64) return null;
  const h = GUA[n - 1]!;
  return guaSlug(h) === slug ? h : null;
}

/* ---------------- English prose pieces (templates, no model) ---------------- */

const PH = (p: Phase) => PHASE_EN[p];
export const POS_EN = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5", "Line 6"] as const;
export const POS_WORD = ["first", "second", "third", "fourth", "fifth", "sixth"] as const;
export const COUNT_WORD = ["no", "one", "two", "three", "four", "five", "six"] as const;

/** Bottom-up yang flags of the changed figure. */
export function changedYangsOf(t: Transition): boolean[] {
  return t.lines.map((l) => (l.changing ? !l.yang : l.yang));
}

/** How the line relates to what it turns into — one clause per kind, date-free. */
export function kindSentence(k: ChangeKind, c: TransitionChange): string {
  const a = PH(c.from.phase);
  const b = PH(c.to.phase);
  switch (k) {
    case "huitou_sheng": return `it is fed back by what it becomes (${b} feeds ${a}) — the line comes out of the change stronger`;
    case "huitou_ke": return `it is overcome by what it becomes (${b} overcomes ${a}) — the change works against the line`;
    case "xie": return `it drains into what it becomes (${a} feeds ${b}) — the line spends its strength on the change`;
    case "ke_chu": return `it wears itself out overcoming what it becomes (${a} overcomes ${b}) — effort with little return`;
    case "jin": return `it advances (same phase, the branch steps forward: ${c.from.branch} → ${c.to.branch}) — the line grows stronger through the change`;
    case "tui": return `it retreats (same phase, the branch steps back: ${c.from.branch} → ${c.to.branch}) — the line loses momentum`;
    case "bihe": return "it changes into its own phase — level, neither helped nor hurt";
    case "fuyin": return `it changes into the same branch (伏吟, ${c.from.branch} → ${c.to.branch}) — motion without movement; things stay where they are`;
    case "fanyin": return `it changes into its clashing branch (反吟, ${c.from.branch} ↔ ${c.to.branch}) — reversal; what turns, turns back`;
    case "he": return `it combines with what it becomes (六合, ${c.from.branch} + ${c.to.branch}) — entanglement, or a deal that holds`;
    case "mu": return `it enters its tomb (${c.to.branch} is the ${a} tomb) — the line gets bogged down`;
    default: return "";
  }
}

/** "Wealth (丑 earth) → Officer (寅 wood)" */
export function changeHeadline(c: TransitionChange): string {
  return `${RELATION_EN[c.from.relation]} · ${c.from.branch} ${PH(c.from.phase)} → ${RELATION_EN[c.to.relation]} · ${c.to.branch} ${PH(c.to.phase)}`;
}

/** One sentence per moving line: relation shift + the kinds, joined. */
export function changeSentence(c: TransitionChange): string {
  const shift = c.from.relation === c.to.relation
    ? `stays ${RELATION_EN[c.from.relation]}`
    : `turns from ${RELATION_EN[c.from.relation]} into ${RELATION_EN[c.to.relation]}`;
  const kinds = c.kinds.map((k) => kindSentence(k, c)).filter(Boolean);
  return `${POS_EN[c.position - 1]} ${shift}; ${kinds.length ? kinds.join("; ") : "a plain change of phase"}.`;
}

/** "line 4" · "lines 1, 2 and 5" · "all six lines" · "no line" */
export function movingLabel(t: Transition): string {
  const m = t.moving;
  if (m.length === 0) return "no line";
  if (m.length === 6) return "all six lines";
  if (m.length === 1) return `line ${m[0]}`;
  return `lines ${m.slice(0, -1).join(", ")} and ${m[m.length - 1]}`;
}

export type RuleKey = "none" | "one" | "two" | "three" | "four" | "five" | "six";

export interface ReadingRule {
  key: RuleKey;
  /** the rule from 朱熹《易学启蒙·考变占》 in plain English */
  rule: string;
  /** which texts to weigh, as (label, text) pairs in reading order */
  weigh: { label: string; text: string; note?: string }[];
}

const listPositions = (ps: number[]) => ps.length <= 1 ? `line ${ps[0]}` : `lines ${ps.slice(0, -1).join(", ")} and ${ps[ps.length - 1]}`;

/** Zhu Xi's rule for how many lines move, with the texts that rule points to. */
export function readingRule(t: Transition): ReadingRule {
  const ta = textsFor(t.a.number);
  const tb = textsFor(t.b.number);
  const n = t.moving.length;
  if (n === 0) return {
    key: "none",
    rule: "With no line moving, the Judgment of the hexagram is the answer; the lower trigram is the situation as it stands, the upper trigram where it tends.",
    weigh: [{ label: `The Judgment of ${t.a.en}`, text: ta.en.judgment }],
  };
  if (n === 1) return {
    key: "one",
    rule: `With one line moving, that line's text is the answer: read ${POS_EN[t.moving[0]! - 1]} of ${t.a.en}. The hexagram it becomes, ${t.b.en}, shows where the matter is heading.`,
    weigh: [{ label: `${POS_EN[t.moving[0]! - 1]} of ${t.a.en}`, text: ta.en.lines[t.moving[0]! - 1]! }],
  };
  if (n === 2) return {
    key: "two",
    rule: `With two lines moving, read both line texts of ${t.a.en}; the upper one (${POS_EN[t.moving[1]! - 1]}) governs.`,
    weigh: t.moving.slice().reverse().map((p, i) => ({ label: `${POS_EN[p - 1]} of ${t.a.en}`, text: ta.en.lines[p - 1]!, note: i === 0 ? "governs" : undefined })),
  };
  if (n === 3) return {
    key: "three",
    rule: `With three lines moving, read the Judgments of both hexagrams: ${t.a.en} is the situation, ${t.b.en} the outcome — and the primary hexagram carries more weight.`,
    weigh: [
      { label: `The Judgment of ${t.a.en}`, text: ta.en.judgment, note: "the situation" },
      { label: `The Judgment of ${t.b.en}`, text: tb.en.judgment, note: "the outcome" },
    ],
  };
  const still = t.lines.filter((l) => !l.changing).map((l) => l.position);
  if (n === 4) return {
    key: "four",
    rule: `With four lines moving, turn to the hexagram it becomes: read the two lines of ${t.b.en} that did not move (${listPositions(still)}); the lower one (${POS_EN[still[0]! - 1]}) governs.`,
    weigh: still.map((p, i) => ({ label: `${POS_EN[p - 1]} of ${t.b.en}`, text: tb.en.lines[p - 1]!, note: i === 0 ? "governs" : undefined })),
  };
  if (n === 5) return {
    key: "five",
    rule: `With five lines moving, read the one line of ${t.b.en} that did not move: ${POS_EN[still[0]! - 1]}.`,
    weigh: [{ label: `${POS_EN[still[0]! - 1]} of ${t.b.en}`, text: tb.en.lines[still[0]! - 1]! }],
  };
  // six moving
  if (t.a.number === 1 || t.a.number === 2) return {
    key: "six",
    rule: `With all six lines moving in ${t.a.en}, the special text for "all ${t.a.number === 1 ? "nines" : "sixes"}" is the answer.`,
    weigh: [{ label: t.a.number === 1 ? "All nines (用九)" : "All sixes (用六)", text: ta.en.extra ?? "" }],
  };
  return {
    key: "six",
    rule: `With all six lines moving, the situation has turned over completely: read the Judgment of the hexagram it becomes, ${t.b.en}.`,
    weigh: [{ label: `The Judgment of ${t.b.en}`, text: tb.en.judgment }],
  };
}

/** 世应 relation for a still chart, date-free. */
export function worldResponseNote(t: Transition): string {
  const w = t.lines[t.palace.world - 1]!;
  const r = t.lines[t.palace.response - 1]!;
  const rel = (() => {
    if (w.phase === r.phase) return "the same phase — the two sides stand level";
    const gen: Record<Phase, Phase> = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };
    const ovc: Record<Phase, Phase> = { wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood" };
    if (gen[r.phase] === w.phase) return "the Other line feeds the Self line — the other side, or the circumstances, help you";
    if (gen[w.phase] === r.phase) return "the Self line feeds the Other line — you give more than you get";
    if (ovc[r.phase] === w.phase) return "the Other line overcomes the Self line — pressure comes from the other side";
    if (ovc[w.phase] === r.phase) return "the Self line overcomes the Other line — you hold the upper hand";
    return "";
  })();
  return `The Self line (you) is ${POS_EN[w.position - 1]}, ${RELATION_EN[w.relation]} · ${w.branch} ${PH(w.phase)}; the Other line (the other side) is ${POS_EN[r.position - 1]}, ${RELATION_EN[r.relation]} · ${r.branch} ${PH(r.phase)}: ${rel}.`;
}

const CATEGORY_EN: Record<PalaceInfo["category"], string> = {
  pure: "the palace's own hexagram", one: "first generation", two: "second generation", three: "third generation",
  four: "fourth generation", five: "fifth generation", youhun: "the wandering-soul hexagram", guihun: "the returning-soul hexagram",
};

export function palaceNote(t: Transition): string {
  const tr = TRIGRAMS[t.palace.palace];
  return `${t.a.en} belongs to the ${tr.pinyin} (${tr.natureEn}) palace, whose phase is ${PH(t.palace.palacePhase)}, as ${CATEGORY_EN[t.palace.category]} — so the Self line sits at ${POS_EN[t.palace.world - 1]} and the Other line at ${POS_EN[t.palace.response - 1]}.`;
}

export function shapeNote(shape: HexShape, name: string): string | null {
  if (shape === "liuchong") return `${name} is a six-clash figure (六冲): every pair of lines clashes — matters here resolve quickly or fall apart quickly, rarely linger.`;
  if (shape === "liuhe") return `${name} is a six-combination figure (六合): every pair of lines combines — matters here bind and hold, for better or worse.`;
  return null;
}

/** Bottom-up list of the six single-line changes of a hexagram — the most-asked pages. */
export function singleLineChanges(a: HexagramInfo): { position: number; b: HexagramInfo }[] {
  const ya = guaYangs(a);
  return ya.map((_, i) => {
    const flipped = ya.map((y, j) => (j === i ? !y : y));
    const b = GUA.find((h) => guaYangs(h).every((y, j) => y === flipped[j]))!;
    return { position: i + 1, b };
  });
}

/** Every change from `a`, grouped by how many lines move (1…6), then by target number. */
export function changesFrom(a: HexagramInfo): { count: number; items: { b: HexagramInfo; moving: number[] }[] }[] {
  const groups = new Map<number, { b: HexagramInfo; moving: number[] }[]>();
  for (const b of GUA) {
    if (b.number === a.number) continue;
    const v = transitionValues(a, b);
    const moving = v.map((x, i) => (x === 6 || x === 9 ? i + 1 : 0)).filter(Boolean);
    const g = groups.get(moving.length) ?? [];
    g.push({ b, moving });
    groups.set(moving.length, g);
  }
  return [...groups.entries()].sort((x, y) => x[0] - y[0]).map(([count, items]) => ({ count, items: items.sort((x, y) => x.b.number - y.b.number) }));
}
