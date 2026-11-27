import type { Foreign } from "./core";
import { LOCALE_META } from "../locales";

/**
 * 10-30 进度表 128 ④ — the birth-chart reports (星盤／八字／紫微) and 命盤問答 written for a page in one of the seven other
 * languages: the same lines the Chinese reports hold (no promise, no claim of accuracy, no fate or karma, no AI, no lucky
 * objects, no medical / investment / legal advice), said for that language; the writing system the text must stay in;
 * and the lengths, asked and checked in that language's own measure (Chinese characters → words or characters).
 */
const BANNED: Record<Foreign, RegExp> = {
  en: /\b(guaranteed?|I guarantee|will definitely|definitely will|is destined|are destined|fated|karma|karmic|past li(?:fe|ves)|accurate|accuracy|AI|artificial intelligence|curse[sd]?|bad luck|misfortune|feng shui|lucky charm|amulet|talisman|prescription)\b/i,
  ja: /絶対に|必ず(?:そう|起こ|叶|当た)|100\s*%|１００％|保証|(?<!に)当た(?:ります|る|った)|的中|宿命|カルマ|前世|開運|お守り|パワーストーン|風水|\bAI\b|人工知能|不運|災い|厄年|厄除け|厄払い|処方/,
  ko: /반드시 (?:일어|이루)|무조건|100\s?%|보장|정확(?:합니다|해요|한 예측)|적중|숙명|카르마|업보|전생|개운|부적|풍수|\bAI\b|인공지능|불운|재앙|액운|처방/,
  fr: /\b(garanti(?:e|es|s)?|je vous garantis|à coup sûr|sans aucun doute|destin(?:é|ée)s? à|prédestiné\w*|karma|vies? antérieures?|malédiction|porte-bonheur|feng shui|IA|intelligence artificielle|ordonnance)\b/i,
  de: /\b(garantiert|ich garantiere|ganz sicher|vorherbestimmt|schicksalhaft|Karma|frühere[sn]? Leben|Fluch|Glücksbringer|Feng Shui|KI|künstliche Intelligenz|Rezept)\b/i,
  es: /\b(garantizad[oa]s?|te garantizo|sin duda|predestinad[oa]s?|destinad[oa]s? a|karma|vidas? pasadas?|maldición|amuleto|feng shui|IA|inteligencia artificial|receta médica)\b/i,
  pt: /\b(garantid[oa]s?|eu garanto|com certeza|sem dúvida|predestinad[oa]s?|destinad[oa]s? a|carma|karma|vidas? passadas?|maldição|amuleto|feng shui|IA|inteligência artificial|receita médica)\b/i,
};
const HAN = /[㐀-鿿]/;
const KANA = /[぀-ヿ]/;
const HANGUL = /[가-힯]/;
/** Chinese-only forms a Japanese text never uses (这 们 说 么 吗…; 這 only where no kana follows: 這う is Japanese) */
const ZH_ONLY = /[你您嗎吗这們们說说麼么还讓让呢吧啊]|這(?![いうえおわっ])/;

/**
 * Chinese chart words a Japanese text has its own terms for — they look like Japanese (kanji) and pass the script
 * check, so they are named: 入廟 (ドミサイル), 相位 (アスペクト), 合相, 六合, 命主星, 上升 (Japanese writes 上昇), a
 * Chinese aspect or dignity in brackets after the Japanese word (（刑、1.4度）, （旺）), and the traditional Chinese forms
 * Japanese writes another way (北交點 → 北交点／ノースノード, 對 → 対, 關 → 関, 會 → 会 …)
 */
const ZH_CHART_JA = /入廟|相位|合相|六合|命主星|上升|宮位|[（(][刑拱沖合旺陷陥弱][、，,）)]/;
const HANT_JA = /[點對關與會來發國學實體經]/;

/**
 * the first reason a piece of a foreign report cannot be kept, or null. 10-30: a Japanese 紫微斗数 text (zwds) keeps the
 * kanji chart words — 廟・旺・陥 in brackets after a star, 入廟, 命主 are how Japanese 紫微斗数 writes them
 */
export function foreignReportOffense(text: string, locale: Foreign, opt: { zwds?: boolean; bazi?: boolean } = {}): string | null {
  const b = text.match(BANNED[locale]);
  if (b) return `banned:${b[0]}`;
  if (locale === "ja") {
    // 10-30 合盤 (bazi): 六合 is also the 四柱推命 branch harmony — Japanese writes it so; only the astrology 六合 (= sextile) is Chinese
    const chart = opt.zwds ? null : (opt.bazi ? text.replace(/六合/g, "") : text).match(ZH_CHART_JA);
    const h = text.match(HANGUL) ?? text.match(ZH_ONLY) ?? chart ?? text.match(HANT_JA);
    return h ? `script:${h[0]}` : null;
  }
  if (locale === "ko") {
    const h = text.match(HAN) ?? text.match(KANA);
    return h ? `script:${h[0]}` : null;
  }
  const h = text.match(HAN) ?? text.match(KANA) ?? text.match(HANGUL);
  return h ? `script:${h[0]}` : null;
}

