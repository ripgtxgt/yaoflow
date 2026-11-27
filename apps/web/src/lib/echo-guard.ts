import { toHans } from "./hant";
import type { MatterSoFar } from "./reading";

/**
 * 10-12 「一件事」记忆 · 程序校验 (进度表 §四 30；10-11 一周复查没过).
 *
 * The 10-04 prompt rules (MATTER_NOTE: never quote the reader back, never read today's mood off old notes) held for
 * every deep reading and follow-up in the review, and failed in four light readings — the smaller model does not keep
 * them. So the light tier gets two things the prompt cannot give:
 *
 *   1. a narrower payload (`lightMatter`): a note older than three days no longer goes in at all — only a count in the
 *      `background` line — and an older cast's question loses its wording; the reader's words from days ago are not
 *      there to be quoted or read as today's mood;
 *   2. a check after generation (`echoOffense`): "you said / wrote / asked …" (你說 / 你嘴上說 / 你那句 / 你問的「…」)
 *      followed by five or more characters of the reader's earlier notes or questions, or seven characters lifted from
 *      them with no marker, sends the reading back once for a rewrite. Wording the current question shares, the
 *      matter's own title and dates do not count — repeating today's question back is fine, an event named in passing
 *      ("前幾天他食物中毒") is too short to trip it.
 */

export const OLD_DAYS = 3;

/**
 * The light reading's view of the matter: dated record older than OLD_DAYS keeps its shape, not the reader's words.
 * 10-22 复查 (Neil: 「可以开始」): nor what our own reading said back then — an earlier call restates the reader's
 * situation of that day, and one light reading took a ritual she had asked about 7–11 days earlier, found only in our
 * old calls, for what she is doing now. An older cast keeps its date, figure, tier and the outcome she reported.
 */
export function lightMatter(m: MatterSoFar | undefined): MatterSoFar | undefined {
  if (!m || m.no_context) return m;
  const oldNotes = m.reader_notes.filter((n) => n.days_ago > OLD_DAYS);
  const notes = m.reader_notes.filter((n) => n.days_ago <= OLD_DAYS);
  const casts = m.earlier_casts.map((c) => {
    if (c.days_ago <= OLD_DAYS) return c;
    const { timing: _t, ...rest } = c;
    return {
      ...rest,
      question: `(asked ${c.days_ago} days ago — wording withheld; the matter is 「${m.title}」)`,
      call: c.call ? `(what that reading said ${c.days_ago} days ago is withheld — it described things as they were then)` : c.call,
    };
  });
  // the "today" line names the latest older question verbatim — not for the light reading
  let background = m.background?.replace(/; the latest of those asked 「[^」]*」/, "");
  if (oldNotes.length) {
    const span = Math.min(...oldNotes.map((n) => n.days_ago)) === Math.max(...oldNotes.map((n) => n.days_ago))
      ? `${oldNotes[0]!.days_ago} days ago`
      : `${Math.min(...oldNotes.map((n) => n.days_ago))}–${Math.max(...oldNotes.map((n) => n.days_ago))} days ago`;
    const line = `${oldNotes.length} older progress note${oldNotes.length === 1 ? "" : "s"} from ${span} left out (background only: nothing in them describes the reader today)`;
    background = background ? `${background}; ${line}` : line;
  }
  return { ...m, earlier_casts: casts, reader_notes: notes, ...(background ? { background } : {}) };
}

const PUNCT = /[\s\p{P}\p{S}]+/gu;
const isCjk = (s: string) => /[぀-ヿ㐀-鿿가-힯]/.test(s);

