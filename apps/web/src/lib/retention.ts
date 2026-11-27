import type { TrackedEvent } from "./analytics-server";

/**
 * 回访率 (09-23, Neil: 「怎么把这个产品做得用户粘性越来越高」 — 用户粘性数据分析-0923.md §五).
 *
 * Two views of the same question — does a reader come back on another day:
 *
 *   visitors  — every browser, from `visit_day` (first date, previous date,
 *               today's date; no id). Counts from 09-23 on, when the
 *               browser started keeping those dates.
 *   customers — everyone who left an email, from their casts in the database.
 *               Goes back to the first cast, but only sees people who cast.
 *
 * Each stickiness change is judged on the same three numbers: back the next
 * day, back within 7 days, back within 30 days, by the day they first came.
 */

const DAY = 86_400_000;

export function dayNum(s: string): number {
  return Math.round(Date.parse(`${s}T00:00:00Z`) / DAY);
}

export interface CohortRow {
  day: string;
  n: number;
  d1: number;
  w7: number;
  w30: number;
  /** how many days have passed since this cohort — a 7-day rate is not final before 7 */
  age: number;
}

/** Visitor cohorts from `visit_day` events. `today` is the reference date (YYYY-MM-DD). */
export function visitorCohorts(events: TrackedEvent[], today: string): CohortRow[] {
  const by = new Map<string, CohortRow>();
  const row = (d: string) => {
    let r = by.get(d);
    if (!r) { r = { day: d, n: 0, d1: 0, w7: 0, w30: 0, age: dayNum(today) - dayNum(d) }; by.set(d, r); }
    return r;
  };
  for (const e of events) {
    if (e.e !== "visit_day" || !e.fd || !e.td) continue;
    const gap = dayNum(e.td) - dayNum(e.fd);
    if (!e.pd) {
      if (gap === 0) row(e.fd).n += 1; // a first visit ever
      continue;
    }
    if (gap < 1) continue;
    const r = row(e.fd);
    if (gap === 1) r.d1 += 1;
    // the first return is the one whose previous visit was the first visit
    if (e.pd === e.fd) {
      if (gap <= 7) r.w7 += 1;
      if (gap <= 30) r.w30 += 1;
    }
  }
  // a return can arrive for a cohort whose first visit predates the dates (09-23): it has no n — leave it out
  return [...by.values()].filter((r) => r.n > 0).sort((a, b) => b.day.localeCompare(a.day));
}

/** Customer cohorts from each customer's cast days (local YYYY-MM-DD per cast). */
export function customerCohorts(days: Map<number, string[]>, today: string): CohortRow[] {
  const by = new Map<string, CohortRow>();
  for (const list of days.values()) {
    const uniq = [...new Set(list)].sort();
    if (uniq.length === 0) continue;
    const first = uniq[0]!;
    let r = by.get(first);
    if (!r) { r = { day: first, n: 0, d1: 0, w7: 0, w30: 0, age: dayNum(today) - dayNum(first) }; by.set(first, r); }
    r.n += 1;
    const gaps = uniq.slice(1).map((d) => dayNum(d) - dayNum(first));
    if (gaps.includes(1)) r.d1 += 1;
    if (gaps.some((g) => g <= 7)) r.w7 += 1;
    if (gaps.some((g) => g <= 30)) r.w30 += 1;
  }
  return [...by.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/** Totals over cohorts old enough for each rate to be final. */
export function cohortTotals(rows: CohortRow[]): { d1: [number, number]; w7: [number, number]; w30: [number, number] } {
  const sum = (min: number, pick: (r: CohortRow) => number): [number, number] => {
    const ok = rows.filter((r) => r.age >= min);
    return [ok.reduce((s, r) => s + pick(r), 0), ok.reduce((s, r) => s + r.n, 0)];
  };
  return { d1: sum(1, (r) => r.d1), w7: sum(7, (r) => r.w7), w30: sum(30, (r) => r.w30) };
}

/** 高频用户: the share of all casts made by the customers with `min`+ casts. */
export function heavyShare(castsPerCustomer: number[], min = 6): { heavy: number; customers: number; share: number } {
  const total = castsPerCustomer.reduce((s, n) => s + n, 0);
  const heavy = castsPerCustomer.filter((n) => n >= min);
  return { heavy: heavy.length, customers: castsPerCustomer.length, share: total ? heavy.reduce((s, n) => s + n, 0) / total : 0 };
}
