import DATA from "@/data/mingli/bazi.json";
import EN from "@/data/l10n/bazilib/en.json";
import JA from "@/data/l10n/bazilib/ja.json";
import KO from "@/data/l10n/bazilib/ko.json";
import FR from "@/data/l10n/bazilib/fr.json";
import DE from "@/data/l10n/bazilib/de.json";
import ES from "@/data/l10n/bazilib/es.json";
import PT from "@/data/l10n/bazilib/pt.json";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { foreignTree, isForeign, type Generated } from "@/lib/l10n/core";

/** 10-18 进度表 72 八字: the words (data/mingli/bazi.json, drafted by 开发 from 推广's brief) and the 日柱 page slugs */
export interface Rizhu { pillar: string; title: string; plain: string; love: string; work: string; watch: string; ask_next: string }
export interface BaziContent {
  stems: Record<string, { plain: string }>;
  gods: Record<string, { plain: string; in_month: string; in_hour: string }>;
  strength: Record<string, { plain: string; tips: string }>;
  elements: Record<string, { plain: string }>;
  dayun: Record<string, string>;
  liunian: Record<string, { plain: string; ask_next: string }>;
  nayin: Record<string, string>;
  howto: string; intro: string; faq: { q: string; a: string }[];
  rizhu: Record<string, Rizhu>;
}
export const B = DATA as unknown as BaziContent;

/**
 * 10-30 进度表 128 ④: the library in the seven other languages (scripts/l10n/translate.ts bazilib → data/l10n/bazilib/,
 * one file per language). The translator sees the words only — a 日柱 entry without its `pillar` key.
 * Client-safe (no OpenCC): the 简体 page converts with locDeep / loc as before.
 */
type RizhuWords = Omit<Rizhu, "pillar">;
export const BAZI_LIB_HANT = {
  ...B,
  rizhu: Object.fromEntries(Object.entries(B.rizhu).map(([k, v]) => [k, { title: v.title, plain: v.plain, love: v.love, work: v.work, watch: v.watch, ask_next: v.ask_next } as RizhuWords])),
};
const GEN: Generated = { en: EN, ja: JA, ko: KO, fr: FR, de: DE, es: ES, pt: PT };
const memo = new Map<string, BaziContent>();
/** the whole library in a language: 繁體 as written, a foreign one translated (简体 stays with locDeep) */
export function bIn(l: string): BaziContent {
  if (!isForeign(l)) return B;
  const hit = memo.get(l);
  if (hit) return hit;
  const t = foreignTree(BAZI_LIB_HANT, GEN, l) as unknown as BaziContent;
  const out = { ...t, rizhu: Object.fromEntries(Object.entries(t.rizhu).map(([k, v]) => [k, { ...v, pillar: k }])) };
  memo.set(l, out);
  return out;
}

const STEM_PY: Record<string, string> = { 甲: "jia", 乙: "yi", 丙: "bing", 丁: "ding", 戊: "wu", 己: "ji", 庚: "geng", 辛: "xin", 壬: "ren", 癸: "gui" };
const BRANCH_PY: Record<string, string> = { 子: "zi", 丑: "chou", 寅: "yin", 卯: "mao", 辰: "chen", 巳: "si", 午: "wu", 未: "wei", 申: "shen", 酉: "you", 戌: "xu", 亥: "hai" };
export const pillarSlug = (gz: string) => `${STEM_PY[gz[0]!]}-${BRANCH_PY[gz[1]!]}`;
export function pillarOfSlug(slug: string): string | null {
  const [a, b] = slug.split("-");
  const s = Object.entries(STEM_PY).find(([, v]) => v === a)?.[0], br = Object.entries(BRANCH_PY).find(([, v]) => v === b)?.[0];
  return s && br && B.rizhu[s + br] ? s + br : null;
}
export const PILLARS = Object.keys(B.rizhu);

/** deep copy of any piece in the reader's script */
export function locDeep<T>(x: T, l: HlLocale): T {
  if (l !== "zh") return x;
  if (typeof x === "string") return loc(x, l) as T;
  if (Array.isArray(x)) return x.map((v) => locDeep(v, l)) as T;
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, locDeep(v, l)])) as T;
  return x;
}

export interface BaziAsk { day: string; stem: string; level: string; favour: string[]; decade?: string; years: string[]; nayin: string[]; gods: string[] }
/** only what one chart needs (10-30: in any language) */
export function baziText(a: BaziAsk, l: HlLocale | string) {
  const D = bIn(l);
  const pick = <V,>(rec: Record<string, V>, keys: string[]) => Object.fromEntries(keys.filter((k) => rec[k] !== undefined).map((k) => [k, rec[k]!]));
  const out = {
    rizhu: D.rizhu[a.day] ?? null,
    stem: D.stems[a.day[0]!] ?? null,
    strength: D.strength[a.level] ?? null,
    elements: pick(D.elements, a.favour),
    dayun: a.decade ? D.dayun[a.decade] ?? null : null,
    liunian: pick(D.liunian, a.years),
    nayin: pick(D.nayin, a.nayin),
    gods: pick(D.gods, a.gods),
    howto: D.howto,
  };
  return isForeign(l) ? out : locDeep(out, l as HlLocale);
}
