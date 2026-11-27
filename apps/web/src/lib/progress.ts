import { maxOf } from "@/lib/minmax";
/**
 * 记一笔进展 — the pacing (09-23). "One note a day" in the copy; 20 hours in
 * practice, so a reader who comes back each evening is never turned away by a
 * few minutes. A cast holds at most NOTE_LIMIT notes: past that, the matter has
 * usually turned the page and deserves a cast of its own.
 */
export const NOTE_GAP_MS = 20 * 3_600_000;
export const NOTE_LIMIT = 8;
/** 09-29 「一件事」: a member's notes are how they walk a matter day by day — 30 on one cast */
export const MEMBER_NOTE_LIMIT = 30;

export type NoteGate = { kind: "open" } | { kind: "wait"; nextAt: number } | { kind: "limit" };

export function noteGate(priorAt: number[], now = Date.now(), gapMs: number = NOTE_GAP_MS, limit: number = NOTE_LIMIT): NoteGate {
  if (priorAt.length >= limit) return { kind: "limit" };
  const last = priorAt.length ? maxOf(priorAt) : 0;
  if (gapMs > 0 && last && now - last < gapMs) return { kind: "wait", nextAt: last + gapMs };
  return { kind: "open" };
}
