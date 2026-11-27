"use client";

import { useMemo } from "react";
import { fullChart, textsFor, type LineValue } from "@yaoflow/engine";
import { asLocale } from "@/lib/locales";
import { chineseLabels, hexName } from "@/lib/names";
import { formatMoney, passMinor, priceMinor, tongkaMinor, type Currency } from "@/lib/money";
import { ctt, shortDay } from "@/lib/dict/cast-thread";
import { passT } from "@/lib/dict/pass";
import { t } from "@/lib/i18n";
import Dossier from "@/components/cast/Dossier";
import TongkaPanel from "@/components/TongkaPanel";

/**
 * 11-05 (Neil: 「没有买的，也要像买了或用额度看了的卦，行尾都有一个红字链接「读者页 ↗」」→ 「只还原读者当时那一页」):
 * the cast page as the reader saw it once the coins fell and they had not paid — the question, the dossier, the casts
 * before it on this matter, the block before the price, the 通卡 panel. Same components as CastFlow; nothing here buys.
 */
export default function ReaderCastView({ locale, question, teaser = null, values, at, tz, n, chain, nudge, currency, first }: {
  locale: string; question: string | null;
  /** 11-05: the free line the reader saw (null when there was none) */
  teaser?: string | null; values: LineValue[]; at: number; tz: number;
  n: number | null; chain: { day: string; hex: string }[];
  nudge: { title: string; body: string; cta: string; goal: "deep" | "member" } | null;
  currency: Currency; first: boolean;
}) {
  const l = asLocale(locale);
  const chart = useMemo(() => fullChart({ values, utcMs: at, tzOffsetMinutes: tz }), [values, at, tz]);
  const texts = useMemo(() => textsFor(chart.cast.primary.number), [chart]);
  const price = formatMoney(currency, tongkaMinor(currency, 1, first), l);
  const month = formatMoney(currency, priceMinor(currency, "month"), l);
  const pass = formatMoney(currency, passMinor(currency), l);
  const fill = (s: string) => s.replace(/\{price\}/g, price).replace(/\{month\}/g, month).replace(/\{pass\}/g, pass);
  const btn = "inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.1em] cursor-default";
  return (
    <div className="max-w-[560px] mx-auto px-[var(--s-4)] pb-24">
      {question && <p className="t-body border-b border-[var(--ink-16)] pb-[var(--s-3)] mb-[var(--s-3)]">{question}</p>}
      <div className="mt-[var(--s-5)]">
        <Dossier locale={l} zh={chineseLabels(l)} readingLocale={l} chart={chart} texts={texts} values={values}>
        {/* 11-05: the same order as the reader's page now — the line and the price under the figure, the texts folded below */}
        <section>
          {(nudge || teaser || (n ?? 0) >= 2) && (
            <div className="mb-[var(--s-4)] border-l-2 border-[var(--cinnabar)] pl-[var(--s-3)]">
              {(n ?? 0) >= 2 && (
                <div className="mb-2">
                  <p className="t-label !text-[var(--gold-text)]">{ctt(l, "thCount", { n: n! })}</p>
                  <p className="t-small mt-0.5 !text-[var(--ink-66)]">
                    {n! - 1 > chain.length ? `${ctt(l, "thMore")} ` : ""}
                    {chain.map((c, i) => <span key={`${c.day}-${i}`} className="whitespace-nowrap">{shortDay(c.day, l)} {c.hex}<span aria-hidden> · </span></span>)}
                    <span className="whitespace-nowrap !text-[var(--ink)]">{ctt(l, "thNow")} {hexName(chart.cast.primary, l)}</span>
                  </p>
                </div>
              )}
              {/* the free line, as the page labelled it */}
              {teaser && (
                <>
                  <p className="t-label mb-1">{(n ?? 0) >= 2 ? ctt(l, "thLabel") : t(l, "teaserLabel")}</p>
                  <p className="t-body">{teaser}</p>
                  {!nudge && <p className="t-small mt-2 !text-[var(--ink-66)]">{t(l, "teaserMore")}</p>}
                </>
              )}
              {nudge && (
                <div className="mt-[var(--s-3)] pt-[var(--s-3)] border-t border-[var(--ink-16)]">
                  <p className="t-body !text-[15px]">{fill(nudge.title)}</p>
                  <p className="t-small mt-1 !text-[var(--ink-66)]">{fill(nudge.body)}</p>
                  <span className={btn}>{fill(nudge.cta)}</span>
                  {nudge.goal === "member" && <span className="block t-small mt-[var(--s-2)] underline underline-offset-4 !text-[var(--ink-66)]">{passT(l, "link", { pass })}</span>}
                </div>
              )}
            </div>
          )}
          {/* the panel itself — its buttons do nothing here */}
          <div className="pointer-events-none select-none" aria-disabled>
            <TongkaPanel locale={l} currency={currency} first={first} onPick={() => {}} memberHint={false} />
          </div>
        </section>
        </Dossier>
      </div>
    </div>
  );
}
