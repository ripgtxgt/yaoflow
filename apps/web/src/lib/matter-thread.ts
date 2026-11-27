import { hexagramByNumber } from "@yaoflow/engine";
import { db, threadCastsForCustomer } from "./db";
import { looksLikeReply, REPLY_WINDOW_MS } from "./reply-like";
import { normalizeQ, similarity, CIRCLING_AT } from "./repeat-gate";
import { hexName } from "./names";
import { asLocale, type Locale } from "./locales";
import { classifyTopic, type Topic } from "./topic";
import { toHans } from "./hant";
import { pick, type PriorReading } from "./reading";

/**
 * 09-26 同一件事的连续性 (Neil: 「让相同的事情的卦象都有连续性」). For a
 * signed-in reader, the most recent reading of theirs on the same matter —
 * server-side, so it holds across devices. Same matter means: a reply-like
 * question within 6 hours (answers the last reading, whatever its topic), or
 * wording that overlaps an earlier question within 24 hours, or the same
 * (non-"other") topic within 6 hours.
 */
export const THREAD_WINDOW_MS = 24 * 3_600_000;

export interface ThreadHit { sid: string | null; question: string; at: number; hex: string; call: string; tier: string }

export function recentThread(customerId: number, question: string, topic: Topic | undefined, now = Date.now()): ThreadHit | null {
  const casts = threadCastsForCustomer(customerId, 40).filter((c) => c.tier && now - c.created_at < THREAD_WINDOW_MS && c.created_at <= now);
  if (!casts.length) return null;
  const nq = normalizeQ(question);
  const t = topic ?? classifyTopic(toHans(question));
  const reply = looksLikeReply(question);
  const hit =
    (reply ? casts.find((c) => now - c.created_at < REPLY_WINDOW_MS) : undefined)
    ?? casts.find((c) => similarity(normalizeQ(c.question), nq, asLocale(c.locale)) >= CIRCLING_AT)
    ?? (t !== "other" ? casts.find((c) => now - c.created_at < REPLY_WINDOW_MS && c.topic === t) : undefined);
  if (!hit) return null;
  const row = db().prepare("SELECT body_json FROM readings WHERE cast_id = ? ORDER BY id DESC LIMIT 1").get(hit.id) as { body_json: string } | undefined;
  if (!row) return null;
  const l: Locale = asLocale(hit.locale);
  const body = JSON.parse(row.body_json) as Record<string, Record<string, string> | undefined>;
  const call = pick((body.verdict ?? body.summary) as never, l).trim();
  if (call.length < 4) return null;
  const p = hexagramByNumber(hit.primary_num);
  const c = hit.changed_num ? hexagramByNumber(hit.changed_num) : null;
  return { sid: hit.session_id ?? null, question: hit.question, at: hit.created_at, hex: `${p ? hexName(p, l) : ""}${c ? ` → ${hexName(c, l)}` : ""}`, call: call.slice(0, 400), tier: hit.tier ?? "one" };
}

/** The same, shaped as the prompt's prior reading. */
export function threadPrior(customerId: number, question: string, topic: Topic | undefined, now = Date.now()): PriorReading | undefined {
  const h = recentThread(customerId, question, topic, now);
  return h ? { question: h.question.slice(0, 200), at: h.at, hex: h.hex.slice(0, 40), call: h.call } : undefined;
}
