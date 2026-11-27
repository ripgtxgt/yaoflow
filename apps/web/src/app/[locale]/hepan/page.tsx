import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TrackOnce from "@/components/TrackOnce";
import ProductPage from "@/components/product/ProductPage";
import PromoStrip from "@/components/PromoStrip";
import HepanFree from "@/components/mingli/HepanFree";
import { canSee, featureState } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { birthUi } from "@/lib/mingli/birth/ui";
import { hepanVocab } from "@/lib/mingli/hepan/facts";
import { hepanT, hepanUiFor } from "@/lib/mingli/hepan/page-ui";
import { hepanNames } from "@/lib/mingli/hepan/names-data";
import { toHans } from "@/lib/hant";
import { brandName } from "@/lib/brand";
import { productOg } from "@/lib/og-product";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { isForeign } from "@/lib/l10n/core";

export const dynamic = "force-dynamic";

/**
 * 10-20 合盤: the free overview (feature `hepan`, preview). Not indexed while in preview; no birth data in the URL.
 * 10-30 进度表 128 ④: in every language the 合盤 is open in — a foreign page hands the overview its words (hepanT) and
 * that language's names (hepanNames); the facts are worked out in the browser as on the Chinese page.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("hepan", locale)) return {};
  const foreign = isForeign(locale);
  const T = foreign ? hepanT(locale) : null;
  const title = T ? T.metaTitle! : loc("合盤：八字、紫微、星盤看兩個人", locale as HlLocale);
  const desc = T ? T.metaDesc! : loc("兩個人的生辰放在一起看：八字、紫微、星盤三套合看相處的節奏、容易卡住的地方和各自要讓的一步。合盤報告單買，會員 8 折。", locale as HlLocale);
  // 10-22 进度表 82 ②: indexed once the switch is on (like /services); a description of its own
  return {
    title: { absolute: `${title} — ${brandName(locale)}` },
    description: desc,
    alternates: pageAlternates(locale, "/hepan", serviceLocales("hepan")),
    robots: featureState("hepan") === "on" ? undefined : { index: false, follow: false },
    ...productOg(locale, title, desc, null), // 10-26 进度表 116: its own title on the default card
  };
}

let HANS_MAP: Record<string, string> | null = null;
/** Traditional → Simplified for every character the overview can show (the client cannot load the converter) */
function hansMap(): Record<string, string> {
  if (HANS_MAP) return HANS_MAP;
  const out: Record<string, string> = {};
  for (const c of new Set([...hepanVocab()])) { const s = toHans(c); if (s !== c && [...s].length === 1) out[c] = s; }
  return (HANS_MAP = out);
}

export default async function HepanPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("hepan", locale)) notFound();
  if (!(await canSee("hepan"))) notFound();
  const l = locale as Locale;
  const ui = hepanUiFor(l);
  const names = isForeign(l) ? hepanNames(l) : null;
  return (
    <ProductPage locale={l} preview={featureState("hepan") === "preview"} title={ui.head ?? ""} lead={ui.lead ?? ""}
      input={<><TrackOnce event="hepan" locale={l} method="view" /><HepanFree locale={l} ui={ui} birthUi={birthUi(l)} hansMap={l === "zh" ? hansMap() : null} castHref={`/${l}/cast`} names={names} /></>}
      promo={<PromoStrip surface="mingli" locale={l} exclude={["hepan"]} />}
      disclaimer={ui.disclaimer}
    />
  );
}
