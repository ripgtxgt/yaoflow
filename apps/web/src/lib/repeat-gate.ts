import type { Locale } from "./locales";
import { looksLikeReply, REPLY_WINDOW_MS } from "./reply-like";
import type { Topic } from "./topic";

/**
 * 一事一占 — the repeat-cast gate, second version (09-15).
 *
 * The first version blocked a question only when it came back word for word
 * inside 24 hours. A reader in Taiwan cast 35 times in one day on one matter,
 * every cast a fresh wording, and the gate never matched once — she was
 * blocked five times and rephrased her way past each one. The promise on the
 * site is "同一件事", not "同一句话", so this version decides on the matter:
 *
 *   - the same wording, or wording close enough (content tokens, Jaccard
 *     ≥ SIMILAR_AT) → the soft block: the reader may say things have changed
 *     and cast again, as before;
 *   - the third cast on one topic inside the window is the last one through;
 *     the fourth is blocked hard — no waiver, come back tomorrow.
 *
 * Everything lives in the reader's own browser (localStorage), exactly as the
 * privacy policy says: no server, no IP, no account. A determined person can
 * clear it; the gate is for the one who keeps asking, not for abuse.
 */

export interface PastCast {
  /** normalised question (see normalizeQ) */
  q: string;
  at: number;
  hex: string;
  /** effective topic at the time: the reader's chip, else the detector's call */
  topic?: Topic;
  /** the detector's own call, kept apart from the chip (09-16: the cap is counted on both, so re-labelling a chip does not reset it) */
  det?: Topic;
  /** the question as typed (trimmed, capped), shown back in the panel so the reader sees what matched */
  raw?: string;
  /** the reading session this cast became, once claimed — the way back to it (09-18) */
  sid?: string;
  /** the call that reading gave (verdict / summary, trimmed), so a re-cast can be written as a continuation (09-18) */
  verdict?: string;
  /** 09-22: this cast happened after the reader waived a soft block — the waivers are counted, not unlimited */
  waived?: boolean;
  tier?: "one" | "deep";
  /** 09-26: the six lines and the instant — so the gate can hand the earlier figure back instead of a dead end */
  v?: number[];
  t?: number;
}

/** How many recent casts count against `topic`: filed under it by chip or by the detector. */
function onTopicCount(recent: PastCast[], topic: Topic): PastCast[] {
  return recent.filter((c) => c.topic === topic || c.det === topic);
}
/** 09-26 (Neil: 「其他类不再完全豁免」): "other" is a grab-bag, so it gets twice the room — but no longer a free pass */
const capFor = (topic: Topic) => (topic === "other" ? TOPIC_CAP * 2 : TOPIC_CAP);

/**
 * 09-22 — the hole the cap had, and the reason it went unnoticed.
 *
 * `other` was exempt from the topic cap, on the reasoning that it is a
 * catch-all: three unrelated questions that all failed to classify should not
 * block each other. But `other` is also where the detector puts most questions
 * it cannot place, and on day two of real payments it was the single largest
 * topic (20 of 46). Two members spent the day circling one matter each —
 * does he still think of me, will my husband ask for a divorce — twelve casts
 * between them, eight filed under `other`, not one of them capped.
 *
 * So `other` stops being a free pass, but not by flat count: what is counted
 * is *circling* — recent casts that share enough of this question's content to
 * be the same matter in different words. Below SIMILAR_AT (they are not the
 * same question) but above CIRCLING_AT (they are not a different subject
 * either). Three genuinely unrelated `other` questions still pass; six
 * variations on one person do not.
 */
export const CIRCLING_AT = 0.22;

/**
 * The casts this question is circling with — its own cluster, one hop wide.
 *
 * Pairwise overlap alone was not enough, and the live case shows why: the
 * reader used two names for the same person (雞女 and Holly) and two for
 * herself. 「鄧樹仁偶爾還會想起雞女」 and 「猴男還會不會想起雞女」 score 0.30,
 * but 「鄧樹仁偶爾還會想起Holly」 against that same new question scores 0.08 —
 * a different label for one person drops it out, though anyone reading the
 * three would say they are one matter. The two 鄧樹仁 castings, however, score
 * 0.60 against each other.
 *
 * So: start from the casts this question touches directly, then take one hop —
 * anything those touch. One hop, not transitive closure, so a chain of loosely
 * related subjects cannot drag in the whole day.
 */
function circlingCount(recent: PastCast[], question: string, locale: Locale): PastCast[] {
  const q = normalizeQ(question);
  const direct = recent.filter((c) => similarity(c.q, q, locale) >= CIRCLING_AT);
  if (direct.length === 0) return [];
  const cluster = new Set(direct);
  for (const seed of direct) {
    for (const c of recent) {
      if (!cluster.has(c) && similarity(c.q, seed.q, locale) >= CIRCLING_AT) cluster.add(c);
    }
  }
  return [...cluster];
}

