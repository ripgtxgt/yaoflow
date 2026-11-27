/** 10-11: Math.min(...xs) overflows the call stack past ~100k values (the admin page died on 10-11) — a loop doesn't. */
export function minOf(xs: Iterable<number>): number { let m = Infinity; for (const x of xs) if (x < m) m = x; return m; }
export function maxOf(xs: Iterable<number>): number { let m = -Infinity; for (const x of xs) if (x > m) m = x; return m; }
