/**
 * 10-14 后台变卡 (Neil: 「我这两天点后台又有些卡，会卡个几秒钟」): stale-while-revalidate for the admin's heavy readings.
 * The event log is ~245k lines and growing; computing the funnel, the daily table and the heat tables from it takes 2–3 s
 * on the admin process, and the old cache keyed on the event count, so every new event (several a minute) missed it.
 * Now: a reading younger than `freshMs` is served as is; one younger than `staleMs` is served at once and recomputed in
 * the background right after the response; only a missing (or very old) one is computed while the page waits. The
 * 10-minute cron warms the main ones (lib/admin-bundle.ts warmAdmin), so a click normally never waits.
 * Admin process only, memory only.
 */
// on globalThis: Next bundles the cron's route and the admin pages separately, each with its own copy of this module —
// a module-level map would let the cron warm a cache the pages never see
// 11-27 后台内存溢出: `keep` = how long an entry may sit unread before the sweep drops it. Keys that carry a day or a
// 10-minute bucket (the live window's day count, /admin/today) used to pile up for the life of the process.
type Entry = { at: number; v: unknown; busy: boolean; keep: number };
const G = globalThis as unknown as { __yfSwr?: Map<string, Entry> };
const C: Map<string, Entry> = (G.__yfSwr ??= new Map<string, Entry>());
/** how long after serving a stale reading its recompute starts (after the page has been sent) */
export const SWR_DEFER_MS = 6_000;
/** a warmed entry (refresh) without a lifetime of its own is dropped after this long without a new warm-up */
export const REFRESH_KEEP_MS = 30 * 60_000;
const SWEEP_EVERY_MS = 60_000;
const S = globalThis as unknown as { __yfSwrSweep?: number };

/** Drop entries past their lifetime (at most once a minute). Entries being recomputed stay. */
export function sweep(now = Date.now(), force = false): number {
  if (!force && now - (S.__yfSwrSweep ?? 0) < SWEEP_EVERY_MS) return 0;
  S.__yfSwrSweep = now;
  let n = 0;
  for (const [k, h] of C) if (!h.busy && now - h.at > h.keep) { C.delete(k); n++; }
  return n;
}

export function swr<T>(key: string, freshMs: number, staleMs: number, compute: () => T, now = Date.now()): T {
  sweep(now);
  const h = C.get(key);
  if (h && now - h.at < freshMs) return h.v as T;
  if (h && now - h.at < staleMs) {
    if (!h.busy) {
      h.busy = true;
      // 10-30 (Neil: 后台冷启动／点开要等): the recompute is synchronous and takes the whole process for 1–3 s. At 200 ms it
      // fired while the page it was served to was still streaming, so the "stale, instant" visit waited ~4 s anyway (measured:
      // 4.2 s every other minute, 0.9 s between). It now waits until the page is long sent.
      setTimeout(() => {
        // 11-27: let go of the old reading before the new one is built (compute is synchronous, nothing reads in between)
        // — holding both doubled the peak of the large overview bundle
        C.delete(key);
        try { C.set(key, { at: Date.now(), v: compute(), busy: false, keep: staleMs }); } catch { h.busy = false; }
      }, SWR_DEFER_MS);
    }
    return h.v as T;
  }
  C.delete(key);
  const v = compute();
  C.set(key, { at: Date.now(), v, busy: false, keep: staleMs });
  return v;
}

/** Recompute now and keep it (the cron's warm-up). */
export function refresh<T>(key: string, compute: () => T): T {
  const keep = Math.max(C.get(key)?.keep ?? 0, REFRESH_KEEP_MS);
  C.delete(key); // 11-27: the old reading goes first (see swr)
  const v = compute();
  C.set(key, { at: Date.now(), v, busy: false, keep });
  sweep();
  return v;
}

/** How many readings are kept (the cron logs it, so growth shows before it costs a crash). */
export function swrSize(): number {
  return C.size;
}

export function swrAge(key: string, now = Date.now()): number | null {
  const h = C.get(key);
  return h ? now - h.at : null;
}
