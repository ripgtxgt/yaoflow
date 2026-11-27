import type { BirthInput, Gender, Normalized } from "@/lib/mingli/birth/normalize";
import { normalizeBirth } from "@/lib/mingli/birth/normalize";
import { astrolabeOf, isMajor, layerOf, opposite, viewOf, type ZiweiView, type ZPalace, type ZStar } from "./chart";
import { gejuOf, type GejuHit } from "./geju";

/**
 * 10-19 紫微「看懂這張盤」 — the facts under the summary card, the 宮干四化 (飛化／自化), this 大限 and this year's
 * 流年命宮, the neighbouring-時辰 comparison and the share-card query. Fixed rules on iztro's chart; runs in the browser.
 * Works on the zh-TW view (the keys); the page swaps in the reader's script.
 */
export const MUTS = ["祿", "權", "科", "忌"] as const;
/** 十干四化 (全書版, the same table iztro uses by default): 祿 權 科 忌 */
export const STEM_MUT: Record<string, [string, string, string, string]> = {
  甲: ["廉貞", "破軍", "武曲", "太陽"], 乙: ["天機", "天梁", "紫微", "太陰"], 丙: ["天同", "天機", "文昌", "廉貞"],
  丁: ["太陰", "天同", "天機", "巨門"], 戊: ["貪狼", "太陰", "右弼", "天機"], 己: ["武曲", "貪狼", "天梁", "文曲"],
  庚: ["太陽", "武曲", "太陰", "天同"], 辛: ["巨門", "太陽", "文曲", "文昌"], 壬: ["天梁", "紫微", "左輔", "武曲"],
  癸: ["破軍", "巨門", "太陰", "貪狼"],
};

const starsOf = (p: ZPalace) => [...p.major, ...p.minor];
const palaceAt = (v: ZiweiView, b: string) => v.palaces.find((p) => p.branch === b)!;
const whereIs = (v: ZiweiView, star: string) => v.palaces.find((p) => starsOf(p).some((s) => s.name === star)) ?? null;

export interface Fly { m: string; star: string; to: string | null; toName: string | null; self: boolean }
/** where a palace's 天干 sends 祿權科忌; self = the star sits in the same palace (自化) */
export function flyOf(v: ZiweiView, branch: string): Fly[] {
  const pal = palaceAt(v, branch);
  const t = STEM_MUT[pal.stem];
  if (!t) return [];
  return t.map((star, i) => {
    const to = whereIs(v, star);
    return { m: MUTS[i]!, star, to: to?.branch ?? null, toName: to?.name ?? null, self: to?.branch === branch };
  });
}
/** 自化 marks for every palace: branch → [{m, star}] */
export function selfMutOf(v: ZiweiView): Record<string, { m: string; star: string }[]> {
  return Object.fromEntries(v.palaces.map((p) => [p.branch, flyOf(v, p.branch).filter((f) => f.self).map((f) => ({ m: f.m, star: f.star }))]));
}

export interface PalaceStars { branch: string; name: string; stars: ZStar[]; borrowed: boolean }
/** a palace's main stars, or (empty palace) the ones across */
export function mainOf(v: ZiweiView, branch: string): PalaceStars {
  const p = palaceAt(v, branch);
  if (p.major.length) return { branch, name: p.name, stars: p.major, borrowed: false };
  return { branch, name: p.name, stars: palaceAt(v, opposite(branch)).major, borrowed: true };
}

export interface Summary {
  soul: PalaceStars; body: PalaceStars; sameBody: boolean;
  fiveClass: string; startAge: number; soulStar: string; bodyStar: string;
  natal: { m: string; star: string; branch: string; palace: string }[];
}
export function summaryOf(v: ZiweiView): Summary {
  const natal: Summary["natal"] = [];
  for (const m of MUTS) for (const p of v.palaces) for (const s of starsOf(p)) if (s.mut === m) natal.push({ m, star: s.name, branch: p.branch, palace: p.name });
  return {
    soul: mainOf(v, v.soulBranch), body: mainOf(v, v.bodyBranch), sameBody: v.soulBranch === v.bodyBranch,
    fiveClass: v.fiveClass, startAge: Math.min(...v.palaces.map((p) => p.decadal[0])), soulStar: v.soulStar, bodyStar: v.bodyStar, natal,
  };
}

