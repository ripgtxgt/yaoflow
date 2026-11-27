import { BRANCH_PHASE, clashes, combines, fullChart, generates, najiaFor, overcomes, textsFor, type FullChart, type LineValue, type Phase } from "@yaoflow/engine";
import { SITUATION_FOR_PROMPT, type Odds, type Situation } from "./situation";
import { isoDaysBetween, timingPlan, type QuestionScale, type TimingPlan } from "./timing";
import { isContactQuestion } from "./contact-question";
import { classifyTopic, type Topic } from "./topic";
import { LOCALE_META, type Locale } from "./locales";
import { LOST_ITEM_NOTE, lostItemFacts } from "./lost-item";
import { LAYER_RULE, layerFact } from "./san-cai";
import { BMG_RULE, type BmgOverlay } from "./bmg-overlay";
import { PUBLIC_EVENT_RULE } from "./public-event";
// 10-02: what the browser needs from here lives in reading-keys.ts (this module must stay server-side — see there)
import { pick, READING_KEYS, type Bi, type Localized } from "./reading-keys";
export { pick, READING_KEYS };
export type { Bi, Localized };

export type Tier = "one" | "deep";

/**
 * 一念解读 (reflective) schema.
 * 09-17: the light tier is the mirror, not the plan — situation, inside,
 * outside, a lean, one question. Dates, steps and warnings belong to the
 * deep tier (Neil: "轻解读和深断没什么区别"). Readings made before that
 * still carry movement / next_step / caution, so those stay optional.
 */
export interface Reading {
  summary: Bi;
  inner_condition: Bi;
  outer_condition: Bi;
  movement?: Bi;
  direction: Bi;
  next_step?: Bi;
  caution?: Bi;
  reflection_question: Bi;
  /** 11-05 进度表 134: one thing to do within two weeks (prefills 「你打算怎麼做」); readings before this have none */
  one_step?: Bi;
}

/** 深断 (master) schema — verdict first. `signals` (09-17): the two things to watch, one for the better, one for the worse. */
export interface DeepReading {
  verdict: Bi;
  tendency: Bi;
  timing: Bi;
  basis: Bi;
  strategy: Bi;
  caution: Bi;
  next_step: Bi;
  signals?: Bi;
  closing: Bi;
  /** 09-26: the other side of the matter — what the other person (or the outside) is weighing; readings before this have none */
  other_side?: Bi;
  /** 09-26: 五档倾向, a code (strong / good / even / hard / very_hard) stored under the reading's locale */
  odds?: Bi;
  /** 11-05 进度表 134: one thing to do within two weeks (prefills 「你打算怎麼做」); readings before this have none */
  one_step?: Bi;
}

/** what the light tier writes since 09-17 */
export const ONE_KEYS: (keyof Reading)[] = [
  "summary", "inner_condition", "outer_condition", "direction", "reflection_question",
];

export const DEEP_KEYS: (keyof DeepReading)[] = [
  "verdict", "tendency", "other_side", "timing", "basis", "strategy", "caution", "next_step", "signals", "closing",
];

/** The model's raw answer: one plain string per field, in the requested language. */
export type RawFields = Record<string, string>;

function validFields(x: unknown, keys: string[]): x is RawFields {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v !== "string" || v.trim().length < 8) return false;
  }
  return true;
}

export function validateReading(x: unknown): x is RawFields {
  return validFields(x, ONE_KEYS);
}

/**
 * The light tier must not tell time (09-17): explicit calendar dates, "within
 * N days/weeks", clock hours. Returns the offending field and match, or null.
 */
const DATE_TALK = [
  /\d{1,2}\s*月\s*\d{1,2}\s*[日号號]/, // 9月12日
  /[\d一二两兩三四五六七八九十几幾半]+\s*(?:个|個)?\s*[月週周]\s*(?:内|內|以内|以內|之内|之內|前後|前后|左右|后|後)/, // 两周内 / 3个月内 / 半個月後
  /[\d一二两兩三四五六七八九十几幾]+\s*(?:天|日)(?:内|內|以内|以內|之内|之內|后|後|左右)/, // 7天内 / 十天后
  /(?:半年|[一二两兩三]年)(?:内|內|以内|以內|之内|之內|后|後|左右)/, // 半年后 / 一年内
  /\d{1,2}\s*[点點时時]\s*(?:到|至|[-–~])\s*\d{1,2}\s*[点點时時]?/, // 13点到15点
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i,
  /\bwithin\s+(?:the\s+next\s+)?\d+\s+(?:days?|weeks?|months?)\b/i,
  /\b\d{1,2}\s*(?:月|gatsu)\s*\d{1,2}\s*(?:日|nichi)/i,
  /\d{1,2}월\s*\d{1,2}일/, // ko
  /\b\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|januar|februar|märz|april|juni|juli|august|oktober|dezember|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|janeiro|fevereiro|março|maio|junho|julho|setembro|outubro|novembro|dezembro)\b/i,
];
export function dateTalkOffense(raw: RawFields, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = raw[k] ?? "";
    for (const re of DATE_TALK) {
      const m = v.match(re);
      if (m) return `${k}:${m[0]}`;
    }
  }
  return null;
}
export function validateDeep(x: unknown): x is RawFields {
  return validFields(x, DEEP_KEYS);
}

/** Wrap the raw single-language answer into the stored shape. */
export function localize<T extends Reading | DeepReading>(raw: RawFields, keys: readonly string[], locale: Locale): T {
  const out: Record<string, Localized> = {};
  for (const k of keys) out[k] = { [locale]: raw[k]!.trim() };
  return out as unknown as T;
}

/**
 * Jargon blacklist — enforcement in code, not just in the prompt.
 * Only deep-tier `basis` may contain technical vocabulary. Each writing
 * system has its own list; languages without CJK script must carry no CJK
 * characters at all (a "辛巳 day" is noise to their readers).
 */
const ZH_JARGON = [
  /[子丑寅卯辰巳午未申酉戌亥][金木水火土]/, // 干支+五行 e.g. 酉金
  /(父母|兄弟|子孙|妻财|官鬼)爻/, // 六亲爻名（父母/兄弟/子孙不带"爻"是正常人话，放行）
  /妻财|官鬼/, // 这两个词只在卦理语境出现
  /世爻|应爻|用神|旬空|空亡|月破|日破|日冲|纳甲|六亲|六神|回头克|回头生|化进|化退/,
  /青龙|朱雀|勾陈|螣蛇|腾蛇|白虎|玄武/,
  // 文言压缩与卦名典故：普通读者读不懂的句子（09-15 内测反馈），basis 之外一律重写
  /此局|吉中带阻|偏阻后通|事在收口|先散后聚|先合后散|休囚|旺相|得令|失令|履虎尾|鸿雁|磐石|栋桡|之象|灭顶|潜龙|飞龙|亢龙|龙战/,
  // 地支日名（"再等一个子日""出空在午日""戌日冲辰"）：日期要用公历写；前后缀限定，避免误伤"孩子日常"
  /(?:个|逢|到|等|在|值)[子丑寅卯辰巳午未申酉戌亥]日|[子丑寅卯辰巳午未申酉戌亥]日(?:冲|值|填|出空|前后)/,
];
const ZH_HANT_JARGON = [
  /[子丑寅卯辰巳午未申酉戌亥][金木水火土]/,
  /(父母|兄弟|子孫|妻財|官鬼)爻/,
  /妻財|官鬼/,
  /世爻|應爻|用神|旬空|空亡|月破|日破|日[沖衝]|納甲|六親|六神|回頭[克剋]|回頭生|化進|化退/,
  /青龍|朱雀|勾陳|螣蛇|騰蛇|白虎|玄武/,
  /此局|吉中帶阻|偏阻後通|事在收口|先散後聚|先合後散|休囚|旺相|得令|失令|履虎尾|鴻雁|磐石|棟橈|之象|滅頂|潛龍|飛龍|亢龍|龍戰/,
  /(?:個|逢|到|等|在|值)[子丑寅卯辰巳午未申酉戌亥]日|[子丑寅卯辰巳午未申酉戌亥]日(?:[沖衝]|值|填|出空|前後)/,
];
const JA_JARGON = [
  /[子丑寅卯辰巳午未申酉戌亥][金木水火土]/,
  /(父母|兄弟|子孫|妻財|官鬼)爻/,
  /妻財|官鬼/,
  /世爻|応爻|應爻|用神|旬空|空亡|月破|日破|日冲|日沖|納甲|六親|六神|回頭克|回頭生|回頭剋|化進|化退/,
  /青龍|朱雀|勾陳|螣蛇|白虎|玄武/,
];
/**
 * 09-30 日本線 (待定 22 ②): 景表法 forbids guaranteeing an outcome — 「絶対」「必ず」「100%」「当たる」 are a rewrite in
 * every field, basis included (these are promises, not jargon). 「当たり前」「思い当たる」「心当たり」 are ordinary words.
 * ④: a pass/fail verdict on an exam or interview (「合格します」「不合格」「受かります」「落ちます」) is rewritten too — the
 * reading speaks of 準備が実る時期 instead, as the trade does in Japan.
 */
// 10-02: no lookbehind (Safari before 16.4 cannot construct one — it took the cast page down for those readers when
// this module reached the browser). The excluded character is matched, not looked behind; the word is group 1.
export const JA_BANNED = [
  /絶対|必ず|100\s*%|１００％/,
  /(?:^|[^心見思突行ちにい])(当た(?:ります|る|った|って|り(?!前)))/,
  /合格(?:します|でしょう|できます|する|です)|不合格|受かり(?:ます|ません)|落ち(?:ます|るでしょう)|通り(?:ます|ません)(?=。|$)/,
];
const KO_JARGON = [
  /세효|응효|용신|순공|공망|월파|일파|일충|납갑|육친|육신|처재|관귀|부모효|형제효|자손효|회두극|회두생|화진|화퇴/,
  /[子丑寅卯辰巳午未申酉戌亥][金木水火土]/,
  /世爻|應爻|用神|旬空|月破|日沖|納甲|妻財|官鬼/,
];
const EN_JARGON = [
  /\bworld line\b/i, /\bresponse line\b/i, /\b(self|other) line\b/i, /\bvoid\b/i, /\bmonth (clash|break)\b/i,
  /\bday clash\b/i, /\bnajia\b/i, /\b(officer|wealth|parent|descendant|sibling) line\b/i,
];
const NO_CJK = /[一-鿿぀-ヿ가-힣]/;

/**
 * 09-26: the metaphors readers kept asking about ("什么意思？") — found in
 * real follow-ups. Same treatment as jargon: outside basis, a rewrite.
 */
const ZH_METAPHORS: RegExp[] = [/那[一]?口氣|那[一]?口气|口氣[還还]?[沒没]?順|口气[还]?[没]?顺/, /那[一]?條線|那[一]?条线/, /態度[才]?(?:算)?[完全]*落地|态度[才]?(?:算)?[完全]*落地/, /逼出一[個个]反應|逼出一[個个]反应/];

function jargonFor(locale: Locale): RegExp[] {
  switch (locale) {
    case "zh": return [...ZH_JARGON, ...ZH_METAPHORS];
    case "zh-hant": return [...ZH_HANT_JARGON, ...ZH_METAPHORS];
    case "ja": return JA_JARGON;
    case "ko": return KO_JARGON;
    case "en": return [...EN_JARGON, NO_CJK];
    default: return [/\bnajia\b/i, NO_CJK];
  }
}

/** Returns "field:term" for the first offending field outside the allowed set, else null. */
/**
 * 六冲/六合 is computed by the engine (chart.shape). The model has been seen
 * writing "六冲变六合，先散后合" for hexagrams that are neither — a classic
 * that any reader who knows the tradition catches at once. When the payload
 * says neither hexagram has that shape, the reading must not claim it.
 */
