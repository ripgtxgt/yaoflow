import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canSee, featureState } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES } from "@/lib/mingli/calendar/page-bits";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { FUN_UI } from "@/lib/mingli/fun/ui";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";
/** 10-29 进度表 126 娛樂小品: the three, behind `fun` */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!(await canSee("fun"))) return {}; // a preview page says nothing about itself to a visitor (the 404 had its title)
  return { title: { absolute: `${loc("娛樂小品：前世今生、渣男鑑定、運勢 K 線", locale as HlLocale)} — ${brandName(locale)}` }, robots: featureState("fun") === "on" ? undefined : { index: false, follow: false } };
}
export default async function FunIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("fun"))) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const items = [["past-life", FUN_UI.plHead, FUN_UI.plLead], ["together", FUN_UI.tgHead, FUN_UI.tgLead], ["kline", FUN_UI.klHead, FUN_UI.klLead]] as const;
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <h1 className="t-d1">{w(FUN_UI.head!)}</h1>
      <p className="t-body mt-[var(--s-4)]">{w(FUN_UI.lead!)}</p>
      <div className="mt-[var(--s-5)] grid gap-3">
        {items.map(([slug, h, line]) => (
          <Link key={slug} href={`/${l}/fun/${slug}`} className="rounded-[6px] border border-[var(--ink-16)] hover:border-[var(--ink)] p-4 block">
            <p className="t-sect">{w(h!)}</p><p className="t-small mt-1 !text-[var(--ink-66)]">{w(line!)}</p>
          </Link>
        ))}
      </div>
    </article>
  );
}
