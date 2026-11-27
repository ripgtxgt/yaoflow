import { resolveCastInstant, resolveServerChart, resolveTiming, type ReadingInput } from "./reading";
import { localIsoDate } from "./timing";

/**
 * 09-26 热区 (E): what the price panel can say about THIS figure before anyone
 * pays — honestly, from the same rules the deep reading is written from. The
 * chart names N timing windows; we say how many and roughly when the nearest
 * falls (early / mid / late in a month), never the day itself: the day, and
 * what to do on it, is what the deep reading is for.
 *
 * 10-04: a cast brought back days later (a saved cast, a reminder letter) is
 * charted at its own instant (`stored`), and only the windows still ahead of
 * the reader's today (`asOf`) are counted — the panel must not promise a
 * window that has already gone by.
 */
export type TimingHint = { n: number; first: string; kind: "day" | "month"; inAsk: boolean };

export function timingHint(input: ReadingInput, opts: { stored?: boolean; asOf?: number } = {}): TimingHint | null {
  try {
    const stored = opts.stored ?? false;
    const chart = resolveServerChart(input, stored);
    const plan = resolveTiming(input, chart, stored);
    const { tz } = resolveCastInstant(input, stored);
    const asOf = opts.asOf !== undefined ? localIsoDate(opts.asOf, tz) : plan.today;
    const from = asOf > plan.today ? asOf : plan.today;
    const wins = plan.candidates
      .filter((c) => c.kind !== "hour")
      .flatMap((c) => c.windows.map((w) => ({ kind: c.kind as "day" | "month", start: w.core ?? w.start, inAsk: !!w.in_ask })))
      .filter((w) => w.start >= from)
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    const uniq = [...new Map(wins.map((w) => [w.start, w])).values()];
    if (!uniq.length) return null;
    return { n: Math.min(uniq.length, 9), first: uniq[0]!.start, kind: uniq[0]!.kind, inAsk: uniq.some((w) => w.inAsk) };
  } catch {
    return null;
  }
}
