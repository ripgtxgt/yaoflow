import type { Metadata } from "next";
import Link from "next/link";
import CrossCards from "@/components/CrossCards";
import type { Locale } from "@/lib/locales";
import { notFound } from "next/navigation";
import TrackOnce from "@/components/TrackOnce";
import NameQuery from "@/components/mingli/NameQuery";
import NameBuy from "@/components/mingli/NameBuy";
import { canSee, featureState } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES } from "@/lib/mingli/calendar/page-bits";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { birthUi } from "@/lib/mingli/birth/ui";
import { NAME_UI } from "@/lib/mingli/name/ui";
import { nameCharsByUse } from "@/lib/mingli/name/chars";
import { brandName } from "@/lib/brand";
import { JaNamePage, KoNamePage } from "@/components/mingli/ForeignName";
import { JA_NAME, KO_NAME } from "@/lib/mingli/name/foreign-text";
import { pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * 10-29 进度表 122 姓名學: the free query (each character's 字義、讀音、康熙筆劃、五行, the 五格 numbers, and with a birth the
 * 喜用), how we count, the characters people use in names, and — behind `name-paid` — 寶寶取名／改名參考.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ⑥: 姓名判断 (ja), 성명학 (ko)
  if ((locale === "ja" || locale === "ko") && serviceOpenIn("name", locale)) {
    const T = locale === "ja" ? JA_NAME : KO_NAME;
    return { title: { absolute: `${T.metaTitle} — ${brandName(locale)}` }, description: T.metaDesc, alternates: pageAlternates(locale, "/name", serviceLocales("name")), robots: featureState("name") === "on" ? undefined : { index: false, follow: false } };
  }
  const l = locale as HlLocale;
  return {
    title: { absolute: `${loc("姓名學查詢：名字的字義、讀音、康熙筆劃、五格與五行", l)} — ${brandName(l)}` },
    description: loc("免費查名字：每個字的意思、注音／拼音／粵拼、康熙筆劃與五行，天格人格地格外格總格的數字；加上出生時間，對照八字喜用。寶寶取名、改名也可以請我們整理參考。", l),
    alternates: { canonical: `/${locale}/name`, languages: { "zh-Hant": "/zh-hant/name", "zh-CN": "/zh/name", "x-default": "/zh-hant/name" } },
    robots: featureState("name") === "on" ? undefined : { index: false, follow: false },
  };
}

export default async function NamePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if ((locale === "ja" || locale === "ko") && serviceOpenIn("name", locale)) {
    if (!(await canSee("name"))) notFound();
    return locale === "ja" ? <JaNamePage /> : <KoNamePage />;
  }
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("name"))) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const ui = Object.fromEntries(Object.entries(NAME_UI).map(([k, v]) => [k, w(v)])) as Record<string, string>;
  const paid = await canSee("name-paid");
  const popular = nameCharsByUse().filter((c) => c.o === 2).slice(0, 120);
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="name" locale={l} method="view" />
      <h1 className="t-d1">{ui.head}</h1>
      <p className="t-body mt-[var(--s-4)] leading-relaxed">{ui.lead}</p>
      <section className="mt-[var(--s-5)]">
        <NameQuery locale={l} ui={ui} birthUi={birthUi(l)} />
      </section>
      {paid && (
        <section className="mt-[var(--s-7)]" id="buy">
          <h2 className="t-d3">{ui.paidHead}</h2>
          <div className="mt-[var(--s-4)]"><NameBuy locale={l} ui={ui} birthUi={birthUi(l)} /></div>
        </section>
      )}
      <section className="mt-[var(--s-7)]">
        <h2 className="t-d3">{ui.how}</h2>
        {[ui.howStroke, ui.howGrid, ui.howEl, ui.howNo].map((x) => <p key={x} className="t-body mt-[var(--s-3)] leading-relaxed !text-[var(--ink-86)]">{x}</p>)}
      </section>
      <section className="mt-[var(--s-7)]">
        <h2 className="t-d3">{ui.popular}</h2>
        <p className="mt-[var(--s-3)] flex flex-wrap gap-2">
          {popular.map((c) => { const ch = l === "zh" ? c.s : c.h; return <Link key={c.h} href={`/${l}/name/zi/${encodeURIComponent(ch)}`} className="w-10 h-10 grid place-items-center rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] t-body !text-[18px]">{ch}</Link>; })}
        </p>
      </section>
      {/* 10-29 (Neil: 产品之间的互相引导): lib/cross-map.ts */}
      <CrossCards source="name" locale={l as Locale} exclude={["name"]} />
    </article>
  );
}
