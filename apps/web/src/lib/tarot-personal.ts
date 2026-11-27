import { letterOn } from "./letter-switch";
import { chatJson, type LlmMessage } from "./llm";
import { CANTONESE_NOTE, HK_WRITTEN_NOTE, LANGUAGE_NOTE_FOR_DAILY } from "./reading";
import { customerIdByEmail, recordOps, recordOrder, sessionRefunded, upsertCustomer } from "./db";
import type { CheckoutSession } from "./stripe";
import { record } from "./analytics-server";
import { toHant } from "./hant";
import { isLocale, LOCALE_META, type Locale } from "./locales";
import {
  ANSWERS, POSITIONS, cardById, dealtOf, dueTarotRevisits, kindOf, markTarotPaid, markTarotRevisitSent, meaningOf,
  setTarotFollowup, setTarotPersonal, tarotDraw, type TarotDraw,
} from "./tarot";
import { cardName, cardsLineIn, positionsIn, tarotText } from "./tarot-text";
import { meaningIn } from "./tarot-meaning-text";

/**
 * 10-16 进度表 68: the paid layer of 線上塔羅 — the cards read against the reader's own matter, at the light-reading price
 * (members: a light reading from their allowance). The model works only from the meaning library's text for these cards
 * (overall + the love / work part for the kind of question) and the question; it never invents a card meaning, never
 * gives a date (that is what a cast is for), never names a deity. Same shape and same checks as 解籤's personal reading
 * (lib/qian-personal.ts): written the first time the result page is opened after payment, or by the fulfil sweep for a
 * buyer who never came back (who then gets the link by mail). One follow-up included. The reader may pick a day to be
 * asked what happened; the sweep sends that letter (four one-tap answers).
 *
 * 10-29 进度表 128: a spread drawn on a page in another language is read in that language — the cards under their
 * standard names there, the meanings from the translated library, the same rules checked with that language's words.
 * The Chinese pages keep exactly the prompts and checks they had.
 */
/** the language a spread is read in: zh and zh-hant keep the Traditional source (the 简体 page converts it) */
const readLocale = (d: Pick<TarotDraw, "locale">): Locale => (isLocale(d.locale) ? d.locale : "zh-hant");
const isZh = (l: string) => l === "zh" || l === "zh-hant";
export const TAROT_PATH = "/zh-hant/tarot";
export const tarotResultPath = (token: string, locale = "zh-hant") => `/${locale}/tarot/r/${token}`;

export interface TarotPersonal { reading: string; cards: string[]; watch: string; next: string }
export interface TarotFollowup { answer: string; cast: boolean }

// 10-17: 準 only as a claim of accuracy (準確、很準、準不準、靈準) — 準備、標準、精準 are ordinary words, and banning them
// failed good readings three times over and kept a paying reader waiting
const FORBIDDEN = /神明|神說|神说|神諭|神谕|靈驗|灵验|改運|改运|保證|保证|一定會|一定会|命中注定|\bAI\b|人工智慧|準確|准确|(很|超|好|最|蠻|真|算得?)[準准]|[準准]不[準准]|靈[準准]|灵[準准]/;

/** 10-17: the words that name the reader's matter — Han bigrams of the question (minus the asking words) and Latin words */
const STOP = new Set(["什麼", "時候", "會不", "不會", "會有", "有沒", "沒有", "可以", "這個", "那個", "我們", "他們", "自己", "現在", "怎麼", "怎樣", "是否", "能不", "應該", "要不", "不要", "還有", "還是", "一下", "多久", "何時", "幾時", "接下", "下來", "未來", "以後", "之後", "最近", "如何", "為什", "麼時", "嗎我", "我的", "我會", "他會", "會在", "起勢", "能夠"]);
const FUNC = /[的了嗎嗎呢吧是在我你妳他她它要不能可怎麼什誰哪會有沒還和與跟對把被就都也很再又這那個些時候]/;
export function matterTerms(question: string): string[] {
  const q = toHant(question);
  const out = new Set<string>();
  for (const w of q.match(/[A-Za-z][A-Za-z0-9]{2,}/g) ?? []) out.add(w.toLowerCase());
  for (const run of q.match(/[\u4e00-\u9fff]+/g) ?? []) for (let i = 0; i + 1 < run.length; i++) { const b = run.slice(i, i + 2); if (!STOP.has(b) && !FUNC.test(b)) out.add(b); }
  return [...out];
}
/**
 * 10-29 进度表 128: the same, for a question in another language — Latin words of 4+ letters (minus the asking words,
 * matched on their first five letters so 'website' finds 'websites'), Japanese kanji pairs and katakana words, Korean words
 * without their particles (matched on their first two syllables).
 */
