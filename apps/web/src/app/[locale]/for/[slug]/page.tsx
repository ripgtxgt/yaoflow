import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveCast, type LineValue } from "@yaoflow/engine";
import { hexagramByNumber } from "@yaoflow/engine";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { LOCALE_META } from "@/lib/locales";
import { guaLocales, guaSlug } from "@/lib/gua";
import { hexName } from "@/lib/names";
import { listCases } from "@/lib/db";
import { casePath } from "@/lib/cases";
import { caseQuestion } from "@/lib/case-seo";
import { tt } from "@/lib/dict/thread";
import { sceneAlternates, sceneBySlug, sceneLocales, scenePath, scenesFor } from "@/lib/scenes";
import { TOPIC_NAMES, type Topic } from "@/lib/topic";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import { brandName } from "@/lib/brand";

/** Static text, plus the live public cases of the same kind: rebuilt hourly. */
export const revalidate = 3600;

export function generateStaticParams() {
  return sceneLocales().flatMap((locale) => scenesFor(locale).map((s) => ({ locale, slug: s.slug })));
}

interface Params { locale: string; slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const s = sceneBySlug(locale, slug);
  if (!s) return {};
  const languages: Record<string, string> = {};
  for (const l of sceneAlternates(slug)) languages[LOCALE_META[l].hreflang] = scenePath(l, slug);
  languages["x-default"] = scenePath(sceneAlternates(slug).includes("en") ? "en" : locale, slug);
  return {
    title: `${s.title} | ${brandName(locale)}`,
    description: s.meta,
    alternates: { canonical: scenePath(locale, slug), languages },
    openGraph: { title: s.title, description: s.meta, type: "article" },
  };
}