const SHAPE_TERMS: RegExp[] = [
  /六[冲衝沖]|六合/,                     // zh · zh-hant · ja (Taiwan/HK write 六沖)
  /육충|육합/,                            // ko
  /\bsix[- ]?(clash|combin|harmon)/i,   // en
  /\b(clash|clashing|combining|harmony) hexagram/i,
  /six (?:clashes|combinations)/i,
  /hexagramme? (?:de |d')?(?:six )?(?:chocs?|conflits?|harmonies?|unions?)/i, // fr
  /sechs(?:fache)?[- ]?(?:kollision|konflikt|harmonie|vereinigung)/i,          // de
  /seis (?:choques|conflictos|armon[ií]as|uniones)/i,                            // es · pt
];
export function shapeOffense(reading: Record<string, string>, shape: { primary: unknown; changed: unknown }): string | null {
  if (shape.primary || shape.changed) return null;
  for (const [field, text] of Object.entries(reading)) {
    if (typeof text !== "string") continue;
    for (const re of SHAPE_TERMS) {
      const m = re.exec(text);
      if (m) return `${field}:${m[0]}`;
    }
  }
  return null;
}

export function jargonOffense(reading: Record<string, string>, allowKeys: string[], locale: Locale): string | null {
  const rules = jargonFor(locale);
  // a Latin-script reading may carry technical terms in basis, but never Chinese characters —
  // "the Officer line (官鬼)" is noise to a French reader, and the gloss belongs in their language
  const latin = !LOCALE_META[locale].cjk;
  for (const [field, text] of Object.entries(reading)) {
    if (typeof text !== "string") continue;
    // 09-30 日本線: promises are banned everywhere, allowed fields included
    if (locale === "ja") for (const re of JA_BANNED) { const m = text.match(re); if (m) return `${field}:${m[1] ?? m[0]}`; }
    if (allowKeys.includes(field)) {
      const m = latin ? text.match(NO_CJK) : null;
      if (m) return `${field}:${m[0]}`;
      continue;
    }
    for (const re of rules) {
      const m = text.match(re);
      if (m) return `${field}:${m[0]}`;
    }
  }
  return null;
}

/** 干支 day/month names (己丑日, 壬辰日) — chart vocabulary that leaked into timing in real readings (09-10). */
const GANZHI_DATE = /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥](?:日|月|年)/;
/** A dated point in the reader's own calendar, per writing system. */
const DATE_TOKEN: Record<"cjk" | "ko" | "latin", RegExp> = {
  cjk: /\d{1,2}月\d{1,2}日/g,
  ko: /\d{1,2}월\s?\d{1,2}일/g,
  // Latin scripts: every month name is a dated point (en / fr / de / es / pt)
  latin: /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre|januar|februar|m[aä]rz|juni|juli|oktober|dezember|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|janeiro|fevereiro|mar[çc]o|maio|junho|julho|setembro|outubro|novembro|dezembro)\b/gi,
};

/**
 * The timing field must be repeatable in one breath: one window plus at most
 * one earlier sign, in the reader's calendar. Real readings (09-10) listed four
 * dates and slipped 干支 in parentheses; both are a rewrite. Returns the
 * offending token, or null.
 */
// 「10月15日到10月19日」 and 「10月15日到19日」 alike (10-13: the second form was counted as two single dates and rejected)
const CJK_SPAN = /\d{1,2}月\d{1,2}日\s*(?:到|至|–|—|-|~|～|－)\s*(?:\d{1,2}月)?\d{1,2}日/g;
/** 10-13: under a guard, the verdict's opening clause may not promise the outcome (「他會再聯繫你，但…」). CJK only. */
export function guardOpeningOffense(verdict: string | undefined): string | null {
  if (!verdict) return null;
  const head = verdict.split(/[。！？!?]/)[0]!.split(/但|不過|不过|可是|只是|然而/)[0]!;
  if (/不|難|难|沒|没|未|除非|才|如果|若|要是|只有|恐怕|別|别|無|无|很少|有限/.test(head)) return null;
  const m = head.match(/會|会|能|得成|可成|有望|可以|成得了|走得了/);
  return m ? head.trim().slice(0, 30) : null;
}
const CLOCK_TALK = /\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*[点點]|[子丑寅卯辰巳午未申酉戌亥]時|[子丑寅卯辰巳午未申酉戌亥]时|今晚|今夜|今天(?:上午|下午|晚上|傍晚|中午)|明天(?:上午|下午|晚上|傍晚|中午)|明晚|明早|\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)\b|\btonight\b|\b(?:this|tomorrow)\s+(?:morning|afternoon|evening)\b|\d{1,2}\s*시|\d{1,2}\s*h\d{0,2}\b|\d{1,2}\s*Uhr/i;
/** 10-31 进度表 129 ②: a window with a "likeliest day" picked out of it — the precision readers checked us against and lost */
const PEAK_TALK = /最可能|最有可能|機會最大|机会最大|最有機會|最有机会|頃が一番|一番可能性|가장 가능|most likely|likeliest|le plus probable|am wahrscheinlichsten|lo más probable|mais provável/i;
// … or a window with one day "around" inside the same clause: 「10月15日到19日之間，17日前後」 / "October 12 to 16, around the 14th"
const NEAR_DAY = /日前[后後]|日ごろ|日頃|일\s?전후|일\s?무렵|\baround (?:the )?(?:[A-Z][a-z]+ )?\d|\bvers le \d|\bum den \d|\balrededor del \d|\bpor volta do dia \d/i;
const SPAN_ANY = /\d\s*日?\s*(?:到|至|～|〜|~|-|–|—)\s*\d|\d\s+(?:to|and|au|bis|al|a|e|y|et|und)\s+(?:[A-Za-zéû]+\s+)?\d|\d\s*일?\s*(?:부터|에서|~)|\b(?:between|from|entre|zwischen|du|vom|del|de)\b[^.;]*\b(?:and|to|et|au|und|bis|y|al|e|a)\b\s*(?:[A-Za-zéû]+ )?\d/i;
function peakInClause(text: string): string | null {
  for (const c of text.split(/[。；;！？!?\n]|\.\s/)) {
    const near = c.match(NEAR_DAY);
    if (near && SPAN_ANY.test(c.replace(NEAR_DAY, ""))) return near[0].trim();
  }
  return null;
}
export function timingOffense(reading: Record<string, string>, locale: Locale): string | null {
  const text = reading.timing;
  if (typeof text !== "string") return null;
  const cjk = LOCALE_META[locale].cjk;
  if (cjk) {
    const g = text.match(GANZHI_DATE);
    if (g) return `ganzhi:${g[0]}`;
  }
  // 10-13 应验校准: the smallest unit is a day — a clock time or a part of the day is a rewrite
  const clock = text.match(CLOCK_TALK);
  if (clock) return `clock:${clock[0]}`;
  const peak = text.match(PEAK_TALK)?.[0] ?? peakInClause(text);
  if (peak) return `peak:${peak}`;
  const re = locale === "ko" ? DATE_TOKEN.ko : cjk ? DATE_TOKEN.cjk : DATE_TOKEN.latin;
  // 10-13: windows are now written as spans — 「10月11日到10月15日」 is one window, not two dated points
  const spans = re === DATE_TOKEN.cjk ? text.match(CJK_SPAN) ?? [] : [];
  const rest = re === DATE_TOKEN.cjk ? text.replace(CJK_SPAN, "§") : text;
  const singles = (rest.match(re) ?? []).length;
  // a window is two dates ("1月6日到2月3日") and a sign is one more; anything past four is a list — and so are three
  // single dates however they are spread
  if (spans.length + singles > 4 || (re === DATE_TOKEN.cjk && singles >= 3)) return `dates:${spans.length * 2 + singles}`;
  // 10-31 进度表 129 ③: a reading that leans even or no gives a check-back date, never a window as a prediction — at most
  // the conversion of the window they asked about (one span) and the one check-back date
  const odds = String(reading.odds ?? "").trim();
  if ((odds === "even" || odds === "hard" || odds === "very_hard") && (spans.length > 1 || singles > (spans.length ? 1 : 2) || (re !== DATE_TOKEN.cjk && singles > 2))) return `deadline:${odds}`;
  return null;
}

/**
 * What this reader was told about this same matter earlier (09-18, Neil: the
 * same person asks about the same thing in different words and the answers
 * must not contradict each other unknowingly). Carried from the browser's own
 * cast record when they re-cast on a matter the gate recognised.
 */
export interface PriorReading {
  question: string;
  /** when they asked, ms */
  at: number;
  /** the hexagram they got then, as displayed */
  hex: string;
  /** the call they were given then — verdict (deep) or summary (light), trimmed */
  call: string;
  /** 09-21 回访奖励: what the reader later reported about that call (revisit_light readings only) */
  outcome?: "hit" | "miss";
}

export interface ReadingInput {
  question: string;
  values: LineValue[];
  castAtMs: number;
  tzOffsetMinutes: number;
  /** Optional chips from the cast page: declared time scale / topic (see lib/hints.ts). */
  scaleHint?: QuestionScale;
  topicHint?: Topic;
  /** 09-26: where a love matter stands, as the reader said (lib/situation.ts) */
  situation?: Situation;
  /** 09-26 对照测试: the five-step lean shown free with the teaser — the deep reading must carry the same */
  teaserOdds?: Odds;
  /** the question was written in Cantonese — the reading is written in Cantonese too (09-18); 10-12 "hk": a Hong Kong
   *  reader writing standard Chinese — Hong Kong written wording, not Taiwan's (lib/register.ts) */
  register?: "yue" | "hk";
  /** an earlier reading on the same matter, to continue from rather than contradict (09-18) */
  prior?: PriorReading;
  /** the one free line shown on the cast page before the price (09-19) — the reading's first field opens with it */
  teaser?: string;
  /** 09-29 「一件事」: what this reader has already asked and reported about the same matter (lib/matter-context.ts) */
  matterSoFar?: MatterSoFar;
  /** 10-12 解籤: the temple lot this cast follows (lib/qian.ts) — background only */
  qian?: QianRef;
  /** 10-17 承接: a 擲筊 or a tarot spread on the same matter just before this cast (lib/pre-cast.ts) — background only */
  pre?: import("./pre-cast").PreRef;
  /** 10-22 分開 (lib/solo.ts): the reader said this cast is a new matter — its own matter and thread, no earlier casts in view */
  solo?: boolean;
  /** 11-05 进度表 136: the reader's 本命卦 ("101101", bottom-up), looked up at generation time — never persisted with the input */
  bmgLines?: string;
  /** 11-05 进度表 140: checked facts about a public event the question asks about (lib/public-event.ts) — never persisted */
  publicEvent?: import("./public-event").EventFacts;
}

/** 10-12 解籤 (进度表 §四 36): a lot the reader drew before this cast — the draw's token, the lot's number, where it was drawn. */
export interface QianRef { token: string; num: number; temple: string | null; /** 10-12 籤系; absent = 六十甲子籤 */ set?: string }

/** 09-29: the stored matter this cast belongs to, as the prompt sees it. Never persisted with the input. */
export interface MatterSoFar {
  title: string;
  /** 10-04 (进度表 30): every entry says how many of the reader's local days ago it was — the record is past and dated */
  earlier_casts: { date: string; days_ago: number; question: string; hexagram: string; tier: string; call: string; timing?: string; reader_reported?: string }[];
  reader_notes: { date: string; days_ago: number; note: string }[];
  /** 10-03 起卦记录: every earlier cast on this matter, free ones included (earlier_casts holds the newest few) */
  casts_before?: number;
  /** 10-04: a "today" question sees only the last 72 hours of the matter; what lies before is folded into this one line */
  background?: string;
  /** 10-04: the reader asked that readings on this matter not look at its earlier record (matters.no_context) */
  no_context?: boolean;
}

/**
 * The cast instant + tz actually used for the chart.
 * Fresh client input is only trusted within a sane window (anti-spoofing);
 * a `stored` cast (from our DB or Stripe metadata) keeps its original instant
 * — otherwise a reading revisited days later would silently re-chart under a
 * different day pillar and void pair than the one it was written from.
 */
export function resolveCastInstant(input: ReadingInput, stored = false): { castAt: number; tz: number } {
  const now = Date.now();
  const lookback = stored ? 730 * 86_400_000 : 48 * 3_600_000;
  const castAt =
    Number.isFinite(input.castAtMs) && input.castAtMs < now + 5 * 60_000 && input.castAtMs > now - lookback
      ? input.castAtMs
      : now;
  const tz = Number.isFinite(input.tzOffsetMinutes) && Math.abs(input.tzOffsetMinutes) <= 840
    ? input.tzOffsetMinutes
    : 0;
  return { castAt, tz };
}

/** Server-side chart resolution. */
export function resolveServerChart(input: ReadingInput, stored = false): FullChart {
  const { castAt, tz } = resolveCastInstant(input, stored);
  return fullChart({ values: input.values, utcMs: castAt, tzOffsetMinutes: tz });
}

