import { maxOf, minOf } from "@/lib/minmax";
import { eventOf } from "./revisit-judge";
import { hexagramByNumber } from "@yaoflow/engine";
import { castsInMatter, matterById, notesInMatter, readingBodyForCast } from "./db";
import { hexName } from "./names";
import { localDay } from "./clock";
import { toHans } from "./hant";
import { questionScale } from "./scale-words";
import type { QuestionScale } from "./timing";
import { asLocale, type Locale } from "./locales";
import { pick, resolveCastInstant, type MatterSoFar, type ReadingInput } from "./reading";

/**
 * 09-29 「一件事」 step 4: what the model sees of the matter a cast belongs to —
 * the earlier casts (question, hexagram, the call they were given, the window,
 * what the reader said came of it) and the reader's own progress notes.
 *
 * Bounded: the six latest casts and six latest notes. A heavy reader's matter
 * holds fifty casts; the model needs the shape of the story, not all of it.
 *
 * 10-04 进度表 30 (a member who asks for "today's" word every day: two readings
 * quoted her note from five days earlier and read her present mood off it):
 *   - every entry carries `days_ago`, so the prompt can treat it as the dated
 *     past it is (lib/reading.ts MATTER_NOTE);
 *   - a question about today (`scale` now / day) sees only the last 72 hours of
 *     the matter — older casts and notes fold into one `background` line;
 *   - a matter the reader switched off (`matters.no_context`) hands over its
 *     title alone: no earlier casts, no notes, and lib/cast-log.ts leaves the
 *     free-cast thread out too.
 */

export const MATTER_CASTS = 6;
export const MATTER_NOTES = 6;
/** a "today" question's window into the matter */
export const RECENT_MS = 72 * 3_600_000;
const DAY = 86_400_000;

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

// 10-07 回访改问法: the fact the reader gave (lib/revisit-judge.ts event), and the score when there is one
const EVENT_SAID: Record<string, string> = {
  happened: "the reader said it happened",
  stirred: "the reader said something stirred but it did not come through",
  nothing: "the reader said it did not happen",
  open: "the reader said it is not settled yet",
};
const SCORE_SAID: Record<string, string> = { hit: "the reading was right", miss: "the reading was wrong", partial: "the reading was partly right" };
function reportedOf(c: { outcome?: string | null; event?: string | null }): string | null {
  const ev = eventOf(c);
  const fact = ev ? EVENT_SAID[ev] : null;
  const score = c.outcome ? SCORE_SAID[c.outcome] : null;
  return fact ? (score ? `${fact} (${score})` : fact) : null;
}

/** whole local days between two instants (0 = the same local day) */
export const daysAgo = (then: number, now: number, tz: number): number =>
  Math.max(0, Math.round((Date.parse(localDay(now, tz)) - Date.parse(localDay(then, tz))) / DAY));

/** a question about today or right now sees only the recent past of its matter */
export const isTodayScale = (scale: QuestionScale | undefined): boolean => scale === "now" || scale === "day";

export interface MatterSoFarOpts {
  /** the question's scale (lib/timing.ts QuestionScale) — now / day narrows the matter to the last 72 hours */
  scale?: QuestionScale;
  /**
   * the moment `days_ago` and the 72-hour window count from: a reading's own cast instant (a reading written later by
   * the sweep is still dated from its cast); a follow-up or the daily line leave it at now, so a note the reader wrote
   * after the cast is in
   */
  at?: number;
}

/** A question's scale: the chip the reader tapped, else its own words (lib/scale-words.ts) — the same call resolveTiming makes. */
export const scaleOf = (input: Pick<ReadingInput, "question" | "scaleHint">, castAt: number, tz: number): QuestionScale =>
  input.scaleHint ?? questionScale(toHans(input.question), castAt, tz);

/** The options for a cast's own reading: its scale, and its (sanitised) instant as the "now" the record is dated from. */
export function matterOptsFor(input: ReadingInput, stored: boolean): MatterSoFarOpts {
  const { castAt, tz } = resolveCastInstant(input, stored);
  return { scale: scaleOf(input, castAt, tz), at: castAt };
}

