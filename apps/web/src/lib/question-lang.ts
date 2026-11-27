import type { Locale } from "./locales";

/**
 * Which language a reading should be written in, judged from the question the
 * person typed rather than the page they happen to be on.
 *
 * 09-17, Neil, looking at five live readings: someone browsing the 繁體 site
 * asked five questions in English and got five Chinese readings back. A reading
 * is a private conversation — people write the question in the language they
 * think in, and answering in another one costs the whole intimacy of it.
 *
 * The rule is deliberately reluctant. Answering in the *wrong* language is
 * worse than answering in the page's, so this returns null — meaning "no reason
 * to switch, keep the page language" — unless the evidence is plain:
 *
 *   · kana or hangul in the text            → ja / ko
 *   · no CJK at all, a real sentence of a   → that language
 *     Latin language we actually publish
 *   · anything shorter, mixed, or unclear   → null
 *
 * Simplified vs Traditional is deliberately NOT handled here: script is a
 * reading preference, not a language. A reader in Taipei may well type
 * Simplified, and the page already follows the browser (middleware,
 * `chineseScript`). Han text therefore always returns null.
 */

/** Runs of Latin letters, apostrophes kept so "don't" and "he's" stay one word. */
const LATIN_WORD = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;

const HAN = /[㐀-䶿一-鿿豈-﫿]/;
const HIRAGANA = /[ぁ-ゟ]/g;
const KATAKANA = /[ァ-ヿ]/g;
const HANGUL = /[가-힣]/g;

/**
 * Function words, which a person uses without thinking and a machine can count.
 * Content words are useless here — "offer", "interview" and "dynamic" show up
 * in all five languages — so these lists hold only grammar.
 */