/** The words of a text, cut into overlapping runs: CJK as characters, Latin as words; runs with digits (dates) left out. */
function grams(text: string, n: number, cjk: boolean): Set<string> {
  const out = new Set<string>();
  // 會不會 / 是不是 / 要不要 → 會 / 是 / 要: a paraphrase of today's question ("你問他會不會主動") is still today's question
  for (const clause of toHans(text).toLowerCase().replace(/(\p{Script=Han})不\1/gu, "$1").split(/[，,。.！!？?；;：:\n「」『』“”"()（）—…]+/)) {
    if (cjk) {
      const c = clause.replace(PUNCT, "");
      for (let i = 0; i + n <= c.length; i++) { const g = c.slice(i, i + n); if (!/\d/.test(g)) out.add(g); }
    } else {
      const w = clause.split(PUNCT).filter(Boolean);
      for (let i = 0; i + n <= w.length; i++) { const g = w.slice(i, i + n).join(" "); if (!/\d/.test(g)) out.add(g); }
    }
  }
  return out;
}

/**
 * Words turned back at the reader: "you said / wrote / asked …" — what follows the marker is checked against their
 * earlier words (the current question's wording is theirs to hear again: 「你問「他會回來嗎」」 is fine).
 */
const MARKERS: RegExp[] = [
  /你(?:嘴上|昨天|前天|上次|之前|前幾天|前几天|那天|當時|当时|先前|才剛|才刚|剛剛|刚刚|剛才|刚才|一直|也)?(?:說|说|寫|写|講|讲|提|問|问)(?:過|过)?(?:的)?/g,
  /你那句/g,
  /\byou (?:said|wrote|asked|told us|mentioned)\b|\bthat line of yours\b|\byour words\b/gi,
  /あなたが(?:言|書|話|聞)/g,
  /(?:당신|네)가 (?:말한|쓴|물은|했던 말)/g,
];
/** a marker's reach: this many characters after it are what it points at */
const REACH = 24;
/** marker + this much of their earlier wording = quoting them back; with no marker, a longer lift */
const MARKED_N_CJK = 5, LIFT_N_CJK = 7, MARKED_N_LATIN = 3, LIFT_N_LATIN = 5;
/**
 * 10-22 复查: 「你主觀感覺他客氣被動」 handed a reader the note she had written that morning almost word for word. "You
 * feel / you think …" followed by four characters of their own notes or earlier questions is their words handed back
 * too (CJK; 「你覺得他冷淡」 with nothing of theirs after it is not).
 */
const FEEL_MARKERS = /你(?:主觀|主观|自己)?(?:感覺|感觉|覺得|觉得|感受到|認為|认为)/g;
const FEEL_N_CJK = 4;

/**
 * 10-22 复查: 「你嘴上說好奇，心裡其實已經……磨得很累」 — the reader's words set against a heart the reading claims to
 * see. It is the very thing a member asked us to stop (10-03: 「據此推測我目前的心情」), and it reads the same whether the
 * words came from an old note, another matter's question asked that afternoon, or today's question: their state is read
 * from the chart, never against what they said. Any field, any record, any tier.
 */
const CONTRAST = /你(?:嘴上|口頭上|口头上|表面上)(?:說|说|問|问|講|讲|喊|答應|答应)|\byou (?:say|said|claim|tell yourself)\b[^.!?]{0,60}\bbut (?:deep down|inside|in your heart|really)\b/i;

/** The first field that sets the reader's words against what they "really" feel, as "field:contrast:…", or null. */
export function contrastOffense(fields: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = fields[k];
    if (typeof v !== "string" || !v) continue;
    const m = v.match(CONTRAST);
    if (m) return `${k}:contrast:${m[0].slice(0, 30)}`;
  }
  return null;
}

/**
 * The first field that hands the reader's own earlier words back, as "field:what" — or null. `current` is the question
 * being answered now; its wording, and the matter title, are the reading's to use.
 */
export function echoOffense(fields: Record<string, unknown>, keys: readonly string[], m: MatterSoFar | undefined, current: string): string | null {
  if (!m || m.no_context) return null;
  const sources = [...m.reader_notes.map((n) => n.note), ...m.earlier_casts.map((c) => c.question).filter((q) => !q.startsWith("(asked "))];
  if (!sources.length) return null;
  const texts = keys.map((k) => [k, fields[k]] as const).filter((x): x is readonly [string, string] => typeof x[1] === "string" && !!x[1]);
  const cjk = isCjk(texts.map((x) => x[1]).join("")) || isCjk(sources.join(""));
  const theirs = (n: number) => {
    const own = new Set([...grams(current, n, cjk), ...grams(m.title ?? "", n, cjk)]);
    const out = new Set<string>();
    for (const s of sources) for (const g of grams(s, n, cjk)) if (!own.has(g)) out.add(g);
    return out;
  };
  const marked = theirs(cjk ? MARKED_N_CJK : MARKED_N_LATIN);
  const lifted = theirs(cjk ? LIFT_N_CJK : LIFT_N_LATIN);
  const felt = cjk ? theirs(FEEL_N_CJK) : null;
  for (const [k, v] of texts) {
    for (const re of MARKERS) {
      for (const hit of v.matchAll(re)) {
        const after = v.slice(hit.index! + hit[0].length, hit.index! + hit[0].length + REACH);
        for (const g of grams(after, cjk ? MARKED_N_CJK : MARKED_N_LATIN, cjk)) if (marked.has(g)) return `${k}:${hit[0]}…${g}`;
      }
    }
    if (felt) {
      for (const hit of v.matchAll(FEEL_MARKERS)) {
        const after = v.slice(hit.index! + hit[0].length, hit.index! + hit[0].length + REACH);
        for (const g of grams(after, FEEL_N_CJK, true)) if (felt.has(g)) return `${k}:${hit[0]}…${g}`;
      }
    }
    for (const g of grams(v, cjk ? LIFT_N_CJK : LIFT_N_LATIN, cjk)) if (lifted.has(g)) return `${k}:${g}`;
  }
  return null;
}

/**
 * 10-22 复查: a follow-up answer had no check at all — one handed a reader the note she had written that morning. The
 * same two checks on the reply; `current` is what is theirs to hear again: the question they are asking now, the cast's
 * own question and what they wrote earlier in this conversation.
 */
export function echoInReply(reply: string, m: MatterSoFar | undefined, current: string): string | null {
  return contrastOffense({ reply }, ["reply"]) ?? echoOffense({ reply }, ["reply"], m, current);
}
