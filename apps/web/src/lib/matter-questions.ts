import { chatJson } from "./llm";
import { db, recordOps } from "./db";
import { normalizeQ, similarity, SIMILAR_AT } from "./repeat-gate";
import { asLocale, LOCALE_META } from "./locales";

/**
 * 10-01 「一件事」的子題 (Neil: 「一件事这个功能再优化一下」; #838 的 PDF：「AI 幫我看 A 跟 C 是否有關連，我是不是重複問了」).
 * #838's 88 casts all sit in ONE matter, 「和大叔的關係」 — right as a matter, useless as a list. Inside a matter
 * the reader asks a handful of real questions, each many times in new words or for a new time frame
 * (「三個月後我們會怎麼相處」「11月我們會怎麼相處」「12月呢」). Word overlap finds 63 groups in her 88; the
 * meaning is a model's call, as it was for the matter itself (matter-assign.ts). One call per matter, cached
 * until the matter gains a cast; the word rule stands in when the model is slow or down.
 */
export interface QCast { id: number; question: string; created_at: number; locale: string }
export interface QGroup { label: string; ids: number[] }

const TIMEOUT_MS = 9_000;
const MAX_Q = 120;

function ensureTable(): void {
  db().exec(`CREATE TABLE IF NOT EXISTS matter_questions (
    matter_id   INTEGER PRIMARY KEY,
    cast_count  INTEGER NOT NULL,
    groups_json TEXT NOT NULL,
    how         TEXT NOT NULL,
    computed_at INTEGER NOT NULL
  )`);
}

/** The word fallback: identical or near-identical wordings (the gate's own SIMILAR_AT), single-link. */
export function wordGroups(casts: QCast[]): QGroup[] {
  const list = [...casts].sort((a, b) => a.created_at - b.created_at);
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = normalizeQ(list[i]!.question), b = normalizeQ(list[j]!.question);
    if (a === b || similarity(a, b, asLocale(list[i]!.locale)) >= SIMILAR_AT) parent[find(j)] = find(i);
  }
  const g = new Map<number, QCast[]>();
  list.forEach((c, i) => g.set(find(i), [...(g.get(find(i)) ?? []), c]));
  return [...g.values()].map((cs) => ({ label: cs[cs.length - 1]!.question.slice(0, 24), ids: cs.map((c) => c.id) }));
}

export function questionsPrompt(): string {
  return [
    "One person has asked many divination questions about ONE life matter. Group the questions by the underlying question they are really asking.",
    "SAME group: the same question in other words, for another time frame (「三個月後會怎麼相處」 and 「12月會怎麼相處」 are one group), with 他/她 instead of a name, or asked again after a reading.",
    "DIFFERENT group: a different thing they want to know about the same matter — what he feels, when he will reach out, what I should do, whether we will be together — each its own group.",
    "Aim for the groups the person would recognise: usually 3–10 for a long list; never one group per question unless they really are all different.",
    "Give each group a short label in the questions' language, as the person would put it: Chinese/Japanese/Korean at most 14 characters, other languages at most 7 words. No dates, no verdicts.",
    "Every id must appear in exactly one group.",
    'Output JSON only: {"groups":[{"label":"<label>","ids":[<id>,...]}]}',
  ].join("\n");
}

export function parseGroups(raw: string, ids: Set<number>): QGroup[] | null {
  try {
    const j = JSON.parse(raw) as { groups?: { label?: unknown; ids?: unknown }[] };
    if (!Array.isArray(j.groups)) return null;
    const seen = new Set<number>();
    const out: QGroup[] = [];
    for (const g of j.groups) {
      const gids = (Array.isArray(g.ids) ? g.ids : []).map(Number).filter((n) => ids.has(n) && !seen.has(n));
      if (!gids.length) continue;
      gids.forEach((n) => seen.add(n));
      out.push({ label: typeof g.label === "string" ? g.label.trim().replace(/[。．.!！?？]+$/u, "").slice(0, 40) : "", ids: gids });
    }
    // anything the model forgot stands as its own group, so no cast ever disappears from the page
    for (const n of ids) if (!seen.has(n)) out.push({ label: "", ids: [n] });
    return out;
  } catch {
    return null;
  }
}