const LATIN_STOP = new Set(("will would should could does what when where which with this that there their they them have from about into more much very going next after before still really ever never again other some your mine " +
  "est-ce avec dans pour mais plus cette sera quand quoi comment elle nous vous leur notre votre faire être avoir aussi encore " +
  "wird werde wann warum was mein meine meinen meinem sein seine ihre nicht noch mehr schon diese dieser haben kann soll sollte werden unsere unser jetzt " +
  "será cuándo cómo para pero más este esta esto ella ellos nuestro tengo tiene puede debo debería vamos ahora todavía " +
  "quando como mais isso eles nosso tenho pode devo minha agora ainda").split(" "));
const KO_PARTICLE = /(?:에서|으로|이랑|한테|에게|까지|부터|하고|은|는|이|가|을|를|에|과|와|의|도|로|랑|만)$/;
const KO_STOP = new Set(["어떻게", "될까", "될까요", "앞으로", "지금", "이번", "그냥", "정말", "과연", "언제", "어떤", "무엇", "있을까", "있을까요", "할까", "할까요", "좋을까", "좋을까요"]);
export function matterTermsIn(question: string, locale: string): string[] {
  if (isZh(locale)) return matterTerms(question);
  const out = new Set<string>();
  if (locale === "ja") {
    for (const run of question.match(/[\u4e00-\u9fff]+/g) ?? []) for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2));
    for (const w of question.match(/[\u30a0-\u30ff]{3,}/g) ?? []) out.add(w);
    for (const w of question.match(/[A-Za-z][A-Za-z0-9]{2,}/g) ?? []) out.add(w.toLowerCase());
    return [...out];
  }
  if (locale === "ko") {
    for (const raw of question.split(/[\s,.?!·]+/)) {
      const w = raw.replace(/[^\uac00-\ud7af]/g, "").replace(KO_PARTICLE, "");
      if (w.length >= 2 && !KO_STOP.has(w) && !KO_STOP.has(raw)) out.add(w.slice(0, 2));
    }
    return [...out];
  }
  for (const raw of question.toLowerCase().match(/[\p{L}][\p{L}'’-]{3,}/gu) ?? []) {
    const w = raw.replace(/^[ldjmnst]['’]/, "");
    if (w.length >= 4 && !LATIN_STOP.has(w)) out.add(w.slice(0, 5));
  }
  return [...out];
}
/** does the reading talk about THIS matter? at least two of its words (or the only one) appear */
export function offTopic(p: TarotPersonal, question: string, locale = "zh-hant"): boolean {
  const terms = matterTermsIn(question, locale);
  if (!terms.length) return false;
  const all = `${p.reading} ${p.cards.join(" ")} ${p.watch}`;
  const text = (isZh(locale) ? toHant(all) : all).toLowerCase();
  const hits = terms.filter((t) => text.includes(t)).length;
  return hits < (terms.length <= 3 ? 1 : 2);
}
const DATEISH = /\d{1,2}\s*[月日號号]|[一二三四五六七八九十]+[月日]|下週|下周|這週|这周|本週|本周|幾天內|几天内|\d+\s*天|月底|年底|明年|今年/;

/* 10-29 进度表 128: the same three checks — no promise, no date, no 'draw again' — in the seven other languages */
const FORBIDDEN_FOREIGN: Record<string, RegExp> = {
  en: /\b(guaranteed|I guarantee|will definitely|definitely will|is destined|are destined|fated|100 ?%|accurate|AI|artificial intelligence|the gods?|divine (?:will|message))\b/i,
  ja: /絶対|必ず|100\s*%|１００％|当た(?:ります|る|った)|保証|運命(?:です|で決まって)|神様が|お告げ|\bAI\b|人工知能|改運|開運/,
  ko: /반드시|무조건|100\s?%|보장|틀림없이|정확(?:합니다|해요|한 결과)|운명(?:입니다|이에요)|신의 뜻|\bAI\b|인공지능|개운/,
  fr: /\b(garanti(?:e|es|s)?|je vous garantis|à coup sûr|sans aucun doute|100 ?%|destin(?:é|ée)s? à|prédestiné\w*|IA|intelligence artificielle|les dieux)\b/i,
  de: /\b(garantiert|ich garantiere|ganz sicher|auf jeden Fall|100 ?%|vorherbestimmt|schicksalhaft|KI|künstliche Intelligenz|die Götter)\b/i,
  es: /\b(garantizad[oa]s?|te garantizo|sin duda|con toda seguridad|100 ?%|predestinad[oa]s?|destinad[oa]s? a|IA|inteligencia artificial|los dioses)\b/i,
  pt: /\b(garantid[oa]s?|eu garanto|com certeza|sem dúvida|100 ?%|predestinad[oa]s?|destinad[oa]s? a|IA|inteligência artificial|os deuses)\b/i,
};
const DATEISH_FOREIGN: Record<string, RegExp> = {
  en: /\b(january|february|march|april|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|next month|this month|next year|this year|end of the (?:month|year)|within \d+ (?:days|weeks)|in \d+ (?:days|weeks)|\d+ days)\b/i,
  ja: /\d+\s*[月日]|[一二三四五六七八九十]+[月日]|来週|今週|再来週|来月|今月|月末|年末|来年|今年|週末|\d+日以内|数日以内|曜日/,
  ko: /\d+\s*(?:월|일)(?![가-힣])|다음\s?주|이번\s?주|다음\s?달|이번\s?달|월말|연말|내년|올해|주말|며칠\s?(?:안|내)|요일/,
  fr: /\b(janvier|février|avril|juin|juillet|août|septembre|octobre|novembre|décembre|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|la semaine prochaine|cette semaine|le mois prochain|ce mois-ci|l'an prochain|l'année prochaine|cette année|fin du mois|fin de l'année|dans \d+ jours|d'ici \d+ jours|\d+ jours)\b/i,
  de: /\b(januar|februar|märz|juni|juli|oktober|dezember|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|nächste woche|diese woche|nächsten monat|diesen monat|nächstes jahr|dieses jahr|monatsende|jahresende|ende des monats|in \d+ tagen|\d+ tage)\b/i,
  es: /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|lunes|martes|miércoles|jueves|viernes|sábado|domingo|la próxima semana|la semana que viene|esta semana|el próximo mes|el mes que viene|este mes|el próximo año|el año que viene|este año|fin de mes|fin de año|en \d+ días|\d+ días)\b/i,
  pt: /\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sábado|domingo|semana que vem|próxima semana|esta semana|mês que vem|próximo mês|este mês|ano que vem|próximo ano|este ano|fim do mês|fim do ano|em \d+ dias|\d+ dias)\b/i,
};
const REDRAW_FOREIGN: Record<string, RegExp> = {
  en: /\b(draw again|redraw|draw another|another card|pull another|draw more cards|reshuffle)\b/i,
  ja: /引き直|もう一枚|もう1枚|再度引|カードを追加/,
  ko: /다시 뽑|한 장 더|카드를 더/,
  fr: /\b(tirer une autre carte|tirez une autre carte|une autre carte|tirer à nouveau|retirer une carte)\b/i,
  de: /\b(noch eine Karte|nochmal ziehen|noch einmal ziehen|neu ziehen|weitere Karten? ziehen)\b/i,
  es: /\b(otra carta|sacar otra|saca otra|volver a sacar|vuelve a sacar)\b/i,
  pt: /\b(outra carta|tirar outra|tire outra|tirar de novo|tire de novo)\b/i,
};
/** the word "next" must carry for a cast, per language (the prompt asks for it by name) */
const HEX_WORD: Record<string, string> = { en: "hexagram", ja: "卦", ko: "괘", fr: "hexagramme", de: "Hexagramm", es: "hexagrama", pt: "hexagrama" };
const NEXT_CAST = /卦|괘|hexagram|I ?Ching|I ?Ging|Yi ?Jing|Yi ?King/i;
/** the writing system the text must stay in */
const WRONG_SCRIPT: Record<string, RegExp> = {
  ja: /[\uac00-\ud7af]/,
  ko: /[\u3040-\u30ff\u3400-\u9fff]/,
  latin: /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/,
};
const scriptRe = (l: string) => WRONG_SCRIPT[l] ?? WRONG_SCRIPT.latin!;
const forbiddenRe = (l: string) => (isZh(l) ? FORBIDDEN : FORBIDDEN_FOREIGN[l] ?? FORBIDDEN_FOREIGN.en!);
const dateRe = (l: string) => (isZh(l) ? DATEISH : DATEISH_FOREIGN[l] ?? DATEISH_FOREIGN.en!);
const redrawRe = (l: string) => (isZh(l) ? /再抽|重抽|再翻|多抽一張|再抽一張/ : REDRAW_FOREIGN[l] ?? REDRAW_FOREIGN.en!);

function cardsFor(d: TarotDraw) {
  const kind = kindOf(d.question);
  const loc = readLocale(d);
  // the Chinese pages: the 繁體 library as it always was; another language: its standard card names and translated meanings
  const zh = isZh(loc);
  const pos = zh ? POSITIONS[d.spread] : positionsIn(loc, d.spread);
  const ui = tarotText(zh ? "zh-hant" : loc).ui;
  return dealtOf(d).map((x, i) => {
    const c = cardById(x.id)!;
    const m = zh ? meaningOf(x.id) : meaningIn(x.id, loc);
    const side = m ? (x.rev ? m.reversed : m.upright) : null;
    return {
      position: pos[i] ?? "",
      card: zh ? c.zh : cardName(x.id, loc), orientation: zh ? (x.rev ? "逆位" : "正位") : (x.rev ? ui.reversed : ui.upright),
      keywords: m ? (x.rev ? m.keywords.reversed : m.keywords.upright) : [],
      meaning: side ? { overall: side.overall, ...(kind === "love" ? { love: side.love } : kind === "work" ? { work: side.work } : {}) } : null,
    };
  });
}

/** 10-29 进度表 128: the prompt for a spread read in another language — the same rules, said for that language */
function foreignSystem(locale: Locale, spread: number, followup: boolean): string {
  const lang = LOCALE_META[locale].english;
  const latin = !LOCALE_META[locale].cjk;
  const pos = positionsIn(locale, spread);
  const hex = HEX_WORD[locale] ?? "hexagram";
  const rules = [
    "You write for YaoFlow, a site about the Yijing (I Ching) and tarot. A reader drew tarot cards for one matter of their own and asks how the cards read for it.",
    `OUTPUT LANGUAGE: ${lang}. ${LANGUAGE_NOTE_FOR_DAILY(locale)} Short plain sentences, second person, like a knowledgeable friend talking — warm, never preachy, never frightening.${latin ? " No Chinese, Japanese or Korean characters anywhere." : locale === "ko" ? " Hangul only: no Chinese characters (hanja) and no Japanese kana." : " Natural Japanese: no hangul."}`,
    "Use ONLY the card meanings you are given (overall, and love or work where given). Do not invent other meanings for these cards. Call each card by the name you are given — it is the standard name in this language. A reversed card is the same energy blocked, delayed, turned inward or overdone — never an omen of doom.",
    spread === 3 ? `The three cards sit in positions: ${pos[0]} (where it stands), ${pos[1]} (what is in the way), ${pos[2]} (where it is heading if nothing changes). Read them as one story.` : `The single card answers "${pos[0]}" — where this matter stands now.`,
    "STAY ON THEIR MATTER: name it in its own words (their website's traffic, this job, your relationship) in the reading and in the card lines. Translate each card's meaning into that matter's terms — for a business, a website or a product: the product, the people it serves, the effort, what to push and what to stop; for work: the job, the boss, the offer; for a relationship: the two people. The card meanings you are given may speak of other areas of life; keep only what applies and say it in the matter's terms. Never bring in another domain's words — no talk of romance, closeness or quarrels for a business or work question.",
    "If they ask WHEN or how long: say once, plainly, that the cards show where it stands and what has to happen first, not the day — then read what has to happen first.",
    "Read honestly: if the cards point to an obstacle, say where it lies and what to do now. Do not flatter.",
    "HARD RULES: never say a deity, the universe or the cards 'said' or 'promised' anything; never promise or guarantee an outcome (no 'definitely', 'guaranteed', '100%', 'destined' or their equivalents); never call anything accurate; never mention AI; never give a date, a month, a weekday, a week, a number of days or any time point — tarot here gives no dates, casting a hexagram does; no medical, legal or investment advice; nothing about a third party in a relationship; never criticise the reader.",
  ];
  const n = (cjk: string, words: string) => (latin ? words : cjk);
  if (followup) return [...rules, `This time the reader asks ONE follow-up about the same matter, after reading what you wrote earlier (earlier_reading). Answer the follow-up itself — do not write a new reading — from the same cards and meanings, in ${n("80–160 characters", "40–80 words")}. If they ask WHEN or how long, say plainly that tarot gives no days and that casting a hexagram for the same matter is how to see that, and set cast=true.`, `Output JSON only: {"answer": "<${n("80–160 characters", "40–80 words")}>", "cast": true|false}`].join("\n");
  return [
    ...rules,
    `Output JSON only: {"reading": "<how these cards read for their question: ${spread === 3 ? n("220–320 characters", "110–160 words") : n("160–240 characters", "80–120 words")}>", "cards": [<one line per card, in order, ${n("25–50 characters", "12–25 words")} each: what THIS card says about their matter>], "watch": "<one concrete thing to watch for or do now: ${n("30–60 characters", "12–25 words")}>", "next": "<one sentence, ${n("20–40 characters", "10–20 words")}, a question that names THEIR matter in a few plain words and leads to finding out WHEN by casting a hexagram for it; it must contain the word ${hex}. Never suggest drawing more cards>"}`,
  ].join("\n");
}

export function tarotSystem(register?: string | null, spread = 1, followup = false, locale: string = "zh-hant"): string {
  if (!isZh(locale) && isLocale(locale)) return foreignSystem(locale, spread, followup);
  const rules = [
    "You write for YaoFlow, a Taiwanese site about the Yijing, temple lots and now tarot. A reader drew tarot cards for one matter of their own and asks how the cards read for it.",
    register === "yue" ? `Short plain sentences, second person, like a knowledgeable friend — warm, never preachy, never frightening. ${CANTONESE_NOTE}`
      : register === "hk" ? `Write in Traditional Chinese, short plain sentences, second person 你, like a knowledgeable friend — warm, never preachy, never frightening. ${HK_WRITTEN_NOTE}`
      : "Write in Traditional Chinese as people in Taiwan write it, short plain sentences, second person 你, like a knowledgeable friend talking — warm, never preachy, never frightening.",
    "Use ONLY the card meanings you are given (overall, and love or work where given). Do not invent other meanings for these cards. A reversed card is the same energy blocked, delayed, turned inward or overdone — never an omen of doom.",
    spread === 3 ? "The three cards sit in positions: 現在 (where it stands), 卡住的地方 (what is in the way), 接下來 (where it is heading if nothing changes). Read them as one story." : "The single card answers 這件事現在 — where this matter stands now.",
    "STAY ON THEIR MATTER: name it in its own words (e.g. 網站的流量、這份工作、你們的關係) in the reading and in the card lines. Translate each card's meaning into that matter's terms — for a business, a website or a product: the product, the people it serves, the effort, what to push and what to stop; for work: the job, the boss, the offer; for a relationship: the two people. The card meanings you are given may speak of other areas of life; keep only what applies and say it in the matter's terms. Never bring in another domain's words — no 對話、姿態、爭執、靠近、感情 for a business or work question.",
    "If they ask WHEN (什麼時候、何時、多久、幾時、起勢): say once, plainly, that the cards show where it stands and what has to happen first, not the day — then read what has to happen first.",
    "Read honestly: if the cards point to an obstacle, say where it lies and what to do now. Do not flatter.",
    "HARD RULES: never say a deity or the cards 'said' or 'promised' anything; never use 靈驗、改運、保證、一定、準、命中注定、AI; never give a date, a month, a week, a number of days or any time point — tarot here gives no dates, a cast does; no medical, legal or investment advice; nothing about a third party in a relationship; never criticise the reader.",
  ];
  if (followup) return [...rules, "This time the reader asks ONE follow-up about the same matter, after reading what you wrote earlier (earlier_reading). Answer the follow-up itself — do not write a new reading — from the same cards and meanings, in 80–160 characters. If they ask WHEN or how long, say plainly that tarot gives no days and that casting a hexagram for the same matter is how to see that, and set cast=true.", 'Output JSON only: {"answer": "<80–160 characters>", "cast": true|false}'].join("\n");
  return [
    ...rules,
    `Output JSON only: {"reading": "<how these cards read for their question: ${spread === 3 ? "220–320" : "160–240"} characters>", "cards": [<one line per card, in order, 25–50 characters each: what THIS card says about their matter>], "watch": "<one concrete thing to watch for or do now: 30–60 characters>", "next": "<one sentence, 20–40 characters, a question that names THEIR matter in a few plain words and leads to finding out WHEN by casting a hexagram for it (起一卦); it must contain 卦. Never suggest drawing more cards>"}`,
  ].join("\n");
}

export function tarotUser(d: TarotDraw): string {
  const loc = readLocale(d);
  const kinds = isZh(loc) ? { love: "感情", work: "工作與事業", overall: "其他" } : tarotText(loc).kinds;
  return JSON.stringify({ cards: cardsFor(d), reader: { question: d.question, kind_of_matter: kinds[kindOf(d.question)] } });
}

export function tarotOffense(p: TarotPersonal, n: number, locale: string = "zh-hant"): string | null {
  const all = `${p.reading} ${p.cards.join(" ")} ${p.watch} ${p.next}`;
  const f = all.match(forbiddenRe(locale));
  if (f) return `forbidden:${f[0]}`;
  const t = all.match(dateRe(locale));
  if (t) return `date:${t[0]}`;
  const redraw = all.match(redrawRe(locale));
  if (redraw) return `redraw:${redraw[0]}`;
  if (!isZh(locale)) { const w = all.match(scriptRe(locale)); if (w) return `script:${w[0]}`; }
  if (p.reading.length < 100) return "short";
  if (p.cards.length !== n) return "cards";
  if (!(isZh(locale) ? /卦/ : NEXT_CAST).test(p.next)) return "next:no-cast";
  return null;
}

/** the follow-up answer: the same words checked (10-29: in the spread's language) */
export function followupOffense(answer: string, locale: string = "zh-hant"): string | null {
  const f = answer.match(forbiddenRe(locale)) ?? answer.match(dateRe(locale));
  if (f) return f[0];
  if (!isZh(locale)) { const w = answer.match(scriptRe(locale)); if (w) return `script:${w[0]}`; }
  return null;
}

function parse(raw: string): TarotPersonal | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const s = (k: string) => (typeof j[k] === "string" ? (j[k] as string).trim() : "");
    const cards = Array.isArray(j.cards) ? (j.cards as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.trim()) : [];
    const p = { reading: s("reading"), cards, watch: s("watch"), next: s("next") };
    return p.reading && p.next ? p : null;
  } catch { return null; }
}

