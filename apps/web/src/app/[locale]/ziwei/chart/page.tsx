import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ZiweiChart from "@/components/mingli/ZiweiChart";
import { canSee, featureState } from "@/lib/features";
import { ziweiPage, ziweiUi } from "@/lib/mingli/ziwei/page-ui";
import { ZIWEI_NAMES } from "@/lib/mingli/ziwei/names";
import { BAZI_NAMES } from "@/lib/mingli/bazi/names";
import { brandName } from "@/lib/brand";
import CrossCards from "@/components/CrossCards";
import { isLocale, type Locale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";
import { isForeign } from "@/lib/l10n/core";
import LoginGate from "@/components/LoginGate";
import { currentCustomer } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * 10-18 进度表 71: the chart (no birth data in the URL; not indexed).
 * 10-30 进度表 128 ④: every language the 紫微 is open in — a page in another language hands the chart its names
 * (lib/mingli/ziwei/names.ts, with the 八字 names for stems, branches, hours and lunar dates).
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("ziwei", locale)) return {};
  return { title: { absolute: `${ziweiPage(locale).chartTitle} — ${brandName(locale)}` }, robots: { index: false, follow: false } };
}

export default async function ZiweiChartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("ziwei", locale)) notFound();
  if (!(await canSee("ziwei"))) notFound();
  const l = locale as Locale;
  const P = ziweiPage(l);
  // 10-25 (Neil): a chart is read only signed in
  let me = null;
  try { me = await currentCustomer(); } catch { /* no database */ }
  const bazi = await canSee("bazi") && serviceOpenIn("bazi", l);
  const names = isForeign(l) ? { zw: ZIWEI_NAMES[l], bz: BAZI_NAMES[l] } : null;
  return (
    <div className="mx-auto w-full max-w-[52rem] px-[var(--s-3)] md:px-8 pt-10 pb-24">
      {featureState("ziwei") === "preview" && <p className="t-small mb-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px]">{P.preview}</p>}
      {me ? <ZiweiChart locale={l} ui={ziweiUi(l)} formHref={`/${l}/ziwei`} baziHref={bazi ? `/${l}/bazi/chart` : null} castHref={`/${l}/cast`} starsHref={`/${l}/ziwei/stars`} names={names} /> : <LoginGate locale={l} next={`/${l}/ziwei/chart`} />}
      {/* 10-22 进度表 86 承接地圖 (设计稿第 3 節): the chart's next step — 一件事看卦 (星盤: 八字 first) */}
      <CrossCards source="ziwei" locale={l} exclude={["ziwei"]} />
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{P.boundary}</p>
    </div>
  );
}
