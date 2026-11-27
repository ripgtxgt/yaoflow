import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TrackOnce from "@/components/TrackOnce";
import ProductPage from "@/components/product/ProductPage";
import PromoStrip from "@/components/PromoStrip";
import NianshuBuy from "@/components/mingli/NianshuBuy";
import { canSee, featureState } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { birthUi } from "@/lib/mingli/birth/ui";
import { NS_UI } from "@/lib/mingli/nianshu/ui";
import { brandName } from "@/lib/brand";
import { NIANSHU_EARLY_UNTIL, nianshuSale } from "@/lib/mingli/nianshu/sale";
import { productOg } from "@/lib/og-product";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { isForeign } from "@/lib/l10n/core";
import { dayIn } from "@/lib/l10n/dates";
import { nsForeignText } from "@/lib/mingli/nianshu/foreign-text";
import { localCustomLine } from "@/lib/mingli/nianshu/local-custom";
import { yearCycle } from "@/lib/mingli/bazi/chart";
import { BAZI_NAMES, branchIndex, bzName } from "@/lib/mingli/bazi/names";

export const dynamic = "force-dynamic";

/**
 * 10-21 三合一年書: the product page (feature `nianshu`). No birth data in the URL.
 * 10-30 进度表 128 ④-5: in every language the 年書 is open in — a foreign page takes its words from foreign-text.ts, the
 * year's stem-branch pair and animal in that language, the early-bird date written its way, and (Japanese, Korean) the
 * line for the year's local custom in place of 太歲.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("nianshu", locale)) return {};
  const T = isForeign(locale) ? nsForeignText(locale).ui : null;
  const title = T ? T.metaTitle : loc("年書：八字、紫微、星盤三套合看一整年", locale as HlLocale);
  const desc = T ? T.metaDesc : loc("八字、紫微、星盤三套合看一整年：每一季的節奏、全年最有動靜、最該放慢、最順手的月份，關鍵月到了寫信提醒，過完再問你像不像。", locale as HlLocale);
  // 10-22 进度表 82 ②: indexed once the switch is on (like /services); a description of its own
  return {
    title: { absolute: `${title} — ${brandName(locale)}` },
    description: desc,
    alternates: pageAlternates(locale, "/nianshu", serviceLocales("nianshu")),
    robots: featureState("nianshu") === "on" ? undefined : { index: false, follow: false },
    // 10-26 进度表 116: the 素材工坊 card prints the 2027 early-bird price (Chinese), so it is used only on a Chinese page
    // while that is what the page sells (11/1–1/31); otherwise the page shares the site's default card with its own title
    ...(() => { const sale = nianshuSale(); return productOg(locale, title, desc, !T && sale.early && sale.year === 2027 ? "nianshu" : null); })(),
  };
}

export default async function NianshuPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("nianshu", locale)) notFound();
  if (!(await canSee("nianshu"))) notFound();
  const l = locale as Locale;
  let ui: Record<string, string>;
  /** the year on sale and the next, as the buy box names them (it may switch to the next year after the server answers) */
  const years: Record<number, { gz: string; animal: string }> = {};
  const y0 = nianshuSale().year;
  if (isForeign(l)) {
    ui = { ...nsForeignText(l).ui };
    const [m, d] = NIANSHU_EARLY_UNTIL.split("/").map(Number);
    ui.earlyUntil = ui.earlyUntil.replace("{d}", dayIn(l, y0, m!, d!));
    const extra = localCustomLine(l);
    if (extra) { const items = ui.inside.split("|"); items.splice(items.length - 1, 0, extra); ui.inside = items.join("|"); }
    for (const y of [y0, y0 + 1]) { const gz = yearCycle(y).getName(); years[y] = { gz: bzName(l).gz(gz), animal: BAZI_NAMES[l].animals[branchIndex(gz[1]!)] ?? "" }; }
  } else {
    const w = (s: string) => loc(s, l as HlLocale);
    ui = Object.fromEntries(Object.entries(NS_UI).map(([k, v]) => [k, w(v)])) as Record<string, string>;
  }
  return (
    <ProductPage locale={l} preview={featureState("nianshu") === "preview"} title={ui.head!} lead={ui.lead!}
      input={<><TrackOnce event="nianshu" locale={l} method="view" /><NianshuBuy locale={l} ui={ui} birthUi={birthUi(l)} years={isForeign(l) ? years : undefined} /></>}
      paid={ui.inside!.split("|")}
      promo={<PromoStrip surface="mingli" locale={l} exclude={["nianshu"]} />}
      disclaimer={ui.disclaimer}
    />
  );
}
