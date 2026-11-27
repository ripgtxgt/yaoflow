import QUIZ from "@/data/bmg/quiz.zh-hant.json";
import HEX from "@/data/bmg/hexagrams.zh-hant.json";

/**
 * 11-05 进度表 136 本命卦小测 (Neil 11-05；《易学人格学×YaoFlow-护城河与落地-1104.md》P1；文案：推广 T-015，Neil 确认).
 * Six lines = six dimensions (yang = the first named): 初 J/P · 二 T/F · 三 N/S (下卦，本来的你) · 四 I/E · 五 自我激励/自我觉察 ·
 * 上 社交/同理 (上卦，现在的你). Lines are bottom-up, 1 = yang. Pure functions — client-safe (the quiz page scores in the
 * browser for the animation; the server scores again before it stores anything).
 *
 * Under pressure the lower trigram changes one line at a time: line 3, then 1, then 2 (「緊一點／壓力大／撐不住」).
 */
export type Lines = [number, number, number, number, number, number];
export type Answer = "A" | "B";

export interface BmgHex {
  kw: number; name: string; short: string; lower: string; upper: string; lines: number[]; type4: string;
  line5: string; line6: string; title: string; oneLine: string; strength: string; stuck: string; tryThis: string;
  stress: { tense: number; pressure: number; breaking: number };
}
export interface BmgQuestion { n: number; line: number; text: string; A: string; B: string }
export interface BmgDim { line: number; label: string; yang: { name: string; text: string }; yin: { name: string; text: string } }

export const QUESTIONS = QUIZ.questions as BmgQuestion[];
export const DIMS = QUIZ.dims as BmgDim[];
export const QUICK_QUESTIONS = QUIZ.quick.questions as number[]; // 9 (五爻), 11 (上爻)
export const HEXES = HEX.hexagrams as BmgHex[];

const BY_KEY = new Map(HEXES.map((h) => [h.lines.join(""), h]));
const BY_KW = new Map(HEXES.map((h) => [h.kw, h]));
export const hexByLines = (l: readonly number[]): BmgHex => BY_KEY.get(l.join(""))!;
export const hexByKw = (kw: number): BmgHex | null => BY_KW.get(kw) ?? null;
export const linesKey = (l: readonly number[]) => l.join("");
export const isLinesKey = (s: unknown): s is string => typeof s === "string" && /^[01]{6}$/.test(s);
export const linesOf = (key: string): Lines => key.split("").map(Number) as Lines;

/** the 16 four-letter types, standard order of letters (E/I, S/N, T/F, J/P) */
export const TYPE4_RE = /^[EI][SN][TF][JP]$/;
export const isType4 = (s: unknown): s is string => typeof s === "string" && TYPE4_RE.test(s.toUpperCase());

/** the 16, in a fixed order (进度表 139 pages) */
export const BMG_TYPES = ["E", "I"].flatMap((a) => ["S", "N"].flatMap((b) => ["T", "F"].flatMap((c) => ["J", "P"].map((d) => `${a}${b}${c}${d}`))));
/** the four hexagrams a four-letter type can be (lines 5 and 6 decide) */
export const hexesOfType4 = (t: string): BmgHex[] => {
  const l = type4Lines(t);
  return [[1, 1], [1, 0], [0, 1], [0, 0]].map(([a, b]) => hexByLines([...l, a!, b!]));
};

/** four letters → lines 1–4 (J=1, T=1, N=1, I=1) */
export function type4Lines(t: string): [number, number, number, number] {
  const u = t.toUpperCase();
  return [u[3] === "J" ? 1 : 0, u[2] === "T" ? 1 : 0, u[1] === "N" ? 1 : 0, u[0] === "I" ? 1 : 0];
}
/** lines 1–4 → the four letters */
export const linesType4 = (l: readonly number[]) => `${l[3] ? "I" : "E"}${l[2] ? "N" : "S"}${l[1] ? "T" : "F"}${l[0] ? "J" : "P"}`;

export interface Scored { lines: Lines; ties: number[] }

/**
 * The full quiz: twelve answers, keyed by question number. Two per line; when they split, lines 1–3 follow the first
 * question and 4–6 the second (决胜规则), and the line is listed in `ties` (the page adds 「這一點你兩邊都有，看情況用」).
 */
export function scoreFull(answers: Record<number, Answer>): Scored | null {
  const lines: number[] = [];
  const ties: number[] = [];
  for (let line = 1; line <= 6; line++) {
    const qs = QUESTIONS.filter((q) => q.line === line).sort((a, b) => a.n - b.n);
    const a = answers[qs[0]!.n], b = answers[qs[1]!.n];
    if (a !== "A" && a !== "B") return null;
    if (b !== "A" && b !== "B") return null;
    if (a === b) lines.push(a === "A" ? 1 : 0);
    else { ties.push(line); lines.push((line <= 3 ? a : b) === "A" ? 1 : 0); }
  }
  return { lines: lines as Lines, ties };
}

/** The quick version: four letters plus questions 9 and 11. */
export function scoreQuick(type4: string, a5: Answer, a6: Answer): Scored | null {
  if (!isType4(type4) || (a5 !== "A" && a5 !== "B") || (a6 !== "A" && a6 !== "B")) return null;
  return { lines: [...type4Lines(type4), a5 === "A" ? 1 : 0, a6 === "A" ? 1 : 0] as Lines, ties: [] };
}

/** 緊一點 → 壓力大 → 撐不住: line 3, then 1, then 2 of the lower trigram turn over, one after another */
export function stressChain(l: readonly number[]): [BmgHex, BmgHex, BmgHex] {
  const x = [...l];
  const out: BmgHex[] = [];
  for (const i of [2, 0, 1]) { x[i] = x[i] ? 0 : 1; out.push(hexByLines(x)); }
  return out as [BmgHex, BmgHex, BmgHex];
}

/** one line of the result per dimension */
export function dimLines(l: readonly number[], ties: readonly number[] = []) {
  return DIMS.map((d) => {
    const side = l[d.line - 1] ? d.yang : d.yin;
    return { line: d.line, label: d.label, name: side.name, text: side.text, both: ties.includes(d.line) };
  });
}

export const RESULT_COPY = {
  open: (full: string) => `這是你的本命卦：${full}。它不是在說你一定是什麼樣的人，而是幫你看清自己習慣怎麼做事、怎麼和人相處。`,
  lower: "本來的你", lowerNote: "比較不容易變，是你遇事時的第一反應。",
  upper: "現在的你", upperNote: "是你這些年練出來的方式，可以調。",
  both: "這一點你兩邊都有，看情況用。",
  stress: (me: string, to: string, one: string) => `壓力大的時候，你容易從${me}變成${to}：${one}知道這一點，壓力來的時候就比較認得出自己。`,
  tryTitle: "如果想試試不一樣的",
  cta: "你最近最放不下的是哪件事？帶著你的本命卦問一卦。", ctaBtn: "問一件事",
  shareFoot: "我的本命卦 · yaoflow.com",
  footer: "本命卦參考易學與人格類型理論，是看自己的一個角度，不是測驗或診斷。",
  quickNote: "四個字母取自常見的 16 型人格分類；本命卦另外多看兩件事：你怎麼推動自己、你怎麼和人相處。",
  quickAsk: "你的四個字母是？", quickFallback: "不知道的話，做完整版（12 題，約 2 分鐘）",
  guess: (t: string) => `你大概是 ${t}`,
};
