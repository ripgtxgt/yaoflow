import { chatText, type LlmMessage } from "./llm";
import { registerOpt } from "./register";
import { recordOps } from "./db";
import {
  buildUserPayload, dateTalkOffense, jargonOffense, resolveServerChart, resolveTiming, teaserOddsSystem, teaserSystem,
  type ReadingInput,
} from "./reading";
import type { Locale } from "./locales";
import { LOCALE_META } from "./locales";
import { ensureHant, toHans } from "./hant";
import { oddsFor } from "./generate";
import { parseOdds, type Odds } from "./situation";

/**
 * The free line (09-19, Neil: 「解读露一句」). After the cast, before the price,
 * the reader sees one sentence of the call — enough to feel that the chart is
 * about their matter, not enough to skip the reading. The same sentence then
 * opens the paid reading (see OPENING_NOTE), so the hook is kept.
 *
 * One short model call, guarded like the readings: no chart vocabulary, no
 * dates, one sentence.
 *
 * 09-22, from the funnel review: this failed 40 times in two days and showed
 * the reader NOTHING at the exact moment they are deciding whether to pay —
 * the most expensive blank on the site. Two causes, both ours:
 *
 *   1. The prompt told the model to say 吉中带阻 for a mixed chart, and the
 *      jargon guard then rejected it. 24 of 50 slips were that one phrase:
 *      we asked for it and blocked it. Fixed in reading.ts.
 *   2. Two tries and then give up. Now three, and if all three slip there is
 *      a plain fallback line — drawn from the chart's own shape, so it is
 *      true, and carrying no jargon, no date and no advice, so it cannot slip.
 *
 * A generic line is worth less than a specific one. It is worth much more
 * than an empty space where the hook should be.
 */

const CJK_MAX = 60;
const LATIN_MAX = 200;

/** 10-03: the line of a 2nd+ cast on one matter ties it to the earlier casts — a little more room */
const THREAD_CJK_MAX = 80;
const THREAD_LATIN_MAX = 260;

