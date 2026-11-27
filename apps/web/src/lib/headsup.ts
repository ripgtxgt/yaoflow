import { resolveCast, type LineValue } from "@yaoflow/engine";
import { dayOfCandidates, headsUpCandidates, lastHeadsUpAt, liveMemberEmail, markDayOf, markForetold, recordOps, type DayOfRow, type HeadsUpRow } from "./db";
import { buildDayOfEmail, buildHeadsUpEmail, sendEmail, type HeadsUpItem } from "./email";
import { timingMailGate } from "./timing-mail";
import { pick } from "./reading";
import { asLocale, LOCALE_META, type Locale } from "./locales";
import { hexName } from "./names";
import { absoluteDates, stripScope } from "./revisit";
import { unsubUrl } from "./unsub";
import { readingLean } from "./revisit-judge";

/**
 * 应期提醒 (09-23, Neil: 「开始做『本周应期』提醒信，做完后首轮发全部卦象的邮箱，
 * 之后设置成定时发送任务……自动添加新的去轮发」).
 *
 * Why this instead of a generic 本週一卦 (see 「本週一卦」周报可行性调研-0923.md):
 * letters about the reader's OWN cast are opened 70–81% of the time; the one
 * generic letter we sent brought back one visitor out of 31. Every deep
 * reading names days; this letter arrives before them.
 *
 *   first  — once, now: every address with a window still ahead gets one
 *            letter listing all of their open windows.
 *   week   — daily from the cron: a window whose next named date falls in the
 *            coming seven days gets its heads-up, once per window; a reading
 *            younger than two days is left alone (they have just read it), and
 *            an address gets at most one such letter in six days — several
 *            windows in the same week share one letter.
 *
 * It is about the reader's own purchase, not a promotion; it carries its own
 * one-click stop (customers.headsup_off), separate from the marketing box.
 *
 * 10-07 应期类信收口 (lib/timing-mail.ts): the week letter skips members (the
 * account page shows their next date) and, like the day-of letter and the
 * revisit, yields to the family's per-address cap — one a day, three a week.
 */

const DAY = 86_400_000;
export const LOOKAHEAD_DAYS = 7;
export const MIN_AGE_DAYS = 2;
export const QUIET_DAYS = 6;
const MAX_ITEMS = 5;

/** The next date the reading's timing names on or after today, or null if none is left (window still open). */
export function nextNamedDate(r: Pick<HeadsUpRow, "timing_quote" | "cast_at">, now = Date.now()): Date | null {
  // absoluteDates builds local-midnight dates; compare against local midnight today
  const t = new Date(now);
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  // 10-14: the reader's own range said back is no date to watch (lib/revisit.ts stripScope)
  const dates = absoluteDates(r.timing_quote ? stripScope(r.timing_quote) : r.timing_quote, new Date(r.cast_at)).filter((d) => d.getTime() >= today.getTime()).sort((a, b) => a.getTime() - b.getTime());
  return dates[0] ?? null;
}

/** exported for the tests: is this window's heads-up due this week? */
export function dueThisWeek(r: Pick<HeadsUpRow, "timing_quote" | "cast_at" | "created_at" | "due_at" | "foretold_at">, now = Date.now()): boolean {
  if (r.foretold_at) return false;
  if (now - r.created_at < MIN_AGE_DAYS * DAY) return false;
  const next = nextNamedDate(r, now);
  // no parsable date left but the window is still open and ends within the week: say so while it matters
  const key = next?.getTime() ?? r.due_at;
  return key <= now + LOOKAHEAD_DAYS * DAY;
}

function day(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_META[locale].htmlLang, { month: "long", day: "numeric" }).format(d);
}

