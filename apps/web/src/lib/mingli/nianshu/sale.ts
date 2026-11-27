/**
 * 10-21 (Neil: 按這個來，早鳥價也做) — which year the 年書 page sells, and whether the early-bird price is on. Client-safe.
 *
 * One year on sale at a time, by 台北 time:
 *   國曆 1/1 – 10/31  → the current calendar year
 *   國曆 11/1 – 12/31 → the next year (the 流年 season: competitors open next year's early bird in November)
 * The early-bird price runs 11/1 – 1/31 — the two months before the year and its first month — then the regular price.
 */
const TPE_MS = 8 * 3600_000;
export interface NianshuSale { year: number; early: boolean }
export function nianshuSale(now = Date.now()): NianshuSale {
  const d = new Date(now + TPE_MS);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(); // 0 = January
  return { year: m >= 10 ? y + 1 : y, early: m >= 10 || m === 0 };
}
/** shown beside the early-bird price */
export const NIANSHU_EARLY_UNTIL = "1/31";
