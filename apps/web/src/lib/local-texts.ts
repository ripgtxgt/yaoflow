import type { Locale } from "./locales";

/**
 * Per-language renderings of the received text, one file per language in
 * data/originals.<locale>.json (derived from gua-seo.<locale>.json by
 * scripts/extract-originals.ts): j = 卦辞, l = the six 爻辞 bottom-up,
 * x = 用九/用六 where the hexagram has one. Chinese scripts read the
 * original itself and English has its own rendering in the engine, so only
 * the six other languages carry a file.
 */
export interface LocalTexts { j: string; l: string[]; x?: string }
export type LocalTextsTable = Record<string, LocalTexts>;

export const LOCAL_TEXT_LOCALES: readonly Locale[] = ["ja", "ko", "fr", "de", "es", "pt"];

export function hasLocalTexts(locale: Locale): boolean {
  return LOCAL_TEXT_LOCALES.includes(locale);
}
