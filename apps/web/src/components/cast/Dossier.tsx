"use client";

import { PHASE_ZH, STRENGTH_ZH, type FullChart, type HexTexts, type LineValue } from "@yaoflow/engine";
import { t, type Locale } from "@/lib/i18n";
import { altLang, hexName, hexSubName, judgmentFor, lineTextFor, relationLabel, spiritLabel, strengthLabel } from "@/lib/names";
import type { LocalTexts } from "@/lib/local-texts";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import type { ReactNode } from "react";
import { LineGlyph, POS_ZH } from "./atoms";

/**
 * 10-22 进度表 76 (CastFlow 拆分): the figure's dossier — dateline, the figure drawn, the moving lines, the judgment
 * and the line texts as received, and the chart itself folded away. Nothing here depends on who is casting.
 */
export default function Dossier({ locale, zh, readingLocale, chart, texts, values, localTexts, children }: {
  locale: Locale;
  /** Chinese-style chart labels (zh, zh-hant, ja) */
  zh: boolean;
  /** the language the reading is written in — the figure's name follows it */
  readingLocale: Locale;
  chart: FullChart;
  texts: HexTexts;
  values: LineValue[];
  /** the classical text in the reader's own language, when there is one */
  localTexts?: LocalTexts;
  /**
   * 11-05: what the reader came for — the free line, the block before the price, the reading — set right under the
   * figure. When given, the judgment and the line texts fold into one closed panel below it, beside the chart.
   */
  children?: ReactNode;
}) {
  const fold = children != null;
  const received = (
    <>
      {/* judgment — the received text, set as a quotation */}
      <section className={fold ? "" : "pt-[var(--s-5)] border-t border-[var(--ink-16)]"}>
        <h2 className="t-sect mb-[var(--s-3)]">{t(locale, "judgment")}</h2>
        <p className="t-d3">{judgmentFor(texts, locale, localTexts).main}</p>
        <p lang={altLang(locale, localTexts)} className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">
          {judgmentFor(texts, locale, localTexts).alt}
        </p>
      </section>

      {/* moving-line texts */}
      {chart.cast.changingPositions.length > 0 && (
        <section className="mt-[var(--s-5)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
          <h2 className="t-sect mb-[var(--s-4)]">{t(locale, "lineTexts")}</h2>
          <div className="flex flex-col gap-[var(--s-4)]">
            {chart.cast.changingPositions.map((p) => (
              <div key={p} className="border-l-2 border-[var(--cinnabar)] pl-4">
                <p className="t-label !text-[var(--cinnabar)] mb-1">{texts.zh.lines[p - 1]!.label}</p>
                <p className="t-body">{lineTextFor(texts, p, locale, localTexts).main}</p>
                <p lang={altLang(locale, localTexts)} className="t-small !text-[var(--ink-45)]">
                  {lineTextFor(texts, p, locale, localTexts).alt}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
  return (
    <>
      {/* dateline */}
      <p className="t-label pb-[var(--s-3)] border-b border-[var(--ink-16)]">
        {chart.calendar.month.stem}{chart.calendar.month.branch}{zh ? "月" : ""}
        {"  "}
        {chart.calendar.day.stem}{chart.calendar.day.branch}{zh ? "日" : ""}
      </p>

      {/* the figure — drawn, never a glyph */}
      <div className="flex items-center gap-6 py-[var(--s-5)]">
        <div>
          <FigureMark yangs={primaryYangs(values)} width={52} className="mb-2.5" />
          <p className="t-body !text-[15px]">{hexName(chart.cast.primary, readingLocale)}</p>
          <p className="t-label !normal-case !tracking-[0.06em] mt-0.5">
            {hexSubName(chart.cast.primary, locale)}
          </p>
        </div>
        {chart.cast.changed && (
          <>
            <span className="t-label !text-[16px] self-center pt-2">→</span>
            <div className="text-[var(--ink-66)]">
              <FigureMark yangs={changedYangs(values)} width={52} className="mb-2.5" />
              <p className="t-body !text-[15px] text-[var(--ink)]">
                {hexName(chart.cast.changed, readingLocale)}
              </p>
              <p className="t-label !normal-case !tracking-[0.06em] mt-0.5">
                {hexSubName(chart.cast.changed, locale)}
              </p>
            </div>
          </>
        )}
      </div>

      <p className="t-small pb-[var(--s-5)]">
        {chart.cast.changingPositions.length > 0 ? (
          <>
            {t(locale, "changingAt")}{" "}
            <span className="text-[var(--cinnabar)]">
              {chart.cast.changingPositions
                .map((p) => (zh ? POS_ZH[p - 1] : locale === "ko" ? `${p}효` : `#${p}`))
                .join(" · ")}
            </span>
          </>
        ) : (
          t(locale, "noChanging")
        )}
        {chart.calendar.voidBranches.length > 0 && (
          <>
            {"  ·  "}
            <span className="text-[var(--gold-text)]">
              {t(locale, "voidLabel")} {chart.calendar.voidBranches.join(" ")}
            </span>
          </>
        )}
      </p>

      {fold ? (
        <>
          <div className="border-t border-[var(--ink-16)] pt-[var(--s-5)]">{children}</div>
          <details className="group mt-[var(--s-6)] panel">
            <summary className="cursor-pointer list-none flex justify-between items-center gap-4 px-[var(--s-4)] min-h-[var(--s-6)]">
              <span className="t-sect">{t(locale, "judgment")}{chart.cast.changingPositions.length > 0 ? ` · ${t(locale, "lineTexts")}` : ""}</span>
              <span className="t-label transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="px-[var(--s-4)] pb-[var(--s-5)] pt-[var(--s-3)]">{received}</div>
          </details>
        </>
      ) : received}

      {/* the chart itself — folded away for anyone who doesn't want it */}
      <details className={`group ${fold ? "mt-[var(--s-3)]" : "mt-[var(--s-5)]"} panel`}>
        <summary className="cursor-pointer list-none flex justify-between items-center gap-4 px-[var(--s-4)] min-h-[var(--s-6)]">
          <span className="t-sect">{t(locale, "proChart")}</span>
          <span className="t-label transition-transform group-open:rotate-180">▾</span>
        </summary>

        <div className="px-[var(--s-4)] pb-[var(--s-5)]">
          <p className="t-label !normal-case !tracking-[0.06em] pb-[var(--s-3)] mb-[var(--s-4)] border-b border-[var(--ink-16)]">
            {chart.calendar.year.stem}{chart.calendar.year.branch}{zh ? "年" : ""} ·{" "}
            {chart.calendar.month.stem}{chart.calendar.month.branch}{zh ? "月" : ""} ·{" "}
            {chart.calendar.day.stem}{chart.calendar.day.branch}{zh ? "日" : ""} ·{" "}
            {t(locale, "legend")}
          </p>

          <div className="flex flex-col gap-[var(--s-3)] overflow-x-auto">
            {[...chart.lines].reverse().map((l) => (
              <div key={l.position} className="flex items-center gap-3 min-w-max">
                <span className="t-label w-4 shrink-0 !tracking-normal">
                  {zh ? POS_ZH[l.position - 1] : l.position}
                </span>
                <LineGlyph
                  yang={l.polarity === "yang"}
                  changing={l.changing}
                  w="w-16 md:w-24"
                />
                <span className="font-[family-name:var(--mono)] text-[11px] w-[8.5rem] shrink-0 pl-3">
                  {zh
                    ? `${relationLabel(l.relation, locale)} ${l.stem}${l.branch}${PHASE_ZH[l.phase as keyof typeof PHASE_ZH]}`
                    : `${relationLabel(l.relation, locale)} ${l.stem}${l.branch}`}
                </span>
                <span className="t-label !normal-case w-14 shrink-0">
                  {spiritLabel(l.spirit, locale)}
                </span>
                <span className="t-label !text-[var(--cinnabar)] w-4 shrink-0">
                  {l.isWorld ? t(locale, "world") : l.isResponse ? t(locale, "response") : ""}
                </span>
                <span className="flex gap-2 shrink-0 t-label !normal-case !tracking-[0.04em]">
                  <span>{zh ? STRENGTH_ZH[l.strength] : strengthLabel(l.strength, locale)}</span>
                  {l.isVoid && <span className="!text-[var(--gold-text)]">{t(locale, "voidLabel")}</span>}
                  {l.monthClash && <span className="text-[var(--cinnabar)]">{t(locale, "monthClash")}</span>}
                  {l.dayClash && <span className="text-[var(--cinnabar)]">{t(locale, "dayClash")}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </>
  );
}
