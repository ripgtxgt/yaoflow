"use client";

import type { ReactNode } from "react";
import { t, type Locale } from "@/lib/i18n";
import CrisisNote from "@/components/CrisisNote";
import type { QuestionIssue } from "@/lib/question-check";
import { cv } from "@/lib/dict/convert";
import { LOCALE_META } from "@/lib/locales";

/* 10-22 进度表 76 (CastFlow 拆分): the cast page's visual atoms — the line, the empty slot, the question note. */

/** The brand's only real asset: fixed ratio, cinnabar iff moving. */
export function LineGlyph({
  yang,
  changing,
  w = "w-36 md:w-48",
}: {
  yang: boolean;
  changing: boolean;
  w?: string;
}) {
  return (
    <div className={`relative ${w} ${changing ? "yao-moving" : ""}`}>
      {yang ? <span className="yao" /> : <div className="yao-yin"><span /><span /><span /></div>}
      {changing && (
        <span className="absolute -right-5 top-1/2 -translate-y-1/2 text-[11px] leading-none">
          {yang ? "○" : "×"}
        </span>
      )}
    </div>
  );
}

/**
 * 09-20: the note under the question box when what they typed names no
 * matter. A rule refusal is final; the model's offers "ask this anyway".
 */
export function QuestionIssueNote({ locale, kind, issue, onKeep }: { locale: Locale; kind: "rule" | "model"; issue?: QuestionIssue; onKeep: () => void }) {
  if (issue === "crisis") return <CrisisNote locale={locale} />;
  return (
    <p className="t-small mt-[var(--s-2)] !text-[var(--cinnabar)] fade-in" role="alert">
      {kind === "rule" ? (
        t(locale, "questionUnclear")
      ) : (
        <>
          {t(locale, "questionUnclearSoft")}{" "}
          <button type="button" onClick={onKeep} className="underline underline-offset-4 !text-[var(--ink)]">
            {t(locale, "questionKeep")}
          </button>
        </>
      )}
    </p>
  );
}

/** Empty slot in the ruler — the shape of a line not yet cast. */
export function LineSlot({ active, w = "w-36 md:w-48" }: { active: boolean; w?: string }) {
  return (
    <div
      className={`${w} h-[8px] rounded-[1px] border border-dashed transition-colors ${
        active ? "border-[var(--gold)]" : "border-current/20"
      }`}
    />
  );
}

/** Line names in the six-line convention: the sixth is 上, never 六. */
export const POS_ZH = ["初", "二", "三", "四", "五", "上"];

/**
 * 10-02 对照测试 x: the nearest timing window as the full reading will name it — the month shown, the day a grey block
 * (a month-level window has no day to hide). The rules' own window, the one the deep reading is written from.
 */
export function previewWhen(first: string, kind: string, rl: Locale): ReactNode {
  const [y, m] = first.split("-").map(Number);
  if (!y || !m) return null;
  const month = new Intl.DateTimeFormat(LOCALE_META[rl].htmlLang, { month: "long", timeZone: "UTC" }).format(Date.UTC(y, m - 1, 15));
  const [a, ...rest] = cv(rl, kind === "month" ? "pvWhenMonth" : "pvWhen", { m, month }).split("▇▇");
  return <>{a}{rest.length > 0 && <><span aria-hidden className="select-none opacity-35 tracking-[-0.12em]">▇▇</span>{rest.join("▇▇")}</>}</>;
}