type Astrolabe = ReturnType<typeof astrolabeOf>;
export interface Now {
  age: number;
  decadal: (PalaceStars & { range: [number, number] }) | null;
  yearly: (PalaceStars & { gz: string }) | null;
}
/** the 大限 being walked now (by 虛歲) and this year's 流年命宮 */
export function nowOf(a: Astrolabe, v: ZiweiView, when: Date): Now {
  let age = 0;
  try { age = a.horoscope(when).age.nominalAge; } catch { /* */ }
  const dp = v.palaces.find((p) => age >= p.decadal[0] && age <= p.decadal[1]);
  let yearly: Now["yearly"] = null;
  try { const ly = layerOf(a, when, "yearly"); yearly = { ...mainOf(v, ly.palaceBranch), gz: `${ly.stem}${ly.palaceBranch}` }; } catch { /* */ }
  return { age, decadal: dp ? { ...mainOf(v, dp.branch), range: dp.decadal } : null, yearly };
}

/** the chart's strongest 格局 and how many others */
export function topGeju(v: ZiweiView): { top: GejuHit | null; others: number; all: GejuHit[] } {
  const all = gejuOf(v);
  return { top: all[0] ?? null, others: Math.max(0, all.length - 1), all };
}

// ── neighbouring 時辰 ──
const ymd = (ms: number) => { const d = new Date(ms); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
const dayMs = (x: { y: number; m: number; d: number }) => Date.UTC(x.y, x.m - 1, x.d);
/**
 * The 時辰 before and after the one on the chart, as birth inputs (solar dates, so a lunar entry works too).
 * Exact time: the clock moves two hours (place, true solar time and DST handling stay as they are).
 * A chosen 時辰: one branch over; 早子 steps back to the day before's 亥, 亥 steps on to 晚子, 晚子 on to the next 丑.
 */
export function neighbourInputs(input: BirthInput, n: Normalized): { dir: -1 | 1; input: BirthInput }[] {
  if (!n.timeKnown) return [];
  const base = { ...input, calendar: "solar" as const, leap: false };
  if (input.timeMode === "exact" && n.clock) {
    const t0 = Date.UTC(n.clock.y, n.clock.m - 1, n.clock.d, n.clock.h, n.clock.mi);
    return ([-1, 1] as const).map((dir) => {
      const d = new Date(t0 + dir * 2 * 3_600_000);
      return { dir, input: { ...base, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() } };
    });
  }
  const b = input.branch ?? 0, D = dayMs(n.solarDate), DAY = 86_400_000;
  const slot = (ms: number, br: number): BirthInput => ({ ...base, ...ymd(ms), timeMode: "branch", branch: br });
  const prev = b === 0 ? slot(D - DAY, 11) : slot(D, b - 1);
  const next = b === 12 ? slot(D + DAY, 1) : slot(D, b + 1);
  return [{ dir: -1, input: prev }, { dir: 1, input: next }];
}

export interface CompareRow { hour: number; soul: PalaceStars; bodyName: string; fiveClass: string }
export function compareRow(input: BirthInput, gender: Gender, lang: "zh-TW" | "zh-CN" = "zh-TW"): CompareRow | null {
  try {
    const n = normalizeBirth(input);
    if (!n.timeKnown || n.hourBranch === null) return null;
    const v = viewOf(astrolabeOf(n, gender, lang));
    return { hour: n.hourBranch, soul: mainOf(v, v.soulBranch), bodyName: palaceAt(v, v.bodyBranch).name, fiveClass: v.fiveClass };
  } catch { return null; }
}

// ── share card ──
export const FIVE_CLASSES = ["水二局", "木三局", "金四局", "土五局", "火六局"] as const;
export const BRIGHTS = ["廟", "旺", "得", "利", "平", "不", "陷"] as const;
/** the card's query: 命宮 branch and stars (or the borrowed ones), 五行局, the top 格局 — no name, no birth date */
/** 10-30 进度表 128 ④: l may be any language the 紫微 is open in (the card is drawn in it) */
export function cardQuery(v: ZiweiView, top: GejuHit | null, l: string): string {
  const s = mainOf(v, v.soulBranch);
  const q = new URLSearchParams({
    b: v.soulBranch, m: s.stars.map((x) => x.name).filter(isMajor).join(","), br: s.stars.map((x) => x.bright ?? "").join(","),
    e: s.borrowed ? "1" : "0", f: v.fiveClass, l,
  });
  if (top) { q.set("g", top.id); q.set("s", top.status === "成" ? "a" : top.status === "半成" ? "b" : "c"); }
  return q.toString();
}
