import { randomBytes } from "node:crypto";
import { caseBySession, castIdForSession, storedReadingForSession, unpublishCase, upsertCase, type CaseRow, type CaseView } from "./db";
import { pick, type Bi } from "./reading";
import { record } from "./analytics-server";
import type { Locale } from "./locales";
import { t } from "./i18n";
import { orT } from "./dict/outcome-records";

/**
 * 公开卦例 (总方案 §5.3 ⑦ / §14 ⑬): a reading its owner chooses to publish
 * as an anonymous page — the figure, the date, the kind of matter, two or
 * three passages of the reading, and how the timing window turned out.
 * The question itself is off by default; the owner may write a public
 * rewording. No email, no account, no link back to the person; withdrawn
 * with one tap, any time.
 */
export const CASE_FRAMING_MAX = 80;
export const PUBLIC_ID_RE = /^[0-9a-f]{10}$/;

/** Deep readings show the call, the tendency and the timing; light readings the summary, the movement and the direction. */
export const CASE_FIELDS: Record<"one" | "deep", readonly string[]> = {
  deep: ["verdict", "tendency", "timing"],
  one: ["summary", "movement", "direction"],
};

/** The dictionary keys that label those fields on the page. */
export const CASE_FIELD_LABELS: Record<string, string> = {
  verdict: "dVerdict", tendency: "dTendency", timing: "dTiming",
  summary: "secSummary", movement: "secMovement", direction: "secDirection",
};

export type FramingCheck = { ok: true; framing: string | null } | { ok: false; error: "link" | "too_short" };

/** The public wording: optional, short, and never a link — a public page under our domain is not an ad slot. */
export function cleanCaseFraming(raw: unknown): FramingCheck {
  const s = (typeof raw === "string" ? raw : "").replace(/\s+/g, " ").trim();
  if (!s) return { ok: true, framing: null };
  if (/https?:|www\.|\.(com|net|org|io|cn|jp|kr|app|me)\b|@/i.test(s)) return { ok: false, error: "link" };
  if (s.length < 2) return { ok: false, error: "too_short" };
  return { ok: true, framing: s.slice(0, CASE_FRAMING_MAX) };
}

export function casePath(locale: Locale, publicId: string): string {
  return `/${locale}/cases/${publicId}`;
}

/** The passages the page shows, picked from the stored reading in its own language. */
export function publicFields(tier: string, reading: unknown, locale: Locale): Record<string, string> {
  const body = (reading ?? {}) as Record<string, Bi | undefined>;
  const out: Record<string, string> = {};
  for (const k of CASE_FIELDS[tier === "deep" ? "deep" : "one"]) {
    const v = pick(body[k], locale);
    if (v) out[k] = v;
  }
  return out;
}

export type PublishResult = { ok: true; row: CaseRow } | { ok: false; error: "not_found" | "not_eligible" | "empty" };

/** Publish a reading as a case (idempotent per reading; re-publishing updates the wording). */
export function publishCase(sid: string, framing: string | null, customerId: number | null): PublishResult {
  const stored = storedReadingForSession(sid);
  if (!stored) return { ok: false, error: "not_found" };
  if (stored.status === "refunded" || stored.status === "disputed") return { ok: false, error: "not_eligible" };
  const castId = castIdForSession(sid);
  if (!castId) return { ok: false, error: "not_found" };
  const locale = stored.locale as Locale;
  const fields = publicFields(stored.tier, stored.reading, locale);
  if (Object.keys(fields).length === 0) return { ok: false, error: "empty" };
  const existing = caseBySession(sid);
  const row = upsertCase({
    publicId: existing?.public_id ?? randomBytes(5).toString("hex"),
    sessionId: sid, castId, customerId: customerId ?? stored.customerId, locale, tier: stored.tier,
    topic: stored.topic, framing, fieldsJson: JSON.stringify(fields),
  });
  if (!existing || existing.unpublished_at) record({ t: Date.now(), e: "case_published", s: sid.slice(-12), locale, tier: stored.tier, path: "/reading" });
  return { ok: true, row };
}

export function withdrawCase(sid: string): boolean {
  return unpublishCase(sid);
}

/**
 * Which outcome line the page shows for a case with a timing window (null when there was none).
 * 10-23 进度表 104 ②: every answer has its own state, in the words /outcomes and the records list use (OutcomeRecords'
 * stateLabel) — 部分 had read 「還說不準」 and 不確定 「到期後沒有回覆」; and a closed window whose letter still waits in the
 * queue says so instead of 「到期後沒有回覆」.
 */
export type OutcomeKey = "caseOutcomeHit" | "caseOutcomeMiss" | "caseOutcomePartial" | "caseOutcomeUnclear" | "caseOutcomeOpen"
  | "caseOutcomePending" | "caseOutcomeQueued" | "caseOutcomeUnanswered";
export function outcomeKey(c: Pick<CaseView, "window_days" | "outcome" | "due_at"> & { revisit_status?: string | null }, now = Date.now()): OutcomeKey | null {
  if (!c.window_days) return null;
  if (c.outcome === "hit") return "caseOutcomeHit";
  if (c.outcome === "miss") return "caseOutcomeMiss";
  if (c.outcome === "partial") return "caseOutcomePartial";
  if (c.outcome === "unclear") return "caseOutcomeUnclear";
  if (c.outcome === "open") return "caseOutcomeOpen";
  if (c.due_at && c.due_at > now) return "caseOutcomePending";
  if (c.revisit_status === "pending") return "caseOutcomeQueued";
  return "caseOutcomeUnanswered";
}
/** the words for an outcome line — the answered ones exactly as /outcomes and the records list say them */
export function outcomeWord(k: OutcomeKey, l: Locale): string {
  switch (k) {
    case "caseOutcomePartial": return orT(l, "stPartial");
    case "caseOutcomeUnclear": return orT(l, "stUnclear");
    case "caseOutcomeOpen": return orT(l, "stOpen");
    case "caseOutcomeQueued": return orT(l, "stQueued");
    default: return t(l, k);
  }
}
