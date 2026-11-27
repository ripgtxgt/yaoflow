import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import BirthForm from "@/components/mingli/BirthForm";
import { canSee, featureState } from "@/lib/features";
import { birthUi } from "@/lib/mingli/birth/ui";
import { xIn } from "@/lib/mingli/astro/content";
import { astroPage } from "@/lib/mingli/astro/page-ui";
import PromoStrip from "@/components/PromoStrip";
import { brandName } from "@/lib/brand";
import ProductPage from "@/components/product/ProductPage";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { isForeign } from "@/lib/l10n/core";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { productOg } from "@/lib/og-product";

export const dynamic = "force-dynamic";

/**
 * 10-18 进度表 74 星盤: the product page with the birth form.
 * 10-30 进度表 128 ④: in every language the 星盤 is open in (lib/mingli/astro/page-ui.ts astroPage; the library from xIn).
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("xingpan", locale)) return {};
  const p = astroPage(locale);
  return { title: { absolute: `${p.metaTitle} — ${brandName(locale)}` }, description: p.metaDesc, alternates: pageAlternates(locale, "/xingpan", serviceLocales("xingpan")), ...productOg(locale, p.metaTitle, p.metaDesc, "xingpan") };
}

export default async function XingpanPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("xingpan", locale)) notFound();
  if (!(await canSee("astro"))) notFound();
  const l = locale as Locale;
  const p = astroPage(l);
  const X = xIn(l);
  // the 繁體 library is converted for the 简体 page; the others are written in their language already
  const w = (s: string) => (isForeign(l) ? s : loc(s, l as HlLocale));
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: X.faq.map((f) => ({ "@type": "Question", name: w(f.q), acceptedAnswer: { "@type": "Answer", text: w(f.a) } })) };
  // 10-22 进度表 87 (设计稿第 5 節「十一個產品共用兩套模板」): the chart page on the product template — 一句話＋輸入、
  // 適合／不適合、怎麼做、免費／付費、界線、FAQ、順帶看看
  return (
    <ProductPage
      locale={l}
      preview={featureState("astro") === "preview"}
      title={p.title}
      lead={p.lead}
      input={<BirthForm locale={l} ui={birthUi(l)} chartHref={`/${l}/xingpan/chart`} needGender={false} astro event="astro" />}
      fit={{ yes: p.fitYes, no: p.fitNo }}
      how={p.how}
      free={p.free}
      // 10-30 进度表 128 ④-5: 合盤 and the 年書 are open in every language, so every line shows
      paid={p.paid}
      boundary={p.boundary}
      faq={X.faq.map((f) => ({ q: w(f.q), a: w(f.a) }))}
      promo={<PromoStrip surface="mingli" locale={l} exclude={["xingpan"]} />}
    >
      <JsonLd data={faq} />
      <TrackOnce event="astro" locale={l} method="view" />
      <section className="mt-[var(--s-6)] grid gap-[var(--s-3)]">
        <p className="t-body leading-relaxed">{w(X.intro)}</p>
        <p className="t-small"><Link href={`/${l}/xingpan/planets`} className="underline underline-offset-4">{p.introLink}</Link></p>
      </section>
    </ProductPage>
  );
}