export default async function ScenePage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const s = sceneBySlug(l, slug);
  if (!s) notFound();
  const values = s.example.values.split("").map(Number) as LineValue[];
  const hasGua = guaLocales().includes(l);
  const topicName = TOPIC_NAMES[(s.topic in TOPIC_NAMES ? s.topic : "other") as Topic][l];
  let cases: ReturnType<typeof listCases> = [];
  try { cases = listCases(l, 5, s.topic); } catch { /* no database: the page stands without them */ }
  const others = scenesFor(l).filter((x) => x.slug !== s.slug);
  const cjkQuote = l === "zh" || l === "zh-hant" || l === "ja";

  const jsonLd = [
    { "@context": "https://schema.org", "@type": "Article", headline: s.h1, description: s.meta, inLanguage: LOCALE_META[l].htmlLang, author: { "@type": "Organization", name: "YaoFlow" } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: s.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];

  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <JsonLd data={jsonLd} />
      <nav className="pt-8">
        <Link href={`/${l}/for`} className="t-label hover:text-[var(--ink)] transition-colors">← {t(l, "scenesTitle")}</Link>
      </nav>

      <header className="mt-[var(--s-5)] pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        <p className="t-label !text-[var(--gold-text)]">{topicName}</p>
        <h1 className="t-d1 mt-1">{s.h1}</h1>
        {s.intro.map((p, i) => <p key={i} className={`t-body mt-[var(--s-3)] leading-relaxed ${i === 0 ? "" : "text-[var(--ink-66)]"}`}>{p}</p>)}
      </header>

      {/* ---- what the chart looks at ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-3)]">{t(l, "sceneHow")}</h2>
        <p className="t-d3 leading-relaxed">{s.how.lead}</p>
        <ul className="mt-[var(--s-4)] flex flex-col gap-[var(--s-3)]">
          {s.how.points.map((p, i) => (
            <li key={i} className="grid grid-cols-[28px_1fr] gap-x-3">
              <span className="t-label !text-[var(--cinnabar)] pt-[3px]">{String(i + 1).padStart(2, "0")}</span>
              <p className="t-body leading-relaxed">{p}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- common tendencies ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-4)]">{t(l, "scenePatterns")}</h2>
        <div className="flex flex-col">
          {s.patterns.map((p, i) => (
            <div key={i} className={`py-[var(--s-4)] grid md:grid-cols-[160px_1fr] gap-x-6 gap-y-1 ${i > 0 ? "border-t border-dotted border-[var(--ink-16)]" : ""}`}>
              <h3 className="t-d3">{p.name}</h3>
              <p className="t-body leading-relaxed text-[var(--ink-66)]">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- a worked example: the chart is computed, the text explains it ---- */}
      <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
        <h2 className="t-sect mb-[var(--s-3)]">{t(l, "sceneExample")}</h2>
        <p className="t-d3">
          <span className="text-[var(--ink-45)]" aria-hidden>{cjkQuote ? "「" : "“"}</span>{s.example.question}<span className="text-[var(--ink-45)]" aria-hidden>{cjkQuote ? "」" : "”"}</span>
        </p>
        <div className="flex items-center gap-6 mt-[var(--s-4)]">
          {(() => {
            const cast = resolveCast(values);
            const p = cast.primary;
            const c = cast.changed;
            return (
              <>
                <div>
                  <FigureMark yangs={primaryYangs(values)} width={44} marks={values.map((v) => v === 6 || v === 9)} className="mb-2" />
                  <p className="t-small !text-[var(--ink)]">{hasGua ? <Link href={`/${l}/gua/${guaSlug(p)}`} className="underline underline-offset-4">{hexName(p, l)}</Link> : hexName(p, l)}</p>
                </div>
                {c && (
                  <>
                    <span className="t-label">→</span>
                    <div className="text-[var(--ink-66)]">
                      <FigureMark yangs={changedYangs(values)} width={44} className="mb-2 opacity-60" />
                      <p className="t-small !text-[var(--ink)]">{hasGua ? <Link href={`/${l}/gua/${guaSlug(c)}`} className="underline underline-offset-4">{hexName(c, l)}</Link> : hexName(c, l)}</p>
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </div>
        {s.example.text.split(/\n\n+/).map((p, i) => <p key={i} className="t-body mt-[var(--s-3)] leading-relaxed">{p}</p>)}
        <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{t(l, "sceneExampleNote")}</p>
      </section>

      {/* ---- real public cases of this kind ---- */}
      {cases.length > 0 && (
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-3)]">{t(l, "sceneCases")}</h2>
          <ul className="flex flex-col">
            {cases.map((c) => {
              const v = c.values_str.split(",").map(Number) as LineValue[];
              const p = hexagramByNumber(c.primary_num);
              const ch = c.changed_num ? hexagramByNumber(c.changed_num) : null;
              const fields = JSON.parse(c.fields_json) as Record<string, string>;
              return (
                <li key={c.public_id} className="py-3 border-t border-dotted border-[var(--ink-16)] first:border-t-0">
                  <Link href={casePath(l, c.public_id)} className="group flex gap-4 items-start">
                    <FigureMark yangs={primaryYangs(v)} width={22} className="shrink-0 pt-1 opacity-70 group-hover:opacity-100" />
                    <span className="min-w-0">
                      <span className="t-label !text-[var(--ink-45)] block">{hexName(p, l)}{ch ? ` → ${hexName(ch, l)}` : ""}{c.outcome === "hit" ? ` · ${t(l, "caseOutcomeHit")}` : ""}</span>
                      <span className="t-body block mt-1 line-clamp-2 group-hover:text-[var(--cinnabar)] transition-colors">{caseQuestion(c, l)} <span className="!text-[var(--ink-66)]">{Object.values(fields)[0]}</span></span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---- three questions ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-4)]">{t(l, "sceneFaq")}</h2>
        <div className="flex flex-col gap-[var(--s-4)]">
          {s.faq.map((f, i) => (
            <div key={i}>
              <h3 className="t-body !font-medium">{f.q}</h3>
              <p className="t-body mt-1 leading-relaxed text-[var(--ink-66)]">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- the door, with the question ready ---- */}
      <section className="ink-block mt-[var(--s-6)] p-[var(--s-5)]">
        <h2 className="t-d3">{t(l, "sceneAsk")}</h2>
        <p className="t-small mt-[var(--s-2)] !text-[var(--paper-66)]">{cjkQuote ? "「" : "“"}{s.ask}{cjkQuote ? "」" : "”"}</p>
        <Link href={`/${l}/cast?q=${encodeURIComponent(s.ask)}`} className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors">
          {t(l, "guaCtaButton")}
        </Link>
      </section>

      {/* ---- related ---- */}
      <section className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
        {hasGua && (
          <>
            <h2 className="t-sect mb-[var(--s-2)]">{t(l, "sceneHexagrams")}</h2>
            <ul className="t-body flex flex-wrap gap-x-6 gap-y-1 mb-[var(--s-4)]">
              {s.hexagrams.map((n) => { const h = hexagramByNumber(n); return <li key={n}><Link href={`/${l}/gua/${guaSlug(h)}`} className="underline underline-offset-4">{n} · {hexName(h, l)}</Link></li>; })}
            </ul>
          </>
        )}
        {others.length > 0 && (
          <>
            <h2 className="t-sect mb-[var(--s-2)]">{t(l, "sceneRelated")}</h2>
            <ul className="t-body flex flex-col gap-1">
              {others.map((x) => <li key={x.slug}><Link href={scenePath(l, x.slug)} className="underline underline-offset-4">{x.h1}</Link></li>)}
            </ul>
          </>
        )}
      </section>
    </article>
  );
}

