import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import ProductPage from "@/components/product/ProductPage";
import XunwuFlow from "@/components/xunwu/XunwuFlow";
import CrossCards from "@/components/CrossCards";
import { canSee, featureState } from "@/lib/features";
import { hkReader } from "@/lib/register";
import { brandName } from "@/lib/brand";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { fmt } from "@/lib/l10n/core";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { TRIGRAM_BY_NUM } from "@/lib/xunwu";
import { firstStepsIn, PAGE, xunwuPageUi, xwText, type XwRegion } from "@/lib/xunwu-text";

export const dynamic = "force-dynamic";

/**
 * 10-29 进度表 127 尋物「東西不見了？」— the one asking page that needs no account (Neil: 「这个可以例外」).
 * 10-29 进度表 128: all nine languages — the words from lib/xunwu-text (xwText), the practical steps by the reader's
 * country (lib/xunwu-markets.ts); Hong Kong readers keep their own title and lead.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("xunwu", locale)) return {};
  if (!(await canSee("xunwu"))) return {};
  const t = xwText(locale).page;
  return {
    title: { absolute: `${t.metaTitle} — ${brandName(locale)}` }, description: t.metaDesc,
    alternates: pageAlternates(locale, "/xunwu", serviceLocales("xunwu")),
  };
}

export default async function XunwuPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("xunwu", locale)) notFound();
  if (!(await canSee("xunwu"))) notFound();
  const l: Locale = locale;
  const hk = l === "zh-hant" && hkReader(await headers());
  const region: XwRegion = l === "zh" ? "cn" : hk ? "hk" : "tw";
  const t = xwText(l);
  const p = t.page;
  const first = firstStepsIn(l, region);
  const trigrams = TRIGRAM_BY_NUM.map((k) => ({ key: k, name: (t.trigram as Record<string, string>)[k]!, ...t.places[k]! }));
  const client = xunwuPageUi(l);
  const u = t.ui;
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <ProductPage
      locale={l}
      preview={featureState("xunwu") === "preview"}
      title={hk ? PAGE.titleHk : p.title}
      lead={hk ? PAGE.leadHk : p.lead}
      input={
        <>
          <JsonLd data={faq} />
          <TrackOnce event="xunwu" locale={l} method="view" />
          <XunwuFlow locale={l} ui={client.ui} cats={client.cats} places={client.places} agos={client.agos} dirs={client.dirs} dirShort={client.dirShort} />
        </>
      }
      fit={{ yes: [...p.fitYes], no: [...p.fitNo] }}
      how={[...p.how]}
      free={[...p.free]}
      boundary={[...p.boundary]}
      faq={p.faq.map((f) => ({ q: f.q, a: f.a }))}
      // 10-29 (Neil: 「要做好产品线之间的相互关联」): the cast for the days, then two everyday pages (lib/cross-map.ts xunwu)
      promo={<CrossCards source="xunwu" locale={l} exclude={["xunwu"]} />}
    >
      {/* the lower half (进度表 127 SEO): what to do first, the classical text with plain words, how we read it */}
      <section className="mt-[var(--s-6)]" id="first">
        <h2 className="t-sect">{p.firstHead}</h2>
        <ul className="mt-[var(--s-2)] grid gap-1.5">{first.map((x) => <li key={x} className="t-body leading-relaxed flex gap-2"><span className="!text-[var(--gold-text)]">·</span><span>{x}</span></li>)}</ul>
      </section>
      <section className="mt-[var(--s-6)]" id="shiwu">
        <h2 className="t-sect">{p.origHead}</h2>
        <blockquote className="mt-[var(--s-2)] border-l-2 border-[var(--gold)] pl-4">
          <p className="t-body leading-relaxed">{t.shiwu.orig}</p>
          <p className="t-small mt-1 !text-[var(--ink-45)]">{fmt(u.sourceLine, { source: t.shiwu.source })}</p>
        </blockquote>
        <div className="mt-[var(--s-3)] grid gap-2">{t.shiwu.plain.map((x) => <p key={x} className="t-body leading-relaxed">{x}</p>)}</div>
        <h3 className="t-sect mt-[var(--s-5)]">{p.trigramHead}</h3>
        <div className="mt-[var(--s-2)] divide-y divide-dotted divide-[var(--ink-16)]">
          {trigrams.map((g) => (
            <div key={g.key} className="py-3">
              <p className="t-body">{fmt(u.trigramLine, { name: "\u0000", dir: g.dir }).split("\u0000").map((part, i) => (i === 0 ? <span key={i}>{part}<span className="!text-[var(--cinnabar)]">{g.name}</span></span> : <span key={i}>{part}</span>))}</p>
              <p className="t-small mt-1 !text-[var(--gold-text)] leading-relaxed">{fmt(u.quote, { q: g.orig })}</p>
              <p className="t-small mt-1 leading-relaxed"><span className="!text-[var(--ink-45)]">{fmt(u.labelLine, { label: p.homeLabel, text: "" })}</span>{g.home}</p>
              <p className="t-small mt-0.5 leading-relaxed"><span className="!text-[var(--ink-45)]">{fmt(u.labelLine, { label: p.outLabel, text: "" })}</span>{g.out}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-[var(--s-6)]" id="how-we-read">
        <h2 className="t-sect">{p.howWeHead}</h2>
        <ul className="mt-[var(--s-2)] grid gap-1.5">{p.howWe.map((x) => <li key={x} className="t-body leading-relaxed flex gap-2"><span className="!text-[var(--gold-text)]">·</span><span>{x}</span></li>)}</ul>
      </section>
    </ProductPage>
  );
}