/**
 * How many times the reader has already said "things have changed" and cast
 * anyway, inside the window. The soft block was waivable without limit, which
 * was tolerable while every cast cost money — the price was the other brake.
 * Membership removed that brake (unlimited light readings), and the first
 * member to have it asked the same question six times in one afternoon. After
 * WAIVER_CAP waivers the soft block stops being soft.
 */
export const WAIVER_CAP = 2;

export type GateVerdict =
  /** same matter as a recent cast — may be waived, unless the waivers are spent */
  | { kind: "same"; past: PastCast; waivable: boolean }
  /** the topic's casts for the window are spent — not waivable */
  /** the window's casts are spent. `by` says which limit: the topic's count, or circling one matter */
  | { kind: "cap"; count: number; past: PastCast; by: "topic" | "circling" }
  | null;

export const REPEAT_WINDOW_MS = 24 * 3_600_000;
/** casts allowed on one topic inside the window */
export const TOPIC_CAP = 3;
/** content-token overlap from which two wordings are the same matter */
export const SIMILAR_AT = 0.5;

const PUNCT = /[\p{P}\p{S}\s]+/gu;

/** Lower-cased, punctuation gone, inner whitespace collapsed to one space (word boundaries survive for Latin). */
export function normalizeQ(q: string): string {
  return q.toLowerCase().replace(PUNCT, " ").trim().replace(/\s+/g, " ");
}

/* ---------- content tokens ---------- */

// multi-character function words first (both scripts), then single characters
const HAN_PHRASES =
  /什麼|什么|為什麼|为什么|到底|究竟|大概|可能|可以|應該|应该|是否|會不會|会不会|能不能|要不要|該不該|该不该|如何|怎麼|怎么|怎樣|怎样|時候|时候|何時|何时|請問|请问|已經|已经|還是|还是|或者|但是|如果|因為|因为|這個|这个|那個|那个|這段|这段|那段|之間|之间|的話|的话|一下|有沒有|有没有|是不是|對不對|对不对|不會|不会|不能|不是|沒有|没有/g;
const STOP_HAN = new Set(
  "我你妳他她它們们的了嗎吗呢啊吧呀嘛麼么是否會会能不沒没有在跟和與与還还再又想要該该應应為为這这那個个些就都也很把被給给讓让對对於于從从而但已經经過过著着得之做才一好".split(""),
);
const STOP_JA = new Set("私僕俺何事方様達今".split(""));
const STOP_KO = new Set(
  "은는이가을를의에서게께한테로와과랑도만요죠네나까습니다입어아해했할하면고지야수있없될되것저제내우리그들좀왜뭐무엇언때떻떤".split(""),
);

const STOP_LATIN: Partial<Record<Locale, string>> = {
  en: "i me my mine we our us you your he him his she her it its they them their this that these those the a an to of in on at for with by from and or but if so as is am are was were be been being will would shall should can could may might must do does did have has had not no yes there here what which who whom when where why how about into over under again still also just very really ever never now then than too more most some any all both each own same only going go get gets got don doesn didn isn aren won wouldn shouldn couldn ll ve re",
  fr: "je tu il elle on nous vous ils elles me te se le la les un une des du de d l au aux à a et ou mais si que qui quoi dont où ne pas plus jamais est sont été être avoir ai as avons avez ont suis es sommes êtes serai sera seront va vais vont aller faire fait ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs y en dans sur sous pour par avec sans chez vers entre comme très bien trop aussi encore toujours déjà quand comment pourquoi qu",
  de: "ich du er sie es wir ihr mich mir dich dir ihn ihm uns euch mein meine meinen meinem meiner dein deine sein seine ihre ihrer unser der die das den dem des ein eine einen einem einer und oder aber wenn ob dass daß nicht kein keine ist sind war waren bin bist wird werden würde würden wurde kann können könnte soll sollte sollen muss müssen darf will wollen möchte hat habe haben hatte zu von mit bei nach aus für auf in im an am um über unter vor noch schon wieder auch nur sehr wie was wer wo wann warum wieso ja nein gibt sich",
  es: "yo tú él ella usted nosotros vosotros ellos ellas me te se lo la los las le les un una unos unas el de del al a y o u pero si que quien quién qué cual cuál cuándo cuando cómo como dónde donde por para con sin sobre en entre hacia desde es son está están estoy estás soy eres era fue será van va voy ir hay he has ha hemos han tengo tiene tener mi mis tu tus su sus nuestro nuestra este esta esto ese esa eso aquel muy más menos también ya aún todavía no ni sí",
  pt: "eu tu ele ela você vocês nós eles elas me te se lhe lhes o a os as um uma uns umas de do da dos das no na nos nas ao à e ou mas que quem qual quando como onde por para com sem sobre em entre é são está estão estou sou era foi será vai vou ir há tenho tem ter meu minha meus minhas seu sua seus suas teu tua este esta isto esse essa isso aquele muito mais menos também já ainda não nem sim",
};
const stopLatin = new Map<string, Set<string>>();
function latinStops(locale: Locale): Set<string> {
  let s = stopLatin.get(locale);
  if (!s) {
    s = new Set((STOP_LATIN[locale] ?? STOP_LATIN.en!).split(" "));
    stopLatin.set(locale, s);
  }
  return s;
}

