import { createHmac, timingSafeEqual } from "node:crypto";
import type { Locale } from "./locales";

/**
 * Signed one-tap links for the revisit email (应验了 / 没应验 / 还没定).
 * The token binds the revisit id so a link cannot be guessed or re-aimed;
 * the verdict itself travels in the clear because changing it is allowed —
 * the latest tap wins. Secret: REVISIT_SECRET, else ADMIN_KEY.
 */

function secret(): string {
  const s = process.env.REVISIT_SECRET ?? process.env.ADMIN_KEY;
  if (!s) throw new Error("no signing secret (REVISIT_SECRET/ADMIN_KEY)");
  return s;
}

export function outcomeToken(revisitId: number): string {
  return createHmac("sha256", secret()).update(`revisit:${revisitId}`).digest("hex").slice(0, 32);
}

export function verifyOutcomeToken(revisitId: number, token: string): boolean {
  if (!/^[0-9a-f]{32}$/.test(token)) return false;
  const expected = Buffer.from(outcomeToken(revisitId), "utf8");
  const given = Buffer.from(token, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * 10-07: the link carries the FACT the reader will tap (happened / stirred / nothing / open — lib/revisit-judge.ts);
 * the old verdict words (hit / partial / miss) are still accepted by the route for the letters already in inboxes.
 */
export function outcomeUrl(site: string, revisitId: number, verdict: "happened" | "stirred" | "nothing" | "open" | "offwindow" | "hit" | "partial" | "miss", locale: Locale): string {
  const p = new URLSearchParams({ id: String(revisitId), v: verdict, t: outcomeToken(revisitId), l: locale });
  return `${site}/api/revisit/outcome?${p.toString()}`;
}

/** 10-12 多段应期: the check-in letter's taps, signed over their own message so they can never set a revisit's outcome. */
export function checkpointToken(checkpointId: number): string {
  return createHmac("sha256", secret()).update(`checkpoint:${checkpointId}`).digest("hex").slice(0, 32);
}

export function verifyCheckpointToken(checkpointId: number, token: string): boolean {
  if (!/^[0-9a-f]{32}$/.test(token)) return false;
  const expected = Buffer.from(checkpointToken(checkpointId), "utf8");
  const given = Buffer.from(token, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function checkpointUrl(site: string, checkpointId: number, answer: "seen" | "none" | "unsure", locale: Locale): string {
  const p = new URLSearchParams({ id: String(checkpointId), v: answer, t: checkpointToken(checkpointId), l: locale });
  return `${site}/api/revisit/checkpoint?${p.toString()}`;
}

/**
 * 应验卡 (proof card, 裂变 V1 ④): a public page for a revisit that came
 * true. Its token is signed over a different message than the outcome
 * token, so a shared card can never be turned into a "set my outcome" link.
 */
export function proofToken(revisitId: number): string {
  return createHmac("sha256", secret()).update(`proof:${revisitId}`).digest("hex").slice(0, 20);
}

export function verifyProofToken(revisitId: number, token: string): boolean {
  if (!/^[0-9a-f]{20}$/.test(token)) return false;
  const expected = Buffer.from(proofToken(revisitId), "utf8");
  const given = Buffer.from(token, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function proofUrl(site: string, revisitId: number, locale: Locale): string {
  return `${site}/${locale}/proof/${revisitId}-${proofToken(revisitId)}`;
}

/** "<id>-<token>" → parts, or null. */
export function parseProofRef(ref: string): { id: number; token: string } | null {
  const m = /^(\d{1,12})-([0-9a-f]{20})$/.exec(ref);
  if (!m) return null;
  return { id: Number(m[1]), token: m[2]! };
}


/**
 * 封卦 (09-21, A1): a public page for a prediction that has been made but
 * not yet settled. Signed over its own message, so a seal link can never be
 * turned into a "set my outcome" link, nor into a proof card for a cast that
 * did not come true.
 */
export function sealToken(revisitId: number): string {
  return createHmac("sha256", secret()).update(`seal:${revisitId}`).digest("hex").slice(0, 20);
}

export function verifySealToken(revisitId: number, token: string): boolean {
  if (!/^[0-9a-f]{20}$/.test(token)) return false;
  const expected = Buffer.from(sealToken(revisitId), "utf8");
  const given = Buffer.from(token, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function sealUrl(site: string, revisitId: number, locale: Locale): string {
  return `${site}/${locale}/seal/${revisitId}-${sealToken(revisitId)}`;
}

/** "<id>-<token>" → parts, or null. Same shape as a proof ref, different signature. */
export function parseSealRef(ref: string): { id: number; token: string } | null {
  const m = /^(\d{1,12})-([0-9a-f]{20})$/.exec(ref);
  if (!m) return null;
  return { id: Number(m[1]), token: m[2]! };
}
