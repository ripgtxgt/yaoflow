import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canSee } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { STAR_SLUG, zIn } from "@/lib/mingli/ziwei/content";
import { ziweiPage } from "@/lib/mingli/ziwei/page-ui";
import { zwName } from "@/lib/mingli/ziwei/names";
import { brandName } from "@/lib/brand";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { isForeign } from "@/lib/l10n/core";

export const dynamic = "force-dynamic";

/** 10-18 进度表 71: the fourteen main stars (library page). 10-30 进度表 128 ④: every language the 紫微 is open in. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("ziwei", locale)) return {};
  const P = ziweiPage(locale);
  return { title: { absolute: `${P.starsMetaTitle} — ${brandName(locale)}` }, description: P.starsDesc, alternates: pageAlternates(locale, "/ziwei/stars", serviceLocales("ziwei")) };
}

export default async function StarsIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("ziwei", locale)) notFound();
  if (!(await canSee("ziwei"))) notFound();
  const l = locale as Locale;
  const P = ziweiPage(l), D = zIn(l);
  const foreign = isForeign(l);
  const Z = foreign ? zwName(l) : null;
  const w = (s: string) => (foreign ? s : loc(s, l as HlLocale));
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <p className="t-small"><Link href={`/${l}/ziwei`} className="underline underline-offset-4 !text-[var(--ink-66)]">← {P.title}</Link></p>
      <h1 className="t-d1 mt-[var(--s-3)]">{P.starsIndex}</h1>
      <ul className="mt-[var(--s-5)] divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
        {Object.entries(STAR_SLUG).map(([s, slug]) => (
          <li key={s} className="py-3">
            <Link href={`/${l}/ziwei/stars/${slug}`} className="flex items-baseline gap-3 hover:underline underline-offset-4">
              <span className={`t-body font-medium ${Z && l !== "ja" && l !== "ko" ? "w-24 shrink-0" : "w-12"}`}>{Z ? Z.star(s) : w(s)}{Z && Z.gloss(s) && <span className="block t-small font-normal !text-[var(--ink-45)]">{Z.gloss(s)}</span>}</span>
              <span className="t-small flex-1 line-clamp-1">{w(D.overview[s]?.intro ?? "")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
