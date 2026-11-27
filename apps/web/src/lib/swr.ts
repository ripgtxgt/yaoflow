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
type Entry = { at: number; v: unknown; busy: boolean };
const G = globalThis as unknown as { __yfSwr?: Map<string, Entry> };
const C: Map<string, Entry> = (G.__yfSwr ??= new Map<string, Entry>());
/** how long after serving a stale reading its recompute starts (after the page has been sent) */
export const SWR_DEFER_MS = 6_000;

export function swr<T>(key: string, freshMs: number, staleMs: number, compute: () => T, now = Date.now()): T {
  const h = C.get(key);
  if (h && now - h.at < freshMs) return h.v as T;
  if (h && now - h.at < staleMs) {
    if (!h.busy) {
      h.busy = true;
      // 10-30 (Neil: 后台冷启动／点开要等): the recompute is synchronous and takes the whole process for 1–3 s. At 200 ms it
      // fired while the page it was served to was still streaming, so the "stale, instant" visit waited ~4 s anyway (measured:
      // 4.2 s every other minute, 0.9 s between). It now waits until the page is long sent.
      setTimeout(() => {
        try { C.set(key, { at: Date.now(), v: compute(), busy: false }); } catch { h.busy = false; }
      }, SWR_DEFER_MS);
    }
    return h.v as T;
  }
  const v = compute();
  C.set(key, { at: Date.now(), v, busy: false });
  return v;
}

/** Recompute now and keep it (the cron's warm-up). */
export function refresh<T>(key: string, compute: () => T): T {
  const v = compute();
  C.set(key, { at: Date.now(), v, busy: false });
  return v;
}

export function swrAge(key: string, now = Date.now()): number | null {
  const h = C.get(key);
  return h ? now - h.at : null;
}
