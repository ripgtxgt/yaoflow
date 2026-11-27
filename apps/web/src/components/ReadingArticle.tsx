"use client";

import { scrubReading } from "@/lib/internal-words";
import { LOCALE_META, t, type DictKey, type Locale } from "@/lib/i18n";
import { parseOdds } from "@/lib/situation";
import { tt } from "@/lib/dict/thread";
// 10-02: never a runtime import from "@/lib/reading" in a client component — that sent the whole module (and a regex
// old Safari cannot build) to the browser; the two values come from the light module
import { READING_KEYS, pick } from "@/lib/reading-keys";
import type { DeepReading, Reading, Tier } from "@/lib/reading";

const ONE_LABELS: Record<Exclude<keyof Reading, "one_step">, DictKey> = {
  summary: "secSummary", inner_condition: "secInner", outer_condition: "secOuter",
  movement: "secMovement", direction: "secDirection", next_step: "secNext",
  caution: "secCaution", reflection_question: "secReflect",
};

/**
 * A block of the reading set on paper. Every block carries the same weight —
 * which is the point: only the call (ink) and the closing line sit outside
 * this rhythm, so the eye knows immediately what it must not skip.
 */
/* The blocks arrive in order rather than all at once, so the reading reads as
   something being set down for you. ~90ms apart: enough to feel deliberate,
   short enough that the whole page has landed before you finish the call. */
const step = (i: number) => ({ animationDelay: `${i * 90}ms` });

/** 09-26: the model writes paragraphs; a single <p> used to run them together into one wall. */
export function Paras({ text, className = "t-body" }: { text: string; className?: string }) {
  const parts = text.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  return <>{parts.map((x, i) => <p key={i} className={`${className} ${i ? "mt-[var(--s-3)]" : ""}`}>{x}</p>)}</>;
}

function Block({ label, children, i }: { label: string; children: React.ReactNode; i: number }) {
  return (
    <div className="pt-[var(--s-5)] border-t border-[var(--ink-16)] fade-in" style={step(i)}>
      <h3 className="t-sect mb-[var(--s-2)]">{label}</h3>
      {typeof children === "string" ? <Paras text={children} /> : <p className="t-body">{children}</p>}
    </div>
  );
}

/**
 * 09-26 (Neil: 「解读页面太乱了」): the page had seven equal blocks in a row, so
 * nothing told the eye where the dates or the doing were. The timing now sits
 * in its own gold card, the next step leads the "what to do" group, and the
 * two halves of the advice — do / don't — stand side by side.
 */
function Card({ id, label, text, tone, i, big, hint }: { id?: string; label: string; text: string; tone: "gold" | "ink" | "cinnabar" | "plain"; i: number; big?: boolean; hint?: string }) {
  const frame =
    tone === "gold" ? "border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07]"
    : tone === "ink" ? "border-l-2 border-[var(--ink)]"
    : tone === "cinnabar" ? "border-l-2 border-[var(--cinnabar)]"
    : "border border-[var(--ink-16)]";
  const labelTone = tone === "gold" ? "!text-[var(--gold-text)]" : tone === "cinnabar" ? "!text-[var(--cinnabar)]" : "";
  return (
    <section id={id} className={`scroll-mt-20 rounded-[2px] ${frame} px-[var(--s-4)] py-[var(--s-4)] fade-in`} style={step(i)}>
      <h3 className={`t-sect mb-[var(--s-2)] ${labelTone}`}>{label}</h3>
      <Paras text={text} className={big ? "t-body !text-[17px] md:!text-[18px]" : "t-body"} />
      {/* 10-05: readers in Taiwan / Hong Kong asked 「這是農曆嗎」 — say which calendar the dates are in */}
      {hint && <p className="t-label mt-[var(--s-3)] opacity-60">{hint}</p>}
    </section>
  );
}

/** The call. Reversed out of ink — the one thing that must land. */
function TheCall({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ink-block call-in">
      <h3 className="t-sect !text-[var(--gold)] mb-[var(--s-3)]">{label}</h3>
      <p className="t-d2">{children}</p>
    </div>
  );
}

/** The closing line: a held note, not another paragraph. */
function Closing({ label, children, i }: { label: string; children: React.ReactNode; i: number }) {
  return (
    <div className="pt-[var(--s-5)] border-t border-[var(--ink-16)] fade-in" style={step(i)}>
      <h3 className="t-sect mb-[var(--s-3)]">{label}</h3>
      <p className="t-d3 stress text-[var(--ink-86)] text-center px-[var(--s-3)]">{children}</p>
      <div className="mx-auto mt-[var(--s-4)] h-px w-12 bg-[var(--gold)]" aria-hidden />
    </div>
  );
}

/**
 * The chart's logic, folded away at the end (09-15). It is the one passage
 * written in the craft's own terms — where a reader who knows Liu Yao checks
 * the work — and beta readers told us it read as a wall they could not get
 * past when it sat fourth of eight. The reading above it stands on its own.
 */
