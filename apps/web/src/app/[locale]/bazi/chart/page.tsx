import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BaziChart from "@/components/mingli/BaziChart";
import { canSee, featureState } from "@/lib/features";
import { baziPage, baziUi } from "@/lib/mingli/bazi/page-ui";
import { BAZI_NAMES } from "@/lib/mingli/bazi/names";
import { ASTRO_NAMES } from "@/lib/mingli/astro/names";
import { brandName } from "@/lib/brand";
import CrossCards from "@/components/CrossCards";
import { isLocale, type Locale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";
import { isForeign } from "@/lib/l10n/core";
import LoginGate from "@/components/LoginGate";
import { currentCustomer } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * 10-18 进度表 72: the chart (no birth data in the URL; not indexed).
 * 10-30 进度表 128 ④: every language the 八字 is open in — a page in another language hands the chart its names
 * (lib/mingli/bazi/names.ts, with the Western signs for the 星座 row).
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("bazi", locale)) return {};
  return { title: { absolute: `${baziPage(locale).chartTitle} — ${brandName(locale)}` }, robots: { index: false, follow: false } };
}

export default async function BaziChartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("bazi", locale)) notFound();
  if (!(await canSee("bazi"))) notFound();
  const l = locale as Locale;
  const P = baziPage(l);
  // 10-25 (Neil): a chart is read only signed in
  let me = null;
  try { me = await currentCustomer(); } catch { /* no database */ }
  const yunshi = await canSee("yunshi") && !isForeign(l); // 每日運勢 opens in the other languages with 128-5
  const names = isForeign(l) ? { ...BAZI_NAMES[l], signs: ASTRO_NAMES[l].signs } : null;
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      {featureState("bazi") === "preview" && <p className="t-small mb-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px]">{P.preview}</p>}
      {me ? <BaziChart locale={l} ui={baziUi(l)} formHref={`/${l}/bazi`} rizhuHref={`/${l}/bazi/rizhu`} castHref={`/${l}/cast`} yunshiHref={yunshi ? `/${l}/yunshi` : null} names={names} /> : <LoginGate locale={l} next={`/${l}/bazi/chart`} />}
      {/* 10-22 进度表 86 承接地圖 (设计稿第 3 節): the chart's next step — 一件事看卦 (星盤: 八字 first) */}
      <CrossCards source="bazi" locale={l} exclude={["bazi"]} />
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{P.boundary}</p>
    </div>
  );
}
