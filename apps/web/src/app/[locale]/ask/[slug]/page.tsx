import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { t } from "@/lib/i18n";
import { listCases } from "@/lib/db";
import { casePath } from "@/lib/cases";
import { caseQuestion } from "@/lib/case-seo";
import { hexName } from "@/lib/names";
import { LOVE_LANDING_DATE, LOVE_LANDING_LOCALE, LOVE_LANDINGS, loveLanding, loveLandingPath, pickLoveCases } from "@/lib/love-landing";
import { scenePath } from "@/lib/scenes";
import { JIEQIAN_PATH } from "@/lib/qian-meta";
import FigureMark, { primaryYangs } from "@/components/FigureMark";
import LoveAskBox from "@/components/LoveAskBox";

/**
 * 10-12 四個感情落地頁 (进度表 §四 37): /zh-hant/ask/{fuhe, hui-lai, zheng-yuan, zhu-dong}. Search-word title → the
 * question box (situation set, three ways to ask) → asking well → how the timing is read → real public cases of this
 * kind → FAQ → updated date. Static copy (lib/love-landing.ts) plus the live cases: rebuilt hourly. 繁體 only.
 */
export const revalidate = 3600;

export function generateStaticParams() {
  return LOVE_LANDINGS.map((p) => ({ locale: LOVE_LANDING_LOCALE, slug: p.slug }));
}

interface Params { locale: string; slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = locale === LOVE_LANDING_LOCALE ? loveLanding(slug) : null;
  if (!p) return {};
  return {
    title: { absolute: p.title },
    description: p.description,
    alternates: { canonical: loveLandingPath(p.slug), languages: { "zh-Hant": loveLandingPath(p.slug) } },
    openGraph: { title: p.title, description: p.description, type: "article" },
  };
}

export default async function LoveLandingPage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  if (locale !== LOVE_LANDING_LOCALE) notFound();
  const p = loveLanding(slug);
  if (!p) notFound();
  const l = LOVE_LANDING_LOCALE;
  let cases: ReturnType<typeof listCases> = [];
  try { cases = pickLoveCases(p, listCases(l, 120, "relationship")); } catch { /* no database: the page stands without them */ }
  const others = LOVE_LANDINGS.filter((x) => x.slug !== p.slug);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const updated = `${LOVE_LANDING_DATE.getUTCFullYear()} 年 ${LOVE_LANDING_DATE.getUTCMonth() + 1} 月 ${LOVE_LANDING_DATE.getUTCDate()} 日`;

  const jsonLd = [
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "YaoFlow", item: `${site}/${l}` },
      { "@type": "ListItem", position: 2, name: p.short, item: `${site}${loveLandingPath(p.slug)}` },
    ] },
  ];

  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <JsonLd data={jsonLd} />

      <header className="pt-10 pb-[var(--s-5)]">
        <p className="t-label !text-[var(--gold-text)]">感情 · 六爻卜卦</p>
        <h1 className="t-d1 mt-1">{p.h1}</h1>
        <p className="t-body mt-[var(--s-3)] leading-relaxed text-[var(--ink-66)]">{p.sub}</p>
      </header>

      <LoveAskBox slug={p.slug} situation={p.situation} situationLabel={p.situationLabel} examples={p.examples} />

      {/* ---- asking well ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-3)]">怎麼問，卦比較答得清楚</h2>
        <div className="overflow-x-auto -mx-[var(--s-4)] px-[var(--s-4)]">
          <table className="w-full text-[15px] min-w-[28rem]">
            <thead>
              <tr className="text-left">
                <th className="t-label font-normal pb-2 pr-4 !text-[var(--ink-45)]">這樣問比較難看清</th>
                <th className="t-label font-normal pb-2 !text-[var(--cinnabar)]">這樣問，卦比較答得清楚</th>
              </tr>
            </thead>
            <tbody>
              {p.pairs.map((x, i) => (
                <tr key={i} className="border-t border-[var(--ink-16)]">
                  <td className="py-2.5 pr-4 text-[var(--ink-45)] align-top">{x.from}</td>
                  <td className="py-2.5 align-top">{x.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]"><Link href={`/${l}/how-to-ask`} className="underline underline-offset-4">更多問法、卦不好怎麼看 →</Link></p>
      </section>

      {/* ---- timing ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-3)]">應期怎麼看</h2>
        {p.timing.map((x, i) => <p key={i} className="t-body leading-relaxed mt-[var(--s-3)] first:mt-0">{x}</p>)}
        <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]"><Link href={`/${l}/timing`} className="underline underline-offset-4">想看推法，請看〈應期怎麼推〉→</Link></p>
      </section>

      {/* ---- real public cases ---- */}
      {cases.length > 0 && (
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-3)]">這類事的公開卦例</h2>
          <p className="t-small !text-[var(--ink-45)] mb-[var(--s-2)]">讀者自願匿名公開的卦例，問法是讀者自己寫的公開版本。</p>
          <ul className="flex flex-col">
            {cases.map((c) => {
              const v = c.values_str.split(",").map(Number) as LineValue[];
              const h = hexagramByNumber(c.primary_num);
              const ch = c.changed_num ? hexagramByNumber(c.changed_num) : null;
              const fields = JSON.parse(c.fields_json) as Record<string, string>;
              return (
                <li key={c.public_id} className="py-3 border-t border-dotted border-[var(--ink-16)] first:border-t-0">
                  <Link href={casePath(l, c.public_id)} className="group flex gap-4 items-start">
                    <FigureMark yangs={primaryYangs(v)} width={22} className="shrink-0 pt-1 opacity-70 group-hover:opacity-100" />
                    <span className="min-w-0">
                      <span className="t-label !text-[var(--ink-45)] block">{hexName(h, l)}{ch ? ` → ${hexName(ch, l)}` : ""}{c.outcome === "hit" ? ` · ${t(l, "caseOutcomeHit")}` : ""}</span>
                      <span className="t-body block mt-1 line-clamp-2 group-hover:text-[var(--cinnabar)] transition-colors">{caseQuestion(c, l)} <span className="!text-[var(--ink-66)]">{Object.values(fields)[0]}</span></span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]"><Link href={`/${l}/cases?topic=relationship`} className="underline underline-offset-4">看更多感情卦例 →</Link></p>
        </section>
      )}

      {/* ---- FAQ ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-4)]">常見問題</h2>
        <div className="flex flex-col gap-[var(--s-4)]">
          {p.faq.map((f, i) => (
            <div key={i}>
              <h3 className="t-body !font-medium">{f.q}</h3>
              <p className="t-body mt-1 leading-relaxed text-[var(--ink-66)]">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- related ---- */}
      <section className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
        <h2 className="t-sect mb-[var(--s-2)]">其他感情問題</h2>
        <ul className="t-body flex flex-col gap-1">
          {others.map((x) => <li key={x.slug}><Link href={loveLandingPath(x.slug)} className="underline underline-offset-4">{x.short}</Link></li>)}
          <li><Link href={JIEQIAN_PATH} className="underline underline-offset-4">求了籤？輸入籤號解籤</Link></li>
          {p.slug === "fuhe" && <li><Link href={scenePath(l, "get-back-together")} className="underline underline-offset-4">分手後復合：卦怎麼看</Link></li>}
        </ul>
        <p className="t-small mt-[var(--s-4)] !text-[var(--ink-45)]">更新日期：{updated}</p>
      </section>
    </article>
  );
}