const writing = new Map<string, Promise<TarotPersonal | null>>();

/** Write (once) the personal reading of a paid spread; concurrent callers share one generation. */
export function ensureTarotPersonal(token: string): Promise<TarotPersonal | null> {
  const d = tarotDraw(token);
  if (!d || !d.paid_at) return Promise.resolve(null);
  if (d.personal_json) { try { return Promise.resolve(JSON.parse(d.personal_json) as TarotPersonal); } catch { /* rewrite */ } }
  const running = writing.get(token);
  if (running) return running;
  const p = (async () => {
    const loc = readLocale(d);
    const messages: LlmMessage[] = [{ role: "system", content: tarotSystem(d.register, d.spread, false, loc) }, { role: "user", content: tarotUser(d) }];
    let last = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await chatJson(messages, { temperature: attempt === 0 ? 0.6 : 0.4, maxTokens: 1400 });
        const out = parse(raw);
        if (!out) { last = "parse"; continue; }
        // off-topic is sent back twice; a third draft is kept rather than leaving a paying reader without a reading
        const bad = tarotOffense(out, d.spread, loc) ?? (attempt < 2 && offTopic(out, d.question, loc) ? "off-topic" : null);
        if (!bad) { setTarotPersonal(token, JSON.stringify(out)); recordOps("tarot_personal", `${d.spread} ${attempt}`); return out; }
        last = bad;
        messages.push({ role: "assistant", content: raw }, { role: "user", content: isZh(loc)
          ? `REWRITE REQUIRED (${bad}).${bad === "off-topic" ? ` The reading drifted away from their matter. Their question: 「${d.question}」 — name that matter in its own words and read every card for it; drop words from other areas of life.` : ""} Follow the HARD RULES: only the given meanings, no deity speaking, no 靈驗/改運/保證/一定/準, no date, month, week or number of days anywhere, one line per card in "cards", and "next" names their matter and leads to casting a hexagram (it must contain 卦) — never to drawing more cards. Output the ENTIRE JSON again.`
          : `REWRITE REQUIRED (${bad}).${bad === "off-topic" ? ` The reading drifted away from their matter. Their question: "${d.question}" — name that matter in its own words and read every card for it; drop words from other areas of life.` : ""}${bad.startsWith("script:") ? ` Write in ${LOCALE_META[loc].english} only — that character does not belong in it.` : ""} Follow the HARD RULES: only the given meanings, no deity speaking, no promise or guarantee, nothing called accurate, no date, month, weekday, week or number of days anywhere, one line per card in "cards", and "next" names their matter and leads to casting a hexagram (it must contain the word ${HEX_WORD[loc] ?? "hexagram"}) — never to drawing more cards. Output the ENTIRE JSON again.` });
      } catch (err) { last = err instanceof Error ? err.message.slice(0, 60) : "?"; }
    }
    recordOps("tarot_personal_fail", `${token.slice(-6)} ${last}`);
    return null;
  })().finally(() => writing.delete(token));
  writing.set(token, p);
  return p;
}

