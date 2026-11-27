import DATA from "@/data/mingli/ziwei.json";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { locDeep } from "@/lib/mingli/bazi/content";
import EN from "@/data/l10n/ziweilib/en.json";
import JA from "@/data/l10n/ziweilib/ja.json";
import KO from "@/data/l10n/ziweilib/ko.json";
import FR from "@/data/l10n/ziweilib/fr.json";
import DE from "@/data/l10n/ziweilib/de.json";
import ES from "@/data/l10n/ziweilib/es.json";
import PT from "@/data/l10n/ziweilib/pt.json";
import { foreignTree, isForeign, type Generated } from "@/lib/l10n/core";

/** 10-18 进度表 71 紫微: the words (data/mingli/ziwei.json) and the 主星 page slugs */
export interface StarPalace { star: string; palace: string; title: string; plain: string; strength: string; watch: string; ask_next: string }
export interface ZiweiContent {
  empty: Record<string, string>;
  overview: Record<string, { intro: string; personality: string; love: string; work: string }>;
  mutagen: Record<string, { plain: string; palaces: Record<string, string> }>;
  minor: Record<string, string>;
  yearly: Record<string, { plain: string; ask_next: string }>;
  monthly: Record<string, string>;
  intro: string; faq: { q: string; a: string }[];
  pairs: Record<string, StarPalace>;
}
export const Z = DATA as unknown as ZiweiContent;

/**
 * 10-30 进度表 128 ④: the library in the seven other languages (scripts/l10n/translate.ts ziweilib → data/l10n/ziweilib/,
 * one file per language). The translator sees the words only — a pair without its `star` and `palace` keys.
 * Client-safe (no OpenCC): the 简体 page converts with locDeep / loc as before.
 */
type PairWords = Omit<StarPalace, "star" | "palace">;
export const ZIWEI_LIB_HANT = {
  ...Z,
  pairs: Object.fromEntries(Object.entries(Z.pairs).map(([k, v]) => [k, { title: v.title, plain: v.plain, strength: v.strength, watch: v.watch, ask_next: v.ask_next } as PairWords])),
};
const GEN: Generated = { en: EN, ja: JA, ko: KO, fr: FR, de: DE, es: ES, pt: PT };
const memo = new Map<string, ZiweiContent>();
/** the whole library in a language: 繁體 as written, a foreign one translated (简体 stays with locDeep) */
export function zIn(l: string): ZiweiContent {
  if (!isForeign(l)) return Z;
  const hit = memo.get(l);
  if (hit) return hit;
  const t = foreignTree(ZIWEI_LIB_HANT, GEN, l) as unknown as ZiweiContent;
  const out = { ...t, pairs: Object.fromEntries(Object.entries(t.pairs).map(([k, v]) => { const [star, palace] = k.split("|"); return [k, { ...v, star: star!, palace: palace! }]; })) };
  memo.set(l, out);
  return out;
}

export const STAR_SLUG: Record<string, string> = {
  紫微: "zi-wei", 天機: "tian-ji", 太陽: "tai-yang", 武曲: "wu-qu", 天同: "tian-tong", 廉貞: "lian-zhen", 天府: "tian-fu",
  太陰: "tai-yin", 貪狼: "tan-lang", 巨門: "ju-men", 天相: "tian-xiang", 天梁: "tian-liang", 七殺: "qi-sha", 破軍: "po-jun",
};
export const PALACE_SLUG: Record<string, string> = {
  命宮: "ming", 兄弟: "xiong-di", 夫妻: "fu-qi", 子女: "zi-nv", 財帛: "cai-bo", 疾厄: "ji-e", 遷移: "qian-yi", 交友: "jiao-you", 官祿: "guan-lu", 田宅: "tian-zhai", 福德: "fu-de", 父母: "fu-mu",
};
export const starOfSlug = (s: string) => Object.entries(STAR_SLUG).find(([, v]) => v === s)?.[0] ?? null;
export const palaceOfSlug = (s: string) => Object.entries(PALACE_SLUG).find(([, v]) => v === s)?.[0] ?? null;

export interface ZiweiAsk { pairs: [string, string][]; empty: string[]; mutagen: [string, string][]; minor: string[]; yearly?: string; monthly?: string }
/** only what one chart needs (10-30: in any language) */
export function ziweiText(a: ZiweiAsk, l: HlLocale | string) {
  const D = zIn(l);
  const out = {
    pairs: Object.fromEntries(a.pairs.map(([s, p]) => [`${s}|${p}`, D.pairs[`${s}|${p}`] ?? null]).filter(([, v]) => v)),
    empty: Object.fromEntries(a.empty.filter((p) => D.empty[p]).map((p) => [p, D.empty[p]!])),
    mutagen: Object.fromEntries(a.mutagen.filter(([m]) => D.mutagen[m]).map(([m, p]) => [`${m}|${p}`, { plain: D.mutagen[m]!.plain, palace: D.mutagen[m]!.palaces[p] ?? "" }])),
    minor: Object.fromEntries(a.minor.filter((s) => D.minor[s]).map((s) => [s, D.minor[s]!])),
    yearly: a.yearly ? D.yearly[a.yearly] ?? null : null,
    monthly: a.monthly ? D.monthly[a.monthly] ?? null : null,
  };
  return isForeign(l) ? out : locDeep(out, l as HlLocale);
}
