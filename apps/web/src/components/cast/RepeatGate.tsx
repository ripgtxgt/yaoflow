"use client";

import type { RefObject } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { TOPIC_NAMES, type Topic } from "@/lib/topic";
import type { GateVerdict } from "@/lib/repeat-gate";
import { tt } from "@/lib/dict/thread";
import { mt } from "@/lib/dict/matter";
import { entryT } from "@/lib/dict/entry";

/**
 * 10-22 进度表 76 (CastFlow 拆分): the 一事一占 guard's panel. Before the rite, or — for a question written after the
 * cast — when the reading is asked for. "same" may be waived; "cap" (the topic's casts for the day are spent) may
 * not. The decision is lib/repeat-gate's; the three doors' work (the earlier figure handed back, a different
 * matter, the waiver) stays with CastFlow, which owns the cast.
 */
export default function RepeatGate({ locale, repeat, topicShown, hasChart, panelRef, onPrior, onOther, onWaive }: {
  locale: Locale;
  repeat: NonNullable<GateVerdict>;
  topicShown: Topic;
  /** a figure is already on the page (the cap's "ask about something else" door only shows before one) */
  hasChart: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  /** 09-26 热区 (C): hand the matter's earlier figure back */
  onPrior: () => void;
  /** 09-30: the cap is on the topic — clear the way for a different matter */
  onOther: () => void;
  /** the same matter, cast again anyway */
  onWaive: () => void;
}) {
  return (
    <div ref={panelRef} className="mt-12 border border-[var(--gold)]/45 rounded-[2px] p-6 md:p-8 fade-in">
      <p className="t-label !text-[var(--gold-text)] mb-3">{t(locale, "repeatQuote")}</p>
      <p className="t-body mb-6">
        {repeat.kind === "cap"
          ? repeat.by === "circling"
            ? /* 09-22: they kept rewording one matter — naming the topic here would
                 miss the point, because what was counted is the matter, not the chip */
              t(locale, "repeatCircling", { n: repeat.count, hex: repeat.past.hex })
            : t(locale, "repeatCapBody", {
                topic: TOPIC_NAMES[repeat.past.topic ?? topicShown][locale],
                n: repeat.count,
                hex: repeat.past.hex,
              })
          : t(locale, "repeatBody", {
              hours: Math.max(1, Math.round((Date.now() - repeat.past.at) / 3_600_000)),
              hex: repeat.past.hex,
            })}
      </p>
      {/* 09-16: show what it matched — the reader can see for themselves whether it is the same matter */}
      {repeat.kind === "same" && repeat.past.raw && (
        <p className="t-small mb-6 -mt-3 !text-[var(--ink-66)]">{t(locale, "repeatAsked", { q: repeat.past.raw })}</p>
      )}
      <div className="flex flex-wrap gap-3">
        {/* 09-18: the same matter belongs to the reading it already has — go back and ask there
            (a light reading offers the deep one first; the conversation lives under it) */}
        {/* 09-23 粘性: a deep reading on the same matter — the first door is 「记一笔进展」 (what happened
            since, answered inside that cast), the conversation second; circling one matter counts too */}
        {/* 09-30 (Neil: 「1，2，3都做吧」): the topic cap ("今天这件事已经问了 n 卦") had only "home" — 491 sessions
            a week met it and 87% stopped there. It now gets the same doors as the other two kinds: the matter's
            page, the earlier figure handed back, and — below — asking about something else. */}
        {(repeat.kind === "same" || repeat.kind === "cap") && repeat.past.sid && repeat.past.tier === "deep" ? (
          <>
            {/* 09-29 「一件事」: the matter's own page first — where it stands, the next day to watch, notes, the conversation */}
            <Link
              href={`/${locale}/matter/s?sid=${encodeURIComponent(repeat.past.sid)}`}
              data-heat="gate-matter"
              className="min-h-[var(--s-6)] grid place-items-center px-6 rounded-[2px]
                         bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]"
            >
              {mt(locale, "open")}
            </Link>
            <Link
              href={`/${locale}/reading?sid=${encodeURIComponent(repeat.past.sid)}#progress`}
              data-heat="gate-note"
              className="t-label self-center hover:text-[var(--ink)] transition-colors"
            >
              {tt(locale, "gateNote")} →
            </Link>
            <Link
              href={`/${locale}/reading?sid=${encodeURIComponent(repeat.past.sid)}#followup`}
              data-heat="gate-ask"
              className="t-label self-center hover:text-[var(--ink)] transition-colors"
            >
              {tt(locale, "gateAsk")} →
            </Link>
          </>
        ) : (repeat.kind === "same" || repeat.kind === "cap") && !repeat.past.verdict && !repeat.past.sid && repeat.past.v?.length === 6 && repeat.past.t ? (
          /* 09-26 热区 (C): 29% of casting sessions met this panel and most had never bought the earlier figure —
             the only door was "home". The matter already has its figure: hand that one back, priced as ever.
             Still one matter, one cast — nothing new is thrown. */
          <button
            type="button"
            data-heat="gate-prior"
            onClick={onPrior}
            className="min-h-[var(--s-6)] px-6 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]"
          >
            {tt(locale, "gatePrior", { hex: repeat.past.hex })}
          </button>
        ) : repeat.past.sid ? (
          <Link
            href={`/${locale}/matter/s?sid=${encodeURIComponent(repeat.past.sid)}`}
            data-heat="gate-matter-light"
            className="min-h-[var(--s-6)] grid place-items-center px-6 rounded-[2px]
                       bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]"
          >
            {t(locale, repeat.past.tier === "deep" ? "repeatGoBack" : "repeatGoBackLight")}
          </Link>
        ) : (
          <Link
            href={`/${locale}`}
            className="min-h-[var(--s-6)] grid place-items-center px-6 rounded-[2px]
                       bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]"
          >
            {t(locale, "repeatBack")}
          </Link>
        )}
        {/* 09-30: the cap is on the topic, so a different matter may still be cast — say so, and clear the way */}
        {repeat.kind === "cap" && repeat.by === "topic" && !hasChart && (
          <button
            type="button"
            data-heat="gate-other"
            onClick={onOther}
            className="min-h-[var(--s-6)] px-6 rounded-[2px] border border-[var(--ink-16)]
                       t-label hover:text-[var(--ink)] transition-colors"
          >
            {entryT(locale).capOther}
          </button>
        )}
        {repeat.kind === "same" && !repeat.waivable && (
          <p className="t-small !text-[var(--ink-45)] self-center">{t(locale, "repeatWaiversSpent")}</p>
        )}
        {repeat.kind === "same" && repeat.waivable && (
          <button
            onClick={onWaive}
            className="min-h-[var(--s-6)] px-6 rounded-[2px] border border-[var(--ink-16)]
                       t-label hover:text-[var(--ink)] transition-colors"
          >
            {t(locale, "repeatProceed")}
          </button>
        )}
      </div>
    </div>
  );
}
