import DATA from "@/data/mingli/xingpan.json";
import EN from "@/data/l10n/xingpan/en.json";
import JA from "@/data/l10n/xingpan/ja.json";
import KO from "@/data/l10n/xingpan/ko.json";
import FR from "@/data/l10n/xingpan/fr.json";
import DE from "@/data/l10n/xingpan/de.json";
import ES from "@/data/l10n/xingpan/es.json";
import PT from "@/data/l10n/xingpan/pt.json";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { locDeep } from "@/lib/mingli/bazi/content";
import { isForeign, type Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";

/** 10-18 进度表 74 星盤: the words (data/mingli/xingpan.json) and the content-page slugs */
export interface PlanetSign { planet: string; sign: string; title: string; plain: string; love: string; work: string; watch: string }
export interface XContent {
  rising: Record<string, { plain: string; faq: { q: string; a: string }[] }>;
  aspects: Record<string, string>; node: Record<string, string>; planets: Record<string, string>;
  intro: string; faq: { q: string; a: string }[];
  ps: Record<string, PlanetSign>; ph: Record<string, string>;
}
export const X = DATA as unknown as XContent;

/**
 * 10-30 进度表 128 ④: the library in the seven other languages (scripts/l10n/translate.ts xingpan → data/l10n/xingpan/,
 * one file per language). The translator sees the words only — a planet-in-sign entry without its planet and sign keys.
 */
type PsWords = Omit<PlanetSign, "planet" | "sign">;
export const XINGPAN_HANT = {
  ...X,
  ps: Object.fromEntries(Object.entries(X.ps).map(([k, v]) => [k, { title: v.title, plain: v.plain, love: v.love, work: v.work, watch: v.watch } as PsWords])),
};
const GEN: Generated = { en: EN, ja: JA, ko: KO, fr: FR, de: DE, es: ES, pt: PT };
/** the whole library in a language: 繁體 as written, a foreign one translated (简体 stays with locDeep) */
export function xIn(l: string): XContent {
  if (!isForeign(l)) return X;
  const t = localize(XINGPAN_HANT, GEN, l) as unknown as XContent;
  return { ...t, ps: Object.fromEntries(Object.entries(t.ps).map(([k, v]) => [k, { ...v, planet: X.ps[k]!.planet, sign: X.ps[k]!.sign }])) };
}

export const PLANET_SLUG: Record<string, string> = { 太陽: "sun", 月亮: "moon", 水星: "mercury", 金星: "venus", 火星: "mars", 木星: "jupiter", 土星: "saturn", 天王星: "uranus", 海王星: "neptune", 冥王星: "pluto" };
export const SIGN_SLUG: Record<string, string> = { 牡羊: "aries", 金牛: "taurus", 雙子: "gemini", 巨蟹: "cancer", 獅子: "leo", 處女: "virgo", 天秤: "libra", 天蠍: "scorpio", 射手: "sagittarius", 摩羯: "capricorn", 水瓶: "aquarius", 雙魚: "pisces" };
const inv = (r: Record<string, string>, v: string) => Object.entries(r).find(([, x]) => x === v)?.[0] ?? null;
export const planetOfSlug = (s: string) => inv(PLANET_SLUG, s);
export const signOfSlug = (s: string) => inv(SIGN_SLUG, s);

export interface AstroAsk { ps: [string, string][]; ph: [string, number][]; rising?: string; aspects: [string, string, string][]; node?: string }
export function astroText(a: AstroAsk, l: HlLocale | string) {
  const D = xIn(l);
  const asp: Record<string, string> = {};
  for (const [p, q, n] of a.aspects) { const k1 = `${p}-${q}|${n}`, k2 = `${q}-${p}|${n}`; const v = D.aspects[k1] ?? D.aspects[k2]; if (v) asp[`${p}-${q}|${n}`] = v; }
  const out = {
    ps: Object.fromEntries(a.ps.map(([p, s]) => [`${p}|${s}`, D.ps[`${p}|${s}`] ?? null]).filter(([, v]) => v)),
    ph: Object.fromEntries(a.ph.map(([p, h]) => [`${p}|${h}`, D.ph[`${p}|${h}`] ?? null]).filter(([, v]) => v)),
    rising: a.rising ? D.rising[a.rising]?.plain ?? null : null,
    aspects: asp,
    node: a.node ? D.node[a.node] ?? null : null,
  };
  return isForeign(l) ? out : locDeep(out, l as HlLocale);
}
