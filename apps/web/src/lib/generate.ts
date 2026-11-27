import { parseOdds, type Odds } from "./situation";
import { scrubReading } from "./internal-words";
import { chatJson, type LlmMessage } from "./llm";
import { recordOps } from "./db";
import {
  DEEP_KEYS, ONE_KEYS, buildUserPayload, chartGuard, guardOpeningOffense, staticRead, dateTalkOffense, deepSystem, jargonOffense, lateTimingOffense, localize, oneSystem, openingOffense,
  resolveCastInstant, resolveServerChart, resolveTiming, shapeOffense, timingOffense, validateDeep, validateReading,
  type DeepReading, type RawFields, type Reading, type ReadingInput, type Tier,
} from "./reading";
import { localIsoDate } from "./timing";
import { contrastOffense, echoOffense, lightMatter } from "./echo-guard";
import { oldRecords, staleCheck, staleRewrite } from "./stale-guard";
import { qianByNum, qianPromptNote } from "./qian";
import { prePromptNote } from "./pre-cast";
import { lostItemOf } from "./lost-item";
import { registerOpt } from "./register";
import { bmgOverlay } from "./bmg-overlay";
import { hexByLines } from "./bmg";
import { bmgLinesForSession } from "./bmg-store";
import { publicEventFacts, type EventFacts } from "./public-event";

/**
 * 10-04: the reader's own date now, when it is a later calendar day than the cast's (both in the cast's clock) — the
 * deep reading is then opened late and must say which windows have gone by. Null on the cast day itself.
 */
export function lateOpenedOn(input: ReadingInput, stored: boolean, now = Date.now()): string | null {
  const { castAt, tz } = resolveCastInstant(input, stored);
  const castDay = localIsoDate(castAt, tz);
  const today = localIsoDate(now, tz);
  return today > castDay ? today : null;
}
import { LOCALE_META, type Locale } from "./locales";
import { ensureHant, toHans } from "./hant";
import { readsAsCantonese } from "./question-lang";

export type AnyReading = Reading | DeepReading;

/**
 * One generation per session at a time (09-15). A reader refreshing a slow
 * page, or the page and the fulfilment sweep arriving together, used to start
 * parallel generations of the same reading — the outage night shows three
 * and four running at once for one person. Later callers now wait on the
 * first call's promise instead.
 */
const inFlight = new Map<string, Promise<AnyReading>>();

export function generateReadingFor(sid: string, tier: Tier, input: ReadingInput, stored = false, locale: Locale = "zh"): Promise<AnyReading> {
  const running = inFlight.get(sid);
  if (running) return running;
  // 11-05 进度表 136: the reader's 本命卦, when they took the quiz (by account, or the browser that paid)
  let bmgLines: string | null = null;
  try { bmgLines = input.bmgLines ?? bmgLinesForSession(sid); } catch { /* the reading goes on without it */ }
  const p = (async () => {
    // 11-05 进度表 140: a public event the question is about — its checked facts (deciding day, status, result); null otherwise
    let publicEvent: EventFacts | null = input.publicEvent ?? null;
    if (!publicEvent) {
      try {
        const { castAt, tz } = resolveCastInstant(input, stored);
        publicEvent = await publicEventFacts(input.question, localIsoDate(castAt, tz));
      } catch { publicEvent = null; }
    }
    return generateReading(tier, { ...input, ...(bmgLines ? { bmgLines } : {}), ...(publicEvent ? { publicEvent } : {}) }, stored, locale);
  })().finally(() => inFlight.delete(sid));
  inFlight.set(sid, p);
  return p;
}

/** How many generations are running right now (health card). */
export function generationsInFlight(): number {
  return inFlight.size;
}

/**
 * Shared generation pipeline: prompt → JSON (one language) → schema check →
 * jargon check with corrective retries → stored shape. Used by the beta API
 * route, the paid reading page and the fulfilment sweep.
 */
