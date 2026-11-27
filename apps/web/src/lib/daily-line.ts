import { chatText } from "./llm";
import { db, readingBodyForCast, recordOps, threadCastsForCustomer, matterById, notesInMatter, type ThreadCast } from "./db";
import { focusCast, memberDaily, type MemberDaily } from "./member-daily";
import { localDay } from "./clock";
import { RECENT_MS } from "./matter-context";
import { jargonOffense, pick } from "./reading";
import { asLocale, LOCALE_META, type Locale } from "./locales";
import { activeMembership } from "./membership";

/**
 * 09-29 今日一卦, written (用户数据与需求全面分析-0929.md §4.1, §4.5). The rule
 * line (member-daily.ts) says one of eight things; this says two or three
 * sentences about THIS matter: how today's day meets it, the one thing worth
 * watching, the one thing not to do. The rule still decides the kind of day —
 * the model only puts it in the matter's own terms.
 *
 * What it must never be: a daily verdict on the other person's heart
 * ("他今天想你吗"). For someone asking ten times a day, that line would be fuel.
 *
 * Cached per member × matter × local day; written by the ten-minute sweep in
 * the morning and, failing that, on first view (the page shows the rule line
 * meanwhile and never waits).
 */

export const DAILY_LINE_TIMEOUT_MS = 8_000;

function ensureTable(): void {
  db().exec(`CREATE TABLE IF NOT EXISTS daily_lines (
    customer_id INTEGER NOT NULL, matter_id INTEGER NOT NULL, day TEXT NOT NULL,
    text TEXT NOT NULL, kind TEXT, created_at INTEGER NOT NULL,
    PRIMARY KEY (customer_id, matter_id, day)
  )`);
}

export function cachedDailyLine(customerId: number, matterId: number, day: string): string | null {
  ensureTable();
  const r = db().prepare("SELECT text FROM daily_lines WHERE customer_id = ? AND matter_id = ? AND day = ?").get(customerId, matterId, day) as { text: string } | undefined;
  return r?.text ?? null;
}

const KIND_MEANING: Record<string, string> = {
  zhi: "the matter's own day — things tend to move; watch for news, receive it calmly",
  chong: "the day clashes with the matter — stirred: news or friction; watch, do not push",
  he: "the day binds the matter — held: a day for waiting and smoothing over",
  sheng: "the day feeds the matter — backed: a small step forward is well placed",
  ke: "the day presses the matter — pressed: not a day to force it",
  xie: "the matter feeds the day — drained: rest, spend less on it",
  hao: "the matter presses the day — effortful: you can act, but it costs",
  bi: "an even day for it — ordinary",
};

export function dailyLinePrompt(locale: Locale): string {
  const cjk = LOCALE_META[locale]?.cjk;
  return [
    "You are 玄溪先生, the Liu Yao reader this person already consults about one matter in their life.",
    "Each morning you write them TODAY'S NOTE on that matter: two or three short sentences, plain words.",
    "The kind of day is ALREADY DECIDED by the rules and given to you (day_kind) — never change it; put it in the terms of their matter.",
    "Say: what today is like for this matter; the one thing worth noticing today; the one thing better not to do today.",
    "HARD RULES:",
    "- Never say what the other person feels, thinks, misses or wants today, and never say whether they will contact the reader today. Speak about the day and the reader's own conduct only.",
    "- reader_notes_recent are things the reader wrote down in the last few days: use them only to know what has happened; never quote or paraphrase them back, and never tell the reader how they feel today from them.",
    "- No dates other than today. If in_window is true you may say these days fall inside the window the reading named — without restating its dates.",
    "- No chart vocabulary (爻, 用神, 世應, 日辰, 旺衰, 六沖…), no hexagram names, no 干支.",
    "- No promises, no 'surely', no fear. Warm and plain, like a note left on the table.",
    `- ${cjk ? "At most 70 characters in total." : "At most 45 words in total."} Plain text, no quotes, no lists, no headings.`,
    `- Write in ${LOCALE_META[locale]?.english ?? locale}.`,
  ].join("\n");
}

const HEART = /(想不想|想你|想妳|想念你|愛不愛|爱不爱|會不會聯絡|会不会联络|會主動找|会主动找|misses you|thinks of you|will (text|call|contact) you)/i;

export function acceptableLine(text: string, locale: Locale): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  const cjk = LOCALE_META[locale]?.cjk;
  if (cjk ? t.length > 110 : t.split(/\s+/).length > 70) return false;
  if (HEART.test(t)) return false;
  if (/\d{1,2}\s*[月\/]\s*\d{1,2}|\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(t)) return false;
  return !jargonOffense({ line: t }, [], locale);
}

