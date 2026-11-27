import { fullChart, hexagramByNumber } from "@yaoflow/engine";
import { db, recordOps } from "./db";
import { chatJson, chatText } from "./llm";
import { fallbackTitle, matterSystemPrompt, parseMatterAnswer } from "./matter-assign";
import { CIRCLING_AT, normalizeQ, similarity } from "./repeat-gate";
import { classifyTopic } from "./topic";
import { toHans } from "./hant";
import { OTHER_PERSON, soloOf } from "./solo";
import { isCrisis } from "./crisis";
import { uaSegment } from "./ua-brief";
import { hexName } from "./names";
import { localDay } from "./clock";
import { asLocale, LOCALE_META, type Locale } from "./locales";
import { daysAgo, isTodayScale, RECENT_MS, type MatterSoFarOpts } from "./matter-context";
import { resolveCastInstant, type MatterSoFar, type ReadingInput } from "./reading";


/** node:sqlite run() result: rows changed (typed loosely — older @types/node lack the field) */
const changesOf = (r: unknown): number => Number((r as { changes?: number | bigint }).changes ?? 0);
/**
 * 10-03 起卦记录 (Neil: 「从一个人第一次摇卦开始，记录他的所有问题和卦象，到他第二次，第三次以及之后如果是同一个问题的，
 * 让AI整合所有出相关信息，然后对之后的卦象和付费引导的话术进行不停地学习和优化」→「只改隐私政策，不告诉读者」→
 * 「我需要这个功能的完整实现，不要给我阉割」).
 *
 * Every cast that reaches the free line — or the cap's note in its place — is written here, keyed by the browser id
 * (yf_bid, lib/browsers.ts): the question, the six lines, the instant and clock, the language, the free line shown.
 * Each cast is filed into a THREAD: one matter of one person, the person being this browser plus every browser filed
 * under the same customer. Same matter or a new one is the same judgement the account's matters make (lib/matter-assign:
 * the model, with the word rules as the fallback) — but for everyone, signed in or not, paid or not.
 *
 * What the thread feeds:
 *   - the 2nd+ free line on a matter is written with the earlier casts in view (lib/teaser.ts, 「连起来说」);
 *   - the paid reading of a thread cast reads all of them together (withCastThread → matter_so_far, THREAD_NOTE);
 *   - the words before the price on the 2nd+ cast are learned from who pays (lib/nudge.ts).
 *
 * Kept 365 days. Health, sex-life and criminal-record questions — special-category data under Taiwan's PDPA art. 6 —
 * keep their category, the figure and the time, never their words or their free line, unless CAST_LOG_SENSITIVE=keep
 * (and then the privacy policy must change first). A crisis question is never written at all. CAST_LOG=off stops it all.
 */

export const CAST_LOG_DAYS = 365;
export const THREAD_OPEN_DAYS = 30;
const THREAD_MODEL_MS = 4_000;
/** the earlier casts a free line or a reading is shown (newest kept) */
export const THREAD_PRIORS = 6;

export const castLogOn = (): boolean => (process.env.CAST_LOG ?? "on") !== "off";
export const keepSensitiveText = (): boolean => (process.env.CAST_LOG_SENSITIVE ?? "withhold") === "keep";

export type Sensitive = "health" | "sex" | "crime";
const SEX_RE = /性生活|性行為|性行为|性關係|性关系|做愛|做爱|上床|一夜情|約炮|约炮|援交|性病|\bsex(ual)?\b|セックス|性行為|섹스|성관계|\bsexe\b|\bsexuel|\bsexo\b|\bsexual/i;
const CRIME_RE = /前科|坐牢|入獄|入狱|服刑|判刑|假釋|假释|犯罪紀錄|犯罪记录|刑事案|被起訴|被起诉|criminal record|\bprison\b|\bjail\b|convicted|前科者|전과|교도소|casier judiciaire|vorstrafe|antecedentes penales|ficha criminal/i;

/** Special-category data (Taiwan PDPA art. 6): health and medical, sex life, criminal record. */
export function sensitiveKind(question: string, topic: string | null): Sensitive | null {
  const q = question.normalize("NFKC");
  if (topic === "health") return "health";
  if (SEX_RE.test(q)) return "sex";
  if (CRIME_RE.test(q)) return "crime";
  return null;
}

/* ---------------- whose casts ---------------- */

/** This browser and every browser filed under the same customer(s) — and under the signed-in customer, if any. */
export function personBids(bid: string, customerId?: number | null): string[] {
  const out = new Set<string>([bid]);
  try {
    const rows = db().prepare(
      "SELECT DISTINCT l2.bid FROM browser_links l1 JOIN browser_links l2 ON l2.customer_id = l1.customer_id WHERE l1.bid = ?",
    ).all(bid) as { bid: string }[];
    for (const r of rows) out.add(r.bid);
    if (customerId && customerId > 0) {
      for (const r of db().prepare("SELECT bid FROM browser_links WHERE customer_id = ?").all(customerId) as { bid: string }[]) out.add(r.bid);
    }
  } catch { /* the browser alone */ }
  return [...out];
}

/* ---------------- rows ---------------- */

