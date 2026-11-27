"use client";

import { t, type Locale } from "@/lib/i18n";
import { SCALE_HINTS, TOPIC_HINTS, type ScaleHint } from "@/lib/hints";
import { TOPIC_NAMES, type Topic } from "@/lib/topic";
import type { AskWindow } from "@/lib/ask-window";
import { SITUATIONS, SITUATION_LABELS, SITUATION_PROMPT_LABEL, type Situation } from "@/lib/situation";
import { SCALE_KEYS, fmtAskWindow } from "@/lib/cast-ui/words";

/**
 * 10-22 进度表 76 (CastFlow 拆分): the optional hints under the question — time frame + topic.
 * One typeset line, like a marginal note on a printed form: "时间范围 让卦来定 ▾ · 问的是 事业 ▾". Tapping a value
 * unfolds a single row of plain-text options; nothing is boxed, nothing is required — the default is the cast's
 * own call. A love question adds the situation chips (09-26).
 */
export default function HintsRow({ locale, scaleHint, setScaleHint, askWin, autoScaleKey, hintOpen, setHintOpen, topicShown, setTopicHint, situation, setSituation }: {
  locale: Locale;
  scaleHint: ScaleHint | null;
  setScaleHint: (s: ScaleHint | null) => void;
  /** the window the question itself named (09-24), shown as dates when it is not today */
  askWin: AskWindow | null | undefined;
  autoScaleKey: "auto" | ScaleHint;
  hintOpen: "scale" | "topic" | null;
  setHintOpen: (o: "scale" | "topic" | null) => void;
  topicShown: Topic;
  setTopicHint: (tp: Topic) => void;
  situation: Situation | null;
  setSituation: (s: Situation | null) => void;
}) {
  return (
    <div className="mt-[var(--s-3)] fade-in">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="t-label">{t(locale, "hintScaleLabel")}</span>
        <button
          type="button"
          onClick={() => setHintOpen(hintOpen === "scale" ? null : "scale")}
          className={`hint-value ${hintOpen === "scale" ? "is-open" : ""}`}
          aria-expanded={hintOpen === "scale"}
        >
          {scaleHint
            ? t(locale, SCALE_KEYS[scaleHint])
            : askWin && askWin.kind !== "today"
              ? fmtAskWindow(askWin, locale)
              : t(locale, SCALE_KEYS[autoScaleKey])}<span className="hint-caret">▾</span>
        </button>
        <span className="t-label !text-[var(--ink-16)]">·</span>
        <span className="t-label">{t(locale, "hintTopicLabel")}</span>
        <button
          type="button"
          onClick={() => setHintOpen(hintOpen === "topic" ? null : "topic")}
          className={`hint-value ${hintOpen === "topic" ? "is-open" : ""}`}
          aria-expanded={hintOpen === "topic"}
        >
          {TOPIC_NAMES[topicShown][locale]}<span className="hint-caret">▾</span>
        </button>
      </p>
      {hintOpen === "scale" && (
        <p className="hint-options fade-in">
          {(["auto", ...SCALE_HINTS] as const).map((k) => {
            const on = scaleHint ? scaleHint === k : k === autoScaleKey;
            return (
              <button
                key={k}
                type="button"
                onClick={() => { setScaleHint(k === "auto" ? null : k); setHintOpen(null); }}
                className={`hint-opt ${on ? "is-on" : ""}`}
              >
                {t(locale, SCALE_KEYS[k])}
              </button>
            );
          })}
        </p>
      )}
      {hintOpen === "topic" && (
        <p className="hint-options fade-in">
          {TOPIC_HINTS.map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => { setTopicHint(tp); setHintOpen(null); }}
              className={`hint-opt ${topicShown === tp ? "is-on" : ""}`}
            >
              {TOPIC_NAMES[tp][locale]}
            </button>
          ))}
        </p>
      )}
      {/* 09-26: a love question reads differently for a couple, an ex gone quiet, someone taken — let them say which (optional) */}
      {topicShown === "relationship" && (
        <div className="mt-[var(--s-3)] fade-in" data-heat="situation">
          <p className="t-small !text-[var(--ink-45)] mb-2">{SITUATION_PROMPT_LABEL[locale] ?? SITUATION_PROMPT_LABEL.en}</p>
          <div className="flex flex-wrap gap-2">
            {SITUATIONS.map((k) => (
              <button key={k} type="button" aria-pressed={situation === k}
                onClick={() => setSituation(situation === k ? null : k)}
                className={`hint-opt ${situation === k ? "is-on" : ""}`}>
                {(SITUATION_LABELS[locale] ?? SITUATION_LABELS.en!)[k]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
