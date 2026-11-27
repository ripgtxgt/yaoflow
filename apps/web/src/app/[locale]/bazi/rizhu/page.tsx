import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canSee } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { bIn, PILLARS, pillarSlug } from "@/lib/mingli/bazi/content";
import { baziPage } from "@/lib/mingli/bazi/page-ui";
import { bzName } from "@/lib/mingli/bazi/names";
import { brandName } from "@/lib/brand";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { isForeign } from "@/lib/l10n/core";

export const dynamic = "force-dynamic";

/** 10-18 进度表 72: the sixty 日柱 (library page; the chart page only links here). 10-30 进度表 128 ④: every language the 八字 is open in. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("bazi", locale)) return {};
  const P = baziPage(locale);
  return { title: { absolute: `${P.libMetaTitle} — ${brandName(locale)}` }, description: P.libDesc, alternates: pageAlternates(locale, "/bazi/rizhu", serviceLocales("bazi")) };
}

export default async function RizhuIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("bazi", locale)) notFound();
  if (!(await canSee("bazi"))) notFound();
  const l = locale as Locale;
  const P = baziPage(l), B = bIn(l);
  const foreign = isForeign(l);
  const F = foreign ? bzName(l) : null;
  const w = (s: string) => (foreign ? s : loc(s, l as HlLocale));
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <p className="t-small"><Link href={`/${l}/bazi`} className="underline underline-offset-4 !text-[var(--ink-66)]">← {P.title}</Link></p>
      <h1 className="t-d1 mt-[var(--s-3)]">{P.libIndex}</h1>
      <ul className="mt-[var(--s-5)] grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)] sm:divide-y-0">
        {PILLARS.map((p) => (
          <li key={p} className="py-3 sm:border-b sm:border-[var(--ink-16)]">
            <Link href={`/${l}/bazi/rizhu/${pillarSlug(p)}`} className="flex items-baseline gap-3 hover:underline underline-offset-4">
              <span className={`t-body font-medium ${F && l !== "ja" ? "w-20" : "w-10"}`}>{F ? F.gz(p) : p}</span>
              <span className="t-small flex-1">{w(B.rizhu[p]!.title)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