export interface LogRow {
  id: number; bid: string; s: string | null; at: number; tz: number; locale: string | null; question: string | null; sensitive: string | null;
  values_str: string; primary_num: number; changed_num: number | null; topic: string | null; teaser: string | null; capped: number;
  thread_id: number | null; thread_n: number | null; thread_how: string | null; style: string | null; nudge: string | null; nudge_seen: number | null;
  paid_sid: string | null; created_at: number; updated_at: number;
  /** 10-03 分组: ios / android / desktop; threads / instagram / … / browser; the free line's lean (good / mixed / bad) */
  device: string | null; app: string | null; lean: string | null;
  /** 10-04 按人写的引导: the block written for this reader on this cast, JSON {locale,title,body,cta} */
  nudge_text?: string | null;
  /** 10-04 排除会员: 1 = a membership covered this cast (the page shows no price) */
  member?: number | null;
  /** 10-05 不顺卦话术: the lean of the line the reader had last seen when the block was picked ("bad" — others not kept) */
  nudge_lean?: string | null;
  /** 10-22 分開: 1 = the reader said this cast is a new matter — filed in a thread of its own, its free line and reading see no earlier casts */
  separate?: number | null;
}
export interface ThreadRow { id: number; bid: string; title: string | null; topic: string | null; sensitive: string | null; how: string | null; first_at: number; last_at: number; n: number }

const rowAt = (bid: string, at: number): LogRow | null =>
  (db().prepare("SELECT * FROM cast_log WHERE bid = ? AND at = ?").get(bid, at) as unknown as LogRow | undefined) ?? null;
export const logRow = (id: number): LogRow | null => (db().prepare("SELECT * FROM cast_log WHERE id = ?").get(id) as unknown as LogRow | undefined) ?? null;
export const threadRow = (id: number): ThreadRow | null => (db().prepare("SELECT * FROM cast_threads WHERE id = ?").get(id) as unknown as ThreadRow | undefined) ?? null;

/** The casts of a thread before `at`, oldest first (the newest `limit`). */
export function earlierInThread(threadId: number, at: number, limit = THREAD_PRIORS): LogRow[] {
  return (db().prepare("SELECT * FROM cast_log WHERE thread_id = ? AND at < ? ORDER BY at DESC LIMIT ?").all(threadId, at, limit) as unknown as LogRow[]).reverse();
}
const countBefore = (threadId: number, at: number): number =>
  (db().prepare("SELECT COUNT(*) AS v FROM cast_log WHERE thread_id = ? AND at < ?").get(threadId, at) as { v: number }).v;

function refreshThread(threadId: number): void {
  const d = db();
  const agg = d.prepare("SELECT COUNT(*) AS n, MIN(at) AS a, MAX(at) AS z FROM cast_log WHERE thread_id = ?").get(threadId) as { n: number; a: number | null; z: number | null };
  if (!agg.n) { d.prepare("DELETE FROM cast_threads WHERE id = ?").run(threadId); return; }
  d.prepare("UPDATE cast_threads SET n = ?, first_at = ?, last_at = ? WHERE id = ?").run(agg.n, agg.a, agg.z, threadId);
  // positions follow the casts' own order (a question written after the cast can be filed late)
  const ids = d.prepare("SELECT id FROM cast_log WHERE thread_id = ? ORDER BY at").all(threadId) as { id: number }[];
  const upd = d.prepare("UPDATE cast_log SET thread_n = ? WHERE id = ?");
  ids.forEach((r, i) => upd.run(i + 1, r.id));
}

/* ---------------- same matter or a new one ---------------- */

interface Cand { id: number; title: string | null; topic: string | null; last_at: number; questions: string[] }

function candidates(bids: string[], now: number, sensitive: boolean): Cand[] {
  const ph = bids.map(() => "?").join(",");
  const threads = db().prepare(
    `SELECT * FROM cast_threads WHERE bid IN (${ph}) AND last_at >= ? AND ${sensitive ? "sensitive IS NOT NULL" : "sensitive IS NULL"} ORDER BY last_at DESC LIMIT 8`,
  ).all(...bids, now - THREAD_OPEN_DAYS * 86_400_000) as unknown as ThreadRow[];
  return threads.map((t) => ({
    id: t.id, title: t.title, topic: t.topic, last_at: t.last_at,
    questions: (db().prepare("SELECT question FROM cast_log WHERE thread_id = ? AND question IS NOT NULL ORDER BY at DESC LIMIT 4").all(t.id) as { question: string }[]).map((r) => r.question),
  }));
}

/** The word rules: a near-identical question, or a love question within three days of a love thread. */
export function ruleThread(cands: Cand[], question: string, topic: string | null, locale: Locale, now: number): number | null {
  const q = normalizeQ(question);
  for (const c of cands) if (c.questions.some((x) => similarity(normalizeQ(x), q, locale) >= CIRCLING_AT)) return c.id;
  // 10-22: not when the question is visibly about someone else (lib/solo.ts OTHER_PERSON)
  if (topic === "relationship" && !OTHER_PERSON.test(question)) {
    const rel = cands.find((c) => c.topic === "relationship" && now - c.last_at < 3 * 86_400_000);
    if (rel) return rel.id;
  }
  return null;
}

