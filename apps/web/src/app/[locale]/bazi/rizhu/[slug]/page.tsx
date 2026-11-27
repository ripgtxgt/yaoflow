import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canSee } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { bIn, PILLARS, pillarOfSlug, pillarSlug } from "@/lib/mingli/bazi/content";
import { baziPage } from "@/lib/mingli/bazi/page-ui";
import { bzName } from "@/lib/mingli/bazi/names";
import { brandName } from "@/lib/brand";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { fmt, isForeign } from "@/lib/l10n/core";

export const dynamic = "force-dynamic";

/** a description of about 80 Chinese characters — outside Chinese, up to the end of a sentence near 160 characters */
function clip(s: string, l: string): string {
  if (!isForeign(l)) return s.slice(0, 80);
  if (s.length <= 160) return s;
  const cut = s.slice(0, 160), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("。"), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 60 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

/** 10-18 进度表 72: one 日柱 (/bazi/rizhu/jia-zi). 10-30 进度表 128 ④: every language the 八字 is open in. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = pillarOfSlug(slug);
  if (!p || !isLocale(locale) || !serviceOpenIn("bazi", locale)) return {};
  const B = bIn(locale);
  if (isForeign(locale)) {
    const P = baziPage(locale), name = bzName(locale).gz(p);
    return { title: { absolute: `${fmt(P.tPillarMeta, { p: name, t: B.rizhu[p]!.title })} — ${brandName(locale)}` }, description: clip(B.rizhu[p]!.plain, locale), alternates: pageAlternates(locale, `/bazi/rizhu/${slug}`, serviceLocales("bazi")) };
  }
  const l = locale as HlLocale;
  return { title: { absolute: `${loc(`${p}日柱｜${B.rizhu[p]!.title}`, l)} — ${brandName(l)}` }, description: loc(B.rizhu[p]!.plain.slice(0, 80), l), alternates: pageAlternates(locale, `/bazi/rizhu/${slug}`, serviceLocales("bazi")) };
}

export default async function RizhuPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !serviceOpenIn("bazi", locale)) notFound();
  const p = pillarOfSlug(slug);
  if (!p) notFound();
  if (!(await canSee("bazi"))) notFound();
  const l = locale as Locale;
  const foreign = isForeign(l);
  const P = baziPage(l), B = bIn(l), F = foreign ? bzName(l) : null;
  const w = (s: string) => (foreign ? s : loc(s, l as HlLocale));
  const name = (gz: string) => (F ? F.gz(gz) : gz);
  const r = B.rizhu[p]!;
  const i = PILLARS.indexOf(p);
  const prev = PILLARS[(i + 59) % 60]!, next = PILLARS[(i + 1) % 60]!;
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <p className="t-small"><Link href={`/${l}/bazi/rizhu`} className="underline underline-offset-4 !text-[var(--ink-66)]">← {P.libIndex}</Link></p>
      <h1 className="t-d1 mt-[var(--s-3)]">{foreign ? fmt(P.tPillar, { p: name(p) }) : w(`${p}日柱`)}</h1>
      {foreign && l !== "ja" && <p className="t-small mt-1 !text-[var(--ink-45)]" lang="zh-Hant">{p}</p>}
      <p className="t-d3 mt-2">{w(r.title)}</p>
      <p className="t-body mt-[var(--s-4)] leading-relaxed">{w(r.plain)}</p>
      <h2 className="t-sect mt-[var(--s-5)]">{P.love}</h2><p className="t-body mt-2 leading-relaxed">{w(r.love)}</p>
      <h2 className="t-sect mt-[var(--s-5)]">{P.work}</h2><p className="t-body mt-2 leading-relaxed">{w(r.work)}</p>
      <h2 className="t-sect mt-[var(--s-5)] !text-[var(--cinnabar)]">{P.watch}</h2><p className="t-body mt-2 leading-relaxed">{w(r.watch)}</p>
      <p className="t-body mt-[var(--s-5)] border-l-2 border-[var(--gold)] pl-4">{w(r.ask_next)}</p>
      <div className="mt-[var(--s-6)] grid gap-3">
        <p><Link href={`/${l}/bazi`} className="inline-block px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px]">{P.cta}</Link></p>
        <p className="t-small flex gap-5"><Link href={`/${l}/bazi/rizhu/${pillarSlug(prev)}`} className="underline underline-offset-4">← {name(prev)}</Link><Link href={`/${l}/bazi/rizhu/${pillarSlug(next)}`} className="underline underline-offset-4">{name(next)} →</Link></p>
      </div>
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{P.note}</p>
    </div>
  );
}
