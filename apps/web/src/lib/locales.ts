/**
 * Every language the site speaks, and what each one needs from the rest of
 * the system. Adding a language = one row here + a dictionary in lib/dict/
 * + (optionally) gua-seo content and an OG font subset. Nothing else changes.
 */

export type Locale = "zh" | "zh-hant" | "en" | "ja" | "ko" | "fr" | "de" | "es" | "pt";

export const LOCALES: readonly Locale[] = ["zh", "zh-hant", "en", "ja", "ko", "fr", "de", "es", "pt"];

export interface LocaleMeta {
  /** <html lang> */
  htmlLang: string;
  /** hreflang / alternates key */
  hreflang: string;
  /** og:locale */
  ogLocale: string;
  /** Stripe Checkout `locale` */
  stripe: string;
  /** name in its own language, for the language menu */
  native: string;
  /** name in English, for the model prompts */
  english: string;
  /** writing system uses CJK ideographs/kana/hangul (font + jargon handling) */
  cjk: boolean;
  /** which OG font set draws the name on cards */
  ogFont: "latin" | "sc" | "hant" | "jp" | "kr";
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  zh:        { htmlLang: "zh-CN",   hreflang: "zh-CN",   ogLocale: "zh_CN", stripe: "zh",    native: "简体中文", english: "Simplified Chinese", cjk: true,  ogFont: "sc" },
  "zh-hant": { htmlLang: "zh-Hant", hreflang: "zh-Hant", ogLocale: "zh_TW", stripe: "zh-TW", native: "繁體中文", english: "Traditional Chinese (as written in Taiwan and Hong Kong)", cjk: true, ogFont: "hant" },
  en:        { htmlLang: "en",      hreflang: "en",      ogLocale: "en_US", stripe: "en",    native: "English",  english: "English", cjk: false, ogFont: "latin" },
  ja:        { htmlLang: "ja",      hreflang: "ja",      ogLocale: "ja_JP", stripe: "ja",    native: "日本語",   english: "Japanese", cjk: true,  ogFont: "jp" },
  ko:        { htmlLang: "ko",      hreflang: "ko",      ogLocale: "ko_KR", stripe: "ko",    native: "한국어",   english: "Korean", cjk: true,  ogFont: "kr" },
  fr:        { htmlLang: "fr",      hreflang: "fr",      ogLocale: "fr_FR", stripe: "fr",    native: "Français", english: "French", cjk: false, ogFont: "latin" },
  de:        { htmlLang: "de",      hreflang: "de",      ogLocale: "de_DE", stripe: "de",    native: "Deutsch",  english: "German", cjk: false, ogFont: "latin" },
  es:        { htmlLang: "es",      hreflang: "es",      ogLocale: "es_ES", stripe: "es",    native: "Español",  english: "Spanish", cjk: false, ogFont: "latin" },
  pt:        { htmlLang: "pt",      hreflang: "pt",      ogLocale: "pt_BR", stripe: "pt",    native: "Português", english: "Portuguese", cjk: false, ogFont: "latin" },
};

/** x-default for search engines: the language most of the web can read. */
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

/** Coerce anything (query, body, DB) to a locale, defaulting to zh. */
export function asLocale(x: unknown, fallback: Locale = "zh"): Locale {
  return isLocale(x) ? x : fallback;
}

/** Chinese in either script — shares the classical vocabulary and its jargon rules. */
export const isChinese = (l: Locale) => l === "zh" || l === "zh-hant";

/** hreflang map for a path that exists in every locale. */
export function alternatesFor(path: string, only?: readonly Locale[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of only ?? LOCALES) out[LOCALE_META[l].hreflang] = `/${l}${path}`;
  // 09-23 (Search Console, URL inspection of /en): the bare root 307s to a
  // language by Accept-Language, and Google took that redirect as "/ and /en
  // are one page" — it chose https://yaoflow.com/ as the canonical of /en, so
  // the English home was filed as a duplicate and never indexed. Google's
  // pattern for a language-picking root is to name the root itself as
  // x-default; then each language home is its own page.
  out["x-default"] = path === "" ? "/" : `/${DEFAULT_LOCALE}${path}`;
  return out;
}

/**
 * The canonical + hreflang block for one page: canonical is the page itself,
 * the alternates are the same path in every language that has its own
 * version. Every indexable page sets this for its own path — a canonical
 * inherited from the layout would point every page at the language's home,
 * which is exactly what Search Console flagged as duplicate pages.
 */
export function pageAlternates(locale: Locale, path: string, only?: readonly Locale[]): { canonical: string; languages: Record<string, string> } {
  return { canonical: `/${locale}${path}`, languages: alternatesFor(path, only) };
}