/* ---------------- the one follow-up ---------------- */

export async function answerTarotFollowup(token: string, question: string): Promise<{ ok: true; followup: TarotFollowup } | { ok: false; why: "no_draw" | "unpaid" | "no_reading" | "used" | "failed" }> {
  const d = tarotDraw(token);
  if (!d) return { ok: false, why: "no_draw" };
  if (!d.paid_at || sessionRefunded(d.paid_session)) return { ok: false, why: "unpaid" };
  if (d.followup_at) return { ok: false, why: "used" };
  const personal = d.personal_json ? (JSON.parse(d.personal_json) as TarotPersonal) : await ensureTarotPersonal(token);
  if (!personal) return { ok: false, why: "no_reading" };
  const q = question.replace(/\s+/g, " ").trim().slice(0, 200);
  const messages: LlmMessage[] = [
    { role: "system", content: tarotSystem(d.register, d.spread, true, readLocale(d)) },
    { role: "user", content: JSON.stringify({ ...JSON.parse(tarotUser(d)), earlier_reading: personal.reading, follow_up: q }) },
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await chatJson(messages, { temperature: 0.5, maxTokens: 600 });
      const j = JSON.parse(raw) as { answer?: unknown; cast?: unknown };
      const answer = typeof j.answer === "string" ? j.answer.trim() : "";
      if (!answer || followupOffense(answer, readLocale(d))) { messages.push({ role: "assistant", content: raw }, { role: "user", content: "REWRITE REQUIRED: no forbidden words, no promise, no date or time point, only the reader's language. Output the JSON again." }); continue; }
      const f = { answer, cast: j.cast === true };
      if (!setTarotFollowup(token, q, JSON.stringify(f))) return { ok: false, why: "used" };
      return { ok: true, followup: f };
    } catch { /* retry */ }
  }
  return { ok: false, why: "failed" };
}
export function tarotFollowupOf(d: Pick<TarotDraw, "followup_q" | "followup_json">): { question: string; followup: TarotFollowup } | null {
  if (!d.followup_q || !d.followup_json) return null;
  try { return { question: d.followup_q, followup: JSON.parse(d.followup_json) as TarotFollowup }; } catch { return null; }
}

