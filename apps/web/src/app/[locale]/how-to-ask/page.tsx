import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { LOCALE_META, LOCALES } from "@/lib/locales";
import { howToAskFor, HOW_TO_ASK_DATE } from "@/lib/how-to-ask";
import { LOVE_LANDING_LOCALE, LOVE_LANDINGS, loveLandingPath } from "@/lib/love-landing";
import { brandName } from "@/lib/brand";

/**
 * 「怎麼問、怎麼看」 (进度表 23, 竞品观察 O14): a paying member asked for it on 09-30. Same page shape as
 * /timing and /glossary — static, one article, JSON-LD, a cast door at the end. Written content: lib/how-to-ask.ts.
 */
export function generateStaticParams() { return LOCALES.map((locale) => ({ locale })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const a = howToAskFor(locale);
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[LOCALE_META[l].hreflang] = `/${l}/how-to-ask`;
  languages["x-default"] = "/en/how-to-ask";
  const description = a.metaDesc ?? a.lead;
  return { title: `${a.metaTitle} | ${brandName(locale)}`, description, alternates: { canonical: `/${locale}/how-to-ask`, languages }, openGraph: { title: a.title, description, type: "article" } };
}

export default async function HowToAsk({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const a = howToAskFor(l);
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: a.metaTitle, description: a.lead, inLanguage: LOCALE_META[l].htmlLang, datePublished: HOW_TO_ASK_DATE.toISOString(), author: { "@type": "Organization", name: "YaoFlow" } };
  const P = ({ children }: { children: string }) => <p className="t-body leading-relaxed mt-[var(--s-3)] first:mt-0">{children}</p>;
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <JsonLd data={jsonLd} />
      <header className="pt-10 pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        <h1 className="t-d1">{a.title}</h1>
        <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{a.lead}</p>
        <nav className="mt-[var(--s-4)] flex flex-wrap gap-x-5 gap-y-1">
          {([["ask", a.ask.h], ["bad", a.bad.h], ["again", a.again.h], ["check", a.check.h]] as const).map(([id, h]) => (
            <a key={id} href={`#${id}`} className="t-label hover:text-[var(--ink)] transition-colors">{h}</a>
          ))}
        </nav>
      </header>

      {/* ---- 1 怎麼問 ---- */}
      <section id="ask" className="mt-[var(--s-6)] scroll-mt-20">
        <h2 className="t-sect mb-[var(--s-3)]">{a.ask.h}</h2>
        <ol className="flex flex-col gap-2 pl-5 list-decimal">
          {a.ask.rules.map((r, i) => <li key={i} className="t-body leading-relaxed">{r}</li>)}
        </ol>
        <p className="t-small mt-[var(--s-4)] !text-[var(--ink-66)]">{a.ask.pairsLead}</p>
        <div className="mt-[var(--s-3)] overflow-x-auto -mx-[var(--s-4)] px-[var(--s-4)]">
          <table className="w-full text-[15px] min-w-[32rem]">
            <thead>
              <tr className="text-left">
                <th className="t-label font-normal pb-2 pr-4 w-[5rem]"></th>
                <th className="t-label font-normal pb-2 pr-4 !text-[var(--ink-45)]">{a.ask.vague}</th>
                <th className="t-label font-normal pb-2 !text-[var(--cinnabar)]">{a.ask.specific}</th>
              </tr>
            </thead>
            <tbody>
              {a.ask.pairs.map((p, i) => {
                const first = i === 0 || a.ask.pairs[i - 1]!.topic !== p.topic;
                return (
                  <tr key={i} className={first ? "border-t border-[var(--ink-16)]" : "border-t border-dotted border-[var(--ink-16)]"}>
                    <td className="py-2.5 pr-4 t-label !text-[var(--ink-45)] align-top whitespace-nowrap">{first ? p.topic : ""}</td>
                    <td className="py-2.5 pr-4 text-[var(--ink-45)] align-top">{p.from}</td>
                    <td className="py-2.5 align-top">{p.to}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="t-body leading-relaxed mt-[var(--s-4)]">{a.ask.after}</p>
      </section>

      {/* ---- 2 卦不好怎麼看 ---- */}
      <section id="bad" className="mt-[var(--s-6)] scroll-mt-20">
        <h2 className="t-sect mb-[var(--s-3)]">{a.bad.h}</h2>
        {a.bad.intro.map((p, i) => <P key={i}>{p}</P>)}
        <ol className="mt-[var(--s-4)] flex flex-col gap-[var(--s-3)]">
          {a.bad.angles.map((x, i) => (
            <li key={i} className="border-l-2 border-[var(--gold)] pl-4">
              <p className="t-body !text-[17px]">{x.q}</p>
              <p className="t-small mt-1 !text-[var(--ink-66)]">{x.note}</p>
            </li>
          ))}
        </ol>
        <p className="t-body leading-relaxed mt-[var(--s-4)]">{a.bad.after}</p>
      </section>

      {/* ---- 3 什麼時候再問 ---- */}
      <section id="again" className="mt-[var(--s-6)] scroll-mt-20">
        <h2 className="t-sect mb-[var(--s-3)]">{a.again.h}</h2>
        <ul className="flex flex-col gap-[var(--s-3)]">
          {a.again.rules.map((r, i) => <li key={i} className="t-body leading-relaxed pl-4 -indent-4">· {r}</li>)}
        </ul>
      </section>

      {/* ---- 4 怎麼驗證 ---- */}
      <section id="check" className="mt-[var(--s-6)] scroll-mt-20">
        <h2 className="t-sect mb-[var(--s-3)]">{a.check.h}</h2>
        <P>{a.check.intro}</P>
        <ol className="mt-[var(--s-3)] flex flex-col gap-2 pl-5 list-decimal">
          {a.check.steps.map((s, i) => <li key={i} className="t-body leading-relaxed">{s}</li>)}
        </ol>
        <p className="t-body leading-relaxed mt-[var(--s-4)]">{a.check.after}</p>
      </section>

      <section className="ink-block mt-[var(--s-6)] p-[var(--s-5)]">
        <h2 className="t-d3">{t(l, "guaCtaTitle")}</h2>
        <p className="t-small mt-[var(--s-2)] !text-[var(--paper-66)]">{t(l, "guaCtaBody")}</p>
        <Link href={`/${l}/cast?c=how-to-ask`} data-heat="hta-cast" className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors">{t(l, "guaCtaButton")}</Link>
      </section>
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)] flex flex-wrap gap-x-2 gap-y-1">
        <Link href={`/${l}/cases`} className="underline underline-offset-4">{a.links.cases}</Link>
        <span className="text-[var(--ink-16)]">·</span>
        <Link href={`/${l}/timing`} className="underline underline-offset-4">{a.links.timing}</Link>
        <span className="text-[var(--ink-16)]">·</span>
        <Link href={`/${l}/glossary`} className="underline underline-offset-4">{a.links.glossary}</Link>
      </p>
      {/* 10-12 (进度表 §四 37): the four love questions, each with its own page */}
      {l === LOVE_LANDING_LOCALE && (
        <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)] flex flex-wrap gap-x-3 gap-y-1">
          <span>感情問題怎麼問：</span>
          {LOVE_LANDINGS.map((x) => <Link key={x.slug} href={loveLandingPath(x.slug)} className="underline underline-offset-4">{x.short}</Link>)}
        </p>
      )}
    </article>
  );
}
