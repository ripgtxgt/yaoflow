import { chatJson } from "./llm";
import {
  castCountInMatter, createMatter, db, matterById, matterCandidates, recordOps, sessionMatter, setCastMatter, setMatterTitle, setSessionMatter,
  type MatterRow,
} from "./db";
import { similarity, normalizeQ, CIRCLING_AT } from "./repeat-gate";
import { asLocale, LOCALE_META, type Locale } from "./locales";
import { classifyTopic } from "./topic";
import { toHans } from "./hant";
import { OTHER_PERSON, soloOf } from "./solo";

/**
 * 09-29 「一件事」 (用户数据与需求全面分析-0929.md §4.1). A reader's casts are
 * filed under the matter they are about, and the filing is stored.
 *
 * The first try was the word-overlap grouping the account page used
 * (lib/matters.ts). On live data it split the heaviest readers apart: one
 * reader's 53 casts about the same man came out as 30 "matters", because
 * 「明年2月會怎麼相處」 shares no content word with 「大叔對我的心結是什麼」.
 * Readers circle one person from many angles and time frames, and name him
 * half the time as just 他. That is a judgement about meaning, so a model makes
 * it: given the reader's open matters and the new question, same matter or a
 * new one, and a short title. The word rules stay as the fallback when the
 * model is slow or down.
 */

export const MATTER_TIMEOUT_MS = 5_000;
/** a matter stays a candidate for this long after its last cast */
export const MATTER_OPEN_DAYS = 30;

type Candidate = MatterRow & { questions: string[] };
/** `solo`: the reader said this cast is a new matter (lib/solo.ts) — decided without the model, never joined */
export interface MatterDecision { matterId: number | null; title: string; how: "model" | "rule"; solo?: true }

const REL = new Set(["relationship"]);

/** The word-rule fallback: overlap with a recent question, or a relationship question right after a relationship matter. */
export function ruleMatter(cands: Candidate[], question: string, topic: string | null, locale: Locale, now = Date.now()): number | null {
  const q = normalizeQ(question);
  for (const m of cands) {
    if (m.questions.some((x) => similarity(normalizeQ(x), q, locale) >= CIRCLING_AT)) return m.id;
  }
  // readers circle one person, often as plain 他/她: a love question within three days of a love matter is that matter —
  // unless it is visibly about someone else (10-22: 「會遇到可以認真交往的人嗎」 is not the matter about him)
  if (topic && REL.has(topic) && !OTHER_PERSON.test(question)) {
    const rel = cands.find((m) => m.topic && REL.has(m.topic) && now - m.last_at < 3 * 86_400_000);
    if (rel) return rel.id;
  }
  return null;
}

