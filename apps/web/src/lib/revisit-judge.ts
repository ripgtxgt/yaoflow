/**
 * 10-07 回访改问法 (Neil: 「58% 没应验」→ 查 → 「做吧」).
 *
 * The revisit used to ask "did it happen?" with buttons worded as a verdict (像說的那樣發生了 / 完全沒發生), and the
 * answer was filed as the reading's score. But 41% of deep readings since 09-26 call the matter unlikely (hard /
 * very_hard) and 37% even; a reader whose reading said "he will not write" and who, rightly, got no letter clicked
 * 完全沒發生 — filed as a miss. Of the first 58 settled answers from real readers, 44 were "miss", yet read against
 * the reading's own lean only 9 were wrong, 20 right, 29 could not be told apart.
 *
 * So the reader is now asked about the FACT only (happened / stirred / nothing / open), and the score is derived here
 * from the reading's lean: likely + happened = hit, likely + nothing = miss; unlikely + nothing = hit, unlikely +
 * happened = miss; stirred = partial either way; an even or unknown lean, or a question with nothing observable to
 * verify (lib/revisit-ask.ts), = unclear — recorded, never counted as accuracy.
 */

export type ReadingLean = "likely" | "unlikely" | "even";
/** 10-31 进度表 129 ④: "offwindow" = it happened, but not in the days the reading named (the reader may add roughly when) */
export type RevisitEvent = "happened" | "stirred" | "nothing" | "open" | "offwindow";
export type RevisitJudgement = "hit" | "partial" | "miss" | "open" | "unclear";
export type RevisitAsk = "event" | "signals";

export const REVISIT_EVENTS: readonly RevisitEvent[] = ["happened", "stirred", "nothing", "open", "offwindow"];

/** The old one-tap links still in inboxes carry the verdict words; each means one fact. */
export const LEGACY_EVENT: Record<string, RevisitEvent> = { hit: "happened", partial: "stirred", miss: "nothing", open: "open" };

export function parseEvent(v: string | null | undefined): RevisitEvent | null {
  if (!v) return null;
  if ((REVISIT_EVENTS as readonly string[]).includes(v)) return v as RevisitEvent;
  return LEGACY_EVENT[v] ?? null;
}

/** The 五档倾向 code a deep reading carries since 09-26 (lib/reading.ts odds), as a lean. */
export function leanOfOdds(code: string | null | undefined): ReadingLean | null {
  if (code === "strong" || code === "good") return "likely";
  if (code === "hard" || code === "very_hard") return "unlikely";
  if (code === "even") return "even";
  return null;
}

// readings before 09-26 carry no odds: the verdict's own words, Chinese and English, say which way it leaned — the call
// usually opens the verdict (「會。」「難。」「不會回來。」), so its first word counts too
const NEG = /^\s*(不|難|难|未必|恐怕|沒|没|無|无)|不會|不会|難|难|不太|未必|不大|不高|不容易|不順|不顺|無望|无望|不成|不宜|不利|恐怕|阻|拖|遲|迟|不了|沒有|没有|不是時候|不是时候|放下|別等|别等|不要等|機會小|机会小|機率低|机率低|偏低|unlikely|will not|won't|hard to|difficult|slim|little chance|not likely|no sign/i;
const POS = /^\s*(會|会|能|可|是|行|成|順|顺)|(?<![不未沒没])(會有|会有|會回|会回|會主動|会主动|會來|会来|能過|能过|可過|可过|可以|有望|有機會|有机会|能成|可成|順利|顺利|有利|有戲|有戏|有希望|偏高|機率高|机率高|大概率|多半會|多半会)|\b(likely|will come|will happen|good chance|favou?rable|yes)\b/i;

/** A lean read from a verdict's words: both or neither kind of word = even / unknown. */
export function leanOfWords(verdict: string | null | undefined): ReadingLean | null {
  if (!verdict) return null;
  const n = NEG.test(verdict), p = POS.test(verdict);
  if (n && !p) return "unlikely";
  if (p && !n) return "likely";
  return n && p ? "even" : null;
}

type Localized = Record<string, string | undefined>;
const pickText = (f: unknown, locale: string): string | null => {
  if (!f) return null;
  if (typeof f === "string") return f;
  if (typeof f !== "object") return null;
  const o = f as Localized;
  return o[locale] ?? o["zh-hant"] ?? o.zh ?? o.en ?? Object.values(o).find((v): v is string => typeof v === "string") ?? null;
};

/** The lean of a stored deep reading (its body JSON): the odds code first, else the verdict's words. */
export function readingLean(body: unknown, locale: string): ReadingLean | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  return leanOfOdds(pickText(b.odds, locale)) ?? leanOfWords(pickText(b.verdict, locale));
}

/** The score, from the fact the reader gave and the lean the reading had. */
export function judgeEvent(lean: ReadingLean | null, event: RevisitEvent, ask: RevisitAsk = "event"): RevisitJudgement {
  if (event === "open") return "open";
  if (ask === "signals" || !lean || lean === "even") return "unclear";
  if (event === "stirred") return "partial";
  // 10-31 进度表 129 ④: a "will happen" reading whose matter came about outside its window got the what, not the when
  if (event === "offwindow") return lean === "likely" ? "partial" : "miss";
  if (lean === "likely") return event === "happened" ? "hit" : "miss";
  return event === "nothing" ? "hit" : "miss";
}

/** The fact behind a stored answer: the event column when it exists, else what the old verdict buttons meant. */
export function eventOf(row: { event?: string | null; outcome?: string | null }): RevisitEvent | null {
  return parseEvent(row.event) ?? (row.outcome && row.outcome !== "unclear" ? parseEvent(row.outcome) : null);
}