/** Only the word "matter" decision: same thread (id), or a new one with a title. */
async function decide(cands: Cand[], question: string, topic: string | null, locale: Locale, now: number): Promise<{ id: number | null; title: string; how: "rule" | "model" }> {
  const near = (() => {
    const q = normalizeQ(question);
    return cands.find((c) => c.questions.some((x) => similarity(normalizeQ(x), q, locale) >= CIRCLING_AT))?.id ?? null;
  })();
  if (near) return { id: near, title: "", how: "rule" };
  if (!cands.length) return { id: null, title: fallbackTitle(question, locale), how: "rule" };
  const ids = new Set(cands.map((c) => c.id));
  const payload = {
    new_question: question.slice(0, 300),
    question_language: LOCALE_META[locale]?.english ?? locale,
    today: new Date(now).toISOString().slice(0, 10),
    open_matters: cands.map((c) => ({ id: c.id, title: c.title ?? "", last_active: new Date(c.last_at).toISOString().slice(0, 10), latest_questions: c.questions.map((q) => q.slice(0, 120)) })),
  };
  try {
    const raw = await Promise.race([
      chatJson([{ role: "system", content: matterSystemPrompt() }, { role: "user", content: JSON.stringify(payload) }], { maxTokens: 80, temperature: 0, timeoutMs: THREAD_MODEL_MS, light: true }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("thread_deadline")), THREAD_MODEL_MS + 800)),
    ]);
    const a = parseMatterAnswer(raw, ids);
    if (a) return { id: a.matter, title: a.title || fallbackTitle(question, locale), how: "model" };
    recordOps("thread_parse", raw.slice(0, 60));
  } catch (e) {
    recordOps("thread_model_fail", (e instanceof Error ? e.message : "?").slice(0, 80));
  }
  return { id: ruleThread(cands, question, topic, locale, now), title: fallbackTitle(question, locale), how: "rule" };
}

/* ---------------- writing a cast ---------------- */

export interface ThreadInfo {
  logId: number;
  threadId: number;
  /** this cast's place on its matter (1 = the first) */
  n: number;
  how: string;
  title: string | null;
  /** the earlier casts on the matter, oldest first (the newest THREAD_PRIORS) */
  earlier: LogRow[];
  firstAt: number;
  row: LogRow;
}

const inFlight = new Map<string, Promise<ThreadInfo | null>>();

function infoFor(row: LogRow): ThreadInfo | null {
  if (!row.thread_id) return null;
  const t = threadRow(row.thread_id);
  if (!t) return null;
  return { logId: row.id, threadId: t.id, n: row.thread_n ?? 1, how: row.thread_how ?? t.how ?? "rule", title: t.title, earlier: earlierInThread(t.id, row.at), firstAt: t.first_at, row };
}

/**
 * Write one cast and file it. Idempotent per browser and instant: asking again returns the same filing (a refresh, a
 * second language) — unless the question itself changed (written after the cast, then edited), which files it afresh.
 */
