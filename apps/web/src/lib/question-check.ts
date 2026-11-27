import type { Locale } from "./locales";
import { normalizeQ } from "./repeat-gate";
import { isCrisis } from "./crisis";

/**
 * Is what they typed a matter at all? (09-20)
 *
 * Neil, looking at a live reading: the question box held 「ああ」 — a sigh, not
 * a matter — and the site cast the figure, wrote a free line about "その問い"
 * and delivered a whole light reading on nothing. The gate before the reading
 * only ever asked for two characters.
 *
 * Two layers, both used before the rite and again before the reading:
 *
 *   1. RULES (this file, pure, instant, shared by the page and the API): the
 *      cases a person recognises on sight — interjections, one character
 *      repeated, keyboard mash, greetings, "test", a bare pronoun. Refused
 *      hard; nothing to argue about.
 *   2. THE MODEL (`judgeMatter`, server only): one short YES/NO call for what
 *      rules cannot see — a bare statement, a request aimed at the site
 *      itself, a quotation. Refused softly: the panel offers "ask this anyway",
 *      because a model can be wrong and a reader must never be stuck.
 *
 * The rules are deliberately narrow. Two-character Chinese matters (工作,
 * 懷孕), a lone topic word in English (job, money), a fragment like 「目前感情
 * 的發展」 — all pass. Anything gray goes to the model, and the model is told
 * to say YES when in doubt.
 */

export type QuestionIssue =
  /** fewer than two characters once trimmed — the old gate's own case */
  | "empty"
  /** no letters, one letter repeated, keyboard mash */
  | "noise"
  /** letters, but nothing that names a matter: a greeting, an interjection, "test", a pronoun */
  | "filler"
  /** 09-26: the question says they may hurt themselves — no cast, no sale; the page shows helplines */
  | "crisis";

const NON_LETTER = /[\p{P}\p{S}\p{N}\s]/gu;

/* ---------- whole-string fillers, compared after normalizeQ (lower, no punctuation) ---------- */

const FILLER_EXACT = new Set<string>([
  // 中文 — greetings, yes/no, test, and the request aimed at the site itself
  "你好", "您好", "哈囉", "哈喽", "嗨", "早安", "晚安", "早", "谢谢", "謝謝", "拜拜", "再见", "再見",
  "测试", "測試", "测试一下", "測試一下", "试试", "試試", "试一下", "試一下", "试一试", "試一試", "测一下", "測一下", "随便", "隨便", "随便问问", "隨便問問",
  "不知道", "不知道问什么", "不知道問什麼", "没有", "沒有", "没有问题", "沒有問題", "好的", "好吧", "好啊", "可以", "嗯嗯", "哦哦", "在吗", "在嗎", "在不在",
  "算命", "算卦", "算一卦", "算一算", "占卜", "起卦", "起一卦", "看看", "看一看", "帮我算卦", "幫我算卦", "帮我算一卦", "幫我算一卦", "帮我算算", "幫我算算", "帮我看看", "幫我看看", "帮我算命", "幫我算命", "帮我占卜", "幫我占卜", "帮我起卦", "幫我起卦", "给我算一卦", "給我算一卦", "问一下", "問一下", "想问一下", "想問一下",
  // 日本語
  "こんにちは", "こんばんは", "おはよう", "おはようございます", "はい", "いいえ", "うん", "ううん", "ええ", "ああ", "えっと", "あの", "あのー", "えー", "そうですね",
  "テスト", "てすと", "試し", "ためし", "占い", "占って", "占ってください", "うらない", "よろしく", "よろしくお願いします", "ありがとう", "ありがとうございます",
  "わからない", "分からない", "わかりません", "分かりません", "なんとなく", "特にない", "特になし", "とくにない", "とくになし", "なし", "ない", "何もない", "なにもない", "適当", "てきとう",
  // 한국어
  "안녕", "안녕하세요", "네", "예", "아니요", "아니오", "아니", "응", "어", "음", "글쎄", "테스트", "시험", "점", "점봐줘", "점 봐줘", "점쳐줘", "점 쳐줘", "사주", "운세",
  "모르겠어", "모르겠어요", "모름", "그냥", "그냥요", "감사합니다", "고마워", "없음", "없어", "없어요", "아무거나",
  // English
  "hi", "hello", "hey", "yo", "sup", "ok", "okay", "test", "testing", "test test", "lol", "haha", "hmm", "hm", "yes", "no", "nah", "yeah", "yep", "nope",
  "thanks", "thank you", "please", "help", "idk", "i don t know", "dunno", "nothing", "none", "whatever", "random", "anything", "just curious", "curious",
  "fortune", "my fortune", "read my fortune", "tell me my fortune", "tell me my future", "my future", "read me", "cast", "divination", "reading",
  // français
  "bonjour", "bonsoir", "salut", "coucou", "merci", "oui", "non", "rien", "essai", "je sais pas", "je ne sais pas", "aucune idée", "mon avenir", "l avenir", "dis moi mon avenir",
  // Deutsch
  "hallo", "hi hallo", "moin", "servus", "danke", "ja", "nein", "nichts", "test test test", "keine ahnung", "weiß nicht", "weiss nicht", "meine zukunft", "zukunft",
  // español
  "hola", "buenas", "gracias", "sí", "si", "nada", "prueba", "no sé", "no se", "mi futuro", "el futuro", "dime mi futuro",
  // português
  "olá", "ola", "oi", "obrigado", "obrigada", "sim", "não", "nao", "teste", "não sei", "nao sei", "meu futuro", "o futuro", "me diga meu futuro",
]);