export function matterSoFar(matterId: number, exclude: { sessions?: string[]; castIds?: number[] }, locale: Locale, opts: MatterSoFarOpts = {}): MatterSoFar | undefined {
  const m = matterById(matterId);
  if (!m) return undefined;
  const title = m.title ?? "";
  // 10-04: the reader asked that this matter's record stay out of their readings
  if (m.no_context) return { title, earlier_casts: [], reader_notes: [], no_context: true };
  const at = opts.at ?? Date.now();
  // dated from a cast's own instant (a reading): what came after that cast is not its past — the sweep writing a
  // reading an hour late must not show it a cast the reader made since; dated from now (a follow-up): everything counts
  const before = (t: number) => opts.at === undefined || t <= at + 60_000;
  const skipS = new Set(exclude.sessions ?? []);
  const skipC = new Set(exclude.castIds ?? []);
  // newest first, the current cast left out
  const all = castsInMatter(matterId).filter((c) => !skipC.has(c.id) && !(c.session_id && skipS.has(c.session_id)) && c.tier && before(c.created_at));
  const tz = all[0]?.tz_offset ?? castsInMatter(matterId)[0]?.tz_offset ?? 0;
  const today = isTodayScale(opts.scale);
  const recent = (t: number) => !today || at - t <= RECENT_MS;
  const casts = all.filter((c) => recent(c.created_at));
  const earlier = casts.slice(0, MATTER_CASTS).reverse().map((c) => {
    const l = asLocale(c.locale);
    const p = hexagramByNumber(c.primary_num);
    const ch = c.changed_num ? hexagramByNumber(c.changed_num) : null;
    const rb = readingBodyForCast(c.id);
    const body = rb?.body ?? {};
    const call = clip(pick((body.verdict ?? body.summary) as never, l) || "", 200);
    const timing = rb?.tier === "deep" && body.timing ? clip(pick(body.timing as never, l), 140) : c.timing_quote ? clip(c.timing_quote, 140) : "";
    return {
      date: localDay(c.created_at, c.tz_offset),
      days_ago: daysAgo(c.created_at, at, c.tz_offset),
      question: clip(c.question, 140),
      hexagram: `${p ? hexName(p, locale) : ""}${ch ? ` → ${hexName(ch, locale)}` : ""}`,
      tier: c.tier === "deep" ? "full" : "light",
      call,
      ...(timing ? { timing } : {}),
      ...(reportedOf(c) ? { reader_reported: reportedOf(c)! } : {}),
    };
  });
  // every note on the matter, the current cast's included: they are the reader's own account of what happened
  const allNotes = notesInMatter(matterId).filter((n) => before(n.created_at));
  const notes = allNotes
    .filter((n) => recent(n.created_at))
    .slice(-MATTER_NOTES)
    .map((n) => ({ date: localDay(n.created_at, tz), days_ago: daysAgo(n.created_at, at, tz), note: clip(n.note, 200) }));
  // 10-04: what a "today" question does not see, in one line — how much, how long ago, and the matter's own words for it
  let background: string | undefined;
  if (today) {
    const olderCasts = all.filter((c) => !recent(c.created_at));
    const olderNotes = allNotes.filter((n) => !recent(n.created_at));
    if (olderCasts.length || olderNotes.length) {
      const oldest = minOf([...olderCasts.map((c) => c.created_at), ...olderNotes.map((n) => n.created_at)]);
      const newest = maxOf([...olderCasts.map((c) => c.created_at), ...olderNotes.map((n) => n.created_at)]);
      const span = daysAgo(oldest, at, tz) === daysAgo(newest, at, tz) ? `${daysAgo(newest, at, tz)} days ago` : `${daysAgo(newest, at, tz)}–${daysAgo(oldest, at, tz)} days ago`;
      const lastQ = olderCasts[0]?.question ? `; the latest of those asked 「${clip(olderCasts[0].question, 80)}」` : "";
      background = `${title ? `「${title}」: ` : ""}${olderCasts.length} earlier cast${olderCasts.length === 1 ? "" : "s"} and ${olderNotes.length} note${olderNotes.length === 1 ? "" : "s"} from ${span}, not shown here${lastQ}`;
    }
  }
  if (!earlier.length && !notes.length && !background) return undefined;
  return { title, earlier_casts: earlier, reader_notes: notes, ...(background ? { background } : {}) };
}