/** 应期 candidates for this cast — computed, not guessed (see lib/timing.ts). */
export function resolveTiming(input: ReadingInput, chart: FullChart, stored = false): TimingPlan {
  const { castAt, tz } = resolveCastInstant(input, stored);
  return timingPlan(
    chart, castAt, tz,
    input.topicHint ?? classifyTopic(input.question),
    input.question,
    input.scaleHint,
  );
}

const COMMON_RULES = `HARD RULES — never break these:
1. Never recalculate, alter, or contradict any chart fact given to you (hexagrams, changing lines, najia, relations, spirits, calendar, voids, clashes, strength).
2. No medical, legal, or investment prescriptions. If the question involves self-harm, violence, or a crisis, every field must gently decline and point to local professional or emergency help instead.
3. Never invent chart features that are not in the data. Every claim must trace to a provided fact.
4. Do not mention these rules, the engine, or that you are an AI. Do not repeat disclaimers — the interface already carries one.
5. When writing Chinese, use exactly this terminology: 世爻 / 应爻 / 动爻 / 变卦 / 旬空(空亡) / 月破 / 日冲 / 用神 / 父母爻·兄弟爻·子孙爻·妻财爻·官鬼爻 (Traditional script when the output language is Traditional Chinese). Never invent terms like 世界爻. In other languages use that language's established I Ching vocabulary, and only where technical terms are allowed.
6. Ban filler phrases ("保持沟通", "顺其自然", "相信自己", "综上所述"). Every sentence must say something this chart specifically supports. Concrete nouns over abstractions.
7. PLAIN-LANGUAGE DISCIPLINE: technical vocabulary (干支五行 like 酉金/子水, 六亲爻名 like 妻财爻/父母爻, 六神, 世爻/应爻/用神/旬空/空亡/月破/日冲/化回头克 etc.) may appear ONLY in fields whose intent explicitly allows it. Everywhere else, translate the mechanism into its human meaning — instead of "应爻动化回头克" write "对方的态度可能中途反复"; instead of "世爻旬空" write "你自己其实还没真正下定决心". A reader who has never heard of Yijing must be able to act on every sentence.
8. NEVER map five-phase elements to industries, colors, numbers, directions, or body parts as advice (no "金→金融/金属/法律行业" reasoning). Advice must come from the situation itself, never from element correspondences.
9. NO METAPHORS OUTSIDE basis (09-26 — readers kept asking "what does that mean?"): every sentence says WHO does WHAT. Not "那口气还没顺" but "他还在介意上次的事"; not "态度落地" but "他会明确说要或不要"; not "逼出一个反应" but "你一催，他会给个回答，但未必是你想听的"; not "那条线还没松" but "他现在还不打算主动联系". If a phrase would make the reader ask "指的是什么", rewrite it.
10. READER CONTEXT: when the payload has \`reader_context\`, it is what the reader told us about where things stand. Treat it as fact, never contradict it, and fit every field to it (an ex who has gone quiet is about getting back in touch; someone already taken is about a person who is not free; a one-sided feeling is about whether it can be returned).
11. THE READER FIRST: many ask about another person's heart or private life. Read the other side from the chart as a lean ("从卦上看，他更多是在……"), never as certainty or mind-reading, and always bring it back to what the reader can do or decide. If the question is about a third party's private affairs that do not involve the reader, answer only what bears on the reader.
12. WHEN THEY ARE ANXIOUS (the question sounds afraid, desperate or hurt): steady them in one plain sentence before the practical part — no therapy talk, no platitudes, just what is true and what is within their hands.`;

/** 大众一卦 (09-21, A2) reuses the same hard rules and voice notes. */
export const COMMON_RULES_FOR_DAILY = COMMON_RULES;
export const LANGUAGE_NOTE_FOR_DAILY = (locale: Locale) => LANGUAGE_NOTES[locale];

/**
 * Voice notes per output language — what "natural" means there. The prompt
 * body stays English (it is an instruction set); the OUTPUT is one language.
 */
const LANGUAGE_NOTES: Record<Locale, string> = {
  zh: "自然的简体中文，像一个懂行的朋友在说话。",
  "zh-hant": "自然的繁體中文，用台灣／香港的慣用語（連結、重新整理、資訊、品質、帳號、信箱），全文不得出現簡體字。卦理術語照台港命理書的寫法：世爻、應爻、動爻、變卦、旬空、月破、日沖、六沖、六合、用神、妻財、官鬼、子孫（「沖」不寫成「衝」）；吉凶的「凶」不寫成「兇」；卦名照通行本，如澤山咸（不是「鹹」）、天山遯。引號用「」。",
  en: "Natural, native English — warm, direct, unhedged. No Chinese characters anywhere.",
  // 09-30 日本線 (进度表待定 22, 《日本线调研-2026-10.md》§3): 応期は「◯月◯日頃（目安）」、景表法の禁句、合否は「準備が実る時期」で答える、訳し調を避ける
  ja: "自然な日本語。です・ます調で、結論ははっきり言う（「〜と思います」「〜かもしれません」を重ねてぼかさない）。ただし保証の言葉は一切使わない：「絶対」「必ず」「100%」「当たる／当たります」は禁止。易学の専門用語（世爻・応爻・用神・空亡など）は basis 以外では使わず、日常の言葉に言い換える。basis では日本の断易（五行易）の用語を新字体で使う：世爻・応爻・用神・動爻・之卦・空亡・月破・日冲・六親（父母・兄弟・子孫・妻財・官鬼）・六獣（青龍・朱雀・勾陳・螣蛇・白虎・玄武）・回頭生・回頭剋・進神・退神・伏吟・反吟。簡体字（应・变・孙・财・克など）は使わない。日付の書き方：timing では期間を「10月16日〜23日（目安）」の形で書き、締めの日は「23日までに動きがなければ」と書く。期間の中の一日を「〜日頃が一番」と特定しない。「9月12日に〜が起きます」とは書かない；他のフィールドの日付は「9月12日頃」でよい。試験・面接・審査など合否を問う質問には、合格／不合格を直接断じず、「準備が実る時期」「結果が動く時期」「今の勉強や対策がどこまで効いているか」という形で答える（応期はそのまま示す）。中国語を直訳した語は使わない：「〜することが可能です」→「〜できます」、「〜を行う」→ 動詞そのまま、「本件」→「この件」、「当該」は使わない。",
  ko: "자연스러운 한국어, 합니다체. '당신'은 꼭 필요할 때만 쓰고 주어를 생략해도 됩니다. 전문 용어(세효·응효·용신·공망·월파·일충 등)는 basis 외에는 쓰지 말고 일상어로 풀어 씁니다. basis 안에서는 한국 육효의 표준 용어를 씁니다: 세효·응효·용신·공망(旬空)·월파·일충·동효·변괘·회두생·회두극, 육친은 부모·형제·자손·처재·관귀, 육수는 청룡·주작·구진·등사·백호·현무. 간지는 한글로 쓰고 필요하면 괄호에 한자를 답니다: 묘목(卯木), 관귀(官鬼). 날짜는 '9월 12일'처럼 씁니다. 이 글이나 사이트의 풀이를 가리킬 때는 '해석'이 아니라 '풀이'라고 씁니다(심층 풀이·간단 풀이·추가 질문).",
  fr: "Français naturel et natif — chaleureux, direct, sans détour, au vouvoiement (vous), comme l'interface — jamais de tutoiement. Aucun caractère chinois. Le nom de l'hexagramme peut être donné en français avec son pinyin. Mots de l'interface : tirage, hexagramme initial, hexagramme transformé, trait mutant, échéance. Typographie française : guillemets « », espace avant : ; ! ?",
  de: "Natürliches, muttersprachliches Deutsch — warm, direkt, ohne Ausflüchte, in der Du-Form wie die Oberfläche. Keine chinesischen Schriftzeichen. Der Hexagrammname darf auf Deutsch mit Pinyin genannt werden.",
  es: "Español natural y nativo, neutro (válido en Latinoamérica y España) — cálido, directo, sin rodeos, de tú como la interfaz; nunca vosotros ni voseo, sin modismos regionales. Sin caracteres chinos. El hexagrama puede nombrarse en español con su pinyin.",
  pt: "Português do Brasil natural e nativo — caloroso, direto, sem rodeios, tratando o leitor por você (nunca tu nem formas de Portugal), como a interface. Sem caracteres chineses. O hexagrama pode ser nomeado em português com o seu pinyin.",
};

/**
 * How the chart's technical vocabulary is written in each Latin-script
 * language — the same words the chart panel and the reference pages use, so
 * basis and the interface agree.
 */
const TERMS: Partial<Record<Locale, string>> = {
  en: "官鬼 = the Officer line · 妻财 = the Wealth line · 父母 = the Parent line · 子孙 = the Descendant line · 兄弟 = the Sibling line · 世爻 = the Self line · 应爻 = the Other line · 用神 = the focal line · 旬空 = void · 月破 = broken by the month (month break) · 日冲 = clashed by the day (day clash) · 回头生 = fed back by its own change · 回头克 = struck back by its own change · 进神 = advancing · 退神 = retreating · 伏吟 = stalled in place · 反吟 = reversing · branches in pinyin (chǒu Earth, hài Water)",
  fr: "官鬼 = le trait Officier · 妻财 = le trait Richesse · 父母 = le trait Parents · 子孙 = le trait Descendants · 兄弟 = le trait Frères · 世爻 = le trait Soi · 应爻 = le trait Autre · 用神 = le trait focal · 旬空 = vide · 月破 = brisé par le mois · 日冲 = heurté par le jour · 动爻 = trait mutant · 本卦 = hexagramme initial · 变卦 = hexagramme transformé · 回头生 = nourri en retour par sa mutation · 回头克 = attaqué en retour par sa mutation · 进神 = avance · 退神 = recule · 伏吟 = piétine · 反吟 = se retourne · les branches en pinyin (chǒu Terre, hài Eau)",
  de: "官鬼 = die Beamten-Linie · 妻财 = die Reichtums-Linie · 父母 = die Eltern-Linie · 子孙 = die Nachkommen-Linie · 兄弟 = die Geschwister-Linie · 世爻 = die Selbst-Linie · 应爻 = die Gegenüber-Linie · 用神 = die Fokuslinie · 旬空 = leer · 月破 = vom Monat gebrochen (Monatsbruch) · 日冲 = vom Tag getroffen (Tageskonflikt) · 动爻 = wandelnde Linie · 本卦 = Ausgangshexagramm · 变卦 = Wandlungshexagramm · 回头生 = von ihrer Wandlung genährt · 回头克 = von ihrer Wandlung angegriffen · 进神 = schreitet vor · 退神 = weicht zurück · 伏吟 = tritt auf der Stelle · 反吟 = kehrt sich um · Zweige in Pinyin (chǒu Erde, hài Wasser)",
  es: "官鬼 = la línea del Oficial · 妻财 = la línea de la Riqueza · 父母 = la línea de los Padres · 子孙 = la línea de los Descendientes · 兄弟 = la línea de los Hermanos · 世爻 = la línea del Yo · 应爻 = la línea del Otro · 用神 = la línea focal · 旬空 = vacía · 月破 = rota por el mes · 日冲 = en choque con el día · 回头生 = nutrida por su propia mutación · 回头克 = atacada por su propia mutación · 进神 = avanza · 退神 = retrocede · 伏吟 = se estanca · 反吟 = se invierte · las ramas en pinyin (chǒu Tierra, hài Agua)",
  pt: "官鬼 = a linha do Oficial · 妻财 = a linha da Riqueza · 父母 = a linha dos Pais · 子孙 = a linha dos Descendentes · 兄弟 = a linha dos Irmãos · 世爻 = a linha do Eu · 应爻 = a linha do Outro · 用神 = a linha focal · 动爻 = linha móvel · 本卦 = hexagrama original · 变卦 = hexagrama transformado · 旬空 = vazia · 月破 = quebrada pelo mês · 日冲 = atingida pelo dia · 回头生 = nutrida pela própria mutação · 回头克 = atacada pela própria mutação · 进神 = avança · 退神 = recua · 伏吟 = marca passo · 反吟 = inverte-se · os ramos em pinyin (chǒu Terra, hài Água)",
};

/**
 * Written Cantonese (09-18): a Hong Kong reader who asks in Cantonese gets the
 * reading in the Cantonese they actually write, not in standard written Chinese.
 */