/** Write (or return the cached) note for one member's focus matter today. Null when there is nothing to write about or the model fails. */
export async function writeDailyLine(customerId: number, fc: ThreadCast, d: MemberDaily, now = Date.now()): Promise<string | null> {
  if (!fc.matter_id) return null;
  const day = localDay(now, fc.tz_offset);
  const cached = cachedDailyLine(customerId, fc.matter_id, day);
  if (cached) return cached;
  const l = asLocale(fc.locale);
  const m = matterById(fc.matter_id);
  const rb = readingBodyForCast(fc.id);
  const call = rb ? pick((rb.body.verdict ?? rb.body.summary) as never, l) : "";
  // 10-04 进度表 30: only what the reader wrote in the last 72 hours — an older note is yesterday's mood, not today's;
  // none at all when they switched this matter's record off
  const notes = m?.no_context ? [] : notesInMatter(fc.matter_id).filter((n) => now - n.created_at <= RECENT_MS).slice(-2).map((n) => n.note.slice(0, 160));
  const payload = {
    matter: m?.title ?? fc.question.slice(0, 60),
    question: fc.question.slice(0, 200),
    latest_call: call.slice(0, 240),
    reader_notes_recent: notes,
    day_kind: d.kind,
    day_kind_meaning: KIND_MEANING[d.kind],
    in_window: d.inWindow,
    today: day,
  };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await Promise.race([
        chatText([{ role: "system", content: dailyLinePrompt(l) }, { role: "user", content: JSON.stringify(payload) }], { maxTokens: 220, temperature: 0.6, timeoutMs: DAILY_LINE_TIMEOUT_MS, light: true }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("daily_line_deadline")), DAILY_LINE_TIMEOUT_MS + 1_000)),
      ]);
      const text = raw.replace(/^["“「]|["”」]$/g, "").replace(/\s+/g, " ").trim();
      if (acceptableLine(text, l)) {
        ensureTable();
        db().prepare("INSERT OR IGNORE INTO daily_lines (customer_id, matter_id, day, text, kind, created_at) VALUES (?,?,?,?,?,?)").run(customerId, fc.matter_id, day, text, d.kind, Date.now());
        return text;
      }
      recordOps("daily_line_reject", `${customerId} ${text.slice(0, 60)}`);
    }
  } catch (e) {
    recordOps("daily_line_fail", (e instanceof Error ? e.message : "?").slice(0, 80));
  }
  return null;
}

const warming = new Set<string>();

/** For a page: the written note if it exists; otherwise start writing it (not awaited) and return null. */
export function dailyLineOrWarm(customerId: number, fc: ThreadCast, d: MemberDaily, now = Date.now()): string | null {
  if (!fc.matter_id) return null;
  const day = localDay(now, fc.tz_offset);
  const cached = cachedDailyLine(customerId, fc.matter_id, day);
  if (cached) return cached;
  const key = `${customerId}:${fc.matter_id}:${day}`;
  if (!warming.has(key)) {
    warming.add(key);
    void writeDailyLine(customerId, fc, d, now).finally(() => setTimeout(() => warming.delete(key), 60_000));
  }
  return null;
}

/** The morning sweep: every active member whose local day has reached 06:00 gets today's note written ahead of their visit. */
export async function runDailyLines(now = Date.now(), max = 25): Promise<number> {
  const members = db().prepare("SELECT DISTINCT customer_id FROM subscriptions WHERE status IN ('active','trialing') AND customer_id IS NOT NULL").all() as { customer_id: number }[];
  let wrote = 0;
  for (const { customer_id } of members) {
    if (wrote >= max) break;
    // 10-22 (Neil: 「改回来吧」): the matter page's 今日一卦 is a member's and a pass holder's again — none while paused
    if (!activeMembership(customer_id, now)) continue;
    const casts = threadCastsForCustomer(customer_id, 120);
    const fc = focusCast(casts, now);
    if (!fc?.matter_id) continue;
    const hour = new Date(now + fc.tz_offset * 60_000).getUTCHours();
    if (hour < 6) continue;
    if (cachedDailyLine(customer_id, fc.matter_id, localDay(now, fc.tz_offset))) continue;
    const d = memberDaily(fc, now);
    if (!d) continue;
    if (await writeDailyLine(customer_id, fc, d, now)) wrote++;
  }
  return wrote;
}