/* ---------------- payment ---------------- */

export type TarotPayResult = { ok: true; created: boolean; token: string } | { ok: false; why: "not_tarot" | "unpaid" | "no_draw" };

/** A paid kind=tarot session → the spread marked paid and the order recorded (tier "tarot"). Idempotent. */
export function fulfilTarotPayment(s: CheckoutSession): TarotPayResult {
  if (s.metadata?.kind !== "tarot") return { ok: false, why: "not_tarot" };
  if (s.payment_status !== "paid") return { ok: false, why: "unpaid" };
  const token = s.metadata?.tarot ?? "";
  const d = tarotDraw(token);
  if (!d) return { ok: false, why: "no_draw" };
  const email = (s.customer_details?.email || s.metadata?.email || "").toLowerCase() || null;
  const amount = (s as { amount_total?: number }).amount_total ?? 0;
  const currency = (s.currency ?? s.metadata?.currency ?? "").toUpperCase();
  const customerId = Number(s.metadata?.cust) || (email ? customerIdByEmail(email) ?? upsertCustomer(email, readLocale(d)) : null);
  recordOrder({
    sessionId: s.id, customerId, castId: null, tier: "tarot", amountCents: amount, currency, email, status: "paid",
    paymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : null, campaign: s.metadata?.c ?? "tarot",
  });
  if (d.paid_at && d.paid_session === s.id) return { ok: true, created: false, token };
  markTarotPaid(token, { session: s.id, email, currency, amountMinor: amount, customerId });
  record({ t: Date.now(), e: "tarot", s: token.slice(-12), locale: d.locale, method: "buy", tier: String(d.spread), cur: currency });
  recordOps("tarot_paid", `${d.spread} ${currency} ${amount}`);
  return { ok: true, created: true, token };
}