/** The first sentence only, trimmed of quotes and labels; null when it is not one usable sentence. */
export function tidyTeaser(raw: string, locale: Locale, threaded = false): string | null {
  let s = (raw ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(/^(斷語|断语|Verdict|Summary|Call)\s*[:：]\s*/i, "");
  s = s.replace(/^[「『"“'‘《«]+/, "").replace(/[」』"”'’》»]+$/, "");
  if (!s) return null;
  // one sentence: cut at the first terminal mark, keeping it
  const m = s.match(/^(.+?[。！？!?])(?:\s|$)/);
  if (m) s = m[1]!;
  else if (/[.]/.test(s) && !LOCALE_META[locale].cjk) {
    const dot = s.indexOf(". ");
    if (dot > 0) s = s.slice(0, dot + 1);
  }
  s = s.trim();
  const max = LOCALE_META[locale].cjk ? (threaded ? THREAD_CJK_MAX : CJK_MAX) : (threaded ? THREAD_LATIN_MAX : LATIN_MAX);
  if (s.length < 6 || s.length > max) return null;
  if (/[{}\[\]<>]/.test(s)) return null;
  return s;
}

/**
 * The line is a call, not a step: "先別急著簽約" hands out the next move for
 * free and undercuts the reading. A light pattern check — the prompt already
 * forbids advice; this catches the slips the first live line made (09-19).
 */
const ADVICE: Partial<Record<Locale, RegExp>> = {
  // 11-06: 「應該會／應該是／應該不」 is "probably", not "you should" — those are not advice (two lines a day fell back on it)
  zh: /先別|别急|別急|不要急|先等|建議|建议|應該(?![會会是不也還还就有沒没算])|应该(?![會会是不也還还就有沒没算])|不妨|先去|最好(?!的)|要做的是/,
  "zh-hant": /先別|別急|不要急|先等|建議|應該(?![會是不也還就有沒算])|不妨|先去|最好(?!的)|要做的是|唔好急|唔使急|等埋/,
  en: /\b(don't|do not|should(n't)?|hold off|wait (for|until)|make sure|try to|you need to|avoid)\b/i,
  ja: /まず|しないで|ください|べき|待っ|急が/,
  ko: /하지 마|기다리|해야|말고|우선/,
};
export function adviceOffense(text: string, locale: Locale): boolean {
  const re = ADVICE[locale];
  return re ? re.test(text) : false;
}

/** 10-03: a linked line never counts the reader's casts back to them ("你第三次問了", "you keep asking"). */
const COUNT_TALK = /第\s*[二三四五六七八九十兩两\d]+\s*[次卦回]|又來問|又来问|又問|又问|反覆問|反复问|一再問|一再问|問了好幾次|问了好几次|何度も|また占|다시 물|몇 번째|\bagain\b|\b(second|third|fourth|fifth) time\b|\bkeep (on )?asking\b|\bencore une fois\b|\bschon wieder\b|\bde nuevo\b|\botra vez\b|\bde novo\b|\boutra vez\b/i;
export function countOffense(text: string): boolean {
  return COUNT_TALK.test(text);
}

/**
 * 10-03 起卦记录: the 2nd+ cast on one matter. `thread` is what came before (lib/cast-log.ts priorsFor); `style` is the
 * way the line ties this chart to it, picked by the learner (lib/nudge.ts, slot "style").
 */
export interface TeaserThread {
  thread: { cast_number: number; earlier_casts: { date: string; question: string; hexagram: string; free_line: string | null }[] };
  style: { id: string; prompt: string };
}

export async function generateTeaser(input: ReadingInput, locale: Locale, ctx?: TeaserThread, stored = false): Promise<string | null> {
  // 10-04: `stored` — a figure brought back days later (a reminder letter's link) is read at its own instant, not now
  const chart = resolveServerChart(input, stored);
  const timing = resolveTiming({ ...input, question: toHans(input.question) }, chart, stored);
  const threaded = !!ctx && ctx.thread.earlier_casts.length > 0;
  const messages: LlmMessage[] = [
    { role: "system", content: teaserSystem(locale, { ...registerOpt(locale, input.register), ...(threaded ? { teaserThread: { n: ctx!.thread.cast_number, style: ctx!.style.prompt } } : {}) }) },
    // the light tier's payload: the still-chart lean stays, the calendar goes
    { role: "user", content: buildUserPayload(input.question, chart, timing, { tellTime: false, situation: input.situation, ...(threaded ? { thread: ctx!.thread } : {}) }) },
  ];
  const still = chart.cast.changingPositions.length === 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await chatText(messages, { temperature: attempt === 0 ? (still ? 0.35 : 0.5) : 0.3, maxTokens: threaded ? 220 : 160 });
      let text = tidyTeaser(raw, locale, threaded);
      if (!text) { messages.push({ role: "assistant", content: raw }, { role: "user", content: "REWRITE REQUIRED. Exactly ONE complete sentence, nothing else — no label, no quotes, no second sentence." }); continue; }
      if (locale === "zh-hant") {
        const { fixed, leaked } = ensureHant({ teaser: text });
        if (leaked.length) recordOps("hant_leak", "teaser");
        text = fixed.teaser;
      }
      const field = { teaser: text };
      const offense = jargonOffense(field, [], locale) ?? dateTalkOffense(field, ["teaser"]) ?? (adviceOffense(text, locale) ? "advice" : null)
        ?? (threaded && countOffense(text) ? "counts their casts" : null);
      // 09-26 (review): ~10% of lines fell back only because one clause named a time ("兩週內"). On the last try,
      // drop that clause and keep the rest if what is left stands on its own and is clean.
      if (offense && offense.startsWith("teaser:") && attempt === 2) {
        const hit = offense.slice("teaser:".length);
        const parts = text.split(/(?<=[，,；;、])/);
        const kept = parts.filter((p) => !p.includes(hit)).join("").replace(/[，,；;、\s]+$/u, "");
        const salvaged = kept.length >= 8 ? kept + (/[。.!！?？]$/u.test(kept) ? "" : LOCALE_META[locale].cjk ? "。" : ".") : "";
        if (salvaged && !jargonOffense({ teaser: salvaged }, [], locale) && !dateTalkOffense({ teaser: salvaged }, ["teaser"]) && !adviceOffense(salvaged, locale)) {
          recordOps("teaser_salvaged", hit.slice(0, 30));
          return salvaged;
        }
      }
      // 11-06: the same on the last try for a clause of advice — the lean usually stands without it
      if (offense === "advice" && attempt === 2) {
        const re = ADVICE[locale];
        const parts = text.split(/(?<=[，,；;、])/);
        const kept = re ? parts.filter((p) => !re.test(p)).join("").replace(/[，,；;、\s]+$/u, "") : "";
        const salvaged = kept.length >= 8 && kept !== text ? kept + (/[。.!！?？]$/u.test(kept) ? "" : LOCALE_META[locale].cjk ? "。" : ".") : "";
        if (salvaged && !jargonOffense({ teaser: salvaged }, [], locale) && !dateTalkOffense({ teaser: salvaged }, ["teaser"]) && !adviceOffense(salvaged, locale)) {
          recordOps("teaser_salvaged", "advice");
          return salvaged;
        }
      }
      if (offense) {
        recordOps("teaser_slip", offense.slice(0, 60));
        messages.push({ role: "assistant", content: raw }, { role: "user", content: `REWRITE REQUIRED (${offense}). One sentence in plain everyday words: no chart vocabulary, no hexagram name, no date or "soon", and NO advice or instruction of any kind (no "don't rush", "wait", "should"). Say only which way it leans for their question and why, in life terms.` });
        continue;
      }
      return text;
    } catch (e) {
      // the provider is down or timed out: no point retrying here, the fulfil
      // path has its own backups — but still say something rather than nothing
      recordOps("teaser_fail", e instanceof Error ? e.message.slice(0, 80) : "unknown");
      return fallbackTeaser(still, locale);
    }
  }
  recordOps("teaser_fail", "three slips → fallback");
  return fallbackTeaser(still, locale);
}

