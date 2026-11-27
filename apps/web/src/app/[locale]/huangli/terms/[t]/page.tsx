import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import FeatureLink from "@/components/FeatureLink";
import { canSee } from "@/lib/features";
import { loc, termPage, yijiInfo } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { HL_LOCALES } from "@/lib/mingli/calendar/page-bits";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** 10-17 进度表 69: one 宜忌 word explained (/huangli/terms/移徙) */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; t: string }> }): Promise<Metadata> {
  const { locale, t } = await params;
  const p = termPage(decodeURIComponent(t));
  if (!p) return {};
  const l = locale as HlLocale;
  const slug = encodeURIComponent(p.tw);
  return {
    title: { absolute: `${loc(`黃曆「${p.tw}」是什麼意思？宜${p.tw}怎麼看`, l)} — ${brandName(l)}` }, description: loc(p.intro.slice(0, 90), l),
    alternates: { canonical: `/${locale}/huangli/terms/${slug}`, languages: { "zh-Hant": `/zh-hant/huangli/terms/${slug}`, "zh-CN": `/zh/huangli/terms/${slug}`, "x-default": `/zh-hant/huangli/terms/${slug}` } },
  };
}

export default async function HuangliTermPage({ params }: { params: Promise<{ locale: string; t: string }> }) {
  const { locale, t } = await params;
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("huangli"))) notFound();
  const p = termPage(decodeURIComponent(t));
  if (!p) notFound();
  const l = locale as HlLocale;
  const w = (x: string) => loc(x, l);
  const info = yijiInfo(p.key, l);
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: w(f.q), acceptedAnswer: { "@type": "Answer", text: w(f.a) } })) };
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <JsonLd data={faq} />
      <nav className="t-label"><Link href={`/${l}/huangli`} className="hover:text-[var(--ink)]">← {w("今日黃曆")}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{w(`宜${p.tw}`)}</h1>
      {info.plain && <p className="t-body mt-[var(--s-3)] !text-[var(--ink-66)]">{info.plain}{info.example ? `（${info.example}）` : ""}</p>}
      <p className="t-body mt-[var(--s-5)] leading-relaxed">{w(p.intro)}</p>
      <h2 className="t-sect mt-[var(--s-5)]">{w("台灣民間常見做法")}</h2>
      <p className="t-body mt-[var(--s-2)] leading-relaxed">{w(p.practice)}</p>
      {p.faq.map((f) => (
        <div key={f.q} className="mt-[var(--s-5)]">
          <h3 className="t-sect">{w(f.q)}</h3>
          <p className="t-body mt-[var(--s-2)] leading-relaxed">{w(f.a)}</p>
        </div>
      ))}
      <section className="mt-[var(--s-6)] grid gap-3">
        <FeatureLink name="zeri" from="huangli-term" locale={l} href={`/${l}/zeri`} text={w(`找適合${p.tw}的日子 →`)} />
        <p className="t-small"><Link href={`/${l}/huangli`} className="underline underline-offset-4 !text-[var(--ink-66)]">{w("看今天的黃曆 →")}</Link></p>
      </section>
    </article>
  );
}
