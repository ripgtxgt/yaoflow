import type { TrackedEvent } from "./analytics-server";

/**
 * 带新 (09-26 裂变 ④, Neil: 「好，都做好吧」): browser sessions that arrived
 * through something a reader passed on, by what it was, and how far each got —
 * cast, reached Stripe, paid. First touch wins: a session is counted under the
 * first shared thing it opened. No ids beyond the anonymous session tag.
 */
export type BringSource = "share" | "gift" | "case" | "pair" | "seal" | "proof";
export const BRING_LABEL: Record<BringSource, string> = {
  share: "分享卡 /share", gift: "送一卦链接", case: "公开卦例 /cases", pair: "合参邀请 /pair", seal: "封卦 /seal", proof: "应验卡 /proof",
};
export interface BringRow { source: BringSource; visits: number; casts: number; checkout: number; paid: number }

export function sourceOf(e: TrackedEvent): BringSource | null {
  if (e.e === "gift_open") return "gift";
  if (e.e !== "page_view") return null;
  const p = e.path ?? "";
  if (/^\/[a-z-]+\/share\//.test(p) || e.via) return "share";
  if (/^\/[a-z-]+\/cases\/[0-9a-f]{10}$/.test(p)) return "case";
  if (/^\/[a-z-]+\/pair\//.test(p)) return "pair";
  if (/^\/[a-z-]+\/seal\//.test(p)) return "seal";
  if (/^\/[a-z-]+\/proof/.test(p)) return "proof";
  return null;
}

export function bringNew(evs: TrackedEvent[], paidSessions: Set<string>): BringRow[] {
  const first = new Map<string, { src: BringSource; t: number }>();
  const casts = new Map<string, number[]>();
  const checkouts = new Map<string, number[]>();
  for (const e of [...evs].sort((a, b) => a.t - b.t)) {
    const src = sourceOf(e);
    if (src && !first.has(e.s)) first.set(e.s, { src, t: e.t });
    if (e.e === "cast_start") (casts.get(e.s) ?? casts.set(e.s, []).get(e.s)!).push(e.t);
    if (e.e === "checkout_start") (checkouts.get(e.s) ?? checkouts.set(e.s, []).get(e.s)!).push(e.t);
  }
  const rows = new Map<BringSource, BringRow>();
  for (const [s, f] of first) {
    const r = rows.get(f.src) ?? { source: f.src, visits: 0, casts: 0, checkout: 0, paid: 0 };
    r.visits += 1;
    if ((casts.get(s) ?? []).some((t) => t >= f.t)) r.casts += 1;
    if ((checkouts.get(s) ?? []).some((t) => t >= f.t)) r.checkout += 1;
    if (paidSessions.has(s)) r.paid += 1;
    rows.set(f.src, r);
  }
  return [...rows.values()].sort((a, b) => b.visits - a.visits);
}
