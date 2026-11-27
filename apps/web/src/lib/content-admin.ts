import { db, recordOps } from "./db";
import { logAction } from "./admin-actions";
import { resetResultsCache } from "./results-line";
import { QIAN_SETS } from "./qian-meta";
import { qianByNum } from "./qian";

/**
 * 10-23 进度表 108 ② 内容整理 — three things the admin does with what readers made public:
 *   公开卦例 — 精选 (first in the case lists; never in the outcome records, which list every answer newest first and
 *              pick nothing for looking good) and 撤下／恢复 (gone from every public page at once: they all read live);
 *   应验纪录 — each answered check-in of a public case, read against what the reader actually said; one scored wrong is
 *              set right here, and the change is kept in 操作记录 (from what, to what, why);
 *   今日一籤 — which lot came up each day, and how often.
 * Every change is written to admin_actions; the home page's counts are read again at once.
 */

export type CaseFilter = "live" | "featured" | "hidden" | "withdrawn" | "all";
export interface AdminCase {
  publicId: string; locale: string; tier: string; topic: string | null; framing: string | null; question: string;
  customerId: number | null; publishedAt: number; featuredAt: number | null; hiddenAt: number | null; unpublishedAt: number | null;
  outcome: string | null; revisitStatus: string | null; test: boolean;
}

export function adminCases(filter: CaseFilter = "live", locale: string | null = null, limit = 200): AdminCase[] {
  const where = [
    filter === "live" ? "k.unpublished_at IS NULL AND k.hidden_at IS NULL"
      : filter === "featured" ? "k.featured_at IS NOT NULL AND k.unpublished_at IS NULL AND k.hidden_at IS NULL"
      : filter === "hidden" ? "k.hidden_at IS NOT NULL"
      : filter === "withdrawn" ? "k.unpublished_at IS NOT NULL" : "1 = 1",
    locale ? "k.locale = ?" : "1 = 1",
  ].join(" AND ");
  const rows = db().prepare(`SELECT k.public_id, k.locale, k.tier, k.topic, k.framing, c.question, k.customer_id, k.published_at, k.featured_at, k.hidden_at, k.unpublished_at,
      r.outcome, r.status AS rstatus, COALESCE(cu.test_flag, 0) AS test
    FROM cases k JOIN casts c ON c.id = k.cast_id LEFT JOIN revisits r ON r.session_id = k.session_id LEFT JOIN customers cu ON cu.id = k.customer_id
    WHERE ${where} ORDER BY (k.featured_at IS NOT NULL) DESC, k.featured_at DESC, k.published_at DESC LIMIT ?`).all(...(locale ? [locale, limit] : [limit])) as {
      public_id: string; locale: string; tier: string; topic: string | null; framing: string | null; question: string; customer_id: number | null; published_at: number;
      featured_at: number | null; hidden_at: number | null; unpublished_at: number | null; outcome: string | null; rstatus: string | null; test: number;
    }[];
  return rows.map((r) => ({
    publicId: r.public_id, locale: r.locale, tier: r.tier, topic: r.topic, framing: r.framing, question: r.question, customerId: r.customer_id,
    publishedAt: r.published_at, featuredAt: r.featured_at, hiddenAt: r.hidden_at, unpublishedAt: r.unpublished_at, outcome: r.outcome, revisitStatus: r.rstatus, test: r.test === 1,
  }));
}

export function caseCounts(): { live: number; featured: number; hidden: number; withdrawn: number } {
  const one = (w: string) => (db().prepare(`SELECT COUNT(*) AS n FROM cases k WHERE ${w}`).get() as { n: number }).n;
  return {
    live: one("k.unpublished_at IS NULL AND k.hidden_at IS NULL"),
    featured: one("k.featured_at IS NOT NULL AND k.unpublished_at IS NULL AND k.hidden_at IS NULL"),
    hidden: one("k.hidden_at IS NOT NULL"),
    withdrawn: one("k.unpublished_at IS NOT NULL"),
  };
}

type Result = { ok: true; result: string } | { ok: false; error: string };
const caseRow = (publicId: string) => db().prepare("SELECT public_id, customer_id, featured_at, hidden_at, unpublished_at, framing FROM cases WHERE public_id = ?").get(publicId) as
  { public_id: string; customer_id: number | null; featured_at: number | null; hidden_at: number | null; unpublished_at: number | null; framing: string | null } | undefined;

