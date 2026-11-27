import type { Locale } from "./locales";

/**
 * The few lines of copy set on the Open Graph cards, per language.
 * Kept out of the UI dictionary on purpose: every non-Latin glyph used here
 * must exist in the embedded font subset for that script (see og.tsx), so
 * changing a line means regenerating the subset — a deliberate step.
 */
export type OgCopy = {
  /** "{n} moving lines" */
  moving: (n: number) => string;
  /** brand line on a card with no figure */
  one: string;
  /** one-sentence tagline under the figure */
  tagline: string;
};

export const OG_COPY: Record<Locale, OgCopy> = {
  zh: {
    moving: (n) => `${n} 个动爻`,
    one: "一件事，一卦。",
    tagline: "把一件悬而未决的事，看清楚。",
  },
  "zh-hant": {
    moving: (n) => `${n} 個動爻`,
    one: "一件事，一卦。",
    tagline: "把一件懸而未決的事，看清楚。",
  },
  en: {
    moving: (n) => `${n} moving line${n > 1 ? "s" : ""}`,
    one: "One question. One cast.",
    tagline: "A deterministic I Ching chart, read in plain language.",
  },
  ja: {
    moving: (n) => `動爻 ${n} つ`,
    one: "一事一卦。",
    tagline: "決めかねていることを、見通す。",
  },
  ko: {
    moving: (n) => `동효 ${n}개`,
    one: "한 가지 일, 한 번의 점괘.",
    tagline: "결정하지 못한 일을, 또렷이 보다.",
  },
  fr: {
    moving: (n) => `${n} trait${n > 1 ? "s" : ""} mutant${n > 1 ? "s" : ""}`,
    one: "Une question. Un tirage.",
    tagline: "Un tableau du Yi Jing calculé selon les règles, lu en langage clair.",
  },
  de: {
    moving: (n) => `${n} wandelnde Linie${n > 1 ? "n" : ""}`,
    one: "Eine Frage. Ein Wurf.",
    tagline: "Ein deterministisches I-Ging-Bild, in klarer Sprache gelesen.",
  },
  es: {
    moving: (n) => `${n} línea${n > 1 ? "s" : ""} mutante${n > 1 ? "s" : ""}`,
    one: "Una pregunta. Una tirada.",
    tagline: "Una figura del I Ching determinista, leída en lenguaje claro.",
  },
  pt: {
    moving: (n) => `${n} linha${n > 1 ? "s" : ""} móve${n > 1 ? "is" : "l"}`,
    one: "Uma pergunta. Uma tiragem.",
    tagline: "Uma figura do I Ching determinística, lida em linguagem clara.",
  },
};
