import { allHexagrams, TRIGRAMS, textsFor, type HexagramInfo, type HexTexts } from "@yaoflow/engine";
import raw from "@/data/gua-seo.json";
import ja from "@/data/gua-seo.ja.json";
import ko from "@/data/gua-seo.ko.json";
import fr from "@/data/gua-seo.fr.json";
import de from "@/data/gua-seo.de.json";
import es from "@/data/gua-seo.es.json";
import pt from "@/data/gua-seo.pt.json";
import { toHant } from "./hant";
import { hexName } from "./names";
import type { Locale } from "./locales";

/**
 * 64-hexagram SEO pages: slugs, line figures, and the pre-generated
 * commentary. zh and en commentary live in gua-seo.json (produced once by
 * scripts/gen-gua-seo.ts, reviewed, frozen); Traditional Chinese is derived
 * from zh at build time; the other six languages have their own
 * gua-seo.<locale>.json (scripts/gen-gua-seo-l10n.ts rewrites the reviewed
 * zh/en commentary in that language and translates the classical text).
 * No model calls at runtime, ever.
 */

export interface GuaSeoSide {
  summary: string;
  lines: string[];
  extra?: string;
  career: string;
  love: string;
  money: string;
  meta: string;
  /** the model's suggestion for a localized name — display uses latin-names.ts instead */
  name?: string;
  /** the classical text in this language (per-language files only) */
  judgment?: string;
  originals?: string[];
  extraOriginal?: string;
}
export interface GuaSeo { n: number; zh: GuaSeoSide; en: GuaSeoSide }

const SEO = raw as unknown as Record<string, GuaSeo>;

/** Per-language commentary files. */
const EXTRA: Partial<Record<Locale, Record<string, GuaSeoSide>>> = {
  ja: ja as unknown as Record<string, GuaSeoSide>,
  ko: ko as unknown as Record<string, GuaSeoSide>,
  fr: fr as unknown as Record<string, GuaSeoSide>,
  de: de as unknown as Record<string, GuaSeoSide>,
  es: es as unknown as Record<string, GuaSeoSide>,
  pt: pt as unknown as Record<string, GuaSeoSide>,
};

/** Display name on the reference pages — the same name the rest of the site uses. */
export function guaName(h: HexagramInfo, locale: Locale): string {
  return hexName(h, locale);
}

/** Locales that have commentary — the only ones the pages are built for. */
export function guaLocales(): Locale[] {
  return ["zh", "zh-hant", "en", ...(Object.keys(EXTRA) as Locale[])];
}

function hantSide(zh: GuaSeoSide): GuaSeoSide {
  return {
    summary: toHant(zh.summary),
    lines: zh.lines.map(toHant),
    ...(zh.extra ? { extra: toHant(zh.extra) } : {}),
    career: toHant(zh.career),
    love: toHant(zh.love),
    money: toHant(zh.money),
    meta: toHant(zh.meta),
  };
}

export function guaSeoFor(n: number, locale: Locale): GuaSeoSide | null {
  const entry = SEO[String(n)];
  if (!entry) return null;
  if (locale === "zh") return entry.zh;
  if (locale === "en") return entry.en;
  if (locale === "zh-hant") return hantSide(entry.zh);
  return EXTRA[locale]?.[String(n)] ?? null;
}

/** King Wen order, 1-based lookup is GUA[n - 1]. */
export const GUA: readonly HexagramInfo[] = allHexagrams();

/** "Xiǎo Chù" → "xiao-chu" (ASCII, hyphenated — stable URL material). */
export const asciiPinyin = (p: string) =>
  p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "-");

/** e.g. 9-xiao-chu; the number prefix keeps homophones (10/56 lu) unique. */
export const guaSlug = (h: HexagramInfo) => `${h.number}-${asciiPinyin(h.pinyin)}`;

/** Bottom-up yang flags for FigureMark. */
export const guaYangs = (h: HexagramInfo): boolean[] =>
  [...TRIGRAMS[h.lower].lines, ...TRIGRAMS[h.upper].lines].map((b) => b === 1);

export interface GuaPageData {
  hex: HexagramInfo;
  seo: GuaSeoSide;
  texts: HexTexts;
}

export function guaBySlug(slug: string, locale: Locale): GuaPageData | null {
  const n = Number(slug.split("-")[0]);
  if (!Number.isInteger(n) || n < 1 || n > 64) return null;
  const hex = GUA[n - 1]!;
  if (guaSlug(hex) !== slug) return null;
  const seo = guaSeoFor(n, locale);
  if (!seo) return null;
  return { hex, seo, texts: textsFor(n) };
}