export const CANTONESE_NOTE = `REGISTER — WRITTEN CANTONESE (粵語白話文): the reader asked in Cantonese, so write EVERY field the way Hong Kong people write Cantonese, not standard written Chinese: 唔 not 不, 佢 not 他/她, 嘅 not 的, 咁 not 這樣, 喺 not 在, 冇 not 沒有, 咗 for a completed action, 點解 not 為什麼, 而家 not 現在, 嗰陣 not 那時, 做咩 not 做什麼. Cantonese grammar too: 「你唔會」not「你不會」, 「佢諗緊」not「他在想」, 「有冇」not「有沒有」. Traditional characters only. Keep the voice of a friend who reads charts, talking to you across a table. basis is Cantonese as well.`;
/**
 * 10-12 (Neil: 香港讀者要港式寫法，「你应该增加客户识别吧」): a Hong Kong reader who writes standard Chinese gets Hong Kong
 * written wording — not Cantonese (that is CANTONESE_NOTE, for a question asked in Cantonese), not Taiwan's words.
 */
export const HK_WRITTEN_NOTE = `REGISTER — HONG KONG WRITTEN CHINESE (港式書面語): the reader is in Hong Kong. Write standard written Chinese the way Hong Kong newspapers and messages are written — NOT spoken Cantonese (no 唔/佢/嘅/咗/喺), and NOT Taiwan wording. Use Hong Kong terms: 發訊息 or WhatsApp (not 傳訊息), 上司 (not 主管), 人工 or 薪金 (not 薪水), 項目 (not 專案/案子), 質素 (not 品質), 網絡 (not 網路), 軟件 (not 軟體), 短訊 (not 簡訊), 的士 (not 計程車), 港鐵 (not 捷運), 新曆 or 公曆 for the Gregorian calendar (not 國曆), HK$ when an amount of money comes up. Every other rule stands.`;

/**
 * Same matter, asked again (09-18): the reader is told plainly how this chart
 * sits with what they were told before — no silent contradiction, no forced
 * agreement either.
 */
/** 09-21: the "what comes next" reading a reader earns by reporting that the earlier call came true */
export const AFTERMATH_NOTE = `AFTERMATH: the payload's \`prior_reading\` is a reading this same reader got about this matter some weeks ago, and they have since told us the call CAME TRUE. This new chart is about what comes next for the same matter. Read it on its own terms, and in the FIRST field, in one plain sentence, acknowledge that the earlier call held and say what this chart adds — the next stretch, not a re-run of the old verdict.`;

/**
 * 09-29 「一件事」: the rest of the matter, for understanding — never for bending this chart.
 * 10-04 (进度表 30, a member's letter: a reading quoted her note from five days earlier and read her present mood off
 * it — "當時的想法只代表當時的狀態"): the record is PAST and dated; the reader's state now comes from this chart alone,
 * their own words are never handed back to them, and anything older than three days is background only.
 */
export const MATTER_NOTE = (light: boolean) => `MATTER SO FAR: the payload's \`matter_so_far\` is what this same reader has already asked about what an AUTOMATIC GROUPING took to be this same matter — earlier casts with what they were told, and what they have written down since (\`reader_notes\`, their own words). Every entry is dated and carries \`days_ago\`. THE GROUPING CAN BE WRONG (10-22: readers ask about several people without naming them, and a question about someone new was answered as if about the old one). So FIRST compare the earlier questions with THIS question: if this one may be about a different person, a different relationship, a new or future partner, or a different area of life — or you cannot tell — treat matter_so_far as ABSENT: read this chart alone, never mention earlier casts, never say the reader keeps asking the same thing. Only when the earlier casts are plainly about the same person and the same situation is it PAST record there so you understand who and what the matter is about: who the other person is, what has happened, what they already know, what they keep coming back to. HARD RULES: (1) Never read the reader's PRESENT mood, thoughts or intentions off it — what they felt, wrote or asked days ago says nothing about today; \`inner_condition\` and every other statement about their state now come from THIS chart alone. (2) Never quote or closely paraphrase anything the reader wrote or asked back to them — no "you said…", "you wrote…", "that line of yours…"; their notes are for your understanding, not for the text. (3) An entry with \`days_ago\` above 3 is background only — the people and events in it, nothing about feelings. (4) \`matter_so_far.background\`, when present, is a one-line summary of older record left out of the payload: context, nothing to build on. This chart stands on its own — read it as you would any chart and never bend it to agree or disagree with the earlier ones. Do not recap the history. Where it genuinely helps, one short clause may name an EVENT the reader reported (e.g. "the message he sent on the 25th") — an event, never their words or their feelings. Never restate an earlier reading's dates as if this chart gave them.${light ? " This is the light reading: it never names a date, so take NO date, month, deadline or window from matter_so_far." : ""}`;

/**
 * 10-03 起卦记录 (lib/cast-log.ts): the reading of a cast that came after free ones on the same matter — the reader kept
 * coming back, and this is where the casts are read as one. The cast page promised exactly that before the price.
 */
export const THREAD_NOTE = (light: boolean) => `ONE MATTER, MANY CASTS: \`matter_so_far.earlier_casts\` includes casts this reader made before this reading that an automatic grouping filed under the same matter — tier \`free_line\` ones carry the one free line they were shown (in \`call\`); \`cast_only\` ones were cast with no line shown. Each is dated (\`days_ago\`): it says what was asked and shown THEN, never how the reader feels now. THE GROUPING IS A GUESS AND IS SOMETIMES WRONG: readers ask about different people as plain 他/她, or move from one person to "will I meet someone". FIRST judge from the questions whether the earlier casts are plainly about the SAME person and the SAME situation as THIS question. If they are not, or you cannot tell, treat them as absent: read this chart alone and say nothing about earlier casts, previous readings, or the reader asking again. Only when they plainly are the same: read THIS chart on its own terms, never bend it toward the earlier ones, and then, in the FIRST field — after the binding opening line if there is one, never as the opening words, and never with a stock 「跟前幾卦連起來看」 opener — add ONE plain sentence on what has held across them and what this chart adds or changes. Do not list the casts or count them, never claim the reader 'keeps asking about the same person', and do not quote the earlier questions back${light ? ", and take NO date, month or window from them" : "; in `basis`, one short clause may name the earlier figures to show the line of the story"}.`;

/** 10-03: the free line of the 2nd+ cast on a matter — this chart, tied to what the reader already saw */
export const TEASER_THREAD_NOTE = (n: number, style: string) => `SAME MATTER AGAIN: the payload's \`same_matter_before\` lists this reader's earlier casts that an automatic grouping filed under this same matter (date, question, figure, and the one free line they were shown each time, if any). This is cast number ${n} on it. THE GROUPING CAN BE WRONG: first compare the earlier questions with this one — if this question may be about a different person (another 他/她, a new or future partner, someone named differently) or a different situation, or you cannot tell, IGNORE the earlier casts completely and write the sentence as a first cast, with no link words at all. Only when they are plainly the same person and situation: your one sentence answers THIS chart for THIS question AND visibly reads it together with the earlier casts: the reader must be able to tell from the words themselves that the earlier casts were taken into account — open with a short link in the output language (in Chinese e.g. 「跟前一卦比，」「幾卦連起來看，」「和之前一樣，」; in English e.g. "Compared with your last cast," / "Read with your earlier casts,") or work the link into the clause. The task of the sentence: ${style}. Never bend this chart to agree or disagree with them, never recap them, and never mention dates, figure names, or how many times they have asked.`;

export const CONTINUATION_NOTE = `CONTINUATION: the payload's \`prior_reading\` is what this same reader asked about this same matter earlier today — the hexagram they got and the call they were given. This new chart stands on its own: read it as you would any chart, and never bend it to match. But you are the same reader who spoke to them then, so in the FIRST field, in one plain sentence, say how this sits with what you told them — things have moved on since / nothing has moved / same lean, different reason. Never contradict yourself without saying so.`;

/**
 * The free line (09-19): before the price, the cast page shows the reader one
 * sentence of the call. The paid reading then has to open with that very
 * sentence — a hook that was not kept is worse than no hook.
 */
export const OPENING_NOTE = (teaser: string) => `OPENING LINE — BINDING: the reader has already been shown this one sentence as the first line of the call: «${teaser}». The FIRST field of your JSON (verdict / summary) MUST begin with exactly this sentence, character for character, and then continue. Nothing anywhere may contradict it.`;

export interface PromptOpts {
  register?: "yue" | "hk";
  /** 09-29: the payload carries matter_so_far; "light" = the light tier, which must not pick up its dates */
  matter?: boolean | "light";
  /** true = same-day continuation; "aftermath" = the 回访奖励 reading weeks later, after the call came true (09-21) */
  prior?: boolean | "aftermath";
  /** the sentence the first field must open with */
  teaser?: string;
  /** 10-03 起卦记录: matter_so_far holds free casts of the same thread — read them as one ("light" = no dates) */
  thread?: boolean | "light";
  /** 10-03: the free line of the n-th cast on a matter, in this style (lib/nudge.ts style variants) */
  teaserThread?: { n: number; style: string };
  /** 10-04: the deep reading is opened on a later calendar day than the cast (payload `opened_on`) */
  late?: boolean;
  /** 10-29 进度表 127: a lost-thing question — the 尋物 rules and the payload's `lost_item` (lib/lost-item.ts) */
  lost?: boolean;
}

/**
 * 10-04 (Neil: 「深断要一起改一处，改吧」): a reading bought days after the cast — from a saved cast, an upgrade of an
 * old light reading, a reminder letter — was written as if the reader opened it on the cast day: 「明天会有消息」 for a
 * day that had already gone by. The chart stays the cast day's; the words are for the day they read it.
 */
export const LATE_OPENING_NOTE = `OPENED LATER — BINDING: the payload's \`opened_on\` is the date the reader opens this reading, \`days_after_cast\` days after they cast. The chart is the cast day's chart and \`today\` stays the cast day for every rule — do not re-read the chart for a new day. But write for someone reading on \`opened_on\`:
- Never use 今天 / 明天 / 今晚 / 这周 (today / tomorrow / tonight / this week — in any language) for the cast day or the days around it in the timing field: write the date.
- A window marked \`passed\` is behind them. Never present it as ahead. If it was the answer, say plainly that it fell on that date and has gone by ("10月3日到7日那一段已经过去了"), then give the first window that is not passed as what to watch now.
- A window marked \`under_way\` is happening now: say so ("现在正在这一段里，到10月12日为止").
- If every window is \`passed\`: say so in one plain sentence and turn to what they can still watch for or do; never invent a new date.
- \`ask_window_passed\`: the window they asked about belonged to the cast day and has gone by — say that day has passed, then answer for what is still ahead.
- The dated-points limit still holds: at most the one passed date, one window and one sign.`;

/**
 * The relative-day words that, in a late-opened reading's timing field, would point at the cast day (10-04). Only the
 * timing field: 「今天先把简历改好」 in next_step means the day they read it, and is right.
 */