const STOPWORDS: Record<"en" | "fr" | "de" | "es" | "pt", readonly string[]> = {
  en: ["the", "is", "are", "am", "was", "will", "would", "should", "shall", "can", "could", "do", "does", "did", "have", "has", "i", "my", "me", "he", "she", "him", "her", "his", "they", "them", "we", "you", "your", "it", "this", "that", "these", "those", "what", "why", "when", "how", "who", "which", "if", "and", "or", "but", "not", "with", "about", "for", "from", "to", "of", "in", "on", "still", "even", "yet", "there", "any", "more", "than", "be", "been", "going", "gonna", "wanna", "just", "know", "think", "want"],
  fr: ["je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "est", "sont", "suis", "était", "sera", "vais", "dois", "peux", "peut", "mon", "ma", "mes", "son", "sa", "ses", "le", "la", "les", "un", "une", "des", "du", "de", "que", "qui", "quoi", "quand", "comment", "pourquoi", "avec", "pour", "dans", "sur", "ne", "pas", "plus", "et", "ou", "mais", "si", "ce", "cette", "cet", "être", "avoir", "faire", "va", "encore", "toujours"],
  de: ["ich", "du", "er", "sie", "es", "wir", "ihr", "ist", "sind", "bin", "war", "wird", "werde", "soll", "kann", "muss", "habe", "hat", "haben", "mein", "meine", "meinen", "der", "die", "das", "den", "dem", "ein", "eine", "einen", "und", "oder", "aber", "nicht", "kein", "mit", "für", "von", "zu", "auf", "in", "ob", "wann", "warum", "wie", "was", "wer", "wenn", "noch", "schon", "sich", "dass"],
  es: ["yo", "él", "ella", "nosotros", "ustedes", "ellos", "es", "son", "soy", "era", "será", "voy", "debo", "puedo", "puede", "tengo", "tiene", "mi", "mis", "su", "sus", "el", "la", "los", "las", "un", "una", "unos", "del", "que", "quién", "cuándo", "cómo", "por", "porque", "para", "con", "sin", "no", "y", "o", "pero", "si", "este", "esta", "eso", "esto", "más", "muy", "hay", "está", "están", "qué"],
  pt: ["eu", "ele", "ela", "nós", "vocês", "eles", "é", "são", "sou", "era", "será", "vou", "devo", "posso", "pode", "tenho", "tem", "meu", "minha", "meus", "seu", "sua", "o", "a", "os", "as", "um", "uma", "uns", "do", "da", "dos", "das", "que", "quem", "quando", "como", "porque", "para", "com", "sem", "não", "e", "ou", "mas", "se", "este", "esta", "isso", "mais", "muito", "há", "está", "estão", "você", "né"],
};

/** Letters and spellings only one of the five uses, worth a point of their own. */
const MARKERS: Record<"fr" | "de" | "es" | "pt", RegExp> = {
  fr: /[àâçéèêëîïôûùü]|\bqu['’]/i,
  de: /[äöüß]/i,
  es: /[ñ¿¡]|ción\b/i,
  pt: /[ãõç]|ção\b|\bnão\b|\bvocê\b/i,
};

const LATIN_LOCALES = ["en", "fr", "de", "es", "pt"] as const;
type LatinLocale = (typeof LATIN_LOCALES)[number];

/** A Latin question this short is a fragment, not a choice of language ("Him"). */
export const MIN_LATIN_WORDS = 4;
/** Below this many function words we cannot tell a language from a product name. */
export const MIN_STOPWORD_HITS = 2;

function latinLocale(words: string[]): LatinLocale | null {
  const lower = words.map((w) => w.toLowerCase().replace(/[’]/g, "'"));
  const text = words.join(" ");
  const scores = LATIN_LOCALES.map((loc) => {
    const set = new Set(STOPWORDS[loc]);
    let hits = lower.filter((w) => set.has(w)).length;
    if (loc !== "en" && MARKERS[loc].test(text)) hits += 2;
    return { loc, hits };
  }).sort((a, b) => b.hits - a.hits);
  const [best, second] = scores;
  if (best.hits < MIN_STOPWORD_HITS) return null;
  if (best.hits === second.hits) return null; // a tie tells us nothing
  return best.loc;
}

/**
 * The language the reading should be written in, or null to keep the page's.
 * Pure and dependency-free on purpose: the cast page and the checkout route
 * both call it, and they have to agree.
 */
export function detectQuestionLocale(question: string, page: Locale): Locale | null {
  const q = (question ?? "").trim();
  if (q.length < 2) return null;

  // Japanese and Korean announce themselves in the script. Hiragana is decisive
  // on its own; katakana alone can be a loanword sitting inside another
  // language, so it needs a run of them.
  const kana = (q.match(HIRAGANA)?.length ?? 0);
  if (kana >= 1 || (q.match(KATAKANA)?.length ?? 0) >= 3) return page === "ja" ? null : "ja";
  if ((q.match(HANGUL)?.length ?? 0) >= 2) return page === "ko" ? null : "ko";

  // Any Han at all and we stay with the page: Chinese script is the page's call,
  // and a lone Han character inside another language is not a language choice.
  if (HAN.test(q)) return null;

  const words = q.match(LATIN_WORD) ?? [];
  if (words.length < MIN_LATIN_WORDS) return null;
  const loc = latinLocale(words);
  if (!loc || loc === page) return null;
  return loc;
}

/**
 * What the reading language actually ends up being, given what the reader chose.
 * `chosen` is whatever the client sent: honoured only when it is one of the two
 * languages the cast page actually offered, so a stray value cannot put someone
 * else's reading into a language nobody asked for.
 */
export function resolveReadingLocale(question: string, page: Locale, chosen?: unknown): Locale {
  const detected = detectQuestionLocale(question, page);
  if (typeof chosen === "string" && (chosen === page || (detected && chosen === detected))) {
    return chosen as Locale;
  }
  return detected ?? page;
}

/* ---------- register: written Cantonese (09-18) ---------- */

/**
 * Characters and words that belong to written Cantonese and not to standard
 * written Chinese. 係 is deliberately absent — it sits inside 關係/係數 — and
 * 睇/諗/返 are weaker on their own, so they only count in company.
 */
const YUE_STRONG = /[唔佢嘅咁喺咗冇乜嘢啲嗰哋啱]/g;
// 09-18 (Neil's HK reader wrote 依家 for 而家): the everyday words too —
// work (份工/返工/轉工/搵工/老細), home (屋企), 點算, 邊度, 即係. Not 出面 or
// 好似: both are ordinary Mandarin as well, and a pair of them would send a
// Taiwanese reader a Cantonese reading.
// (份工 / 轉工 only when not the Mandarin 份工作 / 轉工作)
const YUE_WEAK = /睇|諗|點解|而家|依家|咩|嚟|俾|攞|搵|做咩|係咪|係唔係|好唔好|得唔得|有冇|邊個|邊度|幾時|點樣|點算|即係|份工(?!作)|返工|放工|轉工(?!作)|搵工|老細|屋企|噉|嘞|喇|囉|㗎|啦/g;

export type Register = "yue";

/**
 * The register a Chinese question is written in: "yue" for written Cantonese,
 * null for standard written Chinese (or any other language). One strong
 * marker is enough (唔 / 佢 / 嘅 / 咁 / 喺 …); the weaker ones need to come in
 * pairs, because 睇 or 諗 alone can turn up in a Taiwanese sentence.
 */
export function detectRegister(question: string): Register | null {
  const q = (question ?? "").trim();
  if (!HAN.test(q)) return null;
  const strong = (q.match(YUE_STRONG) ?? []).length;
  const weak = (q.match(YUE_WEAK) ?? []).length;
  return strong >= 1 || weak >= 2 ? "yue" : null;
}

/**
 * Whether a piece of prose reads as Cantonese: used as the guard after
 * generation. Counts distinct strong markers; a 200-character Cantonese
 * paragraph without a single 唔/佢/嘅/咁/咗 is not Cantonese.
 */
export function readsAsCantonese(text: string): boolean {
  const strong = new Set((text ?? "").match(YUE_STRONG) ?? []);
  return strong.size >= 2;
}