export async function generateReading(
  tier: Tier,
  input: ReadingInput,
  stored = false,
  locale: Locale = "zh",
): Promise<AnyReading> {
  const startedAt = Date.now();
  const chart = resolveServerChart(input, stored);
  // 09-18: a Cantonese question gets a Cantonese reading; a re-cast on a matter
  // the gate recognised carries what the reader was told last time
  const yue = locale === "zh-hant" && input.register === "yue";
  // 09-19: the free line shown before the price must open the reading
  const teaser = typeof input.teaser === "string" && input.teaser.trim().length >= 6 ? input.teaser.trim().slice(0, 200) : null;
  const hasMatter = !!input.matterSoFar && (input.matterSoFar.earlier_casts.length > 0 || input.matterSoFar.reader_notes.length > 0);
  // 10-03 起卦记录: free casts on the same matter came before this one — the reading puts them together (THREAD_NOTE)
  const hasThread = hasMatter && input.matterSoFar!.earlier_casts.some((c) => c.tier === "free_line" || c.tier === "cast_only");
  // 10-04 (Neil: 「深断要一起改一处，改吧」): bought on a later day than the cast (a saved cast, an old light reading
  // upgraded, a reminder letter) — the reader's own today goes in, and the windows already behind it are marked
  const openedOn = tier === "deep" ? lateOpenedOn(input, stored) : null;
  // 10-12 (进度表 §四 30): the light reading sees older record without the reader's words (lib/echo-guard.ts)
  const matterSeen = hasMatter ? (tier === "deep" ? input.matterSoFar : lightMatter(input.matterSoFar)) : undefined;
  // 10-29 进度表 127: a lost-thing question reads with its own 用神 and the 失脱 signals (lib/lost-item.ts) — deep only
  const lost = tier === "deep" && !!lostItemOf(input.question);
  const promptOpts = { ...registerOpt(locale, input.register), ...(input.prior ? { prior: input.prior.outcome === "hit" ? ("aftermath" as const) : true } : {}), ...(hasMatter ? { matter: tier === "deep" ? true : ("light" as const) } : {}), ...(hasThread ? { thread: tier === "deep" ? true : ("light" as const) } : {}), ...(teaser ? { teaser } : {}), ...(openedOn ? { late: true } : {}), ...(lost ? { lost: true } : {}) };
  if (lost) recordOps("lost_item_reading", locale);
  // 11-05 进度表 136: the reader's own 本命卦 laid over this chart (lib/bmg-overlay.ts)
  const bmg = input.bmgLines && /^[01]{6}$/.test(input.bmgLines)
    ? bmgOverlay(input.bmgLines.split("").map(Number), chart.lines.map((l) => (l.polarity === "yang" ? 1 : 0)), chart.cast.changingPositions, hexByLines(input.bmgLines.split("").map(Number)).name)
    : undefined;
  if (bmg) recordOps("bmg_reading", `${tier} ${locale}`);
  if (input.publicEvent) recordOps("public_event_reading", `${tier} ${input.publicEvent.status} ${input.publicEvent.date}`);
  const messages: LlmMessage[] = [
    { role: "system", content: tier === "deep" ? deepSystem(locale, promptOpts) : oneSystem(locale, promptOpts) },
    // keyword rules (用神/尺度) read simplified text; the prompt keeps the question verbatim.
    // The light tier never tells time (09-17), so it is not shown the calendar.
    { role: "user", content: `${buildUserPayload(input.question, chart, resolveTiming({ ...input, question: toHans(input.question) }, chart, stored), { tellTime: tier === "deep", prior: input.prior, situation: input.situation, promisedOdds: tier === "deep" ? input.teaserOdds : undefined, matter: matterSeen, ...(openedOn ? { openedOn } : {}), ...(bmg ? { bmg } : {}), ...(input.publicEvent ? { publicEvent: input.publicEvent } : {}) })}${qianNote(input)}${prePromptNote(input.pre)}` },
  ];
  if (openedOn) recordOps("late_open", `${tier} ${locale}`);
  let yueNudged = false;
  let openingNudged = false;
  let lateNudged = false;
  let echoNudged = false;
  let contrastNudged = false;
  let staleChecked = false;
  // 10-13 应验校准: the chart carries a severe signal and the reading still rated it likely — one rewrite
  let guardNudged = false;
  const guard = tier === "deep" ? chartGuard(chart, resolveTiming({ ...input, question: toHans(input.question) }, chart, stored), toHans(input.question)) : null;
  const validate = tier === "deep" ? validateDeep : validateReading;
  const keys = tier === "deep" ? DEEP_KEYS : ONE_KEYS;
  const jargonAllowed = tier === "deep" ? ["basis"] : [];

  let lastErr = "";
  // 10-14 进度表 30 ③: when only the timing passage was refused, the model rewrites that passage alone — the rest of the
  // reading is kept, the answer is shorter (faster), and nothing else can slip on the second pass
  let timingOnly: RawFields | null = null;
  // 11-05 (gen_fail_page: 「日衝」 in strategy, three whole-JSON rewrites in a row kept it): a term refused in one plain
  // field is rewritten in that field alone, the same way — the model no longer copies the rest back with the term in it
  let fieldOnly: { base: RawFields; key: string } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // a still chart has little to anchor on: a cooler first pass keeps the
      // tendency where static_read put it instead of letting phrasing decide
      const still = chart.cast.changingPositions.length === 0;
      const raw = await chatJson(messages, {
        temperature: attempt === 0 ? (tier === "deep" ? (still ? 0.35 : 0.55) : 0.75) : 0.45,
        maxTokens: tier === "deep" ? 3000 : 2400,
      });
      let parsed: unknown = JSON.parse(raw);
      if (timingOnly) {
        const fix = parsed as Record<string, unknown>;
        if (typeof fix?.timing === "string" && fix.timing.trim().length >= 8) parsed = { ...timingOnly, timing: fix.timing };
        else if (!validate(parsed)) parsed = timingOnly; // no usable timing back: keep the reading, the checks below decide again
        timingOnly = null;
      }
      if (fieldOnly) {
        const fix = parsed as Record<string, unknown>;
        const v = fix?.[fieldOnly.key];
        if (typeof v === "string" && v.trim().length >= 4) parsed = { ...fieldOnly.base, [fieldOnly.key]: v };
        else if (!validate(parsed)) parsed = fieldOnly.base;
        fieldOnly = null;
      }
      if (!validate(parsed)) {
        lastErr = "schema_invalid";
        continue;
      }
      // Traditional readers must never see Simplified: convert a leaking field
      // before the jargon check (whose zh-hant list would not even recognise
      // Simplified 应爻) and count the slip.
      if (locale === "zh-hant") {
        const { fixed, leaked } = ensureHant(parsed as RawFields);
        if (leaked.length) {
          recordOps("hant_leak", `${tier} ${leaked.join(",")}`);
          parsed = fixed;
        }
      }
      // 11-01 进度表 132 ②: a clause naming the payload's own words (「guard 判为 cap」) is dropped, not sent back for a rewrite
      { const sc = scrubReading(parsed); if (sc.changed.length) { recordOps("internal_scrub", `${tier} ${locale} ${sc.changed.join(",")}`); parsed = sc.reading; } }
      const offense = jargonOffense(parsed as RawFields, jargonAllowed, locale);
      // 六冲/六合 is the engine's call, not the model's: a claim the payload does not make is a rewrite
      const shapeErr = offense ? null : shapeOffense(parsed as RawFields, chart.shape);
      // 应期 must be one window (+ one sign) in the reader's calendar — no date lists, no 干支 (09-15)
      // 10-31 进度表 129 ③: judged against the odds the reader will see (the teaser's, or the model's after the chart's caps)
      const shownOdds = tier === "deep" ? (input.teaserOdds ?? oddsFor((parsed as RawFields).odds, chart, input, stored) ?? (parsed as RawFields).odds) : undefined;
      const timingSlip = offense || shapeErr || tier !== "deep" ? null : timingOffense({ ...(parsed as RawFields), ...(shownOdds ? { odds: String(shownOdds) } : {}) }, locale);
      // 10-13 (进度表 §四 30): 15 paid full readings in 7 days failed outright on the timing checks after four tries — the
      // reader waited for nothing. On the last try a timing slip (too many dates, a time of day) is kept and counted:
      // a reading with one date too many beats no reading.
      const timingErr = timingSlip && attempt === 3 ? (recordOps("gen_soft_accept", `${tier} ${locale} timing:${timingSlip}`), null) : timingSlip;
      // the light tier tells no time at all (09-17): a date or a "within N days" is a rewrite
      const dateErr = offense || shapeErr || tier === "deep" ? null : dateTalkOffense(parsed as RawFields, keys);
      // Cantonese guard (09-18): the model slips back into standard written
      // Chinese easily — a reading with no 唔/佢/嘅/咁/咗 in its prose is not
      // Cantonese. One nudge, then we take what we have rather than fail.
      if (yue && !offense && !shapeErr && !timingErr && !dateErr && !yueNudged) {
        const prose = keys.filter((k) => k !== "basis").map((k) => String((parsed as RawFields)[k] ?? "")).join(" ");
        if (!readsAsCantonese(prose)) {
          yueNudged = true;
          lastErr = "register:yue";
          recordOps("yue_slip", tier);
          messages.push(
            { role: "assistant", content: raw },
            { role: "user", content: "REWRITE REQUIRED. This reads as standard written Chinese, but the reader asked in Cantonese. Rewrite EVERY field in written Cantonese as Hong Kong people write it — 唔/佢/嘅/咁/喺/冇/咗/點解/而家, Cantonese grammar throughout, Traditional characters. Same meaning, same calls, same dates. Output the ENTIRE JSON again." },
          );
          continue;
        }
      }
      // the promised opening line (09-19): one nudge, then take what we have — a
      // reading that keeps its call but rephrases the first sentence is still the reading
      if (teaser && !offense && !shapeErr && !timingErr && !dateErr && !openingNudged) {
        const firstKey = String(keys[0]);
        const bad = openingOffense(parsed as RawFields, firstKey, teaser);
        if (bad) {
          openingNudged = true;
          lastErr = "opening";
          recordOps("teaser_opening_slip", tier);
          messages.push(
            { role: "assistant", content: raw },
            { role: "user", content: `REWRITE REQUIRED. Field "${firstKey}" must BEGIN with exactly this sentence, character for character, then continue: «${teaser}». Keep every other field as it is. Output the ENTIRE JSON again.` },
          );
          continue;
        }
      }
      // 10-04 opened later: one nudge when the timing field still talks of 今天 / 明天 — the cast day is not their today
      if (openedOn && !offense && !shapeErr && !timingErr && !dateErr && !lateNudged) {
        const bad = lateTimingOffense(parsed as RawFields, locale);
        if (bad) {
          lateNudged = true;
          lastErr = bad;
          recordOps("late_open_slip", `${locale} ${bad}`);
          messages.push(
            { role: "assistant", content: raw },
            { role: "user", content: `REWRITE REQUIRED. The reader opens this reading on ${openedOn}, after the cast day. Field "timing" says "${bad.slice(5)}", which reads as their today or tomorrow. Write calendar dates instead; say plainly which window has already gone by and which one is still ahead. Keep every other field as it is. Output the ENTIRE JSON again in the same language.` },
          );
          continue;
        }
      }
      if (guard && attempt < 3 && !input.teaserOdds && !offense && !shapeErr && !timingErr && !dateErr && !guardNudged) {
        const o = parseOdds((parsed as RawFields).odds);
        const opens = LOCALE_META[locale].cjk ? guardOpeningOffense((parsed as RawFields).verdict) : null;
        if (o === "strong" || o === "good" || (guard.level === "against" && o === "even") || opens) {
          guardNudged = true;
          lastErr = `guard:${guard.level}:${o}`;
          recordOps("guard_slip", `${locale} ${guard.level} ${o}`);
          messages.push(
            { role: "assistant", content: raw },
            { role: "user", content: `REWRITE REQUIRED. The payload's \`guard\` (${guard.rule_en}) is binding, but you rated this "${o}"${opens ? ` and the verdict opens by promising it ("${opens}")` : ""}. ${guard.level === "against" ? "It leans no: odds hard or very_hard, and the verdict says plainly it is unlikely." : "Never likely: odds even, hard or very_hard, and the verdict's FIRST sentence already says it is unlikely or names the one concrete condition it needs (要…才…) — never open with \"it will happen\" and add the condition later."} Make tendency, timing and signals agree. Output the ENTIRE JSON again in the same language.` },
          );
          continue;
        }
      }
      // 10-12 (进度表 §四 30): the reader's own words handed back — a note or an earlier question quoted, or "你那句".
      // Light: one rewrite, then take what we have. Deep held the prompt rule in the 10-11 review: counted, not rewritten.
      if (hasMatter && !offense && !shapeErr && !timingErr && !dateErr && !echoNudged) {
        const echo = echoOffense(parsed as Record<string, unknown>, keys.map(String), input.matterSoFar, input.question);
        if (echo) {
          echoNudged = true;
          recordOps(tier === "deep" ? "echo_deep" : "echo_light", `${locale} ${echo.slice(0, 60)}`);
          // 10-22: never on the last try — a rewrite asked for there would leave the reader with no reading at all
          if (tier !== "deep" && attempt < 3) {
            lastErr = `echo:${echo}`;
            messages.push(
              { role: "assistant", content: raw },
              { role: "user", content: `REWRITE REQUIRED. Field "${echo.split(":")[0]}" hands the reader's own earlier words back to them ("${echo.slice(echo.indexOf(":") + 1)}"). Never quote or closely paraphrase what they wrote or asked before, and never say "you said / you wrote / that line of yours". Their record is background; their state today is read from THIS chart alone. Keep the meaning and every call; output the ENTIRE JSON again in the same language.` },
            );
            continue;
          }
        }
      }
      // 10-22 复查: 「你嘴上說…，心裡其實…」 — their words set against a heart the reading claims to see, whatever the words
      // were (lib/echo-guard.ts contrastOffense). Every tier, with or without a matter: one rewrite, then take what we have.
      if (!offense && !shapeErr && !timingErr && !dateErr && !contrastNudged && attempt < 3) {
        const c = contrastOffense(parsed as Record<string, unknown>, keys.map(String).filter((k) => k !== "basis"));
        if (c) {
          contrastNudged = true;
          lastErr = `contrast:${c}`;
          recordOps(tier === "deep" ? "contrast_deep" : "contrast_light", `${locale} ${c.slice(0, 60)}`);
          messages.push(
            { role: "assistant", content: raw },
            { role: "user", content: `REWRITE REQUIRED. Field "${c.split(":")[0]}" sets the reader's own words against what they supposedly feel inside ("${c.split(":").slice(2).join(":")}…"). Never write "you say X but inside you…" (你嘴上說／你口頭上／你表面上): do not claim to see a heart that contradicts their words. Say what THIS chart shows about their state, plainly. Keep the meaning and every call; output the ENTIRE JSON again in the same language.` },
          );
          continue;
        }
      }
      // 10-22 复查: a full reading took a ritual asked about eleven days earlier for what the reader is doing now. Its matter
      // has record older than three days → one short second look by the model (lib/stale-guard.ts); a passage that takes
      // that record for the present gets the reading written again once. A failed look changes nothing.
      if (tier === "deep" && hasMatter && !offense && !shapeErr && !timingErr && !dateErr && !staleChecked && attempt < 3) {
        staleChecked = true;
        const v = await staleCheck(parsed as Record<string, unknown>, keys.map(String).filter((k) => k !== "basis" && k !== "timing"), input.matterSoFar, input.question);
        if (v?.stale) {
          lastErr = "stale";
          recordOps("stale_deep", `${locale} ${v.passages.join("｜").slice(0, 80)}`);
          messages.push(
            { role: "assistant", content: raw },
            { role: "user", content: staleRewrite(v.passages, oldRecords(input.matterSoFar)) },
          );
          continue;
        }
      }
      if (!offense && !shapeErr && !timingErr && !dateErr) {
        // 09-22: how long a reader actually waited, so the dashboard can show p50/p95
        recordOps("gen_ms", `${tier} ${Date.now() - startedAt}`);
        const out = localize<AnyReading>(parsed as RawFields, keys, locale);
        // 11-05 进度表 134: the one thing to do — optional (a reading without it is still a reading)
        const step = (parsed as RawFields).one_step;
        if (typeof step === "string" && step.trim().length >= 4) (out as unknown as Record<string, unknown>).one_step = { [locale]: step.trim().replace(/\s+/g, " ").slice(0, 120) };
        else recordOps("one_step_missing", `${tier} ${locale}`);
        // 09-26 五档倾向: a code, kept only if it is one of the five — and never against a still chart's computed lean
        if (tier === "deep") {
          // 09-26 对照测试: the lean shown free before paying is the lean the paid reading carries
          const odds = input.teaserOdds ?? oddsFor((parsed as RawFields).odds, chart, input, stored);
          if (odds) (out as unknown as Record<string, unknown>).odds = { [locale]: odds };
        }
        return out;
      }
      if (dateErr) {
        lastErr = `dates:${dateErr}`;
        messages.push(
          { role: "assistant", content: raw },
          {
            role: "user",
            content: `REWRITE REQUIRED. Field "${dateErr.split(":")[0]}" tells time ("${dateErr.split(":")[1]}"). This tier never names a date, a deadline, a number of days or an hour — timing belongs to the full reading. Say what the situation is and which way it leans, with no when. Output the ENTIRE JSON again in the same language; keep every other field as it is.`,
          },
        );
      } else if (timingErr) {
        lastErr = `timing:${timingErr}`;
        timingOnly = parsed as RawFields;
        const only = ` Output ONLY this JSON, nothing else: {"timing": "<the rewritten timing passage, in the same language>"} — every other field stays as you wrote it.`;
        messages.push(
          { role: "assistant", content: raw },
          {
            role: "user",
            content: (timingErr.startsWith("clock")
              ? `REWRITE ONLY THE TIMING. It names a time of day ("${timingErr.slice(6)}"). The smallest unit is a day: no clock hours, no 时辰, no tonight / this afternoon. Give a day-level window of at least three days from the candidates, with no likeliest day.`
              : timingErr.startsWith("ganzhi")
              ? `REWRITE ONLY THE TIMING. It contains the 干支 date name "${timingErr.split(":")[1]}". Dates in timing are plain calendar dates only (9月12日 / September 12); 干支 belongs in basis. Same window, plain dates.`
              : timingErr.startsWith("peak")
              ? `REWRITE ONLY THE TIMING. It picks out a likeliest day ("${timingErr.slice(5)}"). Never single out a day inside a window: give the observation period as a span and its last day as the check-back date (「10月16日到23日這段多留意；到23日還沒動靜，這一輪就先當作沒有」). Same candidates, no 前後 / 最可能 / most likely.`
              : timingErr.startsWith("deadline")
              ? `REWRITE ONLY THE TIMING. Your odds is "${timingErr.split(":")[1]}", so the timing must not predict when it will happen. Give ONE check-back date (the end of the nearest candidate window) and what to do by then: 「卦上看不太會自己動。給它到10月23日——那天前沒有消息，就把重心收回自己身上。」 No window offered as a prediction, no second date.`
              : `REWRITE ONLY THE TIMING. It lists ${timingErr.split(":")[1]} dates. Give ONE observation period (one span, 「10月16日到23日這段」) with its end as the check-back date, plus at most one later backup period — never more — and drop the rest.`) + only,
          },
        );
      } else if (offense && typeof (parsed as Record<string, unknown>)[offense.split(":")[0]] === "string" && offense.split(":")[0] !== "basis") {
        lastErr = `jargon:${offense}`;
        const key = offense.split(":")[0]!, term = offense.split(":").slice(1).join(":");
        fieldOnly = { base: parsed as RawFields, key };
        messages.push(
          { role: "assistant", content: raw },
          {
            role: "user",
            content: `REWRITE ONLY THE FIELD "${key}". It contains "${term}" — technical vocabulary a reader who has never opened the Yijing cannot follow. Say what it means in everyday words instead (for 日沖／日冲／日衝: "that day shakes things up" — 那幾天容易被打亂、臨時有變), and leave out every other chart term too. Same meaning, same advice, same language. Output ONLY this JSON, nothing else: {"${key}": "<the rewritten passage>"}`,
          },
        );
      } else if (offense) {
        lastErr = `jargon:${offense}`;
        messages.push(
          { role: "assistant", content: raw },
          {
            role: "user",
            content: `REWRITE REQUIRED. Field "${offense.split(":")[0]}" contains "${offense.split(":")[1]}" — technical vocabulary, classical phrasing or hexagram lore a reader who has never opened the Yijing cannot follow. ${tier === "deep" ? "Only the basis field may contain technical vocabulary." : "No field may contain technical vocabulary."} Rewrite the ENTIRE JSON with every such term or phrase translated into plain, everyday meaning, in the same output language. Same shape, same insights, plain words.`,
          },
        );
      } else {
        lastErr = `shape:${shapeErr}`;
        messages.push(
          { role: "assistant", content: raw },
          {
            role: "user",
            content: `REWRITE REQUIRED. Field "${shapeErr!.split(":")[0]}" claims a 六冲/六合 relation ("${shapeErr!.split(":")[1]}"), but chart.shape says neither hexagram has that form. Remove every statement about 六冲 or 六合 (and the "先散后合 / 先合后散" reasoning built on it), keep everything else, and output the ENTIRE JSON again in the same language.`,
          },
        );
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "unknown";
    }
    // every non-final attempt is a retry worth counting: a rising rate is the early warning
    if (attempt < 3) recordOps("gen_retry", `${tier} ${locale} attempt${attempt + 1} ${lastErr}`);
  }
  recordOps("gen_fail", `${tier} ${locale} ${lastErr}`);
  throw new Error(`generation_failed:${lastErr}`);
}