/**
 * 09-28 对照测试 (v1, Neil: 「预览多露一点」): the call as a short paragraph — which way it leans, the reason, and
 * what it turns on — under the same rules as the line (no timing, no advice, no chart words). The when and the
 * how stay behind the price; the light reading still goes further (the situation, both sides, the lean explained).
 * Grows the one line it is asked with, so a reader sees the line first and the rest arrive under it.
 */
export async function generateTeaserMore(input: ReadingInput, locale: Locale, line: string): Promise<string | null> {
  const chart = resolveServerChart(input, false);
  const timing = resolveTiming({ ...input, question: toHans(input.question) }, chart, false);
  const cjk = LOCALE_META[locale].cjk;
  const messages: LlmMessage[] = [
    { role: "system", content: teaserSystem(locale, registerOpt(locale, input.register)).replace(
      /The sentence:[\s\S]*?OUTPUT:/,
      `You already gave the first sentence: "${line.replace(/"/g, "'")}". Now add TWO more sentences that continue it — the reason behind the lean in their life terms, and what the outcome turns on (the condition, not the step). Same rules as the first sentence: definite where the chart is definite; NO timing of any kind, NO advice or instruction of any kind, NO hexagram names, NO trigram imagery, NO chart vocabulary or set phrases (吉中带阻, 回头克, 化退, 官鬼, 空亡, 月破 — say it as a friend would). Length: ${cjk ? "40–90 characters" : "25–55 words"} in total for the two sentences. Do NOT repeat the first sentence.\n\nOUTPUT:`,
    ).replace("the sentence alone", "the two sentences alone") },
    { role: "user", content: buildUserPayload(input.question, chart, timing, { tellTime: false, situation: input.situation }) },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await chatText(messages, { temperature: attempt === 0 ? 0.45 : 0.3, maxTokens: 260 });
      let text = (raw ?? "").replace(/\s+/g, " ").trim().replace(/^[「『"“'‘《«]+/, "").replace(/[」』"”'’》»]+$/, "");
      if (text.startsWith(line)) text = text.slice(line.length).trim();
      if (locale === "zh-hant") text = ensureHant({ t: text }).fixed.t;
      const max = cjk ? 110 : 420;
      if (text.length < 12 || text.length > max || /[{}\[\]<>]/.test(text)) { messages.push({ role: "assistant", content: raw }, { role: "user", content: "REWRITE REQUIRED. Exactly two sentences, nothing else." }); continue; }
      const field = { more: text };
      const offense = jargonOffense(field, [], locale) ?? dateTalkOffense(field, ["more"]) ?? (adviceOffense(text, locale) ? "advice" : null);
      if (offense) {
        recordOps("teaser_more_slip", offense.slice(0, 60));
        messages.push({ role: "assistant", content: raw }, { role: "user", content: `REWRITE REQUIRED (${offense}). Two sentences in plain everyday words: no chart vocabulary, no date or "soon", and NO advice of any kind. Only why it leans that way and what it turns on.` });
        continue;
      }
      return text;
    } catch (e) {
      recordOps("teaser_more_fail", e instanceof Error ? e.message.slice(0, 80) : "unknown");
      return null;
    }
  }
  return null;
}

/**
 * The line shown when every attempt slipped. It says only what the cast itself
 * shows — whether anything is moving — which is true of every chart and needs
 * no model, no jargon, no date and no advice. It is deliberately not a call:
 * we do not guess a lean we could not get the model to phrase cleanly.
 */
const FALLBACK: Record<Locale, { still: string; moving: string }> = {
  zh: { still: "这一卦没有动爻——眼下这件事的样子，短期内不会自己变。", moving: "这一卦有动爻——这件事正在变，变在哪里，下面说。" },
  "zh-hant": { still: "這一卦沒有動爻——眼下這件事的樣子，短期內不會自己變。", moving: "這一卦有動爻——這件事正在變，變在哪裡，下面說。" },
  en: { still: "Nothing is moving in this chart — the situation is unlikely to shift on its own just now.", moving: "Something is moving in this chart — the situation is shifting; the reading below says where." },
  ja: { still: "この卦に動爻はありません——今の状況は、しばらくは自然には変わらないでしょう。", moving: "この卦には動爻があります——状況は動いています。どこが動いているかは、下で説明します。" },
  ko: { still: "이 괘에는 동효가 없습니다 — 지금 상황은 당분간 저절로 바뀌지 않습니다.", moving: "이 괘에는 동효가 있습니다 — 상황이 움직이고 있습니다. 어디가 움직이는지는 아래에." },
  fr: { still: "Rien ne bouge dans cette figure — la situation ne devrait pas changer d'elle-même pour l'instant.", moving: "Quelque chose bouge dans cette figure — la situation évolue\u202f; où, c'est ci-dessous." },
  de: { still: "In diesem Zeichen bewegt sich nichts — die Lage dürfte sich vorerst nicht von selbst ändern.", moving: "In diesem Zeichen bewegt sich etwas — die Lage verschiebt sich; wo, steht unten." },
  es: { still: "Nada se mueve en esta figura: la situación no cambiará por sí sola por ahora.", moving: "Algo se mueve en esta figura: la situación está cambiando; dónde, está abajo." },
  pt: { still: "Nada se move nesta figura — a situação não deve mudar sozinha por enquanto.", moving: "Algo se move nesta figura — a situação está mudando; onde, está abaixo." },
};
export function fallbackTeaser(still: boolean, locale: Locale): string {
  const f = FALLBACK[locale] ?? FALLBACK.en;
  return still ? f.still : f.moving;
}

/**
 * Whether a line is one of the fallbacks. The teaser is normally BINDING on
 * the paid reading — it must open with exactly that sentence, so the hook is
 * kept. A fallback must not bind: it is a statement about the chart's shape,
 * not the call, and forcing a reading to open with it would make the reading
 * worse. Checked by the checkout path before passing `teaser` along.
 */
const FALLBACK_LINES = new Set(Object.values(FALLBACK).flatMap((f) => [f.still, f.moving]));
export function isFallbackTeaser(line: string | null | undefined): boolean {
  return !!line && FALLBACK_LINES.has(line.trim());
}

/**
 * 09-26 对照测试 (o1 arm): the lean shown above the free line. A second, tiny
 * call that must agree with the sentence; a still chart's computed lean binds
 * it (oddsFor). Null on any doubt — the line then shows alone, as before.
 */
export async function generateTeaserOdds(input: ReadingInput, locale: Locale, teaser: string): Promise<Odds | null> {
  // the fallback line is not a call — there is nothing for a lean to agree with
  if (isFallbackTeaser(teaser)) return null;
  // "why / what / how" questions have no outcome to rate — a lean there would read as nonsense
  if (!asksOutcome(input.question)) return null;
  try {
    const chart = resolveServerChart(input, false);
    const timing = resolveTiming({ ...input, question: toHans(input.question) }, chart, false);
    const raw = await chatText([
      { role: "system", content: teaserOddsSystem(teaser) },
      { role: "user", content: buildUserPayload(input.question, chart, timing, { tellTime: false, situation: input.situation }) },
    ], { temperature: 0.2, maxTokens: 12 });
    const code = parseOdds(raw.trim().toLowerCase().replace(/[^a-z_]/g, ""));
    if (!code) return null;
    // a still chart's computed lean disagrees with the model's code → the sentence and the lean may disagree too: show neither lean
    return oddsFor(code, chart, input, false) === code ? code : null;
  } catch {
    return null;
  }
}

/** 09-26: a question with an outcome to rate (will / can / whether / yes-no), not "why / what is he thinking / how". */
export function asksOutcome(q: string): boolean {
  const s = q.trim();
  if (/(為什麼|为什么|什麼原因|什么原因|怎麼辦|怎么办|怎麼做|怎么做|如何|在想什麼|在想什么|什麼想法|什么想法|什麼心思|什么心思|是什麼|是什么|why\b|what\b|how\b)/i.test(s)) return false;
  return /(會不會|会不会|能不能|可不可以|是否|是不是|有沒有|有没有|嗎|吗|成不成|行不行|順利|顺利|機會|机会|will\b|can\b|could\b|should\b|is it\b|are we\b|do i\b|does\b|\?|？)/i.test(s);
}
