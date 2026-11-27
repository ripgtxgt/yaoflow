import type { Metadata } from "next";
import Link from "next/link";
import CrossCards from "@/components/CrossCards";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import TrackLink from "@/components/TrackLink";
import { featureOn } from "@/lib/features";
import { fmt } from "@/lib/l10n/core";
import { DREAMS, dreamBySlug, dreamsLike } from "@/lib/dream";
import { dreamIn, dreamNameIn, dreamUi } from "@/lib/dream-text";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { brandName } from "@/lib/brand";

/**
 * 10-29 进度表 124 解夢: one dream — the traditional sayings, the plain reading, variants, and the way in to a cast.
 * 10-30 进度表 128 ③: in every language — the traditional sayings stay the Chinese folk dream books', named as such.
 */
/** dreams about the things people lose (and the thief) — these also point at 尋物 (进度表 127) */
const LOST_DREAMS = new Set(["wallet", "key", "phone", "bag", "ring", "necklace", "jewelry", "computer", "thief", "stealing"]);
export function generateStaticParams() {
  return (["zh-hant", "zh"] as const).flatMap((locale) => DREAMS.map((d) => ({ locale, slug: d.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !serviceOpenIn("dream", locale)) return {};
  const t = dreamIn(slug, locale);
  if (!t) return {};
  const ui = dreamUi(locale);
  return {
    title: { absolute: `${fmt(ui.page.metaTitle, { title: t.title })} — ${brandName(locale)}` },
    description: t.lead.slice(0, /^(zh|ja|ko)/.test(locale) ? 150 : 300),
    alternates: pageAlternates(locale, `/dream/${slug}`, serviceLocales("dream")),
  };
}

export default async function DreamPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !serviceOpenIn("dream", locale)) notFound();
  if (!featureOn("dream")) notFound();
  const d = dreamBySlug(slug);
  const t = d ? dreamIn(slug, locale) : null;
  if (!d || !t) notFound();
  const l = locale as Locale;
  const ui = dreamUi(l).page;
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [...t.variants, ...t.faq].map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <JsonLd data={faq} />
      <TrackOnce event="dream" locale={l} method={`view:${slug}`} />
      <nav className="t-label"><Link href={`/${l}/dream`} className="hover:text-[var(--ink)]">← {ui.back}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{t.title}</h1>
      <p className="t-body mt-[var(--s-4)] leading-relaxed">{t.lead}</p>
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect">{ui.trad}</h2>
        <p className="t-body mt-[var(--s-2)] leading-relaxed whitespace-pre-line">{t.trad}</p>
      </section>
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect">{ui.plain}</h2>
        <p className="t-body mt-[var(--s-2)] leading-relaxed whitespace-pre-line">{t.plain}</p>
      </section>
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect">{ui.variants}</h2>
        {t.variants.map((v) => (
          <div key={v.q} className="mt-[var(--s-4)]">
            <h3 className="t-body !font-medium">{v.q}</h3>
            <p className="t-body mt-1 leading-relaxed text-[var(--ink-66)]">{v.a}</p>
          </div>
        ))}
      </section>
      <section className="mt-[var(--s-6)] ink-block p-[var(--s-5)]">
        <p className="t-body !text-[var(--paper)] leading-relaxed">{t.ask}</p>
        <TrackLink event="dream" locale={l} method={`to_cast:${slug}`} href={`/${l}/cast?${new URLSearchParams({ q: t.askQ, c: "dream" })}`} className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors">{ui.castBtn}</TrackLink>
      </section>
      {/* 10-29 进度表 127 (Neil: 产品线之间的相互关联): a dream about a thing people lose — the 尋物 page, for when it is real */}
      {LOST_DREAMS.has(slug) && featureOn("xunwu") && serviceOpenIn("xunwu", l) && (
        <p className="t-small mt-[var(--s-4)]">
          <TrackLink event="xunwu" locale={l} method={`from_dream:${slug}`} href={`/${l}/xunwu?c=dream`} className="underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">{ui.lost}</TrackLink>
        </p>
      )}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-3)]">{ui.faq}</h2>
        {t.faq.map((f) => (
          <div key={f.q} className="mt-[var(--s-4)]">
            <h3 className="t-body !font-medium">{f.q}</h3>
            <p className="t-body mt-1 leading-relaxed text-[var(--ink-66)]">{f.a}</p>
          </div>
        ))}
      </section>
      <p className="mt-[var(--s-6)] t-small !text-[var(--ink-66)]">{ui.like}{dreamsLike(d).map((x, i) => <span key={x.slug}>{i ? ui.likeSep : ""}<Link href={`/${l}/dream/${x.slug}`} className="underline underline-offset-4">{dreamNameIn(x.slug, l)}</Link></span>)}</p>
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{ui.note}</p>
      {/* 10-29 (Neil: 产品之间的互相引导): lib/cross-map.ts — the page asks for the cast itself */}
      <CrossCards source="dream" locale={l} exclude={["dream"]} skipMain />
    </article>
  );
}
