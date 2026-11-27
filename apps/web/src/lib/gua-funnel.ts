import type { TrackedEvent } from "./analytics-server";
import { SEARCH_REF } from "./qian-funnel";

/**
 * 10-14 进度表 48 ④: per hexagram, the sessions that came in from a search engine on a hexagram page
 * (/<locale>/gua/<n>-<slug>) and how far they went: saw the 「寫一句話，起一卦」 block → tapped it (button or an
 * example) → completed a cast → paid. Sits beside the lot pages' funnel (40 ⑥) in the weekly digest.
 */
const GUA = /^\/[a-z-]+\/gua\/(\d{1,2})-[a-z-]+\/?$/;

export interface GuaFunnelRow { hex: number; landed: number; saw: number; tapped: number; cast: number; paid: number }

export function guaSearchFunnel(events: readonly TrackedEvent[], paidSessions: ReadonlySet<string>): { rows: GuaFunnelRow[]; total: GuaFunnelRow } {
  const bySession = new Map<string, TrackedEvent[]>();
  for (const e of events) { if (!e.s) continue; const l = bySession.get(e.s); if (l) l.push(e); else bySession.set(e.s, [e]); }
  const rows = new Map<number, GuaFunnelRow>();
  for (const [sid, list] of bySession) {
    list.sort((a, b) => a.t - b.t);
    const first = list.find((e) => e.e === "page_view");
    if (!first?.path || !SEARCH_REF.test(first.ref ?? "")) continue;
    const m = first.path.split("?")[0]!.match(GUA);
    const hex = m ? Number(m[1]) : 0;
    if (!(hex >= 1 && hex <= 64)) continue;
    let r = rows.get(hex);
    if (!r) { r = { hex, landed: 0, saw: 0, tapped: 0, cast: 0, paid: 0 }; rows.set(hex, r); }
    r.landed++;
    if (list.some((e) => e.e === "gua_cta" && e.method === "view")) r.saw++;
    const tapAt = list.find((e) => e.e === "gua_cta" && (e.method === "click" || e.method === "example"))?.t;
    if (tapAt !== undefined) {
      r.tapped++;
      if (list.some((e) => e.e === "cast_complete" && e.t >= tapAt)) r.cast++;
      if (paidSessions.has(sid)) r.paid++;
    }
  }
  const out = [...rows.values()].sort((a, b) => b.landed - a.landed || a.hex - b.hex);
  const total = out.reduce((t, r) => ({ hex: 0, landed: t.landed + r.landed, saw: t.saw + r.saw, tapped: t.tapped + r.tapped, cast: t.cast + r.cast, paid: t.paid + r.paid }), { hex: 0, landed: 0, saw: 0, tapped: 0, cast: 0, paid: 0 });
  return { rows: out, total };
}
