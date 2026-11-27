import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import FunPiece from "@/components/mingli/FunPiece";
import TrackOnce from "@/components/TrackOnce";
import { canSee } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES } from "@/lib/mingli/calendar/page-bits";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { birthUi } from "@/lib/mingli/birth/ui";
import { FUN_UI } from "@/lib/mingli/fun/ui";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";
/** 10-29 进度表 126: past-life (通卡／會員; lib/mingli/fun/stories.ts) */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!(await canSee("fun"))) return {}; // a preview page says nothing about itself to a visitor (the 404 had its title)
  return { title: { absolute: `${loc(FUN_UI.plHead!, locale as HlLocale)} — ${brandName(locale)}` }, robots: { index: false, follow: false } };
}
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("fun"))) notFound();
  const l = locale as HlLocale;
  const ui = Object.fromEntries(Object.entries(FUN_UI).map(([k, v]) => [k, loc(v, l)])) as Record<string, string>;
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="fun" locale={l} method="pastlife:view" />
      <p className="t-small"><Link href={`/${l}/fun`} className="underline underline-offset-4">← {ui.head}</Link></p>
      <h1 className="t-d1 mt-[var(--s-3)]">{ui.plHead}</h1>
      <p className="t-body mt-[var(--s-4)] leading-relaxed">{ui.plLead}</p>
      <p className="t-small mt-2 !text-[var(--ink-45)]">{ui.needRights}</p>
      <FunPiece kind="pastlife" locale={l} ui={ui} birthUi={birthUi(l)} />
    </article>
  );
}
