import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { pageJsonLd } from "@/lib/site-jsonld";
import { notFound } from "next/navigation";
import { resolveCast } from "@yaoflow/engine";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { asLocale, LOCALE_META, pageAlternates } from "@/lib/locales";
import { todayHead } from "@/lib/seo-head";
import { hexName } from "@/lib/names";
import { homeDay } from "@/lib/clock";
import { PILES, dailyValues } from "@/lib/daily";
import DailyPiles from "@/components/DailyPiles";
import { brandName } from "@/lib/brand";
import CrossCards from "@/components/CrossCards";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = asLocale(locale);
  // 10-16 进度表 61: a searched title where there is one; hreflang in the site's codes (zh-CN / zh-Hant) with x-default
  // — this page wrote "zh" / "zh-hant" and no x-default (深挖调研 SEO 体检 §5)
  const head = todayHead(l);
  const title = head?.title ?? `${t(l, "dailyTitle")} · ${brandName(l)}`;
  const description = head?.description ?? t(l, "dailyLead").slice(0, 150);
  return {
    title: { absolute: title },
    description,
    alternates: pageAlternates(l, "/today"),
    openGraph: { title, description, type: "website", locale: LOCALE_META[l].ogLocale },
  };
}

/**
 * 大众一卦 (09-21, A2 — 裂变玩法调研 §1.3, the pick-a-card format): three
 * charts for the whole site, the same three everywhere, changing daily. The
 * figures are derived from the date, so this page renders instantly and costs
 * nothing; the words for a pile are written only when someone picks it.
 *
 * It is the first thing we have that a stranger who has not cast can read.
 */
export default async function TodayPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ sub?: string }> }) {
  const { locale } = await params;
  const sub = (await searchParams).sub;
  const subStatus = sub === "ok" || sub === "bad" || sub === "off" ? sub : null;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const day = homeDay(Date.now());

  const piles = PILES.map((pile) => {
    const values = dailyValues(day, pile);
    const cast = resolveCast(values);
    return {
      pile,
      values,
      name: hexName(cast.primary, l),
      changedName: cast.changed ? hexName(cast.changed, l) : null,
    };
  });

  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
      <JsonLd data={pageJsonLd(l, "/today", "WebPage", t(l, "dailyTitle"), t(l, "dailyLead").slice(0, 150))} />
      <p className="t-label !text-[var(--gold-text)] tabular-nums">{day}</p>
      <h1 className="t-d1 mt-2">{t(l, "dailyTitle")}</h1>
      <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)] max-w-[34rem]">{t(l, "dailyLead")}</p>
      <DailyPiles locale={l} day={day} piles={piles} subStatus={subStatus} />
      {/* 10-22 进度表 86 承接地圖: 「今天心裡有一件事？起一卦」, then 擇日 (Chinese pages) */}
      <CrossCards source="daily" locale={l} />
    </div>
  );
}
