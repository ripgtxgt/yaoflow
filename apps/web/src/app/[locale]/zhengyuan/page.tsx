import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TrackOnce from "@/components/TrackOnce";
import ProductPage from "@/components/product/ProductPage";
import PromoStrip from "@/components/PromoStrip";
import ZhengyuanBuy from "@/components/mingli/ZhengyuanBuy";
import { canSee, featureState } from "@/lib/features";
import { birthUi } from "@/lib/mingli/birth/ui";
import { zyText } from "@/lib/mingli/bazi/page-ui";
import { brandName } from "@/lib/brand";
import { productOg } from "@/lib/og-product";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * 10-26 正緣畫像 sold on its own (feature `zhengyuan`): the product page. No birth data in the URL.
 * 10-30 进度表 128 ④: every language it is open in (lib/mingli/bazi/page-ui.ts zyText).
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("zhengyuan", locale)) return {};
  const t = zyText(locale);
  return {
    title: { absolute: `${t.metaTitle} — ${brandName(locale)}` },
    description: t.metaDesc,
    alternates: pageAlternates(locale, "/zhengyuan", serviceLocales("zhengyuan")),
    robots: featureState("zhengyuan") === "on" ? undefined : { index: false, follow: false },
    ...productOg(locale, t.metaTitle, t.metaDesc, null), // 10-26 进度表 116: its own title on the default card
  };
}

export default async function ZhengyuanPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ ta?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("zhengyuan", locale)) notFound();
  if (!(await canSee("zhengyuan"))) notFound();
  const l = locale as Locale;
  const ui = zyText(l) as unknown as Record<string, string>;
  const { ta } = await searchParams;
  return (
    <ProductPage locale={l} preview={featureState("zhengyuan") === "preview"} title={ui.head!} lead={ui.lead!}
      input={<><TrackOnce event="zhengyuan" locale={l} method="view" /><ZhengyuanBuy locale={l} ui={ui} birthUi={birthUi(l)} initialTa={ta === "same" ? "same" : "other"} /></>}
      promo={<PromoStrip surface="mingli" locale={l} exclude={["zhengyuan"]} />}
      disclaimer={ui.disclaimer}
    />
  );
}
