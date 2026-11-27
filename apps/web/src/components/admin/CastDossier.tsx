import { STRENGTH_ZH, textsFor, type FullChart, type LineValue } from "@yaoflow/engine";
import { t, type Locale } from "@/lib/i18n";
import { altLang, hexName, hexSubName, judgmentFor, lineTextFor, relationLabel, spiritLabel } from "@/lib/names";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";

/**
 * 10-13 (Neil: 「能做成用户能看到的页面那种样子吗」): one cast in the back office, laid out the way the reader saw it on
 * the cast page — dateline, the two figures with their names, moving lines and 旬空, 卦辞, 爻辞, the folded chart (open
 * here) and the free line. Same type classes as components/CastFlow.tsx's result block; server-rendered, no state.
 * Always in Chinese: the reader's own script when they read Chinese, Traditional otherwise.
 */
const POS_ZH = ["初", "二", "三", "四", "五", "上"];
const PHASE_ZH: Record<string, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };

export default function CastDossier({ chart, values, question, teaser, readerLocale }: {
  chart: FullChart; values: LineValue[]; question: string | null; teaser: string | null; readerLocale: string | null;
}) {
  const locale: Locale = readerLocale === "zh" ? "zh" : "zh-hant";
  const texts = textsFor(chart.cast.primary.number);
  const j = judgmentFor(texts, locale);
  return (
    <div className="max-w-[560px]" style={{ fontFamily: locale === "zh" ? "var(--serif-zh)" : "var(--serif-hant)" }}>
      {question && <p className="t-body mb-[var(--s-3)]">「{question}」</p>}
      {readerLocale && readerLocale !== "zh" && readerLocale !== "zh-hant" && (
        <p className="t-small mb-2 opacity-70">读者用的是 {readerLocale} 版页面，这里统一用繁体显示。</p>
      )}
      <p className="t-label pb-[var(--s-3)] border-b border-[var(--ink-16)]">
        {chart.calendar.month.stem}{chart.calendar.month.branch}月{"  "}{chart.calendar.day.stem}{chart.calendar.day.branch}日
      </p>

      <div className="flex items-center gap-6 py-[var(--s-5)]">
        <div>
          <FigureMark yangs={primaryYangs(values)} width={52} className="mb-2.5" />
          <p className="t-body !text-[15px]">{hexName(chart.cast.primary, locale)}</p>
          <p className="t-label !normal-case !tracking-[0.06em] mt-0.5">{hexSubName(chart.cast.primary, locale)}</p>
        </div>
        {chart.cast.changed && (
          <>
            <span className="t-label !text-[16px] self-center pt-2">→</span>
            <div className="text-[var(--ink-66)]">
              <FigureMark yangs={changedYangs(values)} width={52} className="mb-2.5" />
              <p className="t-body !text-[15px] text-[var(--ink)]">{hexName(chart.cast.changed, locale)}</p>
              <p className="t-label !normal-case !tracking-[0.06em] mt-0.5">{hexSubName(chart.cast.changed, locale)}</p>
            </div>
          </>
        )}
      </div>

      <p className="t-small pb-[var(--s-5)]">
        {chart.cast.changingPositions.length > 0 ? (
          <>{t(locale, "changingAt")}{" "}<span className="text-[var(--cinnabar)]">{chart.cast.changingPositions.map((p) => POS_ZH[p - 1]).join(" · ")}</span></>
        ) : t(locale, "noChanging")}
        {chart.calendar.voidBranches.length > 0 && (
          <>{"  ·  "}<span className="text-[var(--gold-text)]">{t(locale, "voidLabel")} {chart.calendar.voidBranches.join(" ")}</span></>
        )}
      </p>

      {teaser && (
        <div className="mb-[var(--s-5)] border-l-2 border-[var(--cinnabar)] pl-[var(--s-3)]">
          <p className="t-label mb-1">读者看到的免费一句</p>
          <p className="t-body">{teaser}</p>
        </div>
      )}

      <section className="pt-[var(--s-5)] border-t border-[var(--ink-16)]">
        <h2 className="t-sect mb-[var(--s-3)]">{t(locale, "judgment")}</h2>
        <p className="t-d3">{j.main}</p>
        <p lang={altLang(locale)} className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{j.alt}</p>
      </section>

      {chart.cast.changingPositions.length > 0 && (
        <section className="mt-[var(--s-5)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
          <h2 className="t-sect mb-[var(--s-4)]">{t(locale, "lineTexts")}</h2>
          <div className="flex flex-col gap-[var(--s-4)]">
            {chart.cast.changingPositions.map((p) => {
              const l = lineTextFor(texts, p, locale);
              return (
                <div key={p} className="border-l-2 border-[var(--cinnabar)] pl-4">
                  <p className="t-label !text-[var(--cinnabar)] mb-1">{l.label}</p>
                  <p className="t-body">{l.main}</p>
                  <p lang={altLang(locale)} className="t-small !text-[var(--ink-45)]">{l.alt}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <details open className="group mt-[var(--s-5)] panel">
        <summary className="cursor-pointer list-none flex justify-between items-center gap-4 px-[var(--s-4)] min-h-[var(--s-6)]">
          <span className="t-sect">{t(locale, "proChart")}</span>
          <span className="t-label transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="px-[var(--s-4)] pb-[var(--s-5)]">
          <p className="t-label !normal-case !tracking-[0.06em] pb-[var(--s-3)] mb-[var(--s-4)] border-b border-[var(--ink-16)]">
            {chart.calendar.year.stem}{chart.calendar.year.branch}年 · {chart.calendar.month.stem}{chart.calendar.month.branch}月 · {chart.calendar.day.stem}{chart.calendar.day.branch}日 · {t(locale, "legend")}
          </p>
          <div className="flex flex-col gap-[var(--s-3)] overflow-x-auto">
            {[...chart.lines].reverse().map((l) => {
              const ch = chart.changes.find((x) => x.position === l.position);
              return (
                <div key={l.position} className="flex items-center gap-3 min-w-max">
                  <span className="t-label w-4 shrink-0 !tracking-normal">{POS_ZH[l.position - 1]}</span>
                  <div className={`relative w-16 md:w-24 ${l.changing ? "yao-moving" : ""}`}>
                    {l.polarity === "yang" ? <span className="yao" /> : <div className="yao-yin"><span /><span /><span /></div>}
                    {l.changing && <span className="absolute -right-5 top-1/2 -translate-y-1/2 text-[11px] leading-none">{l.polarity === "yang" ? "○" : "×"}</span>}
                  </div>
                  <span className="font-[family-name:var(--mono)] text-[11px] w-[8.5rem] shrink-0 pl-3">
                    {relationLabel(l.relation, locale)} {l.stem}{l.branch}{PHASE_ZH[l.phase] ?? ""}
                  </span>
                  <span className="t-label !normal-case w-14 shrink-0">{spiritLabel(l.spirit, locale)}</span>
                  <span className="t-label !text-[var(--cinnabar)] w-4 shrink-0">{l.isWorld ? t(locale, "world") : l.isResponse ? t(locale, "response") : ""}</span>
                  <span className="flex gap-2 shrink-0 t-label !normal-case !tracking-[0.04em]">
                    <span>{STRENGTH_ZH[l.strength]}</span>
                    {l.isVoid && <span className="!text-[var(--gold-text)]">{t(locale, "voidLabel")}</span>}
                    {l.monthClash && <span className="text-[var(--cinnabar)]">{t(locale, "monthClash")}</span>}
                    {l.dayClash && <span className="text-[var(--cinnabar)]">{t(locale, "dayClash")}</span>}
                    {ch && <span className="opacity-70">→ {relationLabel(ch.to.relation, locale)} {ch.to.stem}{ch.to.branch}{PHASE_ZH[ch.to.phase] ?? ""}</span>}
                  </span>
                </div>
              );
            })}
          </div>
          {chart.changes.length > 0 && <p className="t-small mt-[var(--s-4)]">{chart.changes.map((x) => x.zh).join("；")}</p>}
        </div>
      </details>
    </div>
  );
}