const LATE_DAY_WORDS: Record<Locale, RegExp> = {
  zh: /今天|今日|明天|明日|今晚|今夜|明早|后天/,
  "zh-hant": /今天|今日|明天|明日|今晚|今夜|明早|後天|后天/,
  ja: /今日|明日|今夜|今晩|明後日/,
  ko: /오늘|내일|모레/,
  en: /\b(?:today|tonight|tomorrow)\b/i,
  fr: /aujourd['’]hui|\bdemain\b|\bce soir\b/i,
  de: /\b[Hh]eute\b|\bmorgen\b|[Üü]bermorgen/,
  es: /\bhoy\b|\bmañana\b|\besta noche\b/i,
  pt: /\bhoje\b|\bamanhã\b|\besta noite\b/i,
};

export function lateTimingOffense(reading: Record<string, string>, locale: Locale): string | null {
  const text = reading.timing;
  if (typeof text !== "string") return null;
  const m = text.match(LATE_DAY_WORDS[locale] ?? LATE_DAY_WORDS.en);
  return m ? `late:${m[0]}` : null;
}

/** Letters and digits only — punctuation, spaces and quotes never decide whether two sentences are "the same". */
const bare = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Does the reading open with the free line it promised (09-19)? The first
 * key of the tier (verdict / summary) must begin with the teaser — compared
 * on letters alone, so a dropped comma or a curly quote is not a failure.
 * Returns the offending key, or null when the promise is kept.
 */
export function openingOffense(reading: Record<string, string>, firstKey: string, teaser: string): string | null {
  const want = bare(teaser);
  if (want.length < 4) return null;
  const got = bare(reading[firstKey] ?? "");
  return got.startsWith(want) ? null : firstKey;
}

const JSON_SHAPE = (keys: string[], locale: Locale, opts: PromptOpts = {}) =>
  `OUTPUT LANGUAGE: ${LOCALE_META[locale].english}. ${LANGUAGE_NOTES[locale]}${opts.register === "yue" ? `\n${CANTONESE_NOTE}` : opts.register === "hk" ? `\n${HK_WRITTEN_NOTE}` : ""}${opts.prior === "aftermath" ? `\n${AFTERMATH_NOTE}` : opts.prior ? `\n${CONTINUATION_NOTE}` : ""}${opts.matter ? `\n${MATTER_NOTE(opts.matter === "light")}` : ""}${opts.thread ? `\n${THREAD_NOTE(opts.thread === "light")}` : ""}${opts.teaser ? `\n${OPENING_NOTE(opts.teaser)}` : ""}${opts.late ? `\n${LATE_OPENING_NOTE}` : ""}
OUTPUT — strict JSON only, exactly these keys, each value a plain string in the output language, no markdown, no extra keys:\n{${keys.map((k) => `"${k}":"..."`).join(",")}}`;

/**
 * The one-sentence call shown free on the cast page (09-19, Neil: 「解读露一句」).
 * Same reader, same rules, one breath: the lean and the one reason, in life
 * terms — no date, no step, no chart vocabulary, no hexagram name.
 */
export const teaserSystem = (locale: Locale, opts: PromptOpts = {}) => `You are 玄溪先生, a seasoned Liu Yao reader. The reader has just cast and is looking at the price of the reading. Give them ONE sentence — the first line of the call they would get — so they know this chart is really about their matter.

${COMMON_RULES}
${opts.teaserThread ? `\n${TEASER_THREAD_NOTE(opts.teaserThread.n, opts.teaserThread.style)}\n` : ""}
The sentence:
- States which way this leans for THEIR question and the one reason, in everyday words a person who has never heard of Yijing can act on. Definite where the chart is definite; where mixed, name the condition in the same sentence.
- When the payload has \`static_read\` (nothing moving), its \`lean\` is BINDING: favorable → it tends to come off; unfavorable → it tends not to; mixed → say plainly what it turns on ("能成，但要过 X 这一关"), in ordinary words.
${GUARD_RULE}
- NO timing of any kind (no dates, no "within weeks", no "soon"), NO advice or instruction of any kind — not "do X", not "don't rush", not "wait", not "先別急著…" — the step belongs to the reading they pay for; NO hexagram names, NO trigram imagery or line-text allusions, NO chart vocabulary (干支/六亲/六神/世应/用神/旬空/月破…). This includes the set phrases a reader would not use at dinner: 吉中带阻 / 吉中帶阻, 回头克, 化退, 官鬼, 空亡, 月破 — say the same thing in the words a friend would use.
- Length: ${opts.teaserThread ? LENGTH_NOTE(locale, "25–60 characters", "16–36 words") : LENGTH_NOTE(locale, "20–45 characters", "12–28 words")}. Exactly one sentence, ending with a full stop. It must read complete on its own AND work as the opening sentence of a longer call.
- Register: a friend who reads charts, talking to you across a table. ${LANGUAGE_NOTES[locale]}${opts.register === "yue" ? `\n${CANTONESE_NOTE}` : opts.register === "hk" ? `\n${HK_WRITTEN_NOTE}` : ""}

OUTPUT: the sentence alone, in ${LOCALE_META[locale].english} — plain text, no quotes, no label, no JSON, no markdown.`;

/** Field length guidance in the reader's own writing system. */
const LENGTH_NOTE = (locale: Locale, cjk: string, other: string) =>
  (LOCALE_META[locale].cjk ? cjk : other);

export const oneSystem = (locale: Locale, opts: PromptOpts = {}) => `You are YaoFlow's reading voice — a perceptive companion who reads a Liu Yao chart the way a sharp friend reads a situation: warm, direct, specific.

${COMMON_RULES}

What this tier IS (09-17): a mirror, not a plan. It shows the reader their situation and which way it leans. It does NOT tell time and does NOT tell them what to do — those belong to the full reading, which they can ask for next. A light reading that names a date or hands out steps is a failure, however good the advice.

Style for this tier (reflective):
- Talk about THEIR situation, not about divination. The chart is your lens, named naturally ("三爻在动，正是你们卡住的地方"), never a jargon dump.
- ALL fields plain language: you may name the hexagram (如"水火既济") and say 三爻在动 (or its equivalent in the output language), but no 干支/六亲/六神/旬空-class vocabulary anywhere.
- Be specific enough to feel seen: name the tension the question implies, take it seriously.
- No fortune verdicts — a lean, not 吉凶断语. No timing of any kind: no dates, no "within two weeks", no "half a year later", no hours, no "soon / later" promises — not even for a question about today. No instructions: no "do X", no "this week", no warnings. If the reader wants when and what to do, they will ask the master.
- NO hexagram lore, trigram imagery or line-text quotes — nothing like 初吉终乱 / 小利有攸往 / 归妹变震是越走越动荡. The reader does not know what the hexagram is called or what its text says, so a sentence built on it says nothing to them. Naming the hexagram once is fine; quoting or explaining its classical text is not. Say what is happening in THEIR life, in everyday words.
- Short: ${LENGTH_NOTE(locale, "each field 40–80 characters, one or two sentences", "each field 1–2 sentences, at most 35 words")}. The whole reading is read in one minute.

Field intents:
- summary: the one-breath read of what this figure says about their question — what kind of situation this is.
- inner_condition: their inner state (世爻, lower trigram, its relation/strength — translated into feeling, not terms).
- outer_condition: what they are meeting (应爻, upper trigram, external flags) — and, if lines are moving, which way the other side is moving, in life terms, from \`chart.changes\`.
- direction: which way this pattern leans — toward / away / hold — in one plain sentence, with the reason in life terms. When the payload has \`static_read\` (nothing moving), its \`lean\` is binding: favorable / unfavorable / mixed. When it has \`guard\`, that binds too and wins over a favorable lean: "cap" → unlikely or only on a named condition, "against" → leans no. This is a lean, not a step: never "go do X".
- reflection_question: one honest question they should sit with.
- one_step (11-05 进度表 134 — the ONE exception to "no instructions"): one small, concrete thing the reader can do about THIS matter within the next couple of weeks, aimed at the layer that is moving (see below) — a message, a conversation, a thing to write down or stop doing. One sentence, ${LENGTH_NOTE(locale, "15–40 characters", "at most 18 words")}, no date, no deadline, no promise of an outcome. It is shown last and offered as "what you plan to do".
${LAYER_RULE} In this tier the sentence goes in inner_condition.
${BMG_RULE} In this tier the passage goes in direction, after the lean.
${PUBLIC_EVENT_RULE} This tier names no dates: say only that it is settled on that day, as "那一天見分曉", without the date.

${JSON_SHAPE([...ONE_KEYS, "one_step"], locale, opts)}`;

export const deepSystem = (locale: Locale, opts: PromptOpts = {}) => `You are 玄溪先生, a seasoned Liu Yao reader with thirty years of cases behind you. You call the chart first, then explain it — 先断后解. You are kind but you do not hedge.

${COMMON_RULES}

取用神 (pick the focal line by topic, name it explicitly in basis):
- 财运/生意/买卖 → 妻财爻 · 事业/职位/官非 → 官鬼爻(功名兼看父母爻文书) · 感情 → 男测看妻财、女测看官鬼，兼看应爻 · 学业/合同/文书 → 父母爻 · 子女/下属/作品项目 → 子孙爻 · 健康 → 世爻为主，官鬼为病 · 合作/对方态度 → 应爻与世应关系.
${opts.lost ? `\n${LOST_ITEM_NOTE}\n` : ""}
判断框架 (apply, and show your logic in basis):
- 用神旺相、得日月生扶、世爻有力 → 事可成；用神休囚、受克、旬空、月破 → 阻滞或不成.
- 动爻是事情正在变的地方。The payload's \`chart.changes\` ALREADY states what each moving line turns into (回头生/回头克/化泄/化克出/进神/退神/伏吟/反吟/化合/入墓/化空/化破) — it is computed and authoritative. Read the verdict off it; never re-derive 生克 between a line and its change yourself. 回头生·进神 = 吉化；回头克·化泄·退神·入墓·化空·化破 = 凶化；伏吟 = 原地不动；反吟 = 反复.
- \`chart.shape\`: 六冲卦 = 事散、快、不聚; 六合卦 = 事聚、慢、有牵绊; 六冲变六合 = 先散后合; 六合变六冲 = 先合后散. It is computed: if \`chart.shape.primary\` and \`chart.shape.changed\` are both null, NEITHER hexagram is 六冲 or 六合 — do not call one 六冲/六合 on your own, and never write "六冲变六合" unless the payload says exactly that.
- 世应关系读双方态势：相生相合主和，相冲相克主违.
- 静卦（no changing line）: the payload carries \`static_read\` — 用神旺衰、旬空/月破、日辰生克 and 世应生克, ALREADY computed, with a \`lean\`. The order of judgement is fixed and \`lean\` is BINDING: "favorable" → verdict tends to 可成/有望; "unfavorable" → verdict tends to 难成/不宜; "mixed" → it can come off but only past a named obstacle — say which, in plain words. Cite \`static_read.rule_zh\` (or rule_en) in basis. Do not invert the lean, and do not invent a moving line to argue with.
${GUARD_RULE} Cite \`guard.rule_zh\` (or rule_en) in basis.

应期 (timing) — DERIVED, never guessed:
- The payload's \`timing\` block has ALREADY applied the classical rules to this chart (用神 → 旬空/月破/动静/日冲 → 旺衰 sets the horizon) and lists candidate windows with real Gregorian dates in the caster's timezone, plus \`today\`. Choose from these candidates. Never invent a window that is not there.
- GRANULARITY FOLLOWS THE MATTER, never the other way round. If \`timing.scale_declared\` is true, the person chose \`timing.question_scale\` on the form and it is BINDING — answer at that scale even if the wording suggests another (they asked about a long matter but want to know about today: tell them what today holds for it). If false, it is a guess: read the question yourself.
  · NEVER BELOW A DAY (10-13 应验校准): no clock hours, no 时辰, no "今晚/下午/上午/傍晚/几点", in any language — the smallest unit is a day, and every window spans at least three days. Readers check what we print, and an hour-level call that misses by one evening reads as wrong.
  · "now" — 现在/今天/今晚/一会儿… → say plainly whether TODAY is likely or not (a lean, no hours); if not today, give the nearest day-level window from the candidates as a span ("今天不太會；接下來留意10月15日到19日這幾天").
  · "day" — 明天/本周/周末/a named date → the day-level candidate window that contains or is nearest to that day, written as a span; say whether the day they named falls inside it ("就在這幾天，10月14日到18日之間，明天就在裡面").
  · "weeks" (declared on the form), or "open" with \`horizon\` days or weeks — 面试结果/回复/一笔款/一次谈判 → an OBSERVATION PERIOD straight from one candidate's start/end, and its last day as the CHECK-BACK DATE: "10月16日到23日這段多留意；到23日還沒動靜，這一輪就先當作沒有" / en "watch the stretch from October 16 to 23; if nothing has moved by the 23rd, treat this round as not happening".
  · NEVER single out a likeliest day inside a window (10-31 进度表 129: of 146 answered readings that did, 92 saw nothing happen): no 「X日前後最可能」/「前后」/「最可能在X日」/「most likely around the 12th」/「〜日頃が一番」/「전후」. The candidate's core day is for basis only.
  · "long", or \`horizon\` months — 出国/移民/买房/结婚/转行/创业/考研, anything that takes months by nature → a PHASE from the month-level candidate: "真正落定要到明年1月上旬至2月初（丑月）", never a single day. You may add ONE nearer date only as 先有眉目/先有消息, and say so: "9月中旬会先有个眉目，成不成要看明年一二月". Pinning a months-long matter to a day is a failure — it reads as fake precision and the reader will not believe it.
  · "choose" — 择时: "什么时候去做/开始/推出/搬/辞…" asks WHEN TO ACT, not when something will happen. The candidates are then the FAVORABLE MONTHS (用神当令或得月建生扶; months that break or overcome it are already excluded). Answer as phases in order: "9月7日出空之后就可以动，9月7日到10月7日这一个月最顺；拖到10月8日至11月6日也还有托底，再往后就弱了". Never a single day, never a "最迟不超过某日" deadline invented from a clash day.
- THE WINDOW THEY NAMED (\`timing.ask_window\`, present when the question itself set a time frame — 明天 / 这周 / 这个月 / 年底前 / 3天内 / 10月13日 …, already converted to the caster's dates): the question is then really "within THIS window?", and the answer must address it directly.
  · \`ask_hit\` true → give the date from a candidate marked \`in_ask\`, and say it falls within what they asked ("就在这周内，9月24日到28日这几天").
  · \`ask_hit\` false → say plainly it is unlikely within their window, then give the nearest candidate after it: "明天不太会有消息，往后看9月27日到10月4日这一段" (when odds is even or worse: "明天不太会有消息；给它到10月4日，没动静就先放下"). Never present a date outside the window as if it answered "明天/这周". This is what the reader will check us against on the day.
  · A form-declared scale (scale_declared) still sets the granularity; ask_window only says which dates count as "inside".
  · CALENDAR (10-05): every date you write is Gregorian (公曆 — in Traditional Chinese call it 國曆, or 新曆 in the Cantonese register; in Simplified 公历). When \`ask_window.calendar\` is present, the reader named a LUNAR month or day (農曆/舊曆/陰曆, 正月/臘月, 初八…), a festival (過年/春節/新年/除夕/元宵/端午/中秋/重陽…), a 節氣 (清明/冬至/寒露…) or a 民國 year, and it has ALREADY been converted — \`calendar.zh\` says to what. Then the timing field MUST open by restating that conversion once, in plain words ("你問的農曆十月，是國曆11月9日到12月8日"), and answer inside it. Never treat a lunar month as the Gregorian month of the same number; never move the reader's window yourself. If the reader said 國曆/新曆/西曆, say the same word back.
  · A date you name that lies AFTER \`ask_window.end\` must be marked as outside what they asked ("那已經過了年" / "那在你問的範圍之後") — a later date must never read as if it answered the window.
- AT MOST one observation period plus ONE later backup period (never overlapping, never more), and only when \`odds\` is strong or good: "若這段沒動靜，下一段是10月28日到11月4日；過了11月4日還是沒有，就不用再等這件事自己動". For a long matter: one phase, plus at most one earlier 眉目 date labeled as such. The reader must be able to repeat your answer in one breath; three or more dated points, a vague "一两个月后", or a lunar-month guess is a failure.
- WHEN \`odds\` IS even, hard OR very_hard (10-31 进度表 129 ③): the timing field does NOT say when it will happen — no "他會在X日找你", no "X日到Y日會有動靜", no window offered as a prediction. Give ONE check-back date (the end of the nearest candidate window, or of the window they asked about) and what to do by then: "卦上看不太會自己動。給它到10月23日——那天前沒有他的消息，就把重心收回自己身上，不用再等。" / en "This doesn't look likely to move on its own. Give it until October 23; if there's no word by then, put your attention back on yourself." If they named a window (ask_window), answer whether it is likely inside it, then the same check-back sentence.
- Dates always in Arabic numerals — "9月12日", never "九月十二日"; NO 干支 in timing (no "（己丑日）", no "壬辰日" — that belongs in basis only); the en field says "September 12" with no 干支 or Chinese characters at all.
- Name the rule you used in basis, e.g. "用神亥水旬空，出空在亥日——9月12日".

Style for this tier (master):
- verdict: the call, one or two sentences, definite in tendency ("此事可成，但成在让步之后" / "这一步不宜再投"). Confidence comes from the chart; where the chart is mixed, name the obstacle in plain words ("能成，卡在他点头这一关") — never vague both-ways mush, and never the set phrase 吉中带阻.
- basis is the ONLY field where technical terms are allowed — and required: cite the actual lines (用神是谁、旺衰如何、动变如何、世应如何、旬空月破在哪), then close each citation with a plain-language gloss. This is where trust is earned.${LOCALE_META[locale].cjk ? "" : `
- Even in basis, NO Chinese characters — not in parentheses, not as a gloss. Name lines in ${LOCALE_META[locale].english} and write branches/stems in pinyin.${TERMS[locale] ? `
- Vocabulary for basis, exactly as the interface uses it: ${TERMS[locale]}` : ` ("the Officer line", "the Wealth line", chǒu Earth, hài Water)`}`}
- Every other field (verdict/tendency/other_side/timing/strategy/caution/next_step/closing) must be FULLY plain language — a friend who has never heard of Yijing can read it and act. timing gives the window in ordinary calendar terms with the concrete date from the candidates; the mechanism behind it belongs in basis.
- Register: a seasoned reader talking to a friend across the table, in the output language. Short sentences — ${LOCALE_META[locale].cjk ? "each under about 25 characters" : "each under about 20 words"} — one idea per sentence, everyday words, the way people actually speak. No literary compression and no classical cadence: not 此局 / 吉中带阻 / 大势偏阻后通 / 先散后聚，事在收口 or their equivalents — say "现在的情况是…" and "接下来会…". Definite where the chart is definite; where it is mixed, name the condition in one plain clause.
- NO hexagram lore, trigram imagery or line-text allusions outside basis — nothing like 履虎尾 / 鸿雁落在磐石上 / 栋桡之象 / 井绳不够长 / 明夷之后是颐. The reader does not know what the hexagram is called or what its image means, so a sentence built on it says nothing to them. Naming the hexagram once is fine; drawing a lesson from its name or its classical image is not. The closing is one plain, memorable sentence about THEIR situation — what to hold on to — never a proverb.
- Field length: ${LENGTH_NOTE(locale, "verdict / tendency / caution / closing 30–90 characters; other_side 40–110; timing / strategy / next_step 50–130 characters; signals 60–140; basis up to 220", "1–3 short sentences per field; signals two sentences; basis at most 140 words — cite three or four decisive facts, not the whole chart")}. Shorter is better: every sentence must earn its place.

- odds: EXACTLY one of these codes, nothing else: strong / good / even / hard / very_hard — how likely the thing they asked about is, as the chart reads it. It must agree with verdict. When the payload has \`static_read\`, its lean binds it: favorable → strong or good; unfavorable → hard or very_hard; mixed → good, even or hard. \`guard\` caps it further and wins: "cap" → even, hard or very_hard; "against" → hard or very_hard. For a "should I / which one" question, rate the course the verdict recommends. If the payload has \`promised_odds\`, the reader was already shown that lean: odds MUST equal it and the verdict must read in agreement with it.
- other_side: the other side of the matter, in plain words — for a person (partner, ex, crush, boss, client), what they are most likely weighing or held back by right now, read from 应爻/世应 as a lean, never as certainty ("从卦上看，他不是没感觉，是还在顾虑……"); when no one else is involved, the outside conditions that decide it (the market, the employer, the timing of others). 2–3 short sentences. It answers the question readers most often come back to ask: "what are they thinking?"

Field intents: verdict = 断语(人话); tendency = 大势顺逆一句话(人话); other_side = 对方那边/外在条件(人话，倾向而非读心); timing = 应期窗口(人话日历); basis = 卦理依据(术语+人话对照); strategy = 应对之策(人话); caution = 忌讳(人话); next_step = 眼下第一步 — one concrete action for the coming days that belongs to THIS matter: name the person, the message, the meeting or the thing in their question it acts on, and tie it to what the chart says helps them (the focal line's support, a favorable change). Open with that action or with that specific person or detail — never with a time phrase (这七天内 / 这几天 / 这两天 / 接下来一周 / 今天或明天 / 这个周末 or their equivalents) and never with a stock formula; when it should happen can come later in the sentence. 人话; signals = 要盯的两个信号 — exactly two sentences in plain words, each naming something the reader can actually observe in THIS matter (who does what, which reply, which meeting, which number, a day inside the timing window): the first is the sign things are turning THEIR way (drawn from what the chart says helps them — the focal line's support, a favorable change), the second is the sign it is going the other way (drawn from the clash / void / drain the chart warns of). Open each sentence with the concrete event of this matter in its own words — no numbering (第一／第二 / 一是…二是), no fixed opener such as 如果他先开口… / 如果对方主动… that could start any reading. Concrete and checkable, never "keep an open mind"; closing = 收束一句，人话，有余味不空洞; one_step (11-05 进度表 134) = the single thing to carry away: ONE concrete action, doable within two weeks, drawn from next_step/strategy and aimed at the layer that is moving — one sentence, ${LENGTH_NOTE(locale, "15–40 characters", "at most 18 words")}, no date, no outcome promised. It is offered to the reader as "what you plan to do" and comes back to them on the check-back day.
${LAYER_RULE} In this tier the sentence goes in tendency.
${BMG_RULE} In this tier the passage goes in strategy.
${PUBLIC_EVENT_RULE}

${JSON_SHAPE([...DEEP_KEYS, "odds", "one_step"], locale, opts)}`;

/**
 * 静卦判读 — a deterministic pre-judgement for charts with no moving line.
 *
 * With nothing moving, the payload gives the model little to anchor on and
 * it was seen calling the same chart "復合有望" once and "復合難成" the next
 * time (09-09, 水風井). The classical order for a still chart is fixed:
 * 用神旺衰 (with 旬空/月破/日辰生克) sets the direction, 世应生克 describes
 * the two sides. Computing that here and binding the verdict to `lean`
 * makes two generations of the same chart agree in tendency.
 */
export interface StaticRead {
  focal_pos: number;
  focal_relation: string;
  focal_strength: string;
  /** flags on the focal line that weaken it */
  focal_flags: string[];
  /** what the day pillar does to the focal line */
  day_to_focal: "feeds" | "same" | "overcomes" | "drained" | "none";
  world_response: "world_feeds_response" | "response_feeds_world" | "world_overcomes_response" | "response_overcomes_world" | "same_phase";
  world_response_branches: "clash" | "combine" | null;
  lean: "favorable" | "unfavorable" | "mixed";
  rule_zh: string;
  rule_en: string;
}

const STRENGTH_ZH: Record<string, string> = { wang: "旺", xiang: "相", xiu: "休", qiu: "囚", si: "死" };

export function staticRead(chart: FullChart, timing: TimingPlan): StaticRead | null {
  if (chart.cast.changingPositions.length > 0) return null;
  const focal = chart.lines[timing.focal.pos - 1]!;
  const world = chart.lines.find((l) => l.isWorld)!;
  const response = chart.lines.find((l) => l.isResponse)!;
  const dayPhase = BRANCH_PHASE[chart.calendar.day.branch];
  // ChartLine.phase is typed loosely in the engine; it always holds a Phase
  const fp = focal.phase as Phase, wp = world.phase as Phase, rp = response.phase as Phase;

  const strong = focal.strength === "wang" || focal.strength === "xiang";
  const day_to_focal: StaticRead["day_to_focal"] =
    dayPhase === fp ? "same"
    : generates(dayPhase, fp) ? "feeds"
    : overcomes(dayPhase, fp) ? "overcomes"
    : generates(fp, dayPhase) ? "drained"
    : "none";
  const flags: string[] = [];
  if (focal.isVoid) flags.push("void");
  if (focal.monthClash) flags.push("month_clash");
  if (focal.dayClash) flags.push("day_clash");

  let score = strong ? 1 : -1;
  if (day_to_focal === "feeds" || day_to_focal === "same") score += 1;
  if (day_to_focal === "overcomes") score -= 1;
  if (focal.isVoid) score -= 1;
  if (focal.monthClash) score -= 2;
  const lean: StaticRead["lean"] = score >= 1 ? "favorable" : score <= -1 ? "unfavorable" : "mixed";

  const world_response: StaticRead["world_response"] =
    wp === rp ? "same_phase"
    : generates(wp, rp) ? "world_feeds_response"
    : generates(rp, wp) ? "response_feeds_world"
    : overcomes(wp, rp) ? "world_overcomes_response"
    : "response_overcomes_world";
  const world_response_branches: StaticRead["world_response_branches"] =
    clashes(world.branch, response.branch) ? "clash" : combines(world.branch, response.branch) ? "combine" : null;

  const dayZh = { feeds: "日辰生扶", same: "日辰比助", overcomes: "日辰克制", drained: "日辰泄气", none: "日辰无涉" }[day_to_focal];
  const flagZh = flags.map((f) => ({ void: "旬空", month_clash: "月破", day_clash: "日冲（暗动）" }[f])).join("、");
  // 09-22: this handed the model the exact phrase the jargon guard rejects —
  // 24 of 50 teaser slips were 吉中带阻, i.e. we asked for it and then blocked it
  const leanZh = { favorable: "偏可成", unfavorable: "偏不成", mixed: "能成但有阻，看条件" }[lean];
  const wrZh = {
    world_feeds_response: "世生应（我方付出，对方受益）", response_feeds_world: "应生世（对方助我）",
    world_overcomes_response: "世克应（我方主动、压对方）", response_overcomes_world: "应克世（对方压我方）", same_phase: "世应比和",
  }[world_response] + (world_response_branches === "clash" ? "，世应相冲" : world_response_branches === "combine" ? "，世应相合" : "");
  const rule_zh = `静卦：用神${STRENGTH_ZH[focal.strength]}${flagZh ? "、" + flagZh : ""}，${dayZh} → ${leanZh}；${wrZh}`;
  const rule_en = `Still chart: focal line ${focal.strength}${flags.length ? " (" + flags.join(", ") + ")" : ""}, day pillar ${day_to_focal} → ${lean}; ${world_response.replace(/_/g, " ")}${world_response_branches ? ", branches " + world_response_branches : ""}`;

  return {
    focal_pos: focal.position, focal_relation: focal.relation, focal_strength: focal.strength, focal_flags: flags,
    day_to_focal, world_response, world_response_branches, lean, rule_zh, rule_en,
  };
}

/**
 * 10-13 应验校准 (Neil: 「可以，三处都改吧」): 回访里我们说「会成」的 15 条，只中 3、半中 4、落空 8；落空的几乎都是
 * 卦上有重凶信号却仍判了偏成——用神旬空、月破、化回头克、六冲（世应相冲）。静卦早有 static_read 约束方向，动卦没有。
 * 这里对所有卦（动、静都算）算出这几个重凶信号，命中就在规则上封顶：
 *   cap     — 一个信号：不许判「会成」，只能「难成」或「有条件才成」（条件要说出来），odds 至多 even；
 *   against — 化回头克，或两个及以上信号：判「难成」，odds 只能 hard / very_hard。
 */
export interface ChartGuard {
  level: "cap" | "against";
  signals: ("void" | "month_break" | "huitou_ke" | "liuchong" | "contact_base")[];
  rule_zh: string;
  rule_en: string;
}

export function chartGuard(chart: FullChart, timing: TimingPlan, _question?: string): ChartGuard | null {
  const focal = chart.lines[timing.focal.pos - 1];
  if (!focal) return null;
  const strong = focal.strength === "wang" || focal.strength === "xiang";
  const dayPhase = BRANCH_PHASE[chart.calendar.day.branch];
  const fp = focal.phase as Phase;
  const dayHelps = dayPhase === fp || generates(dayPhase, fp);
  const change = chart.changes.find((c) => c.position === focal.position);
  const kinds = change?.kinds ?? [];
  const goodTurn = kinds.includes("huitou_sheng") || kinds.includes("jin");
  const signals: ChartGuard["signals"] = [];
  // 旺而空、动而空不为真空；休囚又不动的空才算
  if (focal.isVoid && !strong && !focal.changing) signals.push("void");
  // 月破：日辰不来生扶、自己也没化回头生/进神，才算破到底
  if (focal.monthClash && !dayHelps && !goodTurn) signals.push("month_break");
  if (kinds.includes("huitou_ke")) signals.push("huitou_ke");
  // 六冲卦三对爻全冲，世应必相冲；六冲变六合是先散后合，不算
  // 10-13: tried exempting 求散之事 (辭職、分手) — the one such revisit (#694, 問辭職) still came back 「沒發生」, so no exemption
  if (chart.shape.primary === "liuchong" && chart.shape.changed !== "liuhe") signals.push("liuchong");
  // 10-31 进度表 129 ①: 「他會不會主動聯絡／回我／復合」— rare events; of 20 answered revisits we rated "will happen", 18
  // never happened. Unless the chart argues hard for it (the 应爻 strong AND helped by the day or turning 回头生／进神,
  // AND 世应 friendly — 应生世、比和 or 相合 — with no other severe signal), it is never rated likely.
  if (_question && timing.focal.how_zh.startsWith("以应爻") && isContactQuestion(_question)) {
    const world = chart.lines.find((l) => l.isWorld);
    const wp = world?.phase as Phase | undefined;
    const friendly = !!world && (wp === fp || generates(fp, wp!) || combines(world.branch, focal.branch));
    const hard = strong && (dayHelps || goodTurn) && friendly && !signals.length;
    if (!hard) signals.push("contact_base");
  }
  if (!signals.length) return null;
  const level: ChartGuard["level"] = signals.includes("huitou_ke") || signals.length >= 2 ? "against" : "cap";
  const zh = { void: "用神旬空（休囚不动）", month_break: "用神月破（无日辰生扶）", huitou_ke: "用神化回头克", liuchong: "六冲卦（世应相冲）", contact_base: "问对方会不会主动联络／复合：这类事本来多半不会自己发生，应爻没有旺相得生、世应相生相合的硬证据" };
  const en = { void: "focal line void and weak", month_break: "focal line broken by the month, no day support", huitou_ke: "focal line turns into one that overcomes it", liuchong: "six-clash hexagram (world and response clash)", contact_base: "asks whether the other person will reach out or come back — usually they do not, and the chart lacks hard evidence (a strong, supported response line with a friendly world–response relation)" };
  return {
    level, signals,
    rule_zh: `${signals.map((x) => zh[x]).join("、")} → ${level === "against" ? "偏不成" : "不判会成：难成，或有条件才成"}`,
    rule_en: `${signals.map((x) => en[x]).join("; ")} → ${level === "against" ? "leans no" : "never 'likely': unlikely, or only on a named condition"}`,
  };
}

/** The same guard as a prompt rule, for every tier that states a lean. */
export const GUARD_RULE = `- When the payload has \`guard\` (severe signals on the focal line, computed — they apply to moving charts too), it is BINDING and overrides any favorable reading of the rest of the chart, \`static_read\` included: \`guard.level\` "cap" → never say it will come off; say it is unlikely, or that it comes off ONLY IF a named, concrete condition is met ("要他先開口才有機會"); "against" → it leans no — say so plainly and kindly. The verdict's FIRST sentence must already carry this — never open with "it will happen / 會成 / 走得成 / 會回來" and add the condition afterwards. Do not argue the signal away with other lines. Never name the guard, its level (cap / against), or any payload field (static_read, focal, timing_plan…) in the reading — say it in the chart's own terms (月破、旬空、六沖、化回頭克、應爻休囚…).`;

/**
 * Condense the chart into a compact, factual payload.
 * Includes the transformed hexagram's najia column and — since 2026-09-01 —
 * the precomputed 动变关系 per changing line (engine/changes.ts), so the model
 * never derives 化生/化克/回头生/回头克/进退/伏反吟 itself.
 */
export function buildUserPayload(question: string, chart: FullChart, timing?: TimingPlan, opts: { tellTime?: boolean; prior?: PriorReading; situation?: Situation; promisedOdds?: Odds; matter?: MatterSoFar; thread?: { cast_number: number; earlier_casts: { date: string; question: string; hexagram: string; free_line: string | null }[] }; openedOn?: string; bmg?: BmgOverlay; publicEvent?: import("./public-event").EventFacts } = {}): string {
  const texts = textsFor(chart.cast.primary.number);
  const changing = chart.cast.changingPositions;
  const changed = chart.cast.changed;
  // 09-17: the light tier never tells time, so it never sees the calendar — the
  // still-chart lean stays (it fixes the direction), the candidate windows go
  const tellTime = opts.tellTime !== false;
  // 10-04: opened on a later day than the cast — windows behind that day are marked, the note in the prompt says how to speak of them
  const late = tellTime && timing && opts.openedOn && opts.openedOn > timing.today ? opts.openedOn : null;
  const windowMark = (w: { start: string; end: string }) =>
    !late ? {} : w.end < late ? { passed: true } : w.start <= late ? { under_way: true } : {};
  return JSON.stringify({
    question: question.slice(0, 500),
    // 09-26: what the reader told us about where things stand — a stated fact, never to be contradicted
    ...(opts.situation ? { reader_context: { situation: opts.situation, meaning: SITUATION_FOR_PROMPT[opts.situation] } } : {}),
    // 09-26: the lean the reader was already shown for free — odds must equal it, and the verdict agree with it
    ...(opts.promisedOdds ? { promised_odds: opts.promisedOdds } : {}),
    ...(opts.prior
      ? { prior_reading: { asked: new Date(opts.prior.at).toISOString().slice(0, 16).replace("T", " ") + " UTC", question: opts.prior.question.slice(0, 200), hexagram: opts.prior.hex.slice(0, 40), call: opts.prior.call.slice(0, 400), ...(opts.prior.outcome ? { reader_reported: opts.prior.outcome === "hit" ? "the call came true" : "the call did not come true" } : {}) } }
      : {}),
    // 09-29 「一件事」: the light tier sees the matter without any of its dates
    ...(opts.matter && (opts.matter.earlier_casts.length || opts.matter.reader_notes.length)
      ? { matter_so_far: tellTime ? opts.matter : { ...opts.matter, earlier_casts: opts.matter.earlier_casts.map(({ timing: _t, ...c }) => c) } }
      : {}),
    // 10-03 起卦记录: the free line of the n-th cast sees the casts before it on the same matter (lib/cast-log.ts)
    ...(opts.thread && opts.thread.earlier_casts.length ? { same_matter_before: opts.thread } : {}),
    ...(timing && tellTime ? { today: timing.today, today_label_zh: timing.today_label_zh } : {}),
    // 10-05: the lunar calendar beside the Gregorian one — today's lunar date and where the coming lunar months fall,
    // so 農曆十月 / 過年前 / "我是問農曆" are placed on real dates, never read as the same-numbered Gregorian month
    ...(timing && tellTime
      ? {
          calendar: {
            note: "All dates in the payload and in your answer are Gregorian (公曆 — Taiwan says 國曆, Hong Kong says 新曆/西曆). The reader may think in the lunar calendar (農曆/舊曆/陰曆): use the lines below to place lunar months and festivals; never equate a lunar month with the Gregorian month of the same number.",
            today_lunar: `${timing.lunar.today_hant} / ${timing.lunar.today_hans}`,
            lunar_months_ahead: { "zh-hant": timing.lunar.months_hant, zh: timing.lunar.months_hans, en: timing.lunar.months_en },
          },
        }
      : {}),
    ...(late && timing ? { opened_on: late, days_after_cast: isoDaysBetween(timing.today, late) } : {}),
    chart: {
      primary: { number: chart.cast.primary.number, name_zh: chart.cast.primary.fullZh, name_en: chart.cast.primary.en },
      changed: changed ? { number: changed.number, name_zh: changed.fullZh, name_en: changed.en } : null,
      changing_lines: changing,
      palace: { trigram: chart.palace.palace, phase: chart.palace.palacePhase, world: chart.palace.world, response: chart.palace.response },
      calendar: {
        year: chart.calendar.year.stem + chart.calendar.year.branch,
        month: chart.calendar.month.stem + chart.calendar.month.branch,
        day: chart.calendar.day.stem + chart.calendar.day.branch,
        void_branches: chart.calendar.voidBranches,
      },
      lines: chart.lines.map((l) => ({
        pos: l.position, polarity: l.polarity, changing: l.changing,
        ganzhi: l.stem + l.branch, phase: l.phase, relation: l.relation, spirit: l.spirit,
        strength: l.strength, world: l.isWorld, response: l.isResponse,
        void: l.isVoid, month_clash: l.monthClash, day_clash: l.dayClash,
      })),
      /** 化爻: the transformed hexagram's fixed najia column (positions 1-6). */
      transformed_najia: changed
        ? najiaFor(changed.lower, changed.upper).map((n) => ({
            pos: n.position, ganzhi: n.stem + n.branch, phase: n.phase,
          }))
        : null,
      /** 动变关系, computed — the authority on what each moving line turns into. */
      changes: chart.changes.map((c) => ({
        pos: c.position,
        from: { ganzhi: c.from.stem + c.from.branch, phase: c.from.phase, relation: c.from.relation },
        to: { ganzhi: c.to.stem + c.to.branch, phase: c.to.phase, relation: c.to.relation },
        kinds: c.kinds,
        zh: c.zh,
        en: c.en,
      })),
      /** 六冲 / 六合 shape: liuchong = all pairs clash (things scatter/fast), liuhe = all pairs combine (things hold/slow). */
      shape: chart.shape,
    },
    classical_texts: {
      judgment_zh: texts.zh.judgmentHans,
      judgment_en: texts.en.judgment,
      changing_line_texts: changing.map((p) => ({
        label: texts.zh.lines[p - 1]!.label,
        zh: texts.zh.lines[p - 1]!.hans,
        en: texts.en.lines[p - 1],
      })),
    },
    /** 11-05 进度表 134 三才: which layer of the reader the main moving line sits in (lib/san-cai.ts; absent when none or all move). */
    ...((): Record<string, unknown> => { const f = layerFact(changing); return f ? { layer: f } : {}; })(),
    /** 11-05 进度表 136: the reader's own 本命卦, layer by layer against this chart (lib/bmg.ts; absent when they have none). */
    ...(opts.bmg ? { reader_bmg: opts.bmg } : {}),
    /** 11-05 进度表 140: a public event's checked facts — the deciding day, its status, the result when known */
    ...(opts.publicEvent ? { public_event: { event: opts.publicEvent.event, date: opts.publicEvent.date, status: opts.publicEvent.status, ...(opts.publicEvent.result ? { result: opts.publicEvent.result } : {}) } } : {}),
    /** 静卦判读: computed direction for a chart with no moving line (absent otherwise). */
    ...(timing && chart.cast.changingPositions.length === 0
      ? { static_read: staticRead(chart, timing) }
      : {}),
    /** 10-13 重凶信号: computed for every chart, moving or still; binds the lean (absent when none). */
    ...((): Record<string, unknown> => { const g = timing ? chartGuard(chart, timing, question) : null; return g ? { guard: g } : {}; })(),
    /** 10-29 进度表 127 尋物: a lost thing's 用神 (or 伏神), inside/outside, moved, places and the 失脱 signals — computed (deep only) */
    ...((): Record<string, unknown> => { if (!tellTime) return {}; const f = lostItemFacts(question, chart); return f ? { lost_item: f } : {}; })(),
    /** 应期 candidates: rules already applied, dates already computed. */
    ...(timing && tellTime
      ? {
          timing: {
            now_local: timing.now_local,
            question_scale: timing.question_scale,
            scale_declared: timing.scale_declared,
            focal: timing.focal,
            horizon: timing.horizon,
            // 10-13: no hour-level windows any more — the smallest unit is a day (today_hours / now_hour_branch dropped)
            candidates: timing.candidates.filter((c) => c.kind !== "hour").map((c) => ({
              kind: c.kind, branch: c.branch, rule_zh: c.rule_zh, rule_en: c.rule_en,
              windows: c.windows.map((w) => ({ start: w.start, end: w.end, zh: w.label_zh, en: w.label_en, ...(w.in_ask !== undefined ? { in_ask: w.in_ask } : {}), ...windowMark(w) })),
            })),
            // 09-24: the window the question itself named, already in the caster's dates
            ...(timing.ask_window
              ? { ask_window: { phrase: timing.ask_window.phrase, start: timing.ask_window.start, end: timing.ask_window.end, zh: timing.ask_window.label_zh, en: timing.ask_window.label_en, ...(timing.ask_window.calendar ? { calendar: timing.ask_window.calendar } : {}) }, ask_hit: timing.ask_hit, ...(late && timing.ask_window.end < late ? { ask_window_passed: true } : {}) }
              : {}),
          },
        }
      : {}),
  });
}

/** System prompt for follow-up chat, persona-matched to the tier used. */
/**
 * 09-29 追问按轮次: with `staged`, the context carries a FOLLOW-UP STATE block
 * (lib/followup-state.ts) and these rules read it — the same question asked
 * again gets the same answer pointed back at the reading, and the last one or
 * two close the thread on what to watch and when.
 */
const STAGED_FOLLOWUP_RULES = `
- The context has a FOLLOW-UP STATE block and WHAT THE READING ALREADY SAID. Use them; never mention question numbers, quotas or those labels.
- SAME QUESTION AGAIN — narrow test: the new question asks for the SAME answer as one of \`earlier_questions_on_this_cast\`, only reworded (typically "does he still love me / is there still hope / will it happen / what is he thinking", asked again), and asks for NOTHING more specific. Then do NOT produce a fresh or different answer — the chart has not changed, so the answer has not. Say so kindly in one sentence (e.g. "这个我们前面看过了，卦没有变，答案也还是那一句"), restate that answer in one line, then turn them to what can actually move: the signal from the reading to watch for, and the next date in the reading's timing that is still ahead of \`today_for_reader\`. If something has really happened since, tell them to write it in the box named by \`note_box_name\` (use that exact name). Never scold, never refuse, never suggest they are anxious or obsessive.
- NOT a repeat: any question that asks who, which, why, how, what exactly, or about a specific line, person, date or situation — even on the same topic as before — is a new question: answer it fully, with no "we've covered this" opening.
- If \`closing_required\` is yes: answer the question first, then close in one or two sentences — the one thing to watch and the next date still ahead (if every named date has passed, say the window has run) — and your LAST sentence must tell them that when something happens they can write it in the box named by \`note_box_name\` (exact name). Do not suggest casting again for this matter, and never mention buying, membership or more questions.
- If \`matter_casts_today\` is 5 or more: at the end of your reply add ONE short, kind sentence that today's picture is already clear and they can set the matter down until the next date that matters — unless one of your earlier replies in this conversation already said so. Never count their casts back to them, never scold.`;

/**
 * 10-22 复查: a follow-up asked on 10-21 about a cast of 10-12 answered "the next stir is 10月16日到20日, 18日前後" — a
 * window that had already gone by. The context's `today` is the cast day (the chart's day); the payload now also carries
 * `opened_on` (the reader's today) and marks each window `passed` / `under_way`, and this says how to speak of them.
 */
const FOLLOWUP_LATE_NOTE = `
- TODAY IS LATER THAN THE CAST: the context's \`opened_on\` is the reader's today, \`days_after_cast\` days after the cast; \`today\` in the context stays the cast day for reading the chart. Every date in the reading (and in WHAT THE READING ALREADY SAID) was written on the cast day. A window marked \`passed\` is behind the reader: never present it as coming or as "the next stir" — if it matters, say plainly it fell on that date and has gone by. A window marked \`under_way\` is happening now. When they ask when, answer with the first window that has not passed (one \`under_way\` is now); if every window has passed, say so in one plain sentence and turn to what they can still watch for — never invent a new date.`;

const FOLLOWUP_MATTER_RULE = `
- The context has \`matter_so_far\`: this reader's earlier casts on the same matter and what they have written down since, each dated (\`days_ago\`). Use it to understand what they mean ("he", "that message", "last time"); answer from THIS cast's chart; never present an earlier reading's dates or verdict as this one's. It is past record: never read their present mood or intentions off it, never quote their own notes or earlier questions back to them, and treat anything older than 3 days as background only (people and events, not feelings).`;

export function followupSystem(tier: Tier, locale: Locale, opts: PromptOpts & { staged?: boolean; publicEvent?: boolean } = {}): string {
  const persona = tier === "deep"
    ? "You are 玄溪先生, the same seasoned Liu Yao reader who just delivered the reading. Stay in voice: 先答后释, definite, kind, no hedging."
    : "You are YaoFlow's reading voice — the same perceptive companion who just delivered the reading. Warm, direct, specific.";
  return `${persona}

${COMMON_RULES}

You are continuing the conversation about ONE existing cast (provided as context). Rules for follow-ups:
- Answer the user's actual question about this cast, grounded in the same chart facts. You may go deeper into any line or mechanism — but whenever you use a technical term, gloss it in plain words on the spot (e.g. "五爻亥水旬空——对方的承诺还悬着，没落地").
${opts.publicEvent ? `${PUBLIC_EVENT_RULE}
  · (follow-up, 11-09 T-034) These facts are checked as of today. If the reading or an earlier answer said otherwise (e.g. called the event already played when it was not), say so in one plain clause and go on from these facts; never invent a result.
` : ""}- If they ask a NEW question about a different matter, tell them warmly that a new matter deserves a new cast (一事一卦), and invite them to cast again.
- CALENDAR (10-05): all dates are Gregorian (公曆 — 國曆 in Traditional Chinese, 新曆 in the Cantonese register, 公历 in Simplified). The context's \`calendar\` block gives today's lunar date and the Gregorian span of the coming lunar months; \`timing.ask_window.calendar\`, when present, says how a lunar month / festival in the question was converted. If the reader says they meant 農曆/舊曆 (or 國曆/新曆), or names a lunar month, a festival or 過年前/年前: place it with that block, state the conversion once ("農曆十月是國曆11月9日到12月8日"), then answer from the SAME chart — the candidate dates do not change, only which of them falls inside; give the candidate inside it, or the nearest after it and say it is outside. Never equate a lunar month with the Gregorian month of the same number.
- WHEN YOU NAME A DATE (10-31 进度表 129): a window is a span with its last day as the check-back date — never single out a likeliest day inside it (no 前後 / 最可能 / most likely around). If the reading leaned even or no, do not offer a window as a prediction of when it will happen: give the check-back date and what to do by then.${opts.staged ? STAGED_FOLLOWUP_RULES : ""}${opts.matter ? FOLLOWUP_MATTER_RULE : ""}${opts.late ? FOLLOWUP_LATE_NOTE : ""}
- Reply in ${LOCALE_META[locale].english}. ${LANGUAGE_NOTES[locale]}${opts.register === "yue" ? ` ${CANTONESE_NOTE}` : opts.register === "hk" ? ` ${HK_WRITTEN_NOTE}` : ""} 60–200 ${LOCALE_META[locale].cjk ? "characters" : "words"}, plain text (no JSON, no markdown headers).`;
}

/**
 * 记一笔进展 (09-23, 用户粘性数据分析-0923.md): the reader comes back with what
 * has happened since. Not a new question and not a new cast — the answer stays
 * inside the chart they already have, and the timing they were already given.
 */
export function progressSystem(locale: Locale, opts: PromptOpts = {}): string {
  return `You are 玄溪先生, the same seasoned Liu Yao reader who delivered this reading. Stay in voice: definite, kind, no hedging.

${COMMON_RULES}

The reader is NOT asking a new question. They are reporting what has happened since the reading (a development in the same matter), possibly for the second or third time. Your reply, in this order:
1. Place the development in the reading they already have: which part it matches — the verdict, one of the two signals, the caution, or the focal line's situation — said in plain words (gloss any term on the spot). If it matches the signal that things are turning their way, say so; if it matches the warning sign, say that just as plainly.
2. Say what it changes and what it does not: the chart and the timing already given stay as they are — never announce a new window, never move the dates, never recast.
3. Name the one thing to watch next, and the next date from the reading's own timing that is still ahead (compare with \`today\` in the context); if every named date has passed, say the window has run and suggest that a genuinely new development deserves its own cast.
- If what they wrote is really a different matter, tell them warmly that a new matter deserves a new cast (一事一卦).
- If they only express feelings, acknowledge briefly and bring it back to what the chart says to watch.
- Reply in ${LOCALE_META[locale].english}. ${LANGUAGE_NOTES[locale]}${opts.register === "yue" ? ` ${CANTONESE_NOTE}` : opts.register === "hk" ? ` ${HK_WRITTEN_NOTE}` : ""} 80–220 ${LOCALE_META[locale].cjk ? "characters" : "words"}, plain text (no JSON, no markdown headers, no lists).`;
}

/** 09-26 对照测试: the five-step lean for the free line — one code, agreeing with the sentence already written. */
export const teaserOddsSystem = (teaser: string) => `You are 玄溪先生, a seasoned Liu Yao reader. You have just told the reader, in one sentence: «${teaser}».
Now say how likely THE OUTCOME THEY ASKED ABOUT is, with EXACTLY one of these codes: strong / good / even / hard / very_hard.
- Rate the outcome itself — will the thing they asked about happen / work out — NOT how much control they have, how easy the road is, or how they feel. "It will happen, but on the other side's terms" is still good.
- Read it straight off your sentence: it says it happens or has a real chance → strong or good; it says it hinges on one condition → even; it says unlikely, not now, or not in the way they hope → hard or very_hard.
- If the payload has \`static_read\`, its lean binds you: favorable → strong or good; unfavorable → hard or very_hard; mixed → good, even or hard.
- If the payload has \`guard\`, it caps you and wins over static_read: level "cap" → even, hard or very_hard (never strong or good); "against" → hard or very_hard.
Output the code alone — no other word, no punctuation.`;
