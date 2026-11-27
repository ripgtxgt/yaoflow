import { createHash } from "node:crypto";
import { resolveCast, type LineValue } from "@yaoflow/engine";
import { chatJson } from "./llm";
import { dailyCast, saveDailyCast, recordOps } from "./db";
import { COMMON_RULES_FOR_DAILY, LANGUAGE_NOTE_FOR_DAILY, buildUserPayload, jargonOffense, resolveServerChart } from "./reading";
import { LOCALE_META, type Locale } from "./locales";
import { ensureHant } from "./hant";

/**
 * 大众一卦 (09-21, A2 — 裂变玩法调研 §1.3): the pick-a-card format, which is
 * how divination actually travels (#Tarot ≈ 17.6M posts; Dcard's 大眾占卜).
 * Three charts are cast for the whole site each day; whoever comes picks the
 * one that feels like theirs and gets a short read of it. It is deliberately
 * SHORTER than a light reading — a taste and an entrance, not the product.
 *
 * The three figures are the same worldwide (seeded by the day and the pile
 * only); the words are generated per language, lazily, the first time someone
 * in that language opens the page.
 */
export const PILES = [1, 2, 3] as const;
export type Pile = (typeof PILES)[number];

export interface DailyRead {
  values: LineValue[];
  note: string;
  watch: string;
}

/**
 * The day's figures, deterministic and identical everywhere: SHA-256 over
 * "yaoflow-daily:<day>:<pile>", two bits per line → 6,7,8,9. No randomness,
 * so the same day always yields the same three charts and the page can be
 * cached and re-derived after any restart.
 */
export function dailyValues(day: string, pile: Pile): LineValue[] {
  const h = createHash("sha256").update(`yaoflow-daily:${day}:${pile}`).digest();
  const out: LineValue[] = [];
  for (let i = 0; i < 6; i++) {
    // three coins: 3 heads = 9, 2 = 7, 1 = 8, 0 = 6 — take three bits per line
    const bits = (h[i]! >> 1) & 0b111;
    const heads = ((bits >> 2) & 1) + ((bits >> 1) & 1) + (bits & 1);
    out.push((heads === 3 ? 9 : heads === 2 ? 7 : heads === 1 ? 8 : 6) as LineValue);
  }
  return out;
}

/** Noon UTC+8 of the given day, as the cast instant — one moment for everyone. */
function castAtFor(day: string): number {
  return Date.parse(`${day}T04:00:00Z`);
}

const inFlight = new Map<string, Promise<DailyRead | null>>();

/** The day's pile in this language, from cache or freshly written. Null when generation fails — the page still shows the figure. */
export async function dailyRead(day: string, locale: Locale, pile: Pile): Promise<DailyRead | null> {
  const values = dailyValues(day, pile);
  const cached = dailyCast(day, locale, pile);
  if (cached) return { values, note: cached.note, watch: cached.watch };
  const key = `${day}|${locale}|${pile}`;
  const running = inFlight.get(key);
  if (running) return running;
  const p = generate(day, locale, pile, values).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function generate(day: string, locale: Locale, pile: Pile, values: LineValue[]): Promise<DailyRead | null> {
  try {
    const input = { question: "", values, castAtMs: castAtFor(day), tzOffsetMinutes: -480 };
    const chart = resolveServerChart(input, true);
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await chatJson(
        [
          { role: "system", content: dailySystem(locale) },
          { role: "user", content: buildUserPayload("", chart, undefined, { tellTime: false }) },
        ],
        { maxTokens: 500, temperature: 0.7 },
      );
      const parsed = parseDaily(raw);
      if (!parsed) continue;
      const { note, watch } = locale === "zh-hant" ? ensureHant(parsed).fixed : parsed;
      // the public pile is plain language only — no chart vocabulary leaks into a page strangers land on
      if (jargonOffense({ note, watch }, [], locale)) continue;
      saveDailyCast({ day, locale, pile, values, primaryNum: resolveCast(values).primary.number, note, watch });
      return { values, note, watch };
    }
    recordOps("daily_fail", `${day} ${locale} ${pile}`);
    return null;
  } catch (e) {
    recordOps("daily_fail", `${day} ${locale} ${pile} ${e instanceof Error ? e.message.slice(0, 80) : "?"}`);
    return null;
  }
}

function parseDaily(raw: string): { note: string; watch: string } | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const note = typeof o.note === "string" ? o.note.trim() : "";
    const watch = typeof o.watch === "string" ? o.watch.trim() : "";
    if (note.length < 10 || watch.length < 4) return null;
    return { note: note.slice(0, 400), watch: watch.slice(0, 200) };
  } catch {
    return null;
  }
}

/**
 * The prompt. The reader told us nothing — they only picked a pile — so the
 * words must describe the SHAPE of a situation (what moves, what is stuck,
 * what is waited on), never guess at their circumstances.
 */
export const dailySystem = (locale: Locale) => `You are YaoFlow's reading voice. Three charts are cast for everyone who visits today. A reader has chosen THIS one as theirs, and has told you nothing at all about themselves — not their question, not their situation. Speak to whoever picked it.

${COMMON_RULES_FOR_DAILY}

Give exactly two fields:
- "note": what this chart says about the shape of the situation of whoever picked it — what is moving, what is stuck, what is waiting on someone else, which way it leans. ${LOCALE_META[locale].cjk ? "50–80 字" : "30–50 words"}, two or three short sentences.
- "watch": ONE thing worth keeping an eye on in the next few days — a sign to notice, not an instruction to follow. ${LOCALE_META[locale].cjk ? "15–30 字" : "8–18 words"}, one sentence.

Hard limits for this format:
- You know NOTHING about the reader. Never name a life area as fact ("your job", "your partner", "your family"), never assume a gender, an age, or a country. Speak about the situation's shape, and let the reader recognise it.
- No dates and no time windows of any kind — those belong to the reading they can pay for.
- No hexagram names, no trigram imagery, no line-text allusions, no chart vocabulary (干支/六亲/六神/世应/用神/旬空/月破…) anywhere.
- No advice or instruction in "note". "watch" names a sign, not an action.
- Do not mention piles, cards, choosing, or this format.
${LANGUAGE_NOTE_FOR_DAILY(locale)}

OUTPUT: JSON only, exactly {"note": "…", "watch": "…"}, written in ${LOCALE_META[locale].english}.`;
