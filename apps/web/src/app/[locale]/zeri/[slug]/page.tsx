import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { canSee } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES, todayYmd } from "@/lib/mingli/calendar/page-bits";
import { matterBySlug, zeriDays } from "@/lib/mingli/calendar/zeri";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** 10-17 进度表 70: one matter's page (/zeri/banjia) — how people pick a day for it, the next suitable days, a way in */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const m = matterBySlug(slug);
  if (!m) return {};
  const l = locale as HlLocale;
  return {
    title: { absolute: `${loc(`${m.tw}吉日怎麼挑｜${m.tw}好日子查詢`, l)} — ${brandName(l)}` }, description: loc(m.intro.slice(0, 90), l),
    alternates: { canonical: `/${locale}/zeri/${slug}`, languages: { "zh-Hant": `/zh-hant/zeri/${slug}`, "zh-CN": `/zh/zeri/${slug}`, "x-default": `/zh-hant/zeri/${slug}` } },
  };
}

export default async function ZeriMatterPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("zeri"))) notFound();
  const m = matterBySlug(slug);
  if (!m) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const next = zeriDays(m, todayYmd(), 60, l).days.slice(0, 5);
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: m.faq.map((f) => ({ "@type": "Question", name: w(f.q), acceptedAnswer: { "@type": "Answer", text: w(f.a) } })) };
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <JsonLd data={faq} />
      <nav className="t-label"><Link href={`/${l}/zeri`} className="hover:text-[var(--ink)]">← {w("擇日")}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{w(`${m.tw}怎麼挑日子`)}</h1>
      <p className="t-body mt-[var(--s-4)] leading-relaxed">{w(m.intro)}</p>
      {next.length > 0 && (
        <section className="mt-[var(--s-5)]">
          <h2 className="t-sect">{w("接下來適合的日子")}</h2>
          <ul className="mt-2 t-body">{next.map((d) => <li key={d.ymd}><Link href={`/${l}/huangli/${d.ymd}`} className="underline-offset-4 hover:underline tabular-nums">{+d.ymd.slice(5, 7)}/{+d.ymd.slice(8)}</Link> <span className="t-small !text-[var(--ink-66)]">{d.lunar}</span></li>)}</ul>
        </section>
      )}
      <p className="mt-[var(--s-5)]"><Link href={`/${l}/zeri?do=${m.slug}`} className="inline-block px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px]">{w(`依生肖查${m.tw}的日子 →`)}</Link></p>
      {m.faq.map((f) => (
        <div key={f.q} className="mt-[var(--s-5)]">
          <h2 className="t-sect">{w(f.q)}</h2>
          <p className="t-body mt-[var(--s-2)] leading-relaxed">{w(f.a)}</p>
        </div>
      ))}
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{w("依民間通書宜忌推算，各家擇日做法不同。")}</p>
    </article>
  );
}
