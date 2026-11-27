/**
 * The house clock (09-14). Everything internal — dashboard, customer files,
 * the weekly digest, the Daily buckets — is read in Neil's own time, UTC+8
 * (Asia/Shanghai, no daylight saving, so a fixed offset is exact). The
 * server itself stays on UTC and customer-facing pages keep the reader's
 * own time (a cast carries its tzOffsetMinutes); only what we look at
 * ourselves is shifted here.
 */

export const HOME_TZ_LABEL = "UTC+8";
export const HOME_OFFSET_MIN = 8 * 60;
const HOME_OFFSET_MS = HOME_OFFSET_MIN * 60_000;

/** YYYY-MM-DD in UTC+8. */
const DAY_CACHE = new Map<number, string>();
export function homeDay(ms: number): string {
  // 09-24: the dashboard buckets ~25k events per load; formatting a Date for
  // each one was 100ms of every refresh. Same day number → same string.
  const n = Math.floor((ms + HOME_OFFSET_MS) / 86_400_000);
  let s = DAY_CACHE.get(n);
  if (s === undefined) {
    s = new Date(n * 86_400_000).toISOString().slice(0, 10);
    if (DAY_CACHE.size > 5000) DAY_CACHE.clear();
    DAY_CACHE.set(n, s);
  }
  return s;
}

/** YYYY-MM-DD HH:MM in UTC+8. */
export function homeMinute(ms: number): string {
  return new Date(ms + HOME_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

/** Epoch ms of 00:00 UTC+8 on the day that contains `ms`. */
export function homeDayStart(ms: number): number {
  const d = new Date(ms + HOME_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - HOME_OFFSET_MS;
}

/** The calendar date a cast happened on, in the caster's own clock (not ours, not the server's). */
export function localDay(ms: number, tzOffsetMinutes: number): string {
  return new Date(ms + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}
