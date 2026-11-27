import { letterOn } from "./letter-switch";
import { randomBytes } from "node:crypto";
import {
  createSavedCast, emailHasPaidDeep, emailPaidSince, mailOptedOut, markSavedCast, markSavedFollowup, purgeSavedCasts,
  markSavedReminder, recordOps, savedCastsByEmailSince, savedCastsDue, savedRemindersDue, type SavedCastRow,
} from "./db";
import { buildSavedCastEmail, buildSavedFollowupEmail, buildSavedRemindEmail, sendEmail } from "./email";
import { msT } from "./dict/matter-save";
import { fuzzyWhen } from "./fuzzy-when";
import { hexName } from "./names";
import { resolveServerChart } from "./reading";
import { asLocale, type Locale } from "./locales";
import { formatMoney, isCurrency, priceMinor, tongkaMinor, type Currency } from "./money";
import { tongkaForAll } from "./subscription";
import { firstPassEligible } from "./pass";
import { unsubUrl } from "./unsub";
import { FOLLOWUP_LIMIT } from "./followup-limit";
import { isCrisis } from "./crisis";
import { questionIssue } from "./question-check";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-02 存到邮箱 (Neil: 「做 3 和 4 吧」 — the fourth of the conversion ideas: the reader may save the cast to their inbox, by their own choice; one letter follows with the price).
 *
 * A reader who cast, saw the free line and the price, and is not ready, may email themselves the cast. It is the only
 * unpaid, signed-out cast the server ever keeps — because they asked (the privacy policy says so):
 *   - one letter now: the question, the figure, the free line, the way back to the same figure (/cast?saved=…);
 *   - one reminder the next day — the reader's own next calendar day, between 9:00 and 21:00 their time, at least 8 h after
 *     saving (the page and the letter both say 「明天」), given up after 72 h: what the full reading gives on that figure, and
 *     its price — not to an address that unsubscribed or has since paid; a crisis question is never saved at all;
 *   - deleted after 30 days.
 * No customer row is made: an address that only saved a cast is not an account.
 */
export const SAVED_KEEP_MS = 30 * 86_400_000;
export const FOLLOWUP_AFTER_MS = 8 * 3_600_000;
export const FOLLOWUP_LATEST_MS = 72 * 3_600_000;
export const SAVES_PER_ADDRESS_PER_DAY = 3;

