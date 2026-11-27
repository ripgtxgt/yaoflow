import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TRIGRAMS } from "@yaoflow/engine";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { LOCALE_META, LOCALES } from "@/lib/locales";
import { GUA, guaLocales, guaSeoFor, guaSlug, guaYangs } from "@/lib/gua";
import { hexName, scriptFor } from "@/lib/names";
import { forLocale } from "@/lib/hant";
import { TRIGRAM_NAMES } from "@/lib/trigram-names";
import { referenceFor } from "@/lib/reference";
import FigureMark from "@/components/FigureMark";
import { brandName } from "@/lib/brand";

/** 六十四卦速查表 (进度表 12 ①): one page, all 64 — number, figure, name, trigrams, one line of meaning. Static. */
export function generateStaticParams() { return LOCALES.map((locale) => ({ locale })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const r = referenceFor(locale).table;
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[LOCALE_META[l].hreflang] = `/${l}/gua/table`;
  languages["x-default"] = "/en/gua/table";
  return { title: `${r.title} | ${brandName(locale)}`, description: r.lead, alternates: { canonical: `/${locale}/gua/table`, languages }, openGraph: { title: r.title, description: r.lead, type: "article" } };
}

export default async function GuaTable({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const r = referenceFor(l).table;
  const cjk = scriptFor(l) !== "en";
  const local = TRIGRAM_NAMES[l];
  const trig = (k: keyof typeof TRIGRAMS) => { const tr = TRIGRAMS[k]; return cjk ? forLocale(tr.natureZh, l) : local?.[tr.key][1] ?? tr.natureEn; };
  const hasGua = guaLocales().includes(l);
  const meaning = (n: number) => { const m = guaSeoFor(n, l)?.meta ?? ""; return m.replace(/^[^：:]+[：:]\s*/, ""); };
  const jsonLd = { "@context": "https://schema.org", "@type": "Table", about: "I Ching hexagrams", name: r.title, description: r.lead, inLanguage: LOCALE_META[l].htmlLang };
  return (
    <article className="mx-auto w-full max-w-[52rem] px-[var(--s-4)] md:px-8 pb-20">
      <JsonLd data={jsonLd} />
      <nav className="pt-8"><Link href={`/${l}/gua`} className="t-label hover:text-[var(--ink)] transition-colors">← {t(l, "navGua")}</Link></nav>
      <header className="mt-[var(--s-5)] pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        <h1 className="t-d1">{r.title}</h1>
        <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{r.lead}</p>
      </header>
      <div className="overflow-x-auto -mx-[var(--s-4)] px-[var(--s-4)] md:mx-0 md:px-0">
        <table className="w-full mt-[var(--s-4)] text-[15px]">
          <thead>
            <tr className="text-left">
              <th className="t-label py-2 pr-3 font-normal">{r.colNo}</th>
              <th className="t-label py-2 pr-3 font-normal">{r.colFigure}</th>
              <th className="t-label py-2 pr-3 font-normal">{r.colName}</th>
              <th className="t-label py-2 pr-3 font-normal whitespace-nowrap">{r.colTrigrams}</th>
              <th className="t-label py-2 font-normal">{r.colMeaning}</th>
            </tr>
          </thead>
          <tbody>
            {GUA.map((h) => (
              <tr key={h.number} className="border-t border-dotted border-[var(--ink-16)] align-top">
                <td className="py-2.5 pr-3 tabular-nums text-[var(--ink-45)]">{h.number}</td>
                <td className="py-2.5 pr-3"><FigureMark yangs={guaYangs(h)} width={22} /></td>
                <td className="py-2.5 pr-3 whitespace-nowrap">
                  {hasGua ? <Link href={`/${l}/gua/${guaSlug(h)}`} className="hover:text-[var(--cinnabar)] transition-colors">{hexName(h, l)}</Link> : hexName(h, l)}
                  {!cjk && <span className="block t-small !text-[var(--ink-45)]" lang="zh-Hant">{forLocale(h.fullZh, "zh-hant")}</span>}
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap text-[var(--ink-66)]">{trig(h.upper)} / {trig(h.lower)}</td>
                <td className="py-2.5 t-small !text-[15px] leading-relaxed">{meaning(h.number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">
        <Link href={`/${l}/glossary`} className="underline underline-offset-4">{referenceFor(l).glossary.title}</Link>
        <span className="mx-2 text-[var(--ink-16)]">·</span>
        <Link href={`/${l}/timing`} className="underline underline-offset-4">{referenceFor(l).timing.title}</Link>
      </p>
    </article>
  );
}
