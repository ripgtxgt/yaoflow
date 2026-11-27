import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { LOCALE_META, LOCALES } from "@/lib/locales";
import { guaLocales, guaSlug } from "@/lib/gua";
import { hexName } from "@/lib/names";
import { referenceFor, REFERENCE_DATE } from "@/lib/reference";
import { howToAskFor } from "@/lib/how-to-ask";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import OutcomeRecords from "@/components/OutcomeRecords";
import { recordsForPage } from "@/lib/outcome-records";
import { orT } from "@/lib/dict/outcome-records";
import { brandName } from "@/lib/brand";

/** 應期怎麼推 (进度表 12 ③): the site's own page on where the date in a reading comes from, with a real cast. Static. */
export function generateStaticParams() { return LOCALES.map((locale) => ({ locale })); }
// 10-02 (进度表 28): re-rendered hourly, so reported outcomes reach it once the switch is on (the article itself is static)
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const r = referenceFor(locale).timing;
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[LOCALE_META[l].hreflang] = `/${l}/timing`;
  languages["x-default"] = "/en/timing";
  // 10-02 进度表 27: a language may give the <head> its own wording (繁體 says 卜卦); the H1 and lead stay
  const title = r.metaTitle ?? r.title;
  const description = r.metaDesc ?? r.lead;
  return { title: `${title} | ${brandName(locale)}`, description, alternates: { canonical: `/${locale}/timing`, languages }, openGraph: { title, description, type: "article" } };
}

export default async function Timing({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const r = referenceFor(l);
  const a = r.timing;
  const values = a.example.code.split("").map(Number) as LineValue[];
  const primary = hexagramByNumber(a.example.primary);
  const changed = hexagramByNumber(a.example.changed);
  const hasGua = guaLocales().includes(l);
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.lead, inLanguage: LOCALE_META[l].htmlLang, datePublished: REFERENCE_DATE.toISOString(), author: { "@type": "Organization", name: "YaoFlow" } };
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <JsonLd data={jsonLd} />
      <header className="pt-10 pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        <h1 className="t-d1">{a.title}</h1>
        <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{a.lead}</p>
      </header>
      {a.sections.map((s, i) => (
        <section key={s.h} className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-3)]">{s.h}</h2>
          {s.p.map((p, j) => <p key={j} className="t-body leading-relaxed mt-[var(--s-3)] first:mt-0">{p}</p>)}
          {i === 1 && (
            <div className="flex items-center gap-6 my-[var(--s-4)] py-[var(--s-4)] border-y border-dotted border-[var(--ink-16)]">
              <div><FigureMark yangs={primaryYangs(values)} width={44} className="mb-2" /><p className="t-small">{hasGua ? <Link href={`/${l}/gua/${guaSlug(primary)}`} className="underline underline-offset-4">{hexName(primary, l)}</Link> : hexName(primary, l)}</p></div>
              <span className="t-label !text-[16px]">→</span>
              <div className="text-[var(--ink-66)]"><FigureMark yangs={changedYangs(values)} width={44} className="mb-2" /><p className="t-small">{hasGua ? <Link href={`/${l}/gua/${guaSlug(changed)}`} className="underline underline-offset-4">{hexName(changed, l)}</Link> : hexName(changed, l)}</p></div>
            </div>
          )}
          {s.list && (
            <ol className="mt-[var(--s-3)] flex flex-col gap-2 pl-5 list-decimal">
              {s.list.map((x, j) => <li key={j} className="t-body leading-relaxed">{x}</li>)}
            </ol>
          )}
          {s.after?.map((p, j) => <p key={j} className="t-body leading-relaxed mt-[var(--s-3)]">{p}</p>)}
        </section>
      ))}
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{a.note}</p>
      {/* 10-02 (进度表 28): what readers reported when their windows came — nothing at all while the switch is off */}
      <OutcomeRecords records={recordsForPage({ locale: l, limit: 6 })} l={l} title={orT(l, "titleTiming")} />
      <section className="ink-block mt-[var(--s-6)] p-[var(--s-5)]">
        <h2 className="t-d3">{t(l, "guaCtaTitle")}</h2>
        <p className="t-small mt-[var(--s-2)] !text-[var(--paper-66)]">{t(l, "guaCtaBody")}</p>
        <Link href={`/${l}/cast?c=timing`} className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors">{t(l, "guaCtaButton")}</Link>
      </section>
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">
        <Link href={`/${l}/glossary`} className="underline underline-offset-4">{r.glossary.title}</Link>
        <span className="mx-2 text-[var(--ink-16)]">·</span>
        <Link href={`/${l}/gua/table`} className="underline underline-offset-4">{r.table.title}</Link>
        <span className="mx-2 text-[var(--ink-16)]">·</span>
        <Link href={`/${l}/how-to-ask`} className="underline underline-offset-4">{howToAskFor(l).entry.back}</Link>
      </p>
    </article>
  );
}