export function logCast(opts: { bid: string; s?: string | null; customerId?: number | null; input: ReadingInput; locale: Locale; capped?: boolean; now?: number; ua?: string | null; member?: boolean; /** 10-14 进度表 46 */ outcomeHint?: string | null; /** 10-22 分開 (lib/solo.ts): the reader said this cast is a new matter */ separate?: boolean }): Promise<ThreadInfo | null> {
  if (!castLogOn()) return Promise.resolve(null);
  const question = (opts.input.question ?? "").trim();
  if (question.length < 2 || isCrisis(question)) return Promise.resolve(null);
  const { castAt, tz } = resolveCastInstant(opts.input);
  const key = `${opts.bid}:${castAt}`;
  const running = inFlight.get(key);
  if (running) return running;
  const p = (async () => {
    const now = opts.now ?? Date.now();
    const d = db();
    const topic = opts.input.topicHint ?? classifyTopic(toHans(question));
    const sens = sensitiveKind(question, topic);
    const storedQ = sens && !keepSensitiveText() ? null : question.slice(0, 450);
    const existing = rowAt(opts.bid, castAt);
    const seg = opts.ua !== undefined ? uaSegment(opts.ua) : null;
    // 10-22 分開: the page's tap, or the reader's own words (「全新事件」「不是同一件事」) — a cast already filed under an open
    // thread is filed afresh in one of its own; a cast already separate stays so
    const solo = soloOf({ question, solo: opts.separate });
    if (existing && existing.thread_id && existing.question === storedQ && existing.sensitive === (sens ?? null) && (!solo || existing.separate)) {
      if (opts.capped && !existing.capped) d.prepare("UPDATE cast_log SET capped = 1, updated_at = ? WHERE id = ?").run(now, existing.id);
      if (opts.s && !existing.s) d.prepare("UPDATE cast_log SET s = ? WHERE id = ?").run(opts.s, existing.id);
      if (seg && !existing.device) d.prepare("UPDATE cast_log SET device = ?, app = ? WHERE id = ?").run(seg.device, seg.app, existing.id);
      if (opts.member && !existing.member) d.prepare("UPDATE cast_log SET member = 1 WHERE id = ?").run(existing.id);
      return infoFor(rowAt(opts.bid, castAt) ?? existing);
    }
    const chart = fullChart({ values: opts.input.values, utcMs: castAt, tzOffsetMinutes: tz });
    const bids = personBids(opts.bid, opts.customerId);
    const l = asLocale(opts.locale);
    // a question that changed after it was filed leaves its old thread first
    if (existing?.thread_id) {
      d.prepare("UPDATE cast_log SET thread_id = NULL, thread_n = NULL WHERE id = ?").run(existing.id);
      refreshThread(existing.thread_id);
    }
    let threadId: number | null = null;
    let how: "rule" | "model" | "reader" = "rule";
    let title = "";
    if (solo) {
      how = "reader";
      title = sens ? `[${sens}]` : fallbackTitle(question, l);
    } else if (sens) {
      // no words to compare: the same kind of matter within the open window is the same thread
      const t = d.prepare(
        `SELECT id FROM cast_threads WHERE bid IN (${bids.map(() => "?").join(",")}) AND sensitive = ? AND last_at >= ? ORDER BY last_at DESC LIMIT 1`,
      ).get(...bids, sens, now - THREAD_OPEN_DAYS * 86_400_000) as { id: number } | undefined;
      threadId = t?.id ?? null;
      title = `[${sens}]`;
    } else {
      const dec = await decide(candidates(bids, now, false), question, topic, l, now);
      threadId = dec.id;
      how = dec.how;
      title = dec.title;
    }
    if (threadId === null) {
      threadId = Number(d.prepare(
        "INSERT INTO cast_threads (bid, title, topic, sensitive, how, first_at, last_at, n) VALUES (?,?,?,?,?,?,?,0)",
      ).run(opts.bid, title.slice(0, 40) || null, topic, sens, how, castAt, castAt).lastInsertRowid);
    } else if (how === "model" && title && !sens) {
      d.prepare("UPDATE cast_threads SET title = ? WHERE id = ?").run(title.slice(0, 40), threadId);
    }
    const n = countBefore(threadId, castAt) + 1;
    if (existing) {
      d.prepare(
        `UPDATE cast_log SET s = COALESCE(?, s), tz = ?, locale = ?, question = ?, sensitive = ?, values_str = ?, primary_num = ?, changed_num = ?, topic = ?,
           teaser = NULL, style = NULL, nudge = NULL, nudge_seen = NULL, nudge_text = NULL, lean = NULL, capped = ?, thread_id = ?, thread_n = ?, thread_how = ?, separate = ?,
           device = COALESCE(?, device), app = COALESCE(?, app), updated_at = ? WHERE id = ?`,
      ).run(opts.s ?? null, tz, l, storedQ, sens, opts.input.values.join(""), chart.cast.primary.number, chart.cast.changed?.number ?? null, topic,
        opts.capped ? 1 : 0, threadId, n, how, solo ? 1 : 0, seg?.device ?? null, seg?.app ?? null, now, existing.id);
    } else {
      try {
        d.prepare(
          `INSERT INTO cast_log (bid, s, at, tz, locale, question, sensitive, values_str, primary_num, changed_num, topic, capped, thread_id, thread_n, thread_how, separate, device, app, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(opts.bid, opts.s ?? null, castAt, tz, l, storedQ, sens, opts.input.values.join(""), chart.cast.primary.number, chart.cast.changed?.number ?? null, topic,
          opts.capped ? 1 : 0, threadId, n, how, solo ? 1 : 0, seg?.device ?? null, seg?.app ?? null, now, now);
      } catch {
        // written by a request that was not in this process's map — read what it filed
        const again = rowAt(opts.bid, castAt);
        return again ? infoFor(again) : null;
      }
    }
    // 10-04 排除会员: a cast a membership covered stays out of the conversion numbers (lib/stage-funnel.ts cohort)
    if (opts.member) d.prepare("UPDATE cast_log SET member = 1 WHERE bid = ? AND at = ?").run(opts.bid, castAt);
    // 10-14 进度表 46: 「怎樣算有結果？」 in the reader's words — private, like the question
    const hint = cleanOutcomeHint(opts.outcomeHint);
    if (hint) d.prepare("UPDATE cast_log SET outcome_hint = ? WHERE bid = ? AND at = ?").run(hint, opts.bid, castAt);
    refreshThread(threadId);
    const row = rowAt(opts.bid, castAt);
    if (!row) return null;
    if ((row.thread_n ?? 1) >= 2) recordOps("thread_cast", `${opts.bid.slice(0, 6)} #${threadId} n=${row.thread_n} ${how}`);
    if (solo && existing?.thread_id) recordOps("thread_separate", `${opts.bid.slice(0, 6)} #${existing.thread_id} → #${threadId}`);
    return infoFor(row);
  })().catch((e) => {
    recordOps("cast_log_fail", (e instanceof Error ? e.message : "?").slice(0, 120));
    return null;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/** The free line that was shown for this cast (never for a special-category question unless CAST_LOG_SENSITIVE=keep). */
export function setLogTeaser(logId: number, teaser: string | null, style: string | null): void {
  try {
    const r = logRow(logId);
    if (!r) return;
    const keep = !r.sensitive || keepSensitiveText();
    db().prepare("UPDATE cast_log SET teaser = ?, style = ?, updated_at = ? WHERE id = ?").run(keep ? teaser?.slice(0, 300) ?? null : null, style, Date.now(), logId);
  } catch { /* the line was still shown */ }
}

/**
 * 10-03 分组 (lib/segments.ts): did the free line lean toward what the reader hoped (good), against it (bad), or turn on a
 * condition / not answer an outcome at all (mixed)? A light model, one word, off the request path. Never for a
 * special-category question (its line is not kept either).
 */
export type Lean = "good" | "mixed" | "bad";
export async function classifyLean(logId: number, line: string, question: string): Promise<Lean | null> {
  try {
    const r = logRow(logId);
    if (!r || r.sensitive) return null;
    if (r.lean) return r.lean as Lean;
    const raw = await chatText([
      { role: "system", content: "You read one free sentence an I Ching site gave a reader about their question. Does it lean toward the outcome the reader hopes for? Answer with exactly one word: good (it tends to happen / goes their way), bad (it tends not to / goes against them), or mixed (it turns on a condition, is unclear, or the question does not ask about an outcome)." },
      { role: "user", content: JSON.stringify({ question: question.slice(0, 300), sentence: line.slice(0, 300) }) },
    ], { maxTokens: 4, temperature: 0, timeoutMs: 8_000, light: true });
    const m = (raw ?? "").toLowerCase().match(/\b(good|mixed|bad)\b/);
    if (!m) return null;
    db().prepare("UPDATE cast_log SET lean = ? WHERE id = ? AND sensitive IS NULL").run(m[1], logId);
    return m[1] as Lean;
  } catch {
    return null;
  }
}

export function setLogNudge(logId: number, variant: string | null): void {
  try { db().prepare("UPDATE cast_log SET nudge = ?, updated_at = ? WHERE id = ?").run(variant, Date.now(), logId); } catch { /* best-effort */ }
}

/** 10-05 不顺卦话术: the lean of the line the reader had last seen when this cast's block was picked (lib/nudge.ts leanSeen). */
export function setLogNudgeLean(logId: number, lean: string | null): void {
  try { db().prepare("UPDATE cast_log SET nudge_lean = ? WHERE id = ?").run(lean, logId); } catch { /* best-effort */ }
}

/** The page really showed the words before the price (nudge_shown): only these count for the learner. */
export function confirmNudgeSeen(bid: string, variant: string, now = Date.now()): boolean {
  try {
    const r = db().prepare(
      "UPDATE cast_log SET nudge_seen = 1, updated_at = ? WHERE id = (SELECT id FROM cast_log WHERE bid = ? AND nudge = ? AND created_at >= ? ORDER BY at DESC LIMIT 1)",
    ).run(now, bid, variant, now - 6 * 3_600_000);
    return changesOf(r) > 0;
  } catch {
    return false;
  }
}

/* ---------------- what the cast page and the prompts see ---------------- */

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

function hexLabel(primary: number, changed: number | null, locale: Locale): string {
  const p = hexagramByNumber(primary);
  const c = changed ? hexagramByNumber(changed) : null;
  return `${p ? hexName(p, locale) : ""}${c ? ` → ${hexName(c, locale)}` : ""}`;
}

/** For the free line: the earlier casts on this matter, as the model sees them (no dates are asked of it). */
export interface ThreadPriors {
  cast_number: number;
  earlier_casts: { date: string; question: string; hexagram: string; free_line: string | null }[];
}
export function priorsFor(info: ThreadInfo, locale: Locale): ThreadPriors {
  return {
    cast_number: info.n,
    earlier_casts: info.earlier.map((r) => ({
      date: localDay(r.at, r.tz),
      question: r.question ? clip(r.question, 140) : `(${r.sensitive ?? "private"} question — words not kept)`,
      hexagram: hexLabel(r.primary_num, r.changed_num, locale),
      free_line: r.teaser ? clip(r.teaser, 120) : null,
    })),
  };
}

/**
 * 10-04 按人写的引导 (lib/nudge.ts personalBlock; Neil: 「像这种用户，AI会根据他前几次的问题和卦象来自动调整引导下一次摇卦的付费
 * 引导吗？」→「要」): this reader's matter cast by cast — what they asked, the figure, the free line and how it leaned, or
 * that the day's limit gave none — the only facts their own block before the price may use.
 */
export interface PersonalFacts {
  this_cast_number: number;
  days_asking: number;
  earlier_casts: { date: string; question: string; figure: string; free_line: string | null; free_line_leaned: string }[];
  this_cast: { date: string; question: string; figure: string; free_line: string | null; free_line_leaned: string };
}
const LEANED: Record<string, string> = { good: "toward what they hoped", mixed: "on a condition / not clearly either way", bad: "against what they hoped" };
export function personalFacts(info: ThreadInfo, locale: Locale, now = Date.now()): PersonalFacts {
  const one = (r: LogRow, current: boolean) => ({
    date: localDay(r.at, r.tz),
    question: r.question ? clip(r.question, 140) : `(${r.sensitive ?? "private"} question — words not kept)`,
    figure: hexLabel(r.primary_num, r.changed_num, locale),
    free_line: r.teaser ? clip(r.teaser, 120) : null,
    free_line_leaned: r.capped && !r.teaser ? "no free line: the day's limit on this kind of question was reached"
      : r.teaser ? (r.lean ? LEANED[r.lean] ?? "not judged" : "not judged")
      // this cast's line is being written alongside the block: it IS shown, only its words are not known here (10-04: the
      // first live blocks read "being shown now (not known here)" as "no line today" and said so — false)
      : current ? "this cast DOES show a free line, right above this block — its words are not given here" : "no free line shown",
  });
  return { this_cast_number: info.n, days_asking: spanDays(info, now), earlier_casts: info.earlier.map((r) => one(r, false)), this_cast: one(info.row, true) };
}

/** For the cast page: which cast this is on the matter, and the figures that came before (newest five). */
export interface ThreadView { n: number; first: string; chain: { day: string; hex: string }[] }
export function threadView(info: ThreadInfo, locale: Locale): ThreadView {
  const tz = info.row.tz;
  return {
    n: info.n,
    first: localDay(info.firstAt, tz),
    // the page writes the day in the reader's own style (10/1, 1.10., …)
    chain: info.earlier.slice(-5).map((r) => ({ day: localDay(r.at, r.tz), hex: hexLabel(r.primary_num, null, locale) })),
  };
}

/** Calendar days the matter has spanned so far, in the reader's own clock (1 = today only). */
export function spanDays(info: ThreadInfo, now = Date.now()): number {
  const a = Date.parse(localDay(info.firstAt, info.row.tz));
  const b = Date.parse(localDay(now, info.row.tz));
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/* ---------------- the paid reading ---------------- */

/** The cast a reading was bought for: by the buyer's browser (their tab → browser id), else by its exact instant and words. */
export function logRowForReading(input: Pick<ReadingInput, "question" | "castAtMs">, browserSid: string | null | undefined): LogRow | null {
  try {
    const d = db();
    const at = Number(input.castAtMs);
    if (!Number.isFinite(at)) return null;
    const bid = browserSid ? (d.prepare("SELECT bid FROM tab_browsers WHERE s = ?").get(browserSid) as { bid: string } | undefined)?.bid ?? null : null;
    if (bid) {
      const own = personBids(bid);
      const ph = own.map(() => "?").join(",");
      return (d.prepare(`SELECT * FROM cast_log WHERE bid IN (${ph}) AND at = ? ORDER BY id LIMIT 1`).get(...own, at) as unknown as LogRow | undefined) ?? null;
    }
    // no browser known (an old link, cookies off): the instant to the millisecond and the same words
    return (d.prepare("SELECT * FROM cast_log WHERE at = ? AND question = ? ORDER BY id LIMIT 1").get(at, (input.question ?? "").trim().slice(0, 450)) as unknown as LogRow | undefined) ?? null;
  } catch {
    return null;
  }
}

/** A reading someone paid for (Stripe checkout cs_…, or Apple / Google Pay on the page pi_…) — not a grant, gift, reward or allowance. */
export const isPaidSession = (sid: string | null | undefined): boolean => !!sid && (sid.startsWith("cs_") || sid.startsWith("pi_"));

const sameCast = (a: { date: string; question: string }, b: { date: string; question: string }) =>
  a.date === b.date && normalizeQ(a.question.replace(/…$/, "")).slice(0, 40) === normalizeQ(b.question.replace(/…$/, "")).slice(0, 40);

/**
 * What a paid reading sees of its matter: the account's own matter (earlier paid readings and notes, lib/matter-context)
 * merged with the free casts of the thread this cast was filed in — each with the one line the reader was shown
 * (tier `free_line`), or none when the cap held it back (`cast_only`). Marks the cast as bought.
 */
export function withCastThread(sid: string, rec: { input: ReadingInput; browserSid?: string | null; locale: Locale }, soFar: MatterSoFar | undefined, opts: MatterSoFarOpts = {}): MatterSoFar | undefined {
  try {
    // 10-04 进度表 30: the reader switched this matter's record off — the free casts of its thread stay out too
    if (soFar?.no_context) return soFar;
    // 10-22 分開: the reader said this cast is a new matter — nothing of the browser's threads either
    if (soloOf(rec.input)) return soFar;
    const row = logRowForReading(rec.input, rec.browserSid);
    if (!row?.thread_id) return soFar;
    if (row.separate) return soFar;
    // the reading this cast got — a paid one wins over a free one that came first (a free light reading, then the deep one bought)
    if (!row.paid_sid || (!isPaidSession(row.paid_sid) && isPaidSession(sid))) db().prepare("UPDATE cast_log SET paid_sid = ? WHERE id = ?").run(sid.slice(0, 120), row.id);
    // the block before the price promised "these N casts read together": the reading is given all of them (up to 20) —
    // 10-04: a "today" question, only those of the last 72 hours, like the rest of its matter (lib/matter-context.ts)
    const earlier = earlierInThread(row.thread_id, row.at, 20).filter((r) => !isTodayScale(opts.scale) || (opts.at ?? row.at) - r.at <= RECENT_MS);
    if (!earlier.length) return soFar;
    const l = asLocale(rec.locale);
    const fromThread = earlier.map((r) => ({
      date: localDay(r.at, r.tz),
      days_ago: daysAgo(r.at, row.at, r.tz),
      question: r.question ? clip(r.question, 140) : `(${r.sensitive ?? "private"} question — words not kept)`,
      hexagram: hexLabel(r.primary_num, r.changed_num, l),
      tier: r.teaser ? "free_line" : "cast_only",
      call: r.teaser ? clip(r.teaser, 200) : "",
    }));
    const base = soFar?.earlier_casts ?? [];
    const merged = [...base];
    for (const c of fromThread) if (!base.some((b) => sameCast(b, c))) merged.push(c);
    merged.sort((a, b) => a.date.localeCompare(b.date));
    const before = countBefore(row.thread_id, row.at);
    const t = threadRow(row.thread_id);
    return {
      title: soFar?.title || (t?.title && !t.title.startsWith("[") ? t.title : ""),
      earlier_casts: merged.slice(-20),
      reader_notes: soFar?.reader_notes ?? [],
      casts_before: Math.max(before, base.length),
      ...(soFar?.background ? { background: soFar.background } : {}),
    };
  } catch (e) {
    recordOps("cast_thread_fail", (e instanceof Error ? e.message : "?").slice(0, 120));
    return soFar;
  }
}

/* ---------------- 10-22 分開 from the reading page ---------------- */

/**
 * 10-23 进度表 98 (客服 #510): 「分錯了？合併回去」 — the browser's record follows the cast back: its log row rejoins the
 * thread of a cast that is in the matter it returns to (any of `siblingSids`, same browser), and the thread the split
 * made for it goes when it is empty. Nothing to rejoin (the siblings were cast elsewhere, or logging is off) → the row
 * stays as it is.
 */
export function rejoinLogRowForCast(sid: string, cast: { castAt: number; values: string }, siblingSids: string[]): boolean {
  try {
    const d = db();
    const row = (d.prepare("SELECT * FROM cast_log WHERE paid_sid = ? ORDER BY id DESC LIMIT 1").get(sid) as unknown as LogRow | undefined)
      ?? (d.prepare("SELECT * FROM cast_log WHERE at = ? AND values_str = ? ORDER BY id DESC LIMIT 1").get(cast.castAt, cast.values.replace(/,/g, "")) as unknown as LogRow | undefined);
    if (!row) return false;
    let target: number | null = null;
    for (const s of siblingSids) {
      const r = d.prepare("SELECT thread_id FROM cast_log WHERE paid_sid = ? AND thread_id IS NOT NULL AND bid = ? ORDER BY id DESC LIMIT 1").get(s, row.bid) as { thread_id: number } | undefined;
      if (r?.thread_id && r.thread_id !== row.thread_id) { target = r.thread_id; break; }
    }
    if (!target) return false;
    const old = row.thread_id;
    d.prepare("UPDATE cast_log SET thread_id = ?, thread_how = 'reader', separate = 0, updated_at = ? WHERE id = ?").run(target, Date.now(), row.id);
    refreshThread(target);
    if (old) refreshThread(old);
    recordOps("thread_rejoin", `${row.bid.slice(0, 6)} #${old ?? "-"} → #${target} page`);
    return true;
  } catch (e) {
    recordOps("cast_thread_fail", (e instanceof Error ? e.message : "?").slice(0, 120));
    return false;
  }
}

/**
 * The reader said, on the reading page, that this cast is not the matter it was filed under: the browser's log row leaves
 * its thread for one of its own (how `reader`, `separate` = 1), so the next cast is not read against it either and a
 * re-read sees nothing of it. Found by the reading session first (set when the reading was written), else by the cast's
 * instant and lines. Returns whether a row was moved.
 */
export function separateLogRowForCast(sid: string, cast: { castAt: number; values: string }): boolean {
  try {
    const d = db();
    const row = (d.prepare("SELECT * FROM cast_log WHERE paid_sid = ? ORDER BY id DESC LIMIT 1").get(sid) as unknown as LogRow | undefined)
      ?? (d.prepare("SELECT * FROM cast_log WHERE at = ? AND values_str = ? ORDER BY id DESC LIMIT 1").get(cast.castAt, cast.values.replace(/,/g, "")) as unknown as LogRow | undefined);
    if (!row) return false;
    if (row.separate && row.thread_id && countBefore(row.thread_id, row.at) === 0) return false;
    const old = row.thread_id;
    const t = old ? threadRow(old) : null;
    const title = row.sensitive ? `[${row.sensitive}]` : row.question ? fallbackTitle(row.question, asLocale(row.locale)) : t?.title ?? null;
    const threadId = Number(d.prepare(
      "INSERT INTO cast_threads (bid, title, topic, sensitive, how, first_at, last_at, n) VALUES (?,?,?,?,?,?,?,0)",
    ).run(row.bid, title ? title.slice(0, 40) : null, row.topic, row.sensitive, "reader", row.at, row.at).lastInsertRowid);
    d.prepare("UPDATE cast_log SET thread_id = ?, thread_n = 1, thread_how = 'reader', separate = 1, updated_at = ? WHERE id = ?").run(threadId, Date.now(), row.id);
    refreshThread(threadId);
    if (old) refreshThread(old);
    recordOps("thread_separate", `${row.bid.slice(0, 6)} #${old ?? "-"} → #${threadId} page`);
    return true;
  } catch (e) {
    recordOps("cast_thread_fail", (e instanceof Error ? e.message : "?").slice(0, 120));
    return false;
  }
}

/** Whether the browser's log row of this cast had earlier casts in its thread when the reading was written. */
export function logThreadHadEarlier(sid: string, cast: { castAt: number; values: string }): boolean {
  try {
    const d = db();
    const row = (d.prepare("SELECT * FROM cast_log WHERE paid_sid = ? ORDER BY id DESC LIMIT 1").get(sid) as unknown as LogRow | undefined)
      ?? (d.prepare("SELECT * FROM cast_log WHERE at = ? AND values_str = ? ORDER BY id DESC LIMIT 1").get(cast.castAt, cast.values.replace(/,/g, "")) as unknown as LogRow | undefined);
    return !!row?.thread_id && !row.separate && countBefore(row.thread_id, row.at) > 0;
  } catch {
    return false;
  }
}

/* ---------------- housekeeping ---------------- */

/** The 365-day limit, and threads left empty. */
export function purgeCastLog(now = Date.now()): number {
  const d = db();
  const r = d.prepare("DELETE FROM cast_log WHERE created_at < ?").run(now - CAST_LOG_DAYS * 86_400_000);
  d.prepare("DELETE FROM cast_threads WHERE id NOT IN (SELECT DISTINCT thread_id FROM cast_log WHERE thread_id IS NOT NULL)").run();
  return changesOf(r);
}

/** 「删除这个浏览器的起卦记录」 (admin, on a reader's request): one browser's casts and threads. */
export function eraseBrowserCasts(bid: string): number {
  const d = db();
  const touched = (d.prepare("SELECT DISTINCT thread_id AS t FROM cast_log WHERE bid = ? AND thread_id IS NOT NULL").all(bid) as { t: number }[]).map((x) => x.t);
  const r = d.prepare("DELETE FROM cast_log WHERE bid = ?").run(bid);
  // the threads this browser began go with it; casts of their other browsers in them are moved to no thread
  const own = (d.prepare("SELECT id FROM cast_threads WHERE bid = ?").all(bid) as { id: number }[]).map((x) => x.id);
  for (const id of own) d.prepare("UPDATE cast_log SET thread_id = NULL, thread_n = NULL WHERE thread_id = ?").run(id);
  d.prepare("DELETE FROM cast_threads WHERE bid = ?").run(bid);
  // a thread another browser of theirs began may have held this browser's casts: renumber what is left
  for (const id of touched) if (!own.includes(id)) refreshThread(id);
  try { d.prepare("DELETE FROM browser_net WHERE bid = ?").run(bid); } catch { /* 10-31 进度表 130 */ }
  recordOps("cast_log_erased", `${bid.slice(0, 6)} rows=${changesOf(r)}`);
  return changesOf(r);
}

/** For /admin/nudges: what the log holds lately — casts by their place on a matter, how many were bought, blocks shown. */
export interface CastLogSummary { casts: number; people: number; byN: { k: string; casts: number; paid: number; nudged: number }[]; sensitive: number }
export function castLogSummary(since: number): CastLogSummary {
  const d = db();
  const rows = d.prepare("SELECT bid, thread_n AS n, paid_sid AS p, nudge_seen AS s, sensitive FROM cast_log WHERE created_at >= ?").all(since) as { bid: string; n: number | null; p: string | null; s: number | null; sensitive: string | null }[];
  const k = (n: number | null) => (!n || n <= 1 ? "1" : n === 2 ? "2" : n === 3 ? "3" : "4+");
  const byN = ["1", "2", "3", "4+"].map((key) => {
    const g = rows.filter((r) => k(r.n) === key);
    return { k: key, casts: g.length, paid: g.filter((r) => r.p).length, nudged: g.filter((r) => r.s === 1).length };
  });
  return { casts: rows.length, people: new Set(rows.map((r) => r.bid)).size, byN, sensitive: rows.filter((r) => r.sensitive).length };
}

/** One person's casts for the dashboard trail, oldest first. */
export function castsOfBids(bids: string[], since = 0): LogRow[] {
  if (!bids.length) return [];
  const ph = bids.map(() => "?").join(",");
  return db().prepare(`SELECT * FROM cast_log WHERE bid IN (${ph}) AND at >= ? ORDER BY at`).all(...bids, since) as unknown as LogRow[];
}

export { hexLabel };


/** 10-14 进度表 46: the reader's own 「怎樣算有結果？」 — trimmed to one short line; nothing for a crisis line. */
export function cleanOutcomeHint(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const t = x.replace(/\s+/g, " ").trim().slice(0, 60);
  if (t.length < 2 || isCrisis(t)) return null;
  return t;
}

export { outcomeHintFor as outcomeHintForCast } from "./db";