/** 精选 on or off */
export function featureCase(publicId: string, on: boolean, reason: string, now = Date.now()): Result {
  const c = caseRow(publicId);
  if (!c) return { ok: false, error: "找不到这条卦例" };
  if (on && (c.hidden_at || c.unpublished_at)) return { ok: false, error: "撤下或作者撤回的卦例不能精选" };
  db().prepare("UPDATE cases SET featured_at = ? WHERE public_id = ?").run(on ? now : null, publicId);
  const result = on ? "精选：排在卦例列表最前面" : "取消精选";
  logAction({ customerId: c.customer_id, action: "case_feature", params: { case: publicId, op: on ? "on" : "off" }, reason, ok: true, result }, now);
  return { ok: true, result };
}

/** 撤下 (gone from every public page at once) or 恢复 — the author's own withdrawal is theirs and is not undone here */
export function setCaseHidden(publicId: string, hide: boolean, reason: string, now = Date.now()): Result {
  const c = caseRow(publicId);
  if (!c) return { ok: false, error: "找不到这条卦例" };
  if (!hide && c.unpublished_at) return { ok: false, error: "这条是作者自己撤回的，不能替他恢复" };
  if (hide) db().prepare("UPDATE cases SET hidden_at = ?, featured_at = NULL WHERE public_id = ?").run(c.hidden_at ?? now, publicId);
  else db().prepare("UPDATE cases SET hidden_at = NULL WHERE public_id = ?").run(publicId);
  resetResultsCache();
  recordOps(hide ? "case_hidden" : "case_unhidden", publicId);
  const result = hide ? "撤下：公开页、卦例列表、应验记录马上看不到" : "恢复：重新出现在公开页上";
  logAction({ customerId: c.customer_id, action: "case_hide", params: { case: publicId, op: hide ? "hide" : "show" }, reason, ok: true, result }, now);
  return { ok: true, result };
}

/* ---------------- 应验纪录：逐件核对 ---------------- */

