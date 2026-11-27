import { chatText } from "./llm";
import { recordOps } from "./db";
import { matterPrompt, parseVerdict, type MatterVerdict } from "./question-check";
import type { Locale } from "./locales";
import { LOCALE_META } from "./locales";

/**
 * The model layer of the question check (09-20) — server only, because it
 * talks to the model. One word back, a short deadline, and `light` so a slow
 * answer here never marks a provider down for the readings.
 *
 * Unsure (timeout, host busy, an answer that is neither word) never blocks:
 * the reader goes on, and the rules layer has already caught the obvious.
 */
export const JUDGE_TIMEOUT_MS = 6_000;

export async function judgeMatter(question: string, locale: Locale): Promise<MatterVerdict> {
  const lang = LOCALE_META[locale]?.english ?? locale;
  try {
    const raw = await chatText(
      [
        { role: "system", content: matterPrompt() },
        { role: "user", content: `Page language: ${lang}\nText:\n${question.slice(0, 450)}` },
      ],
      { maxTokens: 4, temperature: 0, timeoutMs: JUDGE_TIMEOUT_MS, light: true },
    );
    const v = parseVerdict(raw);
    if (v === "unsure") recordOps("qcheck_unsure", raw.slice(0, 40));
    return v;
  } catch (e) {
    recordOps("qcheck_fail", e instanceof Error ? e.message.slice(0, 80) : "unknown");
    return "unsure";
  }
}
