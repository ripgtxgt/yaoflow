import type { Locale } from "./locales";
import type { Reading } from "./reading";

/**
 * 10-02 (a reader on iOS 16.2 in the Threads browser: 「Application error: a client-side exception」 on the cast page).
 * The reading page component (a client component) imported `pick` and `READING_KEYS` from reading.ts, so that whole
 * module — prompts, guards and all — went to the browser, and with it the Japanese guard's regex lookbehind
 * (「当た…」 unless preceded by 心/見/思…), which Safari before 16.4 cannot even construct: the cast and reading pages' shared chunk threw
 * on load. These two are all the browser needs; they live here, with nothing but types around them, and reading.ts
 * re-exports them for the server code. Keep this file free of regexes the oldest supported Safari cannot parse.
 */

/**
 * A reading field, in whichever languages it was written. Readings generated
 * before 2026-09-02 carry {zh, en}; everything since carries exactly the
 * language it was asked for. `pick()` reads either.
 */
export type Localized = Partial<Record<Locale, string>>;
/** legacy name, kept so old call sites read naturally */
export type Bi = Localized;

export function pick(f: Localized | undefined | null, locale: Locale): string {
  if (!f) return "";
  const chinese = locale === "zh" || locale === "zh-hant";
  return f[locale]
    ?? (chinese ? f.zh : f.en)
    ?? f.en ?? f.zh
    ?? Object.values(f).find((v): v is string => typeof v === "string" && v.length > 0)
    ?? "";
}

/** every field a light reading may carry — rendering order; older readings fill more of it than new ones */
export const READING_KEYS: (keyof Reading)[] = [
  "summary", "inner_condition", "outer_condition", "movement",
  "direction", "next_step", "caution", "reflection_question",
];
