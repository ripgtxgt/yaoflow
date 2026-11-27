import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { TarotDraw } from "@/components/TarotFlow";
import ProductPage from "@/components/product/ProductPage";
import PromoStrip from "@/components/PromoStrip";
import { canSee, featureState } from "@/lib/features";
import { tarotUi } from "@/lib/tarot-ui";
import { tarotText } from "@/lib/tarot-text";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { brandName } from "@/lib/brand";
import { productOg } from "@/lib/og-product";

export const dynamic = "force-dynamic";

/**
 * 10-16 进度表 68: 線上塔羅 — write one matter, shuffle, pick, the cards turn over (lib/tarot.ts); 10-22 进度表 76 ⑤: on the
 * product template. 10-30 进度表 128 ②: in every language the tarot is open in — the words from lib/tarot-text.ts.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("tarot", locale)) return {};
  const p = tarotText(locale).page;
  return {
    title: { absolute: `${p.metaTitle} — ${brandName(locale)}` }, description: p.metaDesc,
    alternates: pageAlternates(locale, "/tarot", serviceLocales("tarot")),
    ...productOg(locale, p.metaTitle, p.metaDesc, "tarot"), // 10-26 进度表 116
  };
}

export default async function TarotPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string }> }) {
  const { locale } = await params;
  const { q } = await searchParams;
  const initialQ = typeof q === "string" ? q.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (!isLocale(locale) || !serviceOpenIn("tarot", locale)) notFound();
  if (!(await canSee("tarot"))) notFound();
  const p = tarotText(locale).page;
  const ui = tarotUi(locale);
  const notes = p.notes;
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: notes.map((n) => ({ "@type": "Question", name: n.h, acceptedAnswer: { "@type": "Answer", text: n.p } })) };
  return (
    <ProductPage
      locale={locale as Locale}
      preview={featureState("tarot") === "preview"}
      title={p.title}
      lead={p.lead}
      input={
        <>
          <JsonLd data={faq} />
          <TarotDraw locale={locale} ui={ui} initialQ={initialQ} />
        </>
      }
      fit={{ yes: p.fitYes, no: p.fitNo }}
      how={p.how}
      free={p.free}
      paid={p.paid}
      boundary={p.boundary}
      faq={notes.map((n) => ({ q: n.h, a: n.p }))}
      promo={<PromoStrip surface="tarot" locale={locale as Locale} exclude={["tarot"]} />}
      disclaimer={p.disclaimer}
    >
      {/* 10-17: the 78 cards have their own page — the draw page stays the draw */}
      <p className="t-small mt-[var(--s-4)] text-center"><Link href={`/${locale}/tarot/cards`} className="underline underline-offset-4 !text-[var(--ink-66)]">{p.allCards}</Link></p>
    </ProductPage>
  );
}
