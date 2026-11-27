import { readEvents } from "./analytics-server";

/**
 * 09-26 公开卦例: what a published case did — how many people read it, and how
 * many of them went on to cast for themselves in the same visit. Shown to the
 * owner (the reason people keep publishing is seeing that it helped someone).
 * Built from the page_view / cast_start events; cached ten minutes.
 */
export type CaseImpact = { reads: number; casts: number };

let cache: { at: number; map: Map<string, CaseImpact> } | null = null;

function build(): Map<string, CaseImpact> {
  const evs = readEvents(120, { only: ["page_view", "cast_start"] }); // 10-15 进度表 60: just the two kinds it counts
  const bySession = new Map<string, { id: string; t: number }[]>();
  const casts = new Map<string, number[]>();
  for (const e of evs) {
    if (e.e === "page_view" && e.path) {
      const m = /^\/[a-z-]+\/cases\/([0-9a-f]{10})$/.exec(e.path);
      if (m) { const l = bySession.get(e.s) ?? []; l.push({ id: m[1]!, t: e.t }); bySession.set(e.s, l); }
    } else if (e.e === "cast_start") {
      const l = casts.get(e.s) ?? []; l.push(e.t); casts.set(e.s, l);
    }
  }
  const out = new Map<string, CaseImpact>();
  for (const [s, views] of bySession) {
    const seen = new Set<string>();
    for (const v of views) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      const o = out.get(v.id) ?? { reads: 0, casts: 0 };
      o.reads += 1;
      if ((casts.get(s) ?? []).some((t) => t > v.t)) o.casts += 1;
      out.set(v.id, o);
    }
  }
  return out;
}

export function caseImpact(publicId: string): CaseImpact {
  if (!cache || Date.now() - cache.at > 10 * 60_000) cache = { at: Date.now(), map: build() };
  return cache.map.get(publicId) ?? { reads: 0, casts: 0 };
}
