import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AstroChart from "@/components/mingli/AstroChart";
import { canSee, featureState } from "@/lib/features";
import { astroPage, astroUi, signNames } from "@/lib/mingli/astro/page-ui";
import { brandName } from "@/lib/brand";
import CrossCards from "@/components/CrossCards";
import { isLocale, type Locale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";
import LoginGate from "@/components/LoginGate";
import { currentCustomer } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 10-18 进度表 74: the chart (no birth data in the URL; not indexed). 10-30 进度表 128 ④: every language it is open in. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("xingpan", locale)) return {};
  return { title: { absolute: `${astroPage(locale).chartTitle} — ${brandName(locale)}` }, robots: { index: false, follow: false } };
}

export default async function XingpanChartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("xingpan", locale)) notFound();
  if (!(await canSee("astro"))) notFound();
  const l = locale as Locale;
  const p = astroPage(l);
  // 10-25 (Neil): a chart is read only signed in
  let me = null;
  try { me = await currentCustomer(); } catch { /* no database */ }
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      {featureState("astro") === "preview" && <p className="t-small mb-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px]">{p.preview}</p>}
      {me ? <AstroChart locale={l} ui={astroUi(l)} formHref={`/${l}/xingpan`} castHref={`/${l}/cast`} signNames={signNames(l)} /> : <LoginGate locale={l} next={`/${l}/xingpan/chart`} />}
      {/* 10-22 进度表 86 承接地圖 (设计稿第 3 節): the chart's next step — 一件事看卦 (星盤: 八字 first) */}
      <CrossCards source="astro" locale={l} exclude={["xingpan"]} />
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{p.boundary}</p>
    </div>
  );
}
