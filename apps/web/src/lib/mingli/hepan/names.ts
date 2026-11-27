import type { Foreign } from "@/lib/l10n/core";
import { bzNameOf, type BaziNames } from "@/lib/mingli/bazi/names-fmt";
import { zwNameOf, type ZiweiNames } from "@/lib/mingli/ziwei/names-fmt";
import { ASPECTS, PLANETS, SIGNS } from "@/lib/mingli/astro/chart";

/**
 * 10-30 进度表 128 ④ — the names a 合盤 page in another language needs (client-safe, no data): the 八字 and 紫微 names of
 * that language (lib/mingli/bazi/names.ts, lib/mingli/ziwei/names.ts), the Western signs, planets and aspects
 * (lib/mingli/astro/names.ts), the Ascendant and the four Western elements. The server page hands one language's
 * names to the free overview (lib/mingli/hepan/names-data.ts); the report's facts are named with the same helpers.
 */
export interface HepanNames {
  l: Foreign;
  bz: BaziNames; zw: ZiweiNames;
  signs: string[]; planets: string[]; aspects: string[];
  /** 上升 */
  asc: string;
  /** the Western elements 火 土 風 水 */
  astroEl: string[];
}

const ASTRO_EL = ["火", "土", "風", "水"];
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const STAR_STRENGTH: Record<string, "鲜明" | "适中" | "隐约" | "不见"> = { 鮮明: "鲜明", 鲜明: "鲜明", 適中: "适中", 适中: "适中", 隱約: "隐约", 隐约: "隐约", 不見: "不见", 不见: "不见" };
/** the four 紫微 star groups, named by their stars (Latin languages say them in pinyin) */
const GROUP_STARS: Record<string, string[]> = { 紫府: ["紫微", "天府"], 殺破狼: ["七殺", "破軍", "貪狼"], 機月同梁: ["天機", "太陰", "天同", "天梁"], 巨日: ["巨門", "太陽"] };

export function hpNameOf(N: HepanNames) {
  const B = bzNameOf(N.bz), Z = zwNameOf(N.zw, N.bz, N.l);
  const sign = (s: string): string => { const i = (SIGNS as readonly string[]).indexOf(s); return i >= 0 ? N.signs[i]! : s; };
  const planet = (p: string): string => { if (p === "上升") return N.asc; const i = (PLANETS as readonly string[]).indexOf(p); return i >= 0 ? N.planets[i]! : p; };
  const aspect = (a: string): string => { const i = ASPECTS.findIndex((x) => x.name === a); return i >= 0 ? N.aspects[i]! : a; };
  const astroEl = (e: string): string => N.astroEl[ASTRO_EL.indexOf(e)] ?? e;
  /** a 生肖 by its branch, or by the animal's own character (鼠, 龍…) */
  const animal = (x: string): string => {
    const i = BRANCHES.indexOf(x);
    if (i >= 0) return N.bz.animals[i]!;
    const j = "鼠牛虎兔龍蛇馬羊猴雞狗豬".indexOf(x);
    return j >= 0 ? N.bz.animals[j]! : x;
  };
  const starStrength = (s: string): string => { const k = STAR_STRENGTH[s]; return k ? N.bz.starStrength[k] : s; };
  /** a 紫微 star group: Zi Fu = Zi Wei + Tian Fu… (Japanese and Korean keep the stars' own short names) */
  const group = (g: string): string => (GROUP_STARS[g] ? GROUP_STARS[g]!.map(Z.star).join(N.l === "ja" ? "・" : N.l === "ko" ? "·" : "–") : g);
  return { N, l: N.l, B, Z, sign, planet, aspect, astroEl, animal, starStrength, group };
}
export type HpName = ReturnType<typeof hpNameOf>;