/** how many of this language's units one Chinese character of an asked length is worth (Latin: words) */
const PER_HAN: Record<Foreign, number> = { en: 0.6, fr: 0.6, de: 0.55, es: 0.6, pt: 0.6, ja: 1.4, ko: 1.3 };
const unit = (locale: Foreign) => (LOCALE_META[locale].cjk ? "characters" : "words");
/** a length asked for in Chinese characters, said for this language */
export function lengthIn(locale: Foreign, a: number, b?: number): string {
  const k = PER_HAN[locale];
  return b ? `${Math.round(a * k)}–${Math.round(b * k)} ${unit(locale)}` : `${Math.round(a * k)} ${unit(locale)}`;
}
/** every "650–900 characters" / "(600–850)" / ", 650–900)" in a task, said for this language */
export function retargetLengths(task: string, locale: Foreign): string {
  return task
    .replace(/(\d{2,4})\s*[–-]\s*(\d{2,4}) characters/g, (_, a: string, b: string) => lengthIn(locale, +a, +b))
    .replace(/(, |\()(\d{2,4})\s*[–-]\s*(\d{2,4})\)/g, (_, pre: string, a: string, b: string) => `${pre}${lengthIn(locale, +a, +b)})`)
    .replace(/(\d{2,4})\s*[–-]\s*(\d{2,4}) of read/g, (_, a: string, b: string) => `${lengthIn(locale, +a, +b)} of read`);
}
/** a text's length in Chinese characters' worth (what the Chinese limits are written in) */
export function lengthAsChinese(text: string, locale: Foreign): number {
  if (LOCALE_META[locale].cjk) return Math.round([...text.replace(/\s/g, "")].length / PER_HAN[locale]);
  return Math.round((text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length / PER_HAN[locale]);
}

const LANG: Record<Foreign, string> = { en: "English", ja: "Japanese", ko: "Korean", fr: "French", de: "German", es: "Spanish", pt: "Brazilian Portuguese" };
const YOU: Record<Foreign, string> = {
  en: "second person (you)", ja: "polite です／ます form, addressing the reader as あなた (sparingly)", ko: "polite 합니다／해요 style, addressing the reader without a name",
  fr: "second person, vous", de: "second person, du (lowercase)", es: "second person, tú", pt: "second person, você",
};
export const languageName = (l: Foreign): string => LANG[l];
/** the LANGUAGE line of a prompt for a foreign page */
export function foreignLanguageLine(l: Foreign): string {
  return `LANGUAGE: write everything in ${LANG[l]}, as people who read astrology and Chinese metaphysics in ${LANG[l]} write it today — ${YOU[l]}. The facts are given with Chinese words: never copy a Chinese word into the text; write each with its ${LANG[l]} term (the NAMES line says how).`;
}
/** VOICE for a foreign page (the Chinese one counts sentences in characters) */
export function foreignVoice(l: Foreign): string {
  return `VOICE: a friend who knows charts, talking across a table — plain words, short sentences with one idea each, ${YOU[l]}, warm and honest. Every strength comes with how to use it; every tension is a habit to watch, with one thing to do about it. Tendencies, not fate (tend to, often, can) — never a fixed prediction, never a verdict on the reader's life.`;
}
/** HARD RULES for a foreign page: the Chinese list's meaning, in words a ${LANG} text could slip into */
export function foreignHardRules(l: Foreign, extra = "", jaTerms = "Japanese astrology words, never the Chinese ones (アスペクト not 相位, ドミサイル not 入廟, 上昇 not 上升)"): string {
  const script = l === "ja" ? `Write Japanese only: kanji, kana, the usual Latin abbreviations (MC) — no Chinese-only words or simplified Chinese forms, no Korean; ${jaTerms}, and no Chinese word in brackets after a Japanese term.`
    : l === "ko" ? "Write Korean only (hangul): no Chinese characters, no Japanese."
    : `Write ${LANG[l]} only: no Chinese, Japanese or Korean characters.`;
  return [
    "HARD RULES — never write: a claim of accuracy or certainty (accurate, guaranteed, definitely will, destined, fated); fate, destiny as a verdict, karma, past lives, curses, omens, bad luck or misfortune, a day or a year that is lucky or unlucky; remedies to change one's fate, lucky objects, crystals, charms, amulets, feng shui or anything to buy; any mention of AI, a model or a computer. The lunar nodes are a direction to grow toward and a habit to lean on less — never past lives, karma, debts or destiny.",
    "No medical word even as a figure of speech (no prescription, remedy, cure, diagnosis, treatment). No medical advice: no illness, symptom, organ, medicine, supplement or treatment — the body only as daily rhythm (sleep, regular meals, movement, rest). No investment advice: no stock, fund, coin, product or amount — money only as habits and attitude. No legal advice.",
    `${script}${extra ? ` ${extra}` : ""}`,
  ].join(" ");
}
/** what a REWRITE REQUIRED message adds for a foreign page */
export function foreignRewriteNote(bad: string, l: Foreign): string {
  if (bad.startsWith("short") || bad.startsWith("missing") || /^\w+:\d/.test(bad)) return "Keep every field and write the full length asked for.";
  if (bad.startsWith("script:")) return l === "ja" ? "Write Japanese only — that Chinese-only word or Korean letter may not appear; use the Japanese term." : l === "ko" ? "Write hangul only — no Chinese characters, no Japanese; use the Korean term." : `Write ${LANG[l]} only — no Chinese, Japanese or Korean characters; use the ${LANG[l]} term.`;
  const word = /^banned:(.+)$/.exec(bad)?.[1];
  return `${word ? `"${word}" may not appear at all — say that sentence another way. ` : ""}Follow the HARD RULES: no claim of accuracy or certainty, no fate or karma, no medical / investment / legal advice, no talk about how the report works.`;
}
