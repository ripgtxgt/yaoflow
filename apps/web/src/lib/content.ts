import { toHant } from "./hant";
import type { Locale } from "./locales";

/**
 * Server-side selection of authored content (trust points, legal sections,
 * email tables) for a locale. zh and en are authored; Traditional Chinese is
 * derived from zh on the fly; other languages fall back to English until a
 * translation is added under their own key.
 */
export type Authored<T> = { zh: T; en: T } & Partial<Record<Locale, T>>;

function deepHant<T>(v: T): T {
  if (typeof v === "string") return toHant(v) as unknown as T;
  if (Array.isArray(v)) return v.map(deepHant) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = deepHant(x);
    return out as T;
  }
  return v;
}

export function contentFor<T>(item: Authored<T>, locale: Locale): T {
  if (locale === "zh") return item.zh;
  if (locale === "zh-hant") return item["zh-hant"] ?? deepHant(item.zh);
  return item[locale] ?? item.en;
}

/** True when the locale reads English content because nothing else exists yet. */
export function isEnglishFallback<T>(item: Authored<T>, locale: Locale): boolean {
  return locale !== "zh" && locale !== "zh-hant" && locale !== "en" && !item[locale];
}