const site = () => (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
export const savedUrl = (locale: Locale, token: string) => `${site()}/${locale}/cast?saved=${token}&c=saved`;

export type SaveResult = { ok: true; token: string } | { ok: false; error: "bad_values" | "bad_question" | "crisis" | "too_many" | "send_failed" };

const VALID = new Set([6, 7, 8, 9]);
/** the free line as shown — plain text, one line, capped (it goes into a letter to the same person) */
const cleanLine = (s: unknown): string | null => {
  if (typeof s !== "string") return null;
  const t = s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
  return t || null;
};

export async function saveCastForLater(i: {
  email: string; question: string; values: unknown; castAtMs: unknown; tzOffsetMinutes: unknown; locale: string;
  teaser?: unknown; currency?: unknown;
  /** 10-12 B②: kept on the 3rd–4th cast of a matter — the first time the chart names (YYYY-MM-DD), for the one date letter */
  matter?: { first?: unknown } | null;
}, now = Date.now()): Promise<SaveResult> {
  const locale = asLocale(i.locale);
  const q = i.question.replace(/\s+/g, " ").trim().slice(0, 450);
  if (!Array.isArray(i.values) || i.values.length !== 6 || !i.values.every((v) => VALID.has(v as number))) return { ok: false, error: "bad_values" };
  const castAt = Number(i.castAtMs);
  if (!Number.isFinite(castAt) || castAt > now + 60_000 || castAt < now - 3 * 86_400_000) return { ok: false, error: "bad_values" };
  const tz = Math.round(Number(i.tzOffsetMinutes));
  if (!Number.isFinite(tz) || Math.abs(tz) > 14 * 60) return { ok: false, error: "bad_values" };
  // a question in crisis gets the helplines on the page; it is never kept, and never meets a sales reminder
  if (isCrisis(q)) return { ok: false, error: "crisis" };
  if (q.length < 2 || questionIssue(q, locale)) return { ok: false, error: "bad_question" };
  if (savedCastsByEmailSince(i.email, now - 86_400_000) >= SAVES_PER_ADDRESS_PER_DAY) return { ok: false, error: "too_many" };
  const values = i.values as LineValue[];
  const chart = resolveServerChart({ question: q, values, castAtMs: castAt, tzOffsetMinutes: tz } as never, true);
  const hex = hexName(chart.cast.primary, locale);
  const cur = typeof i.currency === "string" ? i.currency.toUpperCase() : "";
  const token = randomBytes(24).toString("hex");
  const remind = i.matter ? matterReminder(i.matter.first, tz, locale, now) : null;
  const row = createSavedCast({
    token, email: i.email, locale, question: q, values, castAt, tzOffset: tz, hex, teaser: cleanLine(i.teaser), currency: isCurrency(cur) ? cur : null,
    ...(i.matter ? { origin: "matter" as const, remindAt: remind?.at ?? null, remindWhen: remind?.when ?? null } : {}),
  }, now);
  const m = buildSavedCastEmail({
    locale, hex, question: q, teaser: row.teaser, url: savedUrl(locale, token), unsubUrl: unsubUrl(site(), row.email, locale),
    ...(i.matter ? { next: remind ? msT(locale, "sNext", { when: remind.when }) : msT(locale, "sNextNoWhen") } : {}),
  });
  const r = await sendEmail(row.email, m.subject, m.html, m.text, { kind: "saved_cast", sessionId: `saved:${row.id}`, locale });
  recordOps("cast_saved", `${locale} ${hex} ${r.ok ? "sent" : "failed"}`);
  if (!r.ok) return { ok: false, error: "send_failed" };
  markSavedCast(row.id, "sent_at", now);
  return { ok: true, token };
}

/** "Tomorrow", in the reader's own clock (tz_offset: minutes east of UTC, as the page sends it), at a decent hour. */
export function followupDue(row: Pick<SavedCastRow, "created_at" | "tz_offset">, now = Date.now()): boolean {
  if (now - row.created_at < FOLLOWUP_AFTER_MS || now - row.created_at > FOLLOWUP_LATEST_MS) return false;
  const shift = (row.tz_offset || 0) * 60_000;
  const day = (t: number) => Math.floor((t + shift) / 86_400_000);
  const hour = Math.floor((((now + shift) % 86_400_000) + 86_400_000) % 86_400_000 / 3_600_000);
  return day(now) > day(row.created_at) && hour >= 9 && hour < 21;
}

/** The one reminder for one saved cast — or why not. */
export async function followUpSaved(row: SavedCastRow, now = Date.now()): Promise<string> {
  if (mailOptedOut(row.email)) { markSavedFollowup(row.id, "skip:optout", now); return "skip:optout"; }
  if (emailPaidSince(row.email, row.created_at)) { markSavedFollowup(row.id, "skip:paid", now); return "skip:paid"; }
  const locale = asLocale(row.locale);
  const cur: Currency = row.currency && isCurrency(row.currency) ? row.currency : "USD";
  // 10-23 进度表 101: once the 通卡 is open to everyone a single full reading is not sold — the letter quotes the 1-day pass
  const pass = tongkaForAll();
  const first = pass ? firstPassEligible(null, row.email) : !emailHasPaidDeep(row.email);
  const m = buildSavedFollowupEmail({
    locale, hex: row.hex ?? "", question: row.question,
    price: formatMoney(cur, pass ? tongkaMinor(cur, 1, first) : priceMinor(cur, first ? "one" : "deep"), locale),
    full: formatMoney(cur, pass ? tongkaMinor(cur, 1, false) : priceMinor(cur, "deep"), locale), first, pass,
    followups: FOLLOWUP_LIMIT, url: savedUrl(locale, row.token), unsubUrl: unsubUrl(site(), row.email, locale),
  });
  const r = await sendEmail(row.email, m.subject, m.html, m.text, { kind: "saved_followup", sessionId: `saved:${row.id}`, locale, unsubUrl: unsubUrl(site(), row.email, locale) });
  const note = r.ok ? "sent" : "failed";
  markSavedFollowup(row.id, note, now);
  return note;
}

/** The fulfil cron's sweep: reminders that are due (at most 50 a run), then the 30-day purge. */
export async function runSavedFollowups(now = Date.now()): Promise<{ sent: number; skipped: number; failed: number; purged: number }> {
  const out = { sent: 0, skipped: 0, failed: 0, purged: 0 };
  if ((process.env.SAVED_FOLLOWUP ?? "on") !== "off" && letterOn("saved_followup")) { // 10-23 进度表 108: the purge below runs either way
    for (const row of savedCastsDue(now - FOLLOWUP_AFTER_MS, now - FOLLOWUP_LATEST_MS).filter((r) => followupDue(r, now)).slice(0, 50)) {
      const r = await followUpSaved(row, now).catch(() => "failed");
      if (r === "sent") out.sent += 1; else if (r === "failed") out.failed += 1; else out.skipped += 1;
    }
  }
  out.purged = purgeSavedCasts(now - SAVED_KEEP_MS);
  if (out.sent || out.failed || out.purged) recordOps("saved_followup", `sent ${out.sent} skipped ${out.skipped} failed ${out.failed} purged ${out.purged}`);
  return out;
}

/**
 * 10-12 B② 第 3–4 卦存这件事: when the one date letter goes — 10:00 the reader's own time on the day before the first time
 * the chart names; none when that is under 12 hours away (the save letter already says when) or past the 30 days a saved
 * cast is kept.
 */
export function matterReminder(first: unknown, tz: number, locale: Locale, now = Date.now()): { at: number; when: string } | null {
  if (typeof first !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(first)) return null;
  const [y, m, d] = first.split("-").map(Number) as [number, number, number];
  const at = Date.UTC(y, m - 1, d - 1, 10) - tz * 60_000;
  if (at < now + 12 * 3_600_000 || at > now + SAVED_KEEP_MS - 86_400_000) return null;
  return { at, when: fuzzyWhen(first, locale) };
}

/** 10-12 B②: the date letters that are due — not to an address that unsubscribed or has paid since it was kept. */
export async function runSavedReminders(now = Date.now()): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  if (!letterOn("saved_followup")) return out; // 10-23 进度表 108
  for (const row of savedRemindersDue(now)) {
    if (mailOptedOut(row.email)) { markSavedReminder(row.id, "skip:optout"); out.skipped += 1; continue; }
    if (emailPaidSince(row.email, row.created_at)) { markSavedReminder(row.id, "skip:paid"); out.skipped += 1; continue; }
    const locale = asLocale(row.locale);
    const unsub = unsubUrl(site(), row.email, locale);
    const m = buildSavedRemindEmail({ locale, hex: row.hex ?? "", question: row.question, when: row.remind_when ?? "", url: savedUrl(locale, row.token), unsubUrl: unsub });
    const r = await sendEmail(row.email, m.subject, m.html, m.text, { kind: "saved_followup", sessionId: `saved-remind:${row.id}`, locale, unsubUrl: unsub }).catch(() => ({ ok: false }));
    markSavedReminder(row.id, r.ok ? "sent" : "failed");
    if (r.ok) out.sent += 1; else out.failed += 1;
  }
  if (out.sent || out.failed) recordOps("saved_remind", `sent ${out.sent} skipped ${out.skipped} failed ${out.failed}`);
  return out;
}