/** crude stemming, enough to make "texted", "texts" and "text" one token */
function stem(w: string, locale: Locale): string {
  if (locale === "en") return w.replace(/(ing|ed|es|s)$/u, (m) => (w.length - m.length >= 3 ? "" : m));
  return w.replace(/(es|s)$/u, (m) => (w.length - m.length >= 3 ? "" : m));
}

const TOKEN = /\p{Script=Han}|[\p{Script=Katakana}ー]+|\p{Script=Hangul}|\p{Script=Hiragana}+|\p{Nd}+|[\p{Script=Latin}\p{M}]+/gu;

/** The words of a question that carry its matter — no pronouns, particles, modal verbs, question words. */
export function contentTokens(q: string, locale: Locale): Set<string> {
  let s = normalizeQ(q);
  if (locale === "zh" || locale === "zh-hant") s = s.replace(HAN_PHRASES, " ");
  const out = new Set<string>();
  const stops = latinStops(locale);
  for (const m of s.matchAll(TOKEN)) {
    const tok = m[0];
    const c = tok.codePointAt(0)!;
    if (c >= 0x3040 && c <= 0x309f) continue; // hiragana: grammar
    if (/\p{Script=Han}/u.test(tok) && tok.length === 1) {
      if (locale === "ja" ? STOP_JA.has(tok) : STOP_HAN.has(tok)) continue;
      out.add(tok);
    } else if (/\p{Script=Hangul}/u.test(tok)) {
      if (!STOP_KO.has(tok)) out.add(tok);
    } else if (/\p{Nd}/u.test(tok) || /\p{Script=Katakana}/u.test(tok)) {
      out.add(tok);
    } else {
      if (tok.length < 2 || stops.has(tok)) continue;
      out.add(stem(tok, locale));
    }
  }
  return out;
}

/** Jaccard overlap of the content tokens of two questions: 0 (nothing shared) … 1 (the same words). */
export function similarity(a: string, b: string, locale: Locale): number {
  const A = contentTokens(a, locale);
  const B = contentTokens(b, locale);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Is this question the same matter as a recent cast: identical after normalising, or similar enough? */
export function sameMatter(q: string, past: PastCast, locale: Locale): boolean {
  const n = normalizeQ(q);
  return past.q === n || similarity(past.q, n, locale) >= SIMILAR_AT;
}

/**
 * The gate's decision for a question about to be cast (or read).
 * `topic` is the effective topic (the reader's chip, else detection) and
 * `detected` the detector's own call; the cap is checked on both, so moving
 * the chip to "其他" after a block does not open the door (09-16: it did).
 * "other" is a grab-bag and is never capped.
 */
export function gateVerdict(list: PastCast[], question: string, topic: Topic, locale: Locale, now = Date.now(), detected: Topic = topic): GateVerdict {
  const recent = list.filter((c) => now - c.at < REPEAT_WINDOW_MS && now >= c.at);
  for (const tp of topic === detected ? [topic] : [topic, detected]) {
    const onTopic = onTopicCount(recent, tp);
    if (onTopic.length >= capFor(tp)) {
      const latest = onTopic.reduce((a, b) => (b.at > a.at ? b : a));
      return { kind: "cap", count: onTopic.length, past: latest, by: "topic" };
    }
  }
  if (normalizeQ(question).length < 2) return null;

  // circling one matter, whatever the chip says — this is what catches `other`
  let circling = circlingCount(recent, question, locale);
  // 09-26: a reply to the last reading ("所以我要讓她知道？") shares no words with it but is the same matter
  const latest = recent.reduce<PastCast | null>((a, b) => (!a || b.at > a.at ? b : a), null);
  if (latest && looksLikeReply(question) && now - latest.at < REPLY_WINDOW_MS) {
    const cluster = new Set([...circling, latest, ...circlingCount(recent, latest.raw ?? latest.q, locale)]);
    circling = [...cluster];
  }
  if (circling.length >= TOPIC_CAP) {
    const latest = circling.reduce((a, b) => (b.at > a.at ? b : a));
    return { kind: "cap", count: circling.length, past: latest, by: "circling" };
  }

  const same = recent.find((c) => sameMatter(question, c, locale));
  if (!same) return null;
  const waived = recent.filter((c) => c.waived).length;
  return { kind: "same", past: same, waivable: waived < WAIVER_CAP };
}