/* ---------- Han: characters that carry no matter on their own ---------- */

// grammar and pronouns (the repeat gate's list) + interjections and laughter
const HAN_EMPTY = new Set(
  ("我你妳他她它們们的了嗎吗呢啊吧呀嘛麼么是否會会能不沒没有在跟和與与還还再又想要該该應应為为這这那個个些就都也很把被給给讓让對对於于從从而但已經经過过著着得之做才一好" +
    "哈呵嘿嗯哦噢喔呃唉哎嗨欸誒诶嘻呜嗚哇哟喲喂啦哩咧咯囉罗啰呦").split(""),
);

/* ---------- Latin: only what can never name a matter by itself ---------- */

const LATIN_EMPTY: Record<string, string> = {
  en: "i me my mine myself we our us you your he him his she her hers it its they them their this that these those the a an and or but so to of in on at for with by from is am are was were be been do does did have has had will would can could should not yes no ok okay hi hello hey lol haha hmm test thanks please just really very about there here now then well oh ah um",
  fr: "je tu il elle on nous vous ils elles me te se moi toi lui eux le la les un une des du de d l au aux à a et ou mais si que qui ne pas est sont suis ai as ont ce cet cette ces mon ma mes ton ta tes son sa ses oui non bonjour salut merci svp",
  de: "ich du er sie es wir ihr mich mir dich dir ihn ihm uns euch mein meine dein deine sein seine der die das den dem des ein eine einen einem einer und oder aber ist sind bin bist war nicht ja nein hallo danke bitte",
  es: "yo tú tu él ella usted nosotros ellos ellas me te se lo la los las le les un una unos unas el de del al a y o pero es son soy está están mi mis su sus sí si no hola gracias por favor",
  pt: "eu tu ele ela você vocês nós eles elas me te se lhe o a os as um uma uns umas de do da dos das no na e ou mas é são sou está estão meu minha seu sua sim não nao olá ola oi obrigado obrigada por favor",
};
const latinEmpty = new Map<string, Set<string>>();
function emptyWords(locale: Locale): Set<string> {
  const key = locale in LATIN_EMPTY ? locale : "en";
  let s = latinEmpty.get(key);
  if (!s) {
    s = new Set((LATIN_EMPTY[key]! + " " + LATIN_EMPTY.en!).split(" "));
    latinEmpty.set(key, s);
  }
  return s;
}
const VOWEL = /[aeiouyàâäáãåæéèêëíìîïóòôöõøúùûüýÿ]/i;
// rows of the keyboard, as a hand rolls over them
const KEY_RUN = /(?:asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|wert|erty|rtyu|tyui|yuio|uiop|zxcv|xcvb|cvbn|vbnm|qwertz|azerty|wasd|jkl)/;

/**
 * The rule layer's verdict on a question, or null when it may be a matter.
 * Pure and cheap: runs on every keystroke on the page and again on the server.
 */
/**
 * Is this string still being typed? (09-22, from the funnel review.)
 *
 * Four of the day's eleven model refusals were people mid-keystroke:
 * 「現在這ㄧㄤ」, 「孫ㄏㄨㄛ ㄔ」 — those are bopomofo, the Zhuyin IME's
 * composition buffer, which only ever appears on screen *while a character is
 * being assembled*. Two more were 「F 現」 then 「F 現在」 a second apart, and
 * one reader was refused twice in thirty seconds on 「如果我打了一段嚴肅一點
 * 來結束這段」 — a real question, caught halfway. Someone refused twice while
 * typing does not try a third time.
 *
 * So: never judge a string that carries an in-flight IME buffer, and never
 * judge one that looks like it stopped mid-word. The check waits; nothing is
 * lost, because it runs again when they actually stop.
 */
const IME_IN_FLIGHT = /[\u3100-\u312F\u31A0-\u31BF]|[\u1100-\u11FF\u3130-\u318F]/u;
export function looksMidTyping(q: string): boolean {
  const s = q.trim();
  if (!s) return false;
  // bopomofo (Zhuyin) or isolated Hangul jamo on screen = the IME is still composing
  if (IME_IN_FLIGHT.test(s)) return true;
  // a trailing lone Latin letter or digit after CJK: "F 現" — a half-typed token
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]\s*[A-Za-z0-9]$/u.test(s)) return true;
  return false;
}

