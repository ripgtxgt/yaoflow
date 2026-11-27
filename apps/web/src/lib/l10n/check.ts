import type { Foreign } from "./core";

/**
 * 10-29 进度表 128 — what a translated leaf must satisfy before it is written (scripts/l10n/translate.ts) and what the
 * tests hold every generated file to: the same {placeholders}, the right writing system, none of the words the site
 * never says. Pure, no imports — the script and the tests share it.
 */

const HAN = /[㐀-鿿豈-﫿]/g;
const KANA = /[぀-ヿ]/;
const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const PH = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;
/** Chinese function words a Japanese sentence never contains — a leaf that has them is Chinese left untranslated */
// 10-30: 這 is also Japanese 這う (to crawl) — Chinese only when no kana follows
const ZH_ONLY = /[你您嗎吗这們们說说麼么还讓让呢吧啊]|這(?![いうえおわっ])/;
/** 景表法 (test/ja-copy.test.ts): no promise of an outcome */
const JA_BANNED = /絶対|必ず|100\s*%|１００％|(?<![心見思突行ちにい])当た(?:ります|る|った|って|り(?!前))/;
/** the site never claims to be accurate or promises the outcome, in any language (「不保證」 → "no guarantee" is fine) */
const EN_BANNED = /\b(100\s*%\s*(?:accurate|right)|always (?:right|accurate)|guaranteed (?:to|results?|outcomes?))\b/i;
const LATIN_BANNED: Record<string, RegExp> = {
  fr: /(toujours exact|résultats? garantis?|garanti à 100)/i,
  de: /(immer zutreffend|garantiert (?:ein|richtig|zutreffend)|100\s*% (?:sicher|richtig))/i,
  es: /(siempre acierta|resultados? garantizados?|garantizado al 100)/i,
  pt: /(sempre acerta|resultados? garantidos?|garantido 100)/i,
};
/** Chinese full-width punctuation left in a Korean or Latin line (a template that kept 「」 or ：) */
const CJK_PUNCT = /[「」『』：，。（）＋＝、｜]/; // 10-30: ｜ too (a fullwidth bar in a Spanish or Korean title)

export const placeholders = (s: string): string[] => [...new Set(s.match(PH) ?? [])].sort();

/** Han characters in a Korean or Latin line — none at all unless the leaf may keep them (`keepHan`: a classical quote, a
 *  stem-branch gloss like 묘목(卯木) on a reference page) */
function hanCount(s: string): number {
  return (s.match(HAN) ?? []).length;
}

/**
 * Why `out` is not acceptable as the `locale` rendering of the 繁體 `src`, or null when it is.
 * `keepHan`: this leaf may keep Chinese characters (a classical quotation shown in the original, a stem-branch name).
 */
export function leafProblem(locale: Foreign, src: string, out: unknown, keepHan = false): string | null {
  if (typeof out !== "string") return "missing";
  const t = out.trim();
  if (!t && src.trim()) return "empty";
  const a = placeholders(src).join(","), b = placeholders(t).join(",");
  if (a !== b) return `placeholders ${a || "-"} ≠ ${b || "-"}`;
  if (/爻流/.test(t)) return "brand in Chinese";
  if (/\bAI\b|人工智慧|人工知能|인공지능/.test(t) && !/\bAI\b|人工智慧|人工智能/.test(src)) return "mentions AI";
  if (locale === "ja") {
    if (HANGUL.test(t)) return "hangul in ja";
    if (ZH_ONLY.test(t) && !keepHan) return "chinese in ja";
    // a long line with no kana and Chinese grammar words is Chinese left as it was (a kanji-only book title is fine)
    if (!keepHan && t.replace(PH, "").length >= 14 && !KANA.test(t) && /[的了是在和也都就要會会很給给沒]/.test(t)) return "no kana in ja";
    if (JA_BANNED.test(t)) return "ja banned word";
    return null;
  }
  if (locale === "ko") {
    if (KANA.test(t)) return "kana in ko";
    if (/[「」『』：，。＋＝｜]/.test(t)) return "chinese punctuation in ko";
    if (!keepHan && hanCount(t) > 0) return "hanja in ko";
    if ((src.match(HAN) ?? []).length >= 2 && !HANGUL.test(t) && !/^[\d\s\p{P}\p{S}A-Za-z]*$/u.test(t)) return "no hangul in ko";
    return null;
  }
  // en / fr / de / es / pt
  if (KANA.test(t) || HANGUL.test(t)) return "kana/hangul in latin";
  if (CJK_PUNCT.test(t) && !keepHan) return "chinese punctuation in latin";
  if (!keepHan && hanCount(t) > 0) return "chinese in latin";
  if (EN_BANNED.test(t)) return "banned claim";
  const lb = LATIN_BANNED[locale];
  if (lb && lb.test(t)) return "banned claim";
  return null;
}