function site(): string {
  return (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
}

export interface HeadsUpRun { mode: "first" | "week"; letters: number; windows: number; skippedQuiet: number; skippedMember: number; skippedCap: number; failed: number; dry: boolean; sample?: string[] }

export async function runHeadsUps(mode: "first" | "week", opts: { dry?: boolean; now?: number; pauseMs?: number } = {}): Promise<HeadsUpRun> {
  const now = opts.now ?? Date.now();
  const dry = !!opts.dry;
  const byEmail = new Map<string, HeadsUpRow[]>();
  for (const r of headsUpCandidates(now)) {
    if (mode === "week" && !dueThisWeek(r, now)) continue;
    const list = byEmail.get(r.email) ?? [];
    list.push(r);
    byEmail.set(r.email, list);
  }
  const out: HeadsUpRun = { mode, letters: 0, windows: 0, skippedQuiet: 0, skippedMember: 0, skippedCap: 0, failed: 0, dry, sample: [] };
  for (const [email, rows] of byEmail) {
    // 10-07 收口: a member's next date is on their account page; and the family's cap (one a day, three a week)
    if (mode === "week" && liveMemberEmail(email)) { out.skippedMember += 1; continue; }
    if (timingMailGate(email, now) !== "ok") { out.skippedCap += 1; continue; }
    const last = lastHeadsUpAt(email);
    if (mode === "week" && last && now - last < QUIET_DAYS * DAY) { out.skippedQuiet += 1; continue; }
    const pick = rows
      .map((r) => ({ r, next: nextNamedDate(r, now) }))
      .sort((a, b) => (a.next?.getTime() ?? a.r.due_at) - (b.next?.getTime() ?? b.r.due_at))
      .slice(0, MAX_ITEMS);
    const locale = asLocale(pick[0]!.r.locale);
    const items: HeadsUpItem[] = pick.map(({ r, next }) => {
      const l = asLocale(r.locale);
      const cast = resolveCast(r.values_str.split(",").map(Number) as LineValue[]);
      return {
        question: r.question,
        hexName: hexName(cast.primary, l) + (cast.changed ? ` → ${hexName(cast.changed, l)}` : ""),
        timing: r.timing_quote,
        nextDate: next ? day(next, l) : null,
        readingUrl: `${site()}/${l}/reading?sid=${encodeURIComponent(r.session_id)}`,
      };
    });
    const m = buildHeadsUpEmail({
      locale, mode: mode === "first" ? "all" : "week", items,
      castUrl: `${site()}/${locale}/cast`,
      stopUrl: unsubUrl(site(), email, locale) + "&k=h",
    });
    out.windows += items.length;
    if (dry) { out.letters += 1; if (out.sample!.length < 3) out.sample!.push(`${email.replace(/^(.).*@/, "$1…@")} · ${m.subject} · ${items.length}`); continue; }
    const sent = await sendEmail(email, m.subject, m.html, m.text, { kind: "headsup" });
    if (sent.ok) {
      out.letters += 1;
      // a window counts as told once its named date is within the week; later windows in a first-run letter get their own week letter
      markForetold(pick.filter(({ r, next }) => (next?.getTime() ?? r.due_at) <= now + LOOKAHEAD_DAYS * DAY).map(({ r }) => r.id));
    } else {
      out.failed += 1;
      recordOps("headsup_fail", `${email.replace(/^(.).*@/, "$1…@")}: ${sent.error ?? "?"}`);
    }
    if (opts.pauseMs) await new Promise((res) => setTimeout(res, opts.pauseMs));
  }
  recordOps("headsup_run", `${mode}${dry ? " dry" : ""} letters=${out.letters} windows=${out.windows} quiet=${out.skippedQuiet} member=${out.skippedMember} cap=${out.skippedCap} failed=${out.failed}`);
  return out;
}

/* ---------------- 应期当天 (09-23, 用户粘性数据分析-0923.md §四 ③) ----------------
 * On the FIRST day the reading named, one short letter: today is the day, the
 * two signals the reading said to watch, and the way back to note what
 * happened. Once per window; never on a reading younger than a day; at most
 * one per address per day — and since 10-07 under the family's cap
 * (lib/timing-mail.ts: one of heads-up / day-of / revisit a day, three a
 * week), the day-of letter first in line because the crons run it first.
 */

export const DAYOF_MIN_AGE_MS = DAY;
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Where this window's first named date stands against today. */
export function dayOfDue(r: Pick<HeadsUpRow, "timing_quote" | "cast_at" | "created_at">, now = Date.now()): "today" | "past" | "later" | "none" {
  const castDay = new Date(r.cast_at);
  const first = absoluteDates(r.timing_quote ? stripScope(r.timing_quote) : r.timing_quote, new Date(castDay.getFullYear(), castDay.getMonth(), castDay.getDate()))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (!first) return "none";
  const t = new Date(now);
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  if (ymd(first) === ymd(today)) return now - r.created_at < DAYOF_MIN_AGE_MS ? "past" : "today";
  return first.getTime() < today.getTime() ? "past" : "later";
}

function signalsOf(r: DayOfRow): string | null {
  try {
    const body = r.body_json ? (JSON.parse(r.body_json) as Record<string, Record<string, string> | undefined>) : null;
    const s = body?.signals ? pick(body.signals, asLocale(r.locale)).trim() : "";
    return s || null;
  } catch {
    return null;
  }
}

/** exported for the tests: the reading behind this window leaned "unlikely" or "even" (its own odds or verdict words). */
export function dayOfSkipsLean(r: Pick<DayOfRow, "body_json" | "locale">): boolean {
  if (!r.body_json) return false;
  try {
    const lean = readingLean(JSON.parse(r.body_json), asLocale(r.locale));
    return lean === "unlikely" || lean === "even";
  } catch {
    return false;
  }
}

export interface DayOfRun { letters: number; passed: number; skippedQuiet: number; failed: number; dry: boolean; sample?: string[] }

export async function runDayOf(opts: { dry?: boolean; now?: number; pauseMs?: number } = {}): Promise<DayOfRun> {
  const now = opts.now ?? Date.now();
  const dry = !!opts.dry;
  const out: DayOfRun = { letters: 0, passed: 0, skippedQuiet: 0, failed: 0, dry, sample: [] };
  const byEmail = new Map<string, DayOfRow[]>();
  const passed: number[] = [];
  for (const r of dayOfCandidates(now)) {
    const due = dayOfDue(r, now);
    if (due === "past" || due === "none") { passed.push(r.id); continue; }
    // 10-31 进度表 129 ③: a reading that leaned "not likely" or "even" gives a check-back date, not a day it will happen —
    // a 「今天是那一段」 letter on it would read as a promise the reading never made
    if (dayOfSkipsLean(r)) { passed.push(r.id); continue; }
    if (due !== "today") continue;
    const list = byEmail.get(r.email) ?? [];
    list.push(r);
    byEmail.set(r.email, list);
  }
  if (!dry) markDayOf(passed);
  out.passed = passed.length;
  for (const [email, rows] of byEmail) {
    const ids = rows.map((r) => r.id);
    // 10-07 收口: one letter of the family a day, three a week; a day-of letter not sent today is not sent later
    if (timingMailGate(email, now) !== "ok") { out.skippedQuiet += 1; if (!dry) markDayOf(ids); continue; }
    const r = rows.sort((a, b) => a.due_at - b.due_at)[0]!;
    const l = asLocale(r.locale);
    const cast = resolveCast(r.values_str.split(",").map(Number) as LineValue[]);
    const readingUrl = `${site()}/${l}/reading?sid=${encodeURIComponent(r.session_id)}`;
    const m = buildDayOfEmail({
      locale: l,
      item: {
        question: r.question,
        hexName: hexName(cast.primary, l) + (cast.changed ? ` → ${hexName(cast.changed, l)}` : ""),
        timing: r.timing_quote,
        signals: signalsOf(r),
        readingUrl,
        noteUrl: `${readingUrl}#progress`,
        hint: r.hint ?? null,
      },
      stopUrl: unsubUrl(site(), email, l) + "&k=h",
    });
    if (dry) { out.letters += 1; if (out.sample!.length < 3) out.sample!.push(`${email.replace(/^(.).*@/, "$1…@")} · ${m.subject}`); continue; }
    const sent = await sendEmail(email, m.subject, m.html, m.text, { kind: "dayof", sessionId: r.session_id });
    if (sent.ok) {
      out.letters += 1;
      markDayOf(ids);
    } else {
      out.failed += 1;
      recordOps("dayof_fail", `${email.replace(/^(.).*@/, "$1…@")}: ${sent.error ?? "?"}`);
    }
    if (opts.pauseMs) await new Promise((res) => setTimeout(res, opts.pauseMs));
  }
  recordOps("dayof_run", `${dry ? "dry " : ""}letters=${out.letters} passed=${out.passed} quiet=${out.skippedQuiet} failed=${out.failed}`);
  return out;
}