/** A plain first title when the model gives none: the question itself, trimmed. */
export function fallbackTitle(question: string, locale: Locale): string {
  const t = question.replace(/\s+/g, " ").trim();
  const cjk = LOCALE_META[locale]?.cjk;
  const max = cjk ? 16 : 48;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function matterSystemPrompt(): string {
  return [
    "You keep one person's divination questions organised by MATTER — the life situation each question is about.",
    "You get the person's open matters (id, title, their latest questions) and one NEW question.",
    "Decide whether the new question belongs to one of those matters.",
    "SAME matter: the same relationship with the same person, the same job hunt, the same decision — even when asked from a new angle, for a different time frame (next month, next year), about what to do, about why, or with 他/她/they instead of a name.",
    "DIFFERENT matter: a different person; a different area of life (a job question is not the love matter); an unrelated event.",
    "In love questions these are DIFFERENT even minutes after a matter about one person: 'will I meet someone', 'is there someone for me', 正緣/桃花, 'the next one', 'a new/future partner', 'someone I just met', 'the other one', a person named or described differently from the matter's (大叔 vs 同事, 前任 vs 現任, A vs B), and any question the person marks as new (全新事件, 另一件事, 不是同一件事, 新認識的, 另一個人).",
    "A plain 他/她/那個人/this person is the same person only when the new question reads as a continuation of that matter's latest questions; people ask about several people in a row without naming any of them.",
    "When you are not sure it is the same person and the same situation, answer null. A question filed under the wrong matter is read as a follow-up about the wrong person — the worst outcome; a new matter that later proves the same costs little.",
    "When two open matters both plainly fit, pick the most recent one.",
    "Also give the matter a short title in the QUESTION's language, the way the person would name it to a friend:",
    "- Chinese/Japanese/Korean: at most 12 characters. Other languages: at most 6 words.",
    "- name the situation, not the question: 「和大叔的關係」「轉職面試」「和前任復合」「Moving to Berlin」.",
    "- keep a name the person used (大叔, Alice); never invent one; no dates, no verdicts, no punctuation at the end.",
    "- if you picked an existing matter, return its title unchanged unless the new question makes it clearly more accurate.",
    'Output JSON only: {"matter": <id number or null>, "title": "<title>"}',
  ].join("\n");
}

export function parseMatterAnswer(raw: string, ids: Set<number>): { matter: number | null; title: string } | null {
  try {
    const j = JSON.parse(raw) as { matter?: unknown; title?: unknown };
    const n = typeof j.matter === "number" ? j.matter : typeof j.matter === "string" && /^\d+$/.test(j.matter) ? Number(j.matter) : null;
    const title = typeof j.title === "string" ? j.title.replace(/[。．.!！?？]+$/u, "").trim().slice(0, 40) : "";
    return { matter: n !== null && ids.has(n) ? n : null, title };
  } catch {
    return null;
  }
}

/** Same matter or a new one (and a title), by the model; the word rules when it cannot answer in time. */
export async function decideMatter(customerId: number, question: string, topic: string | null, locale: Locale, now = Date.now(), opts: { quickWhenAlone?: boolean; solo?: boolean } = {}): Promise<MatterDecision> {
  // 10-22 分開: the reader said this is a new matter (the page's flag, or words like 「全新事件」「不是同一件事」) — no model, never joined
  if (soloOf({ question, solo: opts.solo })) return { matterId: null, title: fallbackTitle(question, locale), how: "rule", solo: true };
  const cands = matterCandidates(customerId, now, MATTER_OPEN_DAYS);
  // nothing open to join: no need to wait on the model before the reading — the title comes afterwards
  if (!cands.length && opts.quickWhenAlone) return { matterId: null, title: fallbackTitle(question, locale), how: "rule" };
  const ids = new Set(cands.map((c) => c.id));
  const lang = LOCALE_META[locale]?.english ?? locale;
  const payload = {
    new_question: question.slice(0, 300),
    question_language: lang,
    today: new Date(now).toISOString().slice(0, 10),
    open_matters: cands.map((c) => ({
      id: c.id,
      title: c.title ?? "",
      last_active: new Date(c.last_at).toISOString().slice(0, 10),
      latest_questions: c.questions.map((q) => q.slice(0, 120)),
    })),
  };
  try {
    // one overall deadline: the provider chain may otherwise try three hosts in turn
    const raw = await Promise.race([
      chatJson(
        [{ role: "system", content: matterSystemPrompt() }, { role: "user", content: JSON.stringify(payload) }],
        { maxTokens: 80, temperature: 0, timeoutMs: MATTER_TIMEOUT_MS, light: true },
      ),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("matter_deadline")), MATTER_TIMEOUT_MS + 1_000)),
    ]);
    const a = parseMatterAnswer(raw, ids);
    if (a) return { matterId: a.matter, title: a.title || fallbackTitle(question, locale), how: "model" };
    recordOps("matter_parse", raw.slice(0, 60));
  } catch (e) {
    recordOps("matter_model_fail", (e instanceof Error ? e.message : "?").slice(0, 80));
  }
  return { matterId: ruleMatter(cands, question, topic, locale, now), title: fallbackTitle(question, locale), how: "rule" };
}

/** Apply a decision: join the matter (maybe retitling it) or open a new one. Returns the matter id. */
function applyDecision(customerId: number, dec: MatterDecision, topic: string | null, at: number): number {
  if (dec.matterId) {
    const m = matterById(dec.matterId);
    // a title the reader wrote is theirs; a model title may be sharpened by a later question
    if (m && m.title_by !== "reader" && dec.how === "model" && dec.title && dec.title !== m.title) setMatterTitle(m.id, dec.title, "model");
    return dec.matterId;
  }
  return createMatter(customerId, dec.title, dec.how, topic, at);
}

const inFlight = new Map<string, Promise<number | null>>();

/**
 * The matter a reading session belongs to, decided once and remembered — the
 * reading page and the fulfilment sweep can both ask, and must agree. Called
 * before the reading is written, so the prompt can see the matter so far.
 */
