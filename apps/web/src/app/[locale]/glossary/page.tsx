import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
import { LOCALE_META, LOCALES } from "@/lib/locales";
import { referenceFor } from "@/lib/reference";
import { brandName } from "@/lib/brand";

/** 六爻術語對照 (进度表 12 ②): the words a Liu Yao chart uses, each with its Chinese original. Static. */
export function generateStaticParams() { return LOCALES.map((locale) => ({ locale })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const r = referenceFor(locale).glossary;
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[LOCALE_META[l].hreflang] = `/${l}/glossary`;
  languages["x-default"] = "/en/glossary";
  return { title: `${r.title} | ${brandName(locale)}`, description: r.lead, alternates: { canonical: `/${locale}/glossary`, languages }, openGraph: { title: r.title, description: r.lead, type: "article" } };
}

export default async function Glossary({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const r = referenceFor(l);
  const g = r.glossary;
  const jsonLd = {
    "@context": "https://schema.org", "@type": "DefinedTermSet", name: g.title, description: g.lead, inLanguage: LOCALE_META[l].htmlLang,
    hasDefinedTerm: g.groups.flatMap((grp) => grp.terms.map((x) => ({ "@type": "DefinedTerm", name: x.zh, description: x.def }))),
  };
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <JsonLd data={jsonLd} />
      <header className="pt-10 pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        <h1 className="t-d1">{g.title}</h1>
        <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{g.lead}</p>
      </header>
      {g.groups.map((grp) => (
        <section key={grp.name} className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-3)]">{grp.name}</h2>
          <dl className="flex flex-col">
            {grp.terms.map((x) => (
              <div key={x.zh} id={x.zh} className="py-[var(--s-3)] border-t border-dotted border-[var(--ink-16)] first:border-t-0 md:grid md:grid-cols-[10rem_1fr] md:gap-x-6">
                <dt className="t-d3 !text-[18px]" lang="zh-Hant">{x.zh}</dt>
                <dd className="t-body mt-1 md:mt-0 leading-relaxed">{x.def}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">
        <Link href={`/${l}/timing`} className="underline underline-offset-4">{r.timing.title}</Link>
        <span className="mx-2 text-[var(--ink-16)]">·</span>
        <Link href={`/${l}/gua/table`} className="underline underline-offset-4">{r.table.title}</Link>
      </p>
    </article>
  );
}