export const OUTCOMES = ["hit", "partial", "miss", "unclear", "open"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OUTCOME_ZH: Record<Outcome | "pending", string> = { hit: "应了", partial: "部分", miss: "没应", unclear: "不确定", open: "还没定", pending: "未答" };
const EVENT_ZH: Record<string, string> = { happened: "发生了", stirred: "有动静没成", nothing: "没发生", open: "还在等" };
// what the reading leaned to (lib/revisit-judge.ts) — the result is the reader's event read against it
const LEAN_ZH: Record<string, string> = { likely: "解读说会成", unlikely: "解读说难成", even: "解读说看条件" };

export interface CheckRecord {
  revisitId: number; publicId: string; locale: string; framing: string | null; question: string; customerId: number | null;
  outcome: Outcome | null; outcomeAt: number | null; event: string | null; lean: string | null; status: string; dueAt: number; timingQuote: string | null;
  fixed: { at: number; from: string; to: string; reason: string } | null;
}

/** the check-ins of live public cases that went out or were answered, newest answer first */
export function recordsToCheck(limit = 150): CheckRecord[] {
  const rows = db().prepare(`SELECT r.id, k.public_id, k.locale, k.framing, c.question, k.customer_id, r.outcome, r.outcome_at, r.event, r.lean, r.status, r.due_at, r.timing_quote
    FROM cases k JOIN casts c ON c.id = k.cast_id JOIN revisits r ON r.session_id = k.session_id
    WHERE k.unpublished_at IS NULL AND k.hidden_at IS NULL AND (r.outcome IS NOT NULL OR r.status = 'sent')
      AND (k.customer_id IS NULL OR k.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))
    ORDER BY COALESCE(r.outcome_at, r.sent_at, r.due_at) DESC LIMIT ?`).all(limit) as {
      id: number; public_id: string; locale: string; framing: string | null; question: string; customer_id: number | null; outcome: string | null; outcome_at: number | null;
      event: string | null; lean: string | null; status: string; due_at: number; timing_quote: string | null;
    }[];
  const fixes = new Map<number, CheckRecord["fixed"]>();
  try {
    for (const a of db().prepare("SELECT at, params_json, reason FROM admin_actions WHERE action = 'outcome_fix' AND ok = 1 ORDER BY at").all() as { at: number; params_json: string; reason: string }[]) {
      const p = JSON.parse(a.params_json) as { revisit?: number; from?: string; to?: string };
      if (p.revisit) fixes.set(Number(p.revisit), { at: a.at, from: p.from ?? "", to: p.to ?? "", reason: a.reason });
    }
  } catch { /* no fixes yet */ }
  return rows.map((r) => ({
    revisitId: r.id, publicId: r.public_id, locale: r.locale, framing: r.framing, question: r.question, customerId: r.customer_id,
    outcome: (OUTCOMES as readonly string[]).includes(r.outcome ?? "") ? (r.outcome as Outcome) : null, outcomeAt: r.outcome_at,
    event: r.event, lean: r.lean, status: r.status, dueAt: r.due_at, timingQuote: r.timing_quote, fixed: fixes.get(r.id) ?? null,
  }));
}
export const eventWord = (e: string | null) => (e ? EVENT_ZH[e] ?? e : null);
export const leanWord = (l: string | null) => (l ? LEAN_ZH[l] ?? l : null);

/** set a check-in's result right — or back to unanswered (`to` = null) */
export function fixOutcome(revisitId: number, to: Outcome | null, reason: string, now = Date.now()): Result {
  const r = db().prepare("SELECT id, customer_id, outcome, outcome_at, session_id FROM revisits WHERE id = ?").get(revisitId) as
    { id: number; customer_id: number | null; outcome: string | null; outcome_at: number | null; session_id: string } | undefined;
  if (!r) return { ok: false, error: "找不到这条回访" };
  if ((r.outcome ?? null) === to) return { ok: false, error: "本来就是这个状态" };
  // the day it was answered stays the reader's; a check-in we mark answered for the first time is dated now
  db().prepare("UPDATE revisits SET outcome = ?, outcome_at = ? WHERE id = ?").run(to, to ? (r.outcome_at ?? now) : null, revisitId);
  resetResultsCache();
  const from = r.outcome ?? "pending";
  const pub = (db().prepare("SELECT public_id FROM cases WHERE session_id = ?").get(r.session_id) as { public_id: string } | undefined)?.public_id ?? null;
  const result = `${OUTCOME_ZH[from as Outcome | "pending"] ?? from} → ${OUTCOME_ZH[(to ?? "pending") as Outcome | "pending"]}`;
  recordOps("outcome_fix", `revisit ${revisitId} ${from} → ${to ?? "pending"}`);
  logAction({ customerId: r.customer_id, action: "outcome_fix", params: { revisit: revisitId, case: pub, from, to: to ?? "pending" }, reason, ok: true, result }, now);
  return { ok: true, result };
}

/* ---------------- 今日一籤：每天抽到哪支 ---------------- */

export interface TqDay { day: string; draws: number; people: number; lots: number; top: { set: string; num: number; title: string; n: number }[] }
const setShort = (id: string) => QIAN_SETS.find((x) => x.id === id)?.short ?? id;
export const lotName = (set: string, num: number): string => {
  const e = qianByNum(num, set);
  const tag = e ? (e.ganzhi ?? e.story ?? "") : "";
  return `${setShort(set)} 第 ${num} 籤${tag ? ` · ${tag}` : ""}`;
};

/** the last `days` days (Taipei), each with its count and its most-drawn lots (`top` of them; all when top = 0) */
export function todayQianDays(days = 30, top = 5, now = Date.now()): TqDay[] {
  try {
    const since = new Date(now + 8 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 10);
    // our own test accounts left out (a sample letter for one of them may draw its lot)
    const notOurs = "subject NOT IN (SELECT 'c:' || id FROM customers WHERE test_flag = 1)";
    const totals = db().prepare(`SELECT day, COUNT(*) AS draws, COUNT(DISTINCT subject) AS people, COUNT(DISTINCT set_id || ':' || num) AS lots FROM tq_draws WHERE day > ? AND ${notOurs} GROUP BY day ORDER BY day DESC`).all(since) as { day: string; draws: number; people: number; lots: number }[];
    const lots = db().prepare(`SELECT day, set_id, num, COUNT(*) AS n FROM tq_draws WHERE day > ? AND ${notOurs} GROUP BY day, set_id, num ORDER BY day DESC, n DESC, num`).all(since) as { day: string; set_id: string; num: number; n: number }[];
    const byDay = new Map<string, { set: string; num: number; title: string; n: number }[]>();
    for (const l of lots) {
      const list = byDay.get(l.day) ?? [];
      if (!top || list.length < top) list.push({ set: l.set_id, num: l.num, title: lotName(l.set_id, l.num), n: l.n });
      byDay.set(l.day, list);
    }
    return totals.map((t) => ({ ...t, top: byDay.get(t.day) ?? [] }));
  } catch { return []; }
}
