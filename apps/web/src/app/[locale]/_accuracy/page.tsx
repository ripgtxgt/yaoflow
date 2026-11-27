import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { asLocale, LOCALES } from "@/lib/locales";
import { outcomeStats, revisitCounts } from "@/lib/db";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** Below this many answers a percentage says more about luck than about us. */
const THIN = 20;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = asLocale(locale);
  return {
    title: `${t(l, "accTitle")} · ${brandName(l)}`,
    description: t(l, "accLead").slice(0, 150),
    alternates: { canonical: `/${l}/accuracy`, languages: Object.fromEntries(LOCALES.map((x) => [x, `/${x}/accuracy`])) },
    openGraph: { title: t(l, "accTitle"), description: t(l, "accLead").slice(0, 150), type: "website" },
  };
}

/**
 * /accuracy (总方案 §14 ⑪, brought forward 09-22): the falsifiable claim, in
 * public. A deep reading names a date on the day it is cast; when the window
 * closes we write and ask, and one tap settles it. Every answer is here — the
 * misses too, because a page that only showed hits would be worth nothing.
 */
export default async function AccuracyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;

  const o = outcomeStats();
  const revisits = revisitCounts();
  const settled = o.hit + o.miss;
  const rate = settled > 0 ? Math.round((o.hit / settled) * 1000) / 10 : null;
  const thin = settled < THIN;

  const Cell = ({ label, value, tone }: { label: string; value: number | string; tone?: "hit" | "miss" }) => (
    <div className="rounded-[2px] border border-[var(--ink-16)] p-[var(--s-4)]">
      <p className="t-label">{label}</p>
      <p className={`t-d2 mt-1 tabular-nums ${tone === "hit" ? "text-[var(--cinnabar)]" : ""}`}>{value}</p>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[42rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
      <h1 className="t-d1">{t(l, "accTitle")}</h1>
      <p className="t-body mt-[var(--s-4)] text-[var(--ink-66)]">{t(l, "accLead")}</p>

      <div className="mt-[var(--s-6)] grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Cell label={t(l, "accHit")} value={o.hit} tone="hit" />
        <Cell label={t(l, "accMiss")} value={o.miss} />
        <Cell label={t(l, "accOpen")} value={o.open} />
        <Cell label={t(l, "accWaiting")} value={revisits.pending} />
      </div>

      {/*
        A percentage out of one or two answers is noise wearing a number's
        clothes — and it misleads in both directions. Under THIN we publish the
        raw counts (they are right there in the cells above) and say plainly
        that there is not enough yet; the rate appears once it means something.
      */}
      {settled > 0 && (
        <div className="mt-[var(--s-5)]">
          <p className="t-label">{t(l, "accRate")}</p>
          {thin ? (
            <>
              <p className="t-d2 mt-1 text-[var(--ink-45)]">{t(l, "accNotYet")}</p>
              <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{t(l, "accThin")}</p>
            </>
          ) : (
            <>
              <p className="t-d1 tabular-nums mt-1">{rate}%</p>
              <div className="mt-[var(--s-3)] h-3 rounded-[2px] overflow-hidden flex border border-[var(--ink-16)]">
                <div className="bg-[var(--cinnabar)]" style={{ width: `${(o.hit / settled) * 100}%` }} />
                <div className="bg-[var(--ink-16)]" style={{ width: `${(o.miss / settled) * 100}%` }} />
              </div>
            </>
          )}
        </div>
      )}

      {o.byTier.length > 0 && (
        <div className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
          {o.byTier.map((x) => (
            <p key={x.tier} className="t-small tabular-nums">
              {x.tier === "deep" ? t(l, "btnDeep") : t(l, "btnOne")}：{t(l, "accHit")} {x.hit} · {t(l, "accMiss")} {x.miss}
            </p>
          ))}
        </div>
      )}

      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{t(l, "sectHow")}</p>
      <Link href={`/${l}`} className="inline-block mt-[var(--s-3)] t-label hover:text-[var(--ink)] transition-colors">
        {t(l, "shareCta")} →
      </Link>
    </div>
  );
}
