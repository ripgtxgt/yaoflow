import { db } from "./db";

/**
 * 匿名「應驗紀錄」(进度表 28, 竞品观察 O24; Neil 10-02: 「先做好、不显示」).
 *
 * What came of a reading's timing, as the reader reported it — the one thing on this site no one can generate. Rules:
 *   - Only readings their owners already chose to publish (公开卦例). A private reading's revisit answer never comes
 *     in here, published or not as an answer; a withdrawn or hidden case drops out the moment it is withdrawn.
 *   - Every answer, newest report first — nothing picked for looking good, and never a percentage. (10-14 进度表 45:
 *     部分 / 還沒定 / 不確定 are listed too; /outcomes shows raw counts, never a rate.)
 *   - What a record carries: the two figures, the kind of matter, the public wording the author wrote (never the
 *     private question), the reading's own timing sentence, the result and the day it was reported. No email, no
 *     name, no session, no casting time — the query below does not even select them.
 *   - Readings of ours (test_flag customers) stay out.
 *   - Shown only with SHOW_OUTCOME_RECORDS=1. Off by default: the pages then render nothing of it (no hidden block,
 *     no JSON-LD) and do not query for it. The admin preview (/admin/outcomes) works either way.
 */
export const outcomeRecordsOn = (): boolean => process.env.SHOW_OUTCOME_RECORDS === "1";

// 10-12 (Neil: 「这个页面是没有再实时更新了吗」): since 10-07 a reader answers with a fact and the score can also be
// partial (有动静没成) or unclear (看条件 / 讯号题, no right or wrong) — they were folded into "pending", so new answers
// looked missing. They are their own states now; the public pages still list only hit and miss.
// 10-14 进度表 45 (Neil 10-14: 打开): every answer is shown now — 應了、部分、沒應、還沒定 (answered "open")、不確定 — and
// "pending" is only a reading nobody has answered yet
export type RecordState = "hit" | "miss" | "partial" | "unclear" | "open" | "pending";

export interface OutcomeRecord {
  publicId: string;
  locale: string;
  tier: string;
  topic: string | null;
  /** the author's public wording, exactly as published — null when they wrote none */
  framing: string | null;
  primary: number;
  changed: number | null;
  /** the reading's timing sentence (or the revisit's quote of it); null when the reading named no window */
  window: string | null;
  windowDays: number | null;
  state: RecordState;
  /** the day the reader answered (settled records only) */
  reportedAt: number | null;
  /** 10-14: the check-in has gone out (its day has come) — counted as due on /outcomes whether answered or not.
   *  10-23 进度表 104 ②: by the window's date — a window that has closed is due even while its letter waits in the queue */
  due: boolean;
  /** 10-23: the window has closed but the check-in letter is still waiting in the queue (held by the daily cap) — not asked yet */
  queued: boolean;
}

const SQL = `SELECT k.public_id, k.locale, k.tier, k.topic, k.framing, k.fields_json, k.published_at,
                    c.primary_num, c.changed_num,
                    r.window_days, r.timing_quote, r.outcome, r.outcome_at, r.status AS revisit_status, r.due_at
             FROM cases k JOIN casts c ON c.id = k.cast_id
             LEFT JOIN revisits r ON r.session_id = k.session_id
             WHERE k.unpublished_at IS NULL AND k.hidden_at IS NULL
               AND (k.customer_id IS NULL OR k.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))`;

interface Row {
  public_id: string; locale: string; tier: string; topic: string | null; framing: string | null; fields_json: string; published_at: number;
  primary_num: number; changed_num: number | null;
  window_days: number | null; timing_quote: string | null; outcome: string | null; outcome_at: number | null;
  revisit_status?: string | null; due_at?: number | null;
}

/** the first sentence of the reading's timing passage — the date it named, in its own words */
function firstSentence(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?(?:[。！？]|[!?](?=\s|$)|\.(?=\s|$)))/);
  const one = (m ? m[1]! : t).trim();
  return one.length > 140 ? `${one.slice(0, 139)}…` : one;
}

export function toRecord(r: Row, now = Date.now()): OutcomeRecord {
  let timing = "";
  try { timing = (JSON.parse(r.fields_json) as Record<string, string>).timing ?? ""; } catch { /* a broken row shows no window */ }
  const window = timing ? firstSentence(timing) : r.timing_quote ? firstSentence(r.timing_quote) : null;
  const state: RecordState = r.outcome === "hit" ? "hit" : r.outcome === "miss" ? "miss" : r.outcome === "partial" ? "partial" : r.outcome === "unclear" ? "unclear" : r.outcome === "open" ? "open" : "pending";
  return {
    publicId: r.public_id, locale: r.locale, tier: r.tier, topic: r.topic, framing: r.framing,
    primary: r.primary_num, changed: r.changed_num,
    window, windowDays: r.window_days,
    state, reportedAt: state === "pending" ? null : r.outcome_at ?? null,
    due: state !== "pending" || r.revisit_status === "sent" || (r.due_at != null && r.due_at <= now),
    queued: state === "pending" && r.revisit_status === "pending" && r.due_at != null && r.due_at <= now,
  };
}