export function questionIssue(raw: string, locale: Locale): QuestionIssue | null {
  const s = (raw ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (s.length < 2) return "empty";
  if (isCrisis(s)) return "crisis";
  const letters = s.replace(NON_LETTER, "");
  if (letters.length === 0) return "noise"; // "???", "。。。", "123", "😂😂"
  const distinct = new Set(Array.from(letters));
  if (distinct.size === 1) return "noise"; // ああ, aaaa, 哈哈哈
  if (letters.length >= 4 && distinct.size === 2) return "noise"; // hahaha, 呵呵呵呵
  if (FILLER_EXACT.has(normalizeQ(s))) return "filler";

  const han = letters.match(/\p{Script=Han}/gu) ?? [];
  const kana = letters.match(/[\p{Script=Hiragana}\p{Script=Katakana}ー]/gu) ?? [];
  const hangul = letters.match(/\p{Script=Hangul}/gu) ?? [];

  // Japanese: kanji carry the matter; a kana-only string must be a real sentence
  if (kana.length > 0 && kana.length >= hangul.length) {
    if (han.some((c) => !HAN_EMPTY.has(c) && !"私僕俺何事方様達今".includes(c))) return null;
    const katakana = letters.match(/[\p{Script=Katakana}ー]{2,}/gu) ?? [];
    if (katakana.length > 0) return null; // a loanword names something (オファー, デート)
    return letters.length >= 6 && distinct.size >= 4 ? null : "filler";
  }
  // Chinese: at least one character that is neither grammar nor an interjection
  if (han.length > 0 && han.length >= hangul.length) {
    return han.some((c) => !HAN_EMPTY.has(c)) ? null : "filler";
  }
  // Korean: two syllables (jamo alone — ㅋㅋ, ㅠㅠ — are noise). Particles share
  // their syllables with content words (이직, 지금), so no syllable stoplist here:
  // the exact-filler list and the model take the rest.
  if (hangul.length > 0) {
    const syllables = letters.match(/[가-힣]/gu) ?? [];
    if (syllables.length === 0) return "noise";
    return syllables.length >= 2 ? null : "filler";
  }
  // Latin scripts: drop the words that cannot name a matter, look at what is left
  const words = normalizeQ(s).split(" ").filter(Boolean);
  const empty = emptyWords(locale);
  const content = words.filter((w) => !empty.has(w));
  if (content.length === 0) return "filler"; // "Him", "is it", "ok thanks"
  if (content.some((w) => KEY_RUN.test(w))) return "noise";
  const joined = content.join("");
  if (joined.length < 2) return "filler"; // "ex", "tv" stay: two letters can name a matter
  if (!VOWEL.test(joined)) return "noise"; // "hjkl", "xkcd" — nothing pronounceable
  return null;
}

/* ---------- the model layer ---------- */

export type MatterVerdict = "yes" | "no" | "unsure";

/**
 * The screening prompt. Deliberately permissive: the cost of refusing a real
 * matter (a stuck reader) is far higher than the cost of reading on a vague one.
 */
export function matterPrompt(): string {
  return [
    "You screen the text a visitor typed into the question box of a divination site, before a reading is made.",
    "Decide ONLY whether the text names a MATTER — something in the person's own life or situation they want an answer about:",
    "a decision, a relationship, someone's feelings or next move, a job, money, an exam, a move, a trip, a health worry, a timing question, an outcome.",
    "Fragments, a single topic word (job, 前任, 搬家, 취업), casual or dialect phrasing, vague or oddly worded questions, and questions in any language all COUNT as a matter → YES.",
    "Answer NO only when there is clearly no matter at all:",
    "- a greeting, an interjection, a sigh, laughter, a thank-you;",
    "- a test or placeholder string, random characters, a number, an emoji;",
    "- a request aimed at the site itself (who are you, how does this work, read my fortune, cast for me, tell me something);",
    "- a bare statement with nothing to be answered (the weather is nice, I am thirty, I like cats);",
    "- a quotation, lyric, proverb or joke.",
    "If in doubt, answer YES. Reply with exactly one word: YES or NO.",
  ].join("\n");
}

/** Read the model's one word; anything else is "unsure", and unsure never blocks. */
export function parseVerdict(raw: string): MatterVerdict {
  const t = (raw ?? "").trim().toUpperCase();
  const yes = /\bYES\b/.test(t);
  const no = /\bNO\b/.test(t);
  if (yes === no) return "unsure"; // neither word, or both
  return no ? "no" : "yes";
}

/** Cache key for a verdict: the wording, not the punctuation or case. */
export function matterKey(question: string, locale: Locale): string {
  return `${locale}|${normalizeQ(question.normalize("NFKC"))}`;
}