/** 10-29 进度表 128: the letters in the spread's own language (简体 for a 简体 page now too) */
const mailLocale = (d: TarotDraw): Locale => readLocale(d);

/** The letter with the link — once per spread (the emails row is the claim). */
export async function mailTarotOnce(token: string, site: string): Promise<"sent" | "already" | "skip" | "failed"> {
  const { db, recordEmail } = await import("./db");
  const { buildTarotEmail, sendEmail } = await import("./email");
  const { CONTACT_EMAIL } = await import("./trust");
  const d = tarotDraw(token);
  if (!d?.paid_at || !d.personal_json) return "skip";
  const email = (d.email ?? "").trim().toLowerCase();
  if (!email) return "skip";
  const claimed = (db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?, 'tarot-mail', ?, ?, 'sending', NULL) ON CONFLICT(session_id, kind) DO NOTHING")
    .run(`tarot:${token}`, email, Date.now()) as unknown as { changes?: number }).changes;
  if (!claimed) return "already";
  // 10-23 进度表 111 ③: what was paid and the receipt, when this was bought on its own
  const { receiptFor } = await import("./receipt");
  const loc = mailLocale(d);
  const m = buildTarotEmail({ t: tarotText(loc).mail, locale: loc, cards: cardsLineIn(dealtOf(d), loc), url: `${site}${tarotResultPath(token, d.locale)}`, receipt: await receiptFor(d.paid_session, loc) });
  const r = await sendEmail(email, m.subject, m.html, m.text, { kind: "tarot", sessionId: d.paid_session ?? `tarot:${token}`, customerId: d.customer_id ?? undefined, replyTo: CONTACT_EMAIL }).catch(() => ({ ok: false, error: "throw" } as { ok: boolean; error?: string; id?: string }));
  recordEmail(`tarot:${token}`, "tarot-mail", email, r.ok ? "sent" : "failed", r.ok ? r.id : r.error);
  return r.ok ? "sent" : "failed";
}