/** The matter's question groups — cached until the matter gains or loses a cast. */
export async function matterQuestionGroups(matterId: number, casts: QCast[]): Promise<{ groups: QGroup[]; how: "model" | "rule" | "cache" }> {
  ensureTable();
  if (casts.length < 2) return { groups: casts.map((c) => ({ label: "", ids: [c.id] })), how: "rule" };
  const row = db().prepare("SELECT cast_count, groups_json, how FROM matter_questions WHERE matter_id = ?").get(matterId) as { cast_count: number; groups_json: string; how: string } | undefined;
  let cached: QGroup[] | null = null;
  try { cached = row ? (JSON.parse(row.groups_json) as QGroup[]) : null; } catch { cached = null; }
  if (row && cached && row.cast_count === casts.length && row.how === "model") return { groups: cached, how: "cache" };
  // the model failed a moment ago: don't make every view wait on it again
  const rowAt = (db().prepare("SELECT computed_at FROM matter_questions WHERE matter_id = ?").get(matterId) as { computed_at: number } | undefined)?.computed_at ?? 0;
  if (row && cached && row.how === "rule" && row.cast_count === casts.length && Date.now() - rowAt < 15 * 60_000) return { groups: cached, how: "rule" };
  // stale but present: answer now from the cache (new casts placed by the word rule), regroup in the background,
  // so a page view never waits on the model once the matter has been grouped before
  if (cached && row?.how === "model") {
    if (!inflight.has(matterId)) {
      inflight.add(matterId);
      void computeGroups(matterId, casts).finally(() => inflight.delete(matterId));
    }
    return { groups: mergeNew(cached, casts), how: "cache" };
  }
  return computeGroups(matterId, casts);
}

const inflight = new Set<number>();

/** What the cache already knows, no model call (the reading page's matter card): how many questions, and how often this cast's was asked. */
export function cachedQuestionInfo(matterId: number, castId: number | null): { questions: number; thisAsked: number } | null {
  ensureTable();
  const row = db().prepare("SELECT groups_json FROM matter_questions WHERE matter_id = ?").get(matterId) as { groups_json: string } | undefined;
  if (!row) return null;
  try {
    const gs = JSON.parse(row.groups_json) as QGroup[];
    const mine = castId ? gs.find((g) => g.ids.includes(castId)) : undefined;
    return { questions: gs.length, thisAsked: mine?.ids.length ?? 0 };
  } catch {
    return null;
  }
}

/** Cached groups plus casts that came after: each joins the group holding a near-identical wording, else stands alone. Casts moved away drop out. */
export function mergeNew(groups: QGroup[], casts: QCast[]): QGroup[] {
  const byId = new Map(casts.map((c) => [c.id, c]));
  const out = groups.map((g) => ({ label: g.label, ids: g.ids.filter((i) => byId.has(i)) })).filter((g) => g.ids.length);
  const known = new Set(out.flatMap((g) => g.ids));
  for (const c of casts) {
    if (known.has(c.id)) continue;
    const loc = asLocale(c.locale);
    const nq = normalizeQ(c.question);
    const home = out.find((g) => g.ids.some((i) => { const o = normalizeQ(byId.get(i)!.question); return o === nq || similarity(o, nq, loc) >= SIMILAR_AT; }));
    if (home) home.ids.push(c.id);
    else out.push({ label: "", ids: [c.id] });
    known.add(c.id);
  }
  return out;
}

async function computeGroups(matterId: number, casts: QCast[]): Promise<{ groups: QGroup[]; how: "model" | "rule" }> {
  const recent = [...casts].sort((a, b) => b.created_at - a.created_at).slice(0, MAX_Q);
  const ids = new Set(recent.map((c) => c.id));
  const locale = asLocale(recent[0]?.locale);
  let groups: QGroup[] | null = null;
  let how: "model" | "rule" = "rule";
  try {
    const raw = await Promise.race([
      chatJson(
        [
          { role: "system", content: questionsPrompt() },
          { role: "user", content: JSON.stringify({ language: LOCALE_META[locale]?.english ?? locale, questions: recent.map((c) => ({ id: c.id, date: new Date(c.created_at).toISOString().slice(0, 10), q: c.question.slice(0, 160) })) }) },
        ],
        { maxTokens: 1200, temperature: 0, timeoutMs: TIMEOUT_MS, light: true },
      ),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("questions_deadline")), TIMEOUT_MS + 1_000)),
    ]);
    groups = parseGroups(raw, ids);
    if (groups) how = "model";
    else recordOps("matter_q_parse", raw.slice(0, 60));
  } catch (e) {
    recordOps("matter_q_fail", (e instanceof Error ? e.message : "?").slice(0, 80));
  }
  // casts older than the MAX_Q window keep the word grouping
  const older = casts.filter((c) => !ids.has(c.id));
  const all = [...(groups ?? wordGroups(recent)), ...(older.length ? wordGroups(older) : [])];
  // a failed regroup never replaces a model grouping already kept — the next view tries again
  const prev = db().prepare("SELECT how FROM matter_questions WHERE matter_id = ?").get(matterId) as { how: string } | undefined;
  if (how === "rule" && prev?.how === "model") return { groups: all, how };
  db().prepare("INSERT INTO matter_questions (matter_id, cast_count, groups_json, how, computed_at) VALUES (?,?,?,?,?) ON CONFLICT(matter_id) DO UPDATE SET cast_count = excluded.cast_count, groups_json = excluded.groups_json, how = excluded.how, computed_at = excluded.computed_at")
    .run(matterId, casts.length, JSON.stringify(all), how, Date.now());
  return { groups: all, how };
}