/** Every live public case that named a timing window, in any state — the admin preview's material. */
export function allRecords(): OutcomeRecord[] {
  return (db().prepare(`${SQL} ORDER BY k.published_at DESC`).all() as unknown as Row[]).map((r) => toRecord(r)).filter((x) => x.window);
}

/** Live public cases with no timing window (light readings): they never become records. Counted for the preview. */
export function casesWithoutWindow(): number {
  return (db().prepare(`${SQL}`).all() as unknown as Row[]).map((r) => toRecord(r)).filter((x) => !x.window).length;
}

/** answered by the reader, whatever the answer (10-14 进度表 45: all of them are listed, not only 應了 / 沒應) */
export const answered = (x: OutcomeRecord) => x.state !== "pending";
const settled = answered;
const newestReport = (a: OutcomeRecord, b: OutcomeRecord) => (b.reportedAt ?? 0) - (a.reportedAt ?? 0);

/**
 * The records a page shows: every answered one (應了、部分、沒應、還沒定、不確定 alike) in one language, newest report first.
 * `hex` keeps those whose primary or changed figure is that hexagram.
 */
export function outcomeRecords(opts: { locale: string; hex?: number | null; limit?: number; excludePublicId?: string | null }): OutcomeRecord[] {
  return allRecords()
    .filter((x) => settled(x) && x.locale === opts.locale)
    .filter((x) => !opts.hex || x.primary === opts.hex || x.changed === opts.hex)
    .filter((x) => !opts.excludePublicId || x.publicId !== opts.excludePublicId)
    .sort(newestReport)
    .slice(0, opts.limit ?? 5);
}

/** Records for a page — empty, without touching the database, while the switch is off. */
export function recordsForPage(opts: Parameters<typeof outcomeRecords>[0]): OutcomeRecord[] {
  if (!outcomeRecordsOn()) return [];
  try { return outcomeRecords(opts); } catch { return []; /* no database at build time */ }
}

/**
 * 10-14 进度表 45 /outcomes: the raw counts — check-ins that have gone out, how many readers answered, and each answer.
 * Counts only, never a percentage. `records` is the same list the page shows, so the two always agree.
 */
export interface OutcomeTotals { due: number; reported: number; hit: number; partial: number; miss: number; open: number; unclear: number; notReported: number; queued: number; waiting: number }

/** the counts of any list of records — /outcomes per language, /admin/outcomes per language and per hexagram (10-23) */
export function tallyRecords(rs: OutcomeRecord[]): OutcomeTotals {
  const due = rs.filter((x) => x.due);
  const n = (st: RecordState) => rs.filter((x) => x.state === st).length;
  return {
    due: due.length, reported: rs.filter(answered).length, hit: n("hit"), partial: n("partial"), miss: n("miss"), open: n("open"), unclear: n("unclear"),
    // no answer after the check-in (or none will be asked: skipped, failed) / window closed, the letter still in the queue
    // (10-23 进度表 104 ②: the queued ones were counted as 應期未到)
    notReported: due.filter((x) => !answered(x) && !x.queued).length, queued: due.filter((x) => x.queued).length,
    waiting: rs.filter((x) => !x.due).length,
  };
}

export function outcomeTotals(locale: string, records = allRecords()): OutcomeTotals {
  return tallyRecords(records.filter((x) => x.locale === locale));
}

/** 10-23: a hexagram's counts are /outcomes' own (tallyRecords) — 應了…未回報、已到期待問、應期未到 — no 「未到」 of its own */
export interface HexPreview extends OutcomeTotals { hex: number; shown: OutcomeRecord[] }

/**
 * /admin/outcomes: for each hexagram, what its page lists while the switch is on, and how many records it has.
 * A record counts on both of its figures' pages.
 */
export function outcomePreview(records = allRecords(), perPage = 5): HexPreview[] {
  const out: HexPreview[] = [];
  for (let hex = 1; hex <= 64; hex++) {
    const on = records.filter((x) => x.primary === hex || x.changed === hex);
    if (!on.length) continue;
    out.push({ hex, ...tallyRecords(on), shown: on.filter(settled).sort(newestReport).slice(0, perPage) });
  }
  return out;
}

/** Every answered record of one language, newest report first — the /outcomes list (empty while the switch is off). */
export function allAnswered(locale: string): OutcomeRecord[] {
  if (!outcomeRecordsOn()) return [];
  try { return allRecords().filter((x) => answered(x) && x.locale === locale).sort(newestReport); } catch { return []; }
}