/** The sweep: letters for spreads whose chosen day has come (each once). */
export async function runTarotRevisits(site: string, now = Date.now()): Promise<{ sent: number; failed: number }> {
  if (!letterOn("tarot_revisit")) return { sent: 0, failed: 0 }; // 10-23 进度表 108
  const { buildTarotRevisitEmail, sendEmail } = await import("./email");
  const { CONTACT_EMAIL } = await import("./trust");
  let sent = 0, failed = 0;
  for (const d of dueTarotRevisits(now)) {
    if (!markTarotRevisitSent(d.token, now)) continue;
    const page = `${site}${tarotResultPath(d.token, d.locale)}`;
    const loc = mailLocale(d);
    const t = tarotText(loc);
    const links = ANSWERS.map((a) => ({ label: t.answers[a], url: `${site}/api/tarot/answer?t=${d.token}&a=${a}` }));
    const m = buildTarotRevisitEmail({ t: t.mail, locale: loc, question: d.question, outcome: d.outcome_def, plan: d.plan ?? null, links, pageUrl: page });
    const r = await sendEmail(d.email!, m.subject, m.html, m.text, { kind: "tarot_revisit", sessionId: `tarot-rv:${d.token}`, customerId: d.customer_id ?? undefined, replyTo: CONTACT_EMAIL }).catch(() => ({ ok: false }));
    if (r.ok) sent++; else failed++;
  }
  if (sent || failed) recordOps("tarot_revisit", `sent ${sent} failed ${failed}`);
  return { sent, failed };
}
