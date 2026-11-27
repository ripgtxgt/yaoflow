import { asLocale } from "./locales";
import { CIRCLING_AT, similarity } from "./repeat-gate";

/**
 * 「这件事」(09-23, 用户粘性数据分析-0923.md §四): the reader's casts grouped
 * by the matter they were about, so a return visit finds "where this stands"
 * instead of a pile of separate readings.
 *
 * The same test the 一事一占 gate uses for circling (content-token overlap ≥
 * CIRCLING_AT), applied server-side over a customer's own casts: two casts
 * join when their questions share enough of their matter and were cast within
 * MATTER_SPAN_DAYS of each other. Single-link — the gate's live case showed one
 * person under two names, 「雞女」 and 「Holly」, linked through a third wording.
 */

export const MATTER_SPAN_DAYS = 45;
const DAY = 86_400_000;

export interface MatterCast { id: number; question: string; locale: string; created_at: number }

/** Groups of cast ids, each group newest first; groups ordered by their newest cast. */
export function groupMatters<T extends MatterCast>(casts: T[]): T[][] {
  const list = [...casts].sort((a, b) => b.created_at - a.created_at);
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!, b = list[j]!;
      if (Math.abs(a.created_at - b.created_at) > MATTER_SPAN_DAYS * DAY) continue;
      if (find(i) === find(j)) continue;
      if (similarity(a.question, b.question, asLocale(a.locale)) >= CIRCLING_AT) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, T[]>();
  list.forEach((c, i) => {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(c);
    groups.set(r, g);
  });
  return [...groups.values()].sort((a, b) => b[0]!.created_at - a[0]!.created_at);
}

/** The group this cast belongs to, or just the cast itself. */
export function matterOf<T extends MatterCast>(casts: T[], castId: number): T[] {
  return groupMatters(casts).find((g) => g.some((c) => c.id === castId)) ?? casts.filter((c) => c.id === castId);
}

/**
 * 09-29: a light reading upgraded to a full one is stored as two casts of the
 * same figure and question minutes apart. On a matter's timeline they are one
 * cast, shown at its fullest (follow-ups added up). Input and output newest first.
 */
export function collapseUpgrades<T extends { values_str: string; question: string; created_at: number; tier: string | null; followups: number }>(casts: T[]): T[] {
  const out: T[] = [];
  for (const c of casts) {
    const i = out.findIndex((o) => o.values_str === c.values_str && o.question === c.question && Math.abs(o.created_at - c.created_at) < 30 * 60_000);
    if (i < 0) { out.push(c); continue; }
    const twin = out[i]!;
    out[i] = twin.tier !== "deep" && c.tier === "deep" ? { ...c, followups: c.followups + twin.followups } : { ...twin, followups: twin.followups + c.followups };
  }
  return out;
}
