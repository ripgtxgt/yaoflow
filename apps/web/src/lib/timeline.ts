import { maskAskedRange, timingSegments } from "./revisit";

/**
 * 10-14 进度表 §四 44 应期时间轴 (Neil: 「把这几个做了吧」). What the reading's timing prose names, laid out on a line:
 * the cast day → the window(s) → the day we come back to ask. Built from the same parse the check-in letters use
 * (lib/revisit.ts timingSegments), and the return day is the revisit's own due date when there is one — the axis and
 * the letter always agree. Dates are plain 「YYYY-MM-DD」 in the caster's calendar. Nothing is invented: no window in
 * the prose, no timeline.
 */
export type { TimelineData } from "./timeline-cal";
import type { TimelineData } from "./timeline-cal";

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
/** a Date from timingSegments (built with local-time constructors) as its own calendar day */
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** kept for callers and tests: the reader's own range said back is no window (lib/revisit.ts maskAskedRange) */
export const dropAskedRange = maskAskedRange;

export function buildTimeline(i: { timing: string | null | undefined; castAtMs: number; tzOffsetMinutes: number; revisitDueAt?: number | null }): TimelineData | null {
  if (!i.timing) return null;
  const local = new Date(i.castAtMs + i.tzOffsetMinutes * 60_000);
  // the parser works in the process's local calendar: hand it the cast day at local midnight
  const from = new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const segs = timingSegments(i.timing, from).filter((s) => s.end.getTime() >= from.getTime());
  if (!segs.length) return null;
  // up to three windows, those that close by the check-in day (an earlier sign, the main window, the one after)
  const due = i.revisitDueAt ? i.revisitDueAt + i.tzOffsetMinutes * 60_000 : Infinity;
  const inside = segs.filter((s) => Date.UTC(s.end.getFullYear(), s.end.getMonth(), s.end.getDate()) < due);
  const windows = (inside.length ? inside : segs).slice(0, 3).map((s) => ({ start: isoLocal(s.start), end: isoLocal(s.end) }));
  const lastEnd = windows[windows.length - 1]!.end;
  const fallback = (() => { const d = new Date(`${lastEnd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return iso(d); })();
  const revisit = i.revisitDueAt ? iso(new Date(i.revisitDueAt + i.tzOffsetMinutes * 60_000)) : fallback;
  return { start: iso(local), windows, revisit: revisit < lastEnd ? fallback : revisit };
}