export function resolveSessionMatter(sessionId: string, customerId: number | null, question: string, topicHint: string | undefined, locale: Locale, solo?: boolean): Promise<number | null> {
  if (!customerId) return Promise.resolve(null);
  const known = sessionMatter(sessionId);
  if (known && matterById(known)) return Promise.resolve(known);
  const running = inFlight.get(sessionId);
  if (running) return running;
  const topic = topicHint ?? classifyTopic(toHans(question));
  const p = (async () => {
    const l = asLocale(locale);
    const dec = await decideMatter(customerId, question, topic, l, Date.now(), { quickWhenAlone: true, solo });
    const id = applyDecision(customerId, dec, topic, Date.now());
    setSessionMatter(sessionId, id, dec.solo ? "reader" : dec.how);
    if (!dec.matterId && dec.how === "rule") void retitle(id, customerId, question, topic, l);
    recordOps("matter_filed", `${customerId} ${dec.matterId ? "join" : dec.solo ? "solo" : "new"} ${dec.how}`);
    return id;
  })().catch((e) => {
    recordOps("matter_fail", (e instanceof Error ? e.message : "?").slice(0, 80));
    return null;
  }).finally(() => inFlight.delete(sessionId));
  inFlight.set(sessionId, p);
  return p;
}

/**
 * File a saved cast. The session's decision when there is one; otherwise the
 * word rules right now (sync, never blocks the save) and the model afterwards
 * to correct it — a cast saved without a signed-in reader still lands in the
 * right place a few seconds later.
 */
export function fileCast(castId: number, sessionId: string | null, customerId: number | null, question: string, topic: string | null, locale: string, solo?: boolean): void {
  if (!customerId) return;
  try {
    // 10-26: a cast already filed (kept at its free line, then read) stays in its matter; the paid session joins it
    const filed = (db().prepare("SELECT matter_id FROM casts WHERE id = ?").get(castId) as { matter_id: number | null } | undefined)?.matter_id;
    if (filed) { if (sessionId) setSessionMatter(sessionId, filed, "cast"); return; }
    const known = sessionId ? sessionMatter(sessionId) : null;
    if (known && matterById(known)) { setCastMatter(castId, known, "session"); return; }
    const l = asLocale(locale);
    const now = Date.now();
    // 10-22 分開: a cast the reader marked as a new matter opens its own, whatever the words share with an open one
    const alone = soloOf({ question, solo });
    const cands = alone ? [] : matterCandidates(customerId, now, MATTER_OPEN_DAYS);
    const rid = alone ? null : ruleMatter(cands, question, topic, l, now);
    const id = rid ?? createMatter(customerId, fallbackTitle(question, l), "rule", topic, now);
    setCastMatter(castId, id, alone ? "reader" : "rule");
    if (sessionId) setSessionMatter(sessionId, id, alone ? "reader" : "rule");
    // the model's second look, off the request path (a solo cast only gets its title)
    if (alone) void retitle(id, customerId, question, topic, l);
    else void refineFiling(castId, id, customerId, question, topic, l, now);
  } catch (e) {
    recordOps("matter_fail", (e instanceof Error ? e.message : "?").slice(0, 80));
  }
}

async function refineFiling(castId: number, ruleId: number, customerId: number, question: string, topic: string | null, locale: Locale, at: number): Promise<void> {
  try {
    const dec = await decideMatter(customerId, question, topic, locale, at);
    if (dec.how !== "model") return;
    const target = dec.matterId ?? null;
    // the rule opened a fresh matter for this cast and the model agrees it is new: only the title improves
    if (target === null && castCountInMatter(ruleId) === 1) {
      const m = matterById(ruleId);
      if (m && m.title_by !== "reader" && dec.title) setMatterTitle(ruleId, dec.title, "model");
      return;
    }
    if (target === ruleId) {
      const m = matterById(ruleId);
      if (m && m.title_by !== "reader" && dec.title) setMatterTitle(ruleId, dec.title, "model");
      return;
    }
    const { moveCast } = await import("./matter-move");
    moveCast(castId, target, customerId, dec.title, "model");
  } catch { /* the rule filing stands */ }
}

/** A fresh matter's title from the model, off the request path (its only cast is this question). */
export async function retitle(matterId: number, customerId: number, question: string, topic: string | null, locale: Locale): Promise<void> {
  try {
    // decide as if nothing else were open: the answer is a title for a new matter
    const dec = await decideMatter(-1, question, topic, locale);
    const m = matterById(matterId);
    if (dec.how === "model" && dec.title && m && m.customer_id === customerId && m.title_by !== "reader") setMatterTitle(matterId, dec.title, "model");
  } catch { /* the plain title stands */ }
}