function BasisAside({ label, hint, children, i }: { label: string; hint: string; children: React.ReactNode; i: number }) {
  return (
    <details className="pt-[var(--s-5)] border-t border-[var(--ink-16)] fade-in group" style={step(i)}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="t-sect inline-flex items-baseline gap-2">
          <span className="inline-block w-[0.6em] text-[var(--ink-45)] transition-transform group-open:rotate-90">›</span>
          {label}
        </span>
        <span className="t-small block mt-[var(--s-2)] text-[var(--ink-45)]">{hint}</span>
      </summary>
      <div className="mt-[var(--s-3)]">{typeof children === "string" ? <Paras text={children} /> : children}</div>
    </details>
  );
}

/**
 * Reading order for the master tier (09-15): the call, the lie of the land,
 * when, what to do first, how to play it, what to avoid, the closing line —
 * and only then the chart's logic, folded. Before this the logic sat fourth,
 * between timing and strategy, and lay readers stopped there.
 */
// 09-17: `signals` (what to watch, one for the better and one for the worse) sits after 忌讳; readings made before it simply have none

export default function ReadingArticle(
  { locale, tier, reading, topic }: { locale: Locale; tier: Tier; reading: Reading | DeepReading; topic?: string | null },
) {
  // 11-01 进度表 132 ②: readings written before the scrub may still name the payload's words — dropped on the way out
  reading = scrubReading(reading).reading;
  if (tier === "deep") {
    const r = reading as DeepReading;
    const f = (k: keyof DeepReading) => pick(r[k], locale);
    const odds = parseOdds(f("odds"));
    let n = 1;
    return (
      <article className="mt-[var(--s-5)] flex flex-col gap-[var(--s-5)]">
        {/* 09-26 五档倾向: one word the reader can hold on to, above the call */}
        {odds && (
          <p className="t-label -mb-[var(--s-3)]">
            {tt(locale, "oddsLabel")} · <span className={`${odds === "strong" || odds === "good" ? "!text-[var(--gold-text)]" : odds === "even" ? "" : "!text-[var(--cinnabar)]"}`}>{tt(locale, `odds_${odds}` as "odds_good")}</span>
          </p>
        )}
        <div id="verdict" className="scroll-mt-20"><TheCall label={t(locale, "dVerdict")}>{f("verdict")}</TheCall></div>
        {f("tendency") && <Block i={n++} label={t(locale, "dTendency")}>{f("tendency")}</Block>}
        {/* 09-26: the other side — the question readers most often came back to ask */}
        {f("other_side") && <Card id="other" i={n++} tone="plain" label={tt(locale, topic === "relationship" || topic === "decision" || !topic ? "dOther" : "dOuter")} text={f("other_side")} />}
        {f("timing") && <Card id="timing" i={n++} tone="gold" label={t(locale, "dTiming")} text={f("timing")} big hint={LOCALE_META[locale].cjk ? t(locale, "dTimingCal") : undefined} />}
        {f("next_step") && <Card id="next" i={n++} tone="ink" label={t(locale, "dNext")} text={f("next_step")} big />}
        {(f("strategy") || f("caution")) && (
          <div className="grid gap-[var(--s-4)] md:grid-cols-2">
            {f("strategy") && <Card i={n++} tone="plain" label={t(locale, "dStrategy")} text={f("strategy")} />}
            {f("caution") && <Card i={n++} tone="cinnabar" label={t(locale, "dCaution")} text={f("caution")} />}
          </div>
        )}
        {f("signals") && <Block i={n++} label={t(locale, "dSignals")}>{f("signals")}</Block>}
        {/* 11-05 进度表 134: the one thing to carry away — also prefills 「你打算怎麼做」 below */}
        {f("one_step") && <Card id="one-step" i={n++} tone="gold" label={tt(locale, "dOneStep")} text={f("one_step")} />}
        <Closing i={n++} label={t(locale, "dClosing")}>
          {f("closing")}
        </Closing>
        <BasisAside i={n++} label={t(locale, "dBasisAside")} hint={t(locale, "dBasisHint")}>
          {f("basis")}
        </BasisAside>
      </article>
    );
  }

  // the light tier (09-17): situation, inside, outside, a lean, one question — older readings also carry movement / next step / caution
  const r = reading as Reading;
  const blocks = READING_KEYS.filter((k) => k !== "summary" && k !== "reflection_question" && pick(r[k], locale) !== "");
  return (
    <article className="mt-[var(--s-5)] flex flex-col gap-[var(--s-5)]">
      <TheCall label={t(locale, "secSummary")}>{pick(r.summary, locale)}</TheCall>
      {blocks.map((k, i) => (
        <Block key={k} i={i + 1} label={t(locale, ONE_LABELS[k as Exclude<keyof Reading, "one_step">])}>{pick(r[k], locale)}</Block>
      ))}
      {/* 11-05 进度表 134 */}
      {pick(r.one_step, locale) && <Card id="one-step" i={blocks.length + 1} tone="gold" label={tt(locale, "dOneStep")} text={pick(r.one_step, locale)} />}
      <Closing i={blocks.length + 1} label={t(locale, "secReflect")}>
        {pick(r.reflection_question, locale)}
      </Closing>
    </article>
  );
}
