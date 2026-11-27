import type { SealData } from "./db";

/**
 * 封卦 (09-21, A1) — which of the four faces a sealed prediction is showing.
 *
 *   open    the window the reading named has not closed yet
 *   hit     the person came back and said it came true
 *   miss    they came back and said it did not
 *   silent  the window has passed and they have not said
 *
 * "open" as a verdict (还没定) leaves the page open too — nothing is settled,
 * so the page keeps waiting rather than claiming an answer.
 */
export type SealState = "open" | "hit" | "miss" | "silent";

export function sealState(d: Pick<SealData, "due_at" | "outcome" | "outcome_at">, now = Date.now()): SealState {
  if (d.outcome === "hit" || d.outcome === "miss") return d.outcome;
  return d.due_at > now ? "open" : "silent";
}
