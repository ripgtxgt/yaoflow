import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale, type Locale, asLocale, pageAlternates, t } from "@/lib/i18n";
import CastFlow from "@/components/CastFlow";
import ProductPage, { ProductBlocks } from "@/components/product/ProductPage";
import PromoStrip from "@/components/PromoStrip";
import { castProductT } from "@/lib/dict/cast-product";

// 10-25: who is reading decides the page (the login card or the rite) — never baked at build time
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: pageAlternates(asLocale(locale), "/cast") };
}

/**
 * 10-22 进度表 76 ⑤: the cast page on the product template. The rite (CastFlow) is the input; the blocks under it
 * (適合問／怎麼做／免費與付費／界線／順帶看看／免責) go in as CastFlow's children, so they stand under the question before
 * the cast and leave the page once a figure is up — the result then reads like the result template, not a product page.
 */
export default async function CastPage(
  { params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const c = castProductT(l);
  const blocks = <ProductBlocks locale={l} fit={{ yes: c.fitYes, no: c.fitNo }} how={c.how} free={c.free} paid={c.paid} boundary={c.boundary}
    promo={<PromoStrip surface="cast" locale={l} exclude={["cast"]} />} disclaimer={t(l, "disclaimer")} />;
  return (
    <ProductPage
      locale={l}
      title={c.title}
      lead={t(l, "questionHint")}
      input={
        <Suspense fallback={<div className="min-h-[70vh]" />}>
          <CastFlow locale={l}>{blocks}</CastFlow>
        </Suspense>
      }
    />
  );
}
