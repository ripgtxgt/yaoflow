import type { Metadata } from "next";
import Link from "next/link";
import CrossCards from "@/components/CrossCards";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { notFound } from "next/navigation";
import TrackOnce from "@/components/TrackOnce";
import { canSee } from "@/lib/features";
import { DREAM_CATS, DREAMS } from "@/lib/dream";
import { dreamIn, dreamIndexTitle, dreamUi } from "@/lib/dream-text";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { brandName } from "@/lib/brand";

/** 10-29 进度表 124 解夢: every dream page, by kind (lib/dream.ts); 10-30 进度表 128 ③: in every language (lib/dream-text.ts) */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("dream", locale)) return {};
  return {
    title: { absolute: `${dreamIndexTitle(locale)} — ${brandName(locale)}` },
    description: dreamUi(locale).index.metaDesc,
    alternates: pageAlternates(locale, "/dream", serviceLocales("dream")),
  };
}

export default async function DreamIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("dream", locale)) notFound();
  if (!(await canSee("dream"))) notFound();
  const l = locale as Locale;
  const ui = dreamUi(l);
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="dream" locale={l} method="index" />
      <h1 className="t-d1">{ui.index.title}</h1>
      <p className="t-body mt-[var(--s-4)] leading-relaxed">{ui.index.lead}</p>
      {DREAM_CATS.map((c) => {
        const list = DREAMS.filter((d) => d.cat === c);
        if (!list.length) return null;
        return (
          <section key={c} className="mt-[var(--s-6)]">
            <h2 className="t-sect">{ui.cats[c]}</h2>
            <p className="mt-[var(--s-3)] flex flex-wrap gap-2">{list.map((d) => <Link key={d.slug} href={`/${l}/dream/${d.slug}`} className="px-3 py-1.5 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] t-body !text-[15px]">{dreamIn(d.slug, l)?.chip ?? d.slug}</Link>)}</p>
          </section>
        );
      })}
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{ui.index.note}</p>
      {/* 10-29 (Neil: 产品之间的互相引导): lib/cross-map.ts */}
      <CrossCards source="dream" locale={l} exclude={["dream"]} />
    </article>
  );
}