/**
 * 09-26: the model's odds code, checked. A still chart carries a computed lean
 * that binds the verdict; the odds must sit on the same side of it or they are
 * pulled to the nearest code that does.
 */
export function oddsFor(raw: unknown, chart: ReturnType<typeof resolveServerChart>, input: ReadingInput, stored: boolean): Odds | null {
  let o = parseOdds(raw);
  if (!o) return null;
  const timing = resolveTiming({ ...input, question: toHans(input.question) }, chart, stored);
  if (chart.cast.changingPositions.length === 0) {
    const lean = staticRead(chart, timing)?.lean;
    if (lean === "favorable" && (o === "hard" || o === "very_hard" || o === "even")) o = "good";
    else if (lean === "unfavorable" && (o === "strong" || o === "good" || o === "even")) o = "hard";
    else if (lean === "mixed" && (o === "strong" || o === "very_hard")) o = o === "strong" ? "good" : "hard";
  }
  // 10-13 重凶信号 caps every chart, and wins over a still chart's favorable lean
  const g = chartGuard(chart, timing, toHans(input.question));
  if (g?.level === "against" && (o === "strong" || o === "good" || o === "even")) o = "hard";
  if (g?.level === "cap" && (o === "strong" || o === "good")) o = "even";
  return o;
}

/** 10-12 解籤 (进度表 §四 36): the lot a cast follows, as background after the payload — or nothing. */
function qianNote(input: ReadingInput): string {
  const e = input.qian ? qianByNum(input.qian.num, input.qian.set ?? null) : null;
  return e ? `\n\n${qianPromptNote(e, input.qian!.temple)}` : "";
}
