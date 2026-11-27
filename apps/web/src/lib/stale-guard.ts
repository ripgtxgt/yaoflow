import { chatJson, parseJsonLoose, type LlmMessage } from "./llm";
import { OLD_DAYS } from "./echo-guard";
import type { MatterSoFar } from "./reading";

/**
 * 10-22 「一件事」记忆复查 (Neil: 「可以开始」): a full reading told a reader to stop 「這七天送飲料、做術法」 — a seven-day
 * ritual she had asked about eleven days earlier, written as if she were still doing it. The full reading keeps the
 * matter's history on purpose (who, what happened), so the words cannot be withheld as they are for the light reading,
 * and no word list tells "she asked about it 11 days ago" from "she is doing it now". So a full reading whose matter has
 * record older than three days gets one short second look by the model: does any passage take that old record for the
 * present? If it names passages that are really in the reading, the reading is written again once with them pointed
 * out. A failed or slow look lets the reading through as it is.
 */

export interface OldRecord { days_ago: number; kind: "asked" | "wrote" | "earlier_reading"; text: string }

/** What in the matter is older than OLD_DAYS: the reader's own questions and notes, and what our readings said then. */
export function oldRecords(m: MatterSoFar | undefined): OldRecord[] {
  if (!m || m.no_context) return [];
  const out: OldRecord[] = [];
  for (const c of m.earlier_casts) {
    if (c.days_ago <= OLD_DAYS) continue;
    if (c.question && !c.question.startsWith("(")) out.push({ days_ago: c.days_ago, kind: "asked", text: c.question.slice(0, 160) });
    if (c.call && !c.call.startsWith("(")) out.push({ days_ago: c.days_ago, kind: "earlier_reading", text: c.call.slice(0, 160) });
  }
  for (const n of m.reader_notes) if (n.days_ago > OLD_DAYS) out.push({ days_ago: n.days_ago, kind: "wrote", text: n.note.slice(0, 160) });
  return out.slice(-12);
}

export const STALE_SYSTEM = `You check one fortune-telling reading for a single fault. The reader's OLD RECORDS are things they asked or wrote, or an earlier reading said, MORE THAN THREE DAYS AGO (each has days_ago). They tell what was going on THEN; nothing in them says it is still going on today.
FAULT: a passage of the READING states or assumes that something found only in the old records is still happening now — something the reader is still doing, still planning, still feeling — or builds advice on it still going on (e.g. old record, 11 days ago: "I am doing a ritual: bring him a drink every day for seven days"; reading: "stop the drinks and the rituals now" or "the more you keep sending him things…" → FAULT).
NOT a fault: naming an old event as past ("11 days ago you asked about the ritual"), anything the reading takes from this chart or from the current question, general advice that does not rest on the old record, and statements about the OTHER person.
Answer ONLY with JSON: {"stale": true|false, "passages": ["<exact short quote from the READING, at most 40 characters>"]}. passages empty when stale is false.`;

export interface StaleVerdict { stale: boolean; passages: string[] }

/**
 * The second look. Returns null when there is nothing old to compare with, or when the look fails; passages are kept
 * only if they really are in the reading (a quote the model made up is no reason to rewrite).
 */
export async function staleCheck(fields: Record<string, unknown>, keys: readonly string[], m: MatterSoFar | undefined, question: string): Promise<StaleVerdict | null> {
  const old = oldRecords(m);
  if (!old.length) return null;
  const reading: Record<string, string> = {};
  for (const k of keys) { const v = fields[k]; if (typeof v === "string" && v.trim()) reading[k] = v; }
  if (!Object.keys(reading).length) return null;
  const messages: LlmMessage[] = [
    { role: "system", content: STALE_SYSTEM },
    { role: "user", content: JSON.stringify({ current_question: question.slice(0, 300), old_records: old, reading }) },
  ];
  try {
    const raw = await chatJson(messages, { temperature: 0, maxTokens: 300, timeoutMs: 15_000, light: true });
    const v = parseJsonLoose<{ stale?: unknown; passages?: unknown }>(raw).value;
    const all = Object.values(reading).join("\n");
    const passages = Array.isArray(v?.passages)
      ? v.passages.filter((p): p is string => typeof p === "string" && p.trim().length >= 4).map((p) => p.trim().slice(0, 60)).filter((p) => all.includes(p)).slice(0, 4)
      : [];
    return { stale: v?.stale === true && passages.length > 0, passages };
  } catch {
    return null;
  }
}

/** The rewrite request when the second look found old record taken for the present. */
export function staleRewrite(passages: string[], old: OldRecord[]): string {
  const days = old.map((o) => o.days_ago);
  const span = Math.min(...days) === Math.max(...days) ? `${days[0]} days` : `${Math.min(...days)}–${Math.max(...days)} days`;
  return `REWRITE REQUIRED. These passages treat what the reader asked or wrote ${span} ago as if it were still going on: ${passages.map((p) => `「${p}」`).join(" ")}. That record is past — it may well have ended or changed. Never present it as what the reader is doing, planning or feeling now, and never build advice on it still going on; if it matters, name it as past, with when. Keep every call, every date and everything else; output the ENTIRE JSON again in the same language.`;
}
