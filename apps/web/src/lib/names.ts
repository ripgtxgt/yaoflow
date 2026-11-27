import type { HexagramInfo, HexTexts, Relation, Spirit } from "@yaoflow/engine";
import { RELATION_ZH, SPIRIT_ZH } from "@yaoflow/engine";
import { RELATION_EN, SPIRIT_EN, RELATION_L10N, SPIRIT_L10N, STRENGTH_EN, STRENGTH_L10N } from "./labels";
import type { Strength } from "@yaoflow/engine";
import { FULL_ZH_HANT, RELATION_HANT, SPIRIT_HANT } from "./hant-names";
import { KO_NAMES, RELATION_KO, SPIRIT_KO } from "./ko-names";
import { JA_NAMES } from "./ja-names";
import { LATIN_NAMES } from "./latin-names";
import type { Locale } from "./locales";
import type { LocalTexts } from "./local-texts";

/**
 * Client-safe naming per locale (no OpenCC here — the Traditional forms are
 * precomputed tables). Chinese scripts get the classical full name; Japanese
 * readers get the shinjitai form their books print with the on'yomi reading
 * beneath (ja-names.ts); Korean readers get
 * the Hangul name their 주역 books use, with the Hanja beneath; French,
 * German, Spanish and Portuguese readers get their own edition's names
 * (latin-names.ts); English gets the Wilhelm/Baynes title. Pinyin sits
 * beneath every Latin-script name.
 */

/** Which classical script a locale reads, and what the secondary line shows. */
export type Script = "hans" | "hant" | "en";
export function scriptFor(locale: Locale): Script {
  if (locale === "zh") return "hans";
  if (locale === "zh-hant" || locale === "ja") return "hant";
  return "en";
}

/** Primary display name of a hexagram. */
export function hexName(h: HexagramInfo, locale: Locale): string {
  if (locale === "ko") return KO_NAMES[h.number]?.[0] ?? h.en;
  if (locale === "ja") return JA_NAMES[h.number]?.[0] ?? FULL_ZH_HANT[h.number] ?? h.fullZh;
  const latin = LATIN_NAMES[locale]?.[h.number - 1];
  if (latin) return latin;
  const s = scriptFor(locale);
  return s === "hans" ? h.fullZh : s === "hant" ? (FULL_ZH_HANT[h.number] ?? h.fullZh) : h.en;
}

/** The quieter second line under the name. */
export function hexSubName(h: HexagramInfo, locale: Locale): string {
  if (locale === "ko") return KO_NAMES[h.number]?.[1] ?? h.pinyin;
  if (locale === "ja") return JA_NAMES[h.number]?.[1] ?? h.pinyin;
  return scriptFor(locale) === "en" ? h.pinyin : h.en;
}

/**
 * 卦辞: main line in the reader's script, an alternate underneath. When the
 * language has its own rendering of the received text (`local`, see
 * local-texts.ts), that is the main line and the classical original sits
 * beneath it — the source is always one glance away.
 */
/**
 * The language of that alternate line, for a `lang` attribute — so a run of
 * classical Chinese under a French or Korean rendering is set in a Chinese
 * face (globals.css keys on [lang|="zh"]) instead of the page's own.
 */
export function altLang(locale: Locale, local?: LocalTexts | null): "zh-Hant" | "en" {
  if (local?.j) return "zh-Hant";
  const s = scriptFor(locale);
  return s === "hans" || s === "hant" ? "en" : "zh-Hant";
}

export function judgmentFor(t: HexTexts, locale: Locale, local?: LocalTexts | null): { main: string; alt: string } {
  if (local?.j) return { main: local.j, alt: t.zh.judgmentHant };
  const s = scriptFor(locale);
  if (s === "hans") return { main: t.zh.judgmentHans, alt: t.en.judgment };
  if (s === "hant") return { main: t.zh.judgmentHant, alt: t.en.judgment };
  return { main: t.en.judgment, alt: t.zh.judgmentHant };
}

/** 爻辞 for line position 1–6. */
export function lineTextFor(t: HexTexts, pos: number, locale: Locale, local?: LocalTexts | null): { label: string; main: string; alt: string } {
  const s = scriptFor(locale);
  const z = t.zh.lines[pos - 1]!;
  const e = t.en.lines[pos - 1]!;
  const lo = local?.l?.[pos - 1];
  if (lo) return { label: z.label, main: lo, alt: z.hant };
  if (s === "hans") return { label: z.label, main: z.hans, alt: e };
  if (s === "hant") return { label: z.label, main: z.hant, alt: e };
  return { label: z.label, main: e, alt: z.hant };
}

export function relationLabel(r: Relation, locale: Locale): string {
  if (locale === "ko") return RELATION_KO[r];
  if (locale === "fr" || locale === "de" || locale === "es" || locale === "pt") return RELATION_L10N[locale][r];
  const s = scriptFor(locale);
  return s === "hans" ? RELATION_ZH[r] : s === "hant" ? RELATION_HANT[r] : RELATION_EN[r];
}

export function spiritLabel(sp: Spirit, locale: Locale): string {
  if (locale === "ko") return SPIRIT_KO[sp];
  if (locale === "fr" || locale === "de" || locale === "es" || locale === "pt") return SPIRIT_L10N[locale][sp];
  const s = scriptFor(locale);
  return s === "hans" ? SPIRIT_ZH[sp] : s === "hant" ? SPIRIT_HANT[sp] : SPIRIT_EN[sp];
}

/** 旺衰 word for a non-Chinese-label chart (en, ko, fr, de, es, pt). */
export function strengthLabel(st: Strength, locale: Locale): string {
  if (locale === "ko" || locale === "fr" || locale === "de" || locale === "es" || locale === "pt") return STRENGTH_L10N[locale][st];
  return STRENGTH_EN[st];
}

/** True when the reader's chart labels are Chinese-style (位/年月日 suffixes, 初…上). */
export const chineseLabels = (locale: Locale) => scriptFor(locale) !== "en";
