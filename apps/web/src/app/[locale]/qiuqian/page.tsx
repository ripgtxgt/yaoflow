import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import JsonLd from "@/components/JsonLd";
import FeatureLink from "@/components/FeatureLink";
import { Qiuqian } from "@/components/JiaobeiFlow";
import { currentCustomer } from "@/lib/auth";
import ProductPage from "@/components/product/ProductPage";
import PromoStrip from "@/components/PromoStrip";
import { canSee, featureState } from "@/lib/features";
import { hkReader } from "@/lib/register";
import { cleanQuestion, hkWords, NOTES, qiuqianTemples } from "@/lib/jiaobei";
import { jiaobeiUi } from "@/lib/jiaobei-ui";
import { toHans } from "@/lib/hant";
import type { Locale } from "@/lib/locales";
import { brandName } from "@/lib/brand";
import { productOg } from "@/lib/og-product";
import { ForeignQiuqian, foreignQiuqianMeta } from "@/components/ForeignQian";
import { isForeign, type Foreign } from "@/lib/l10n/core";
import { isLocale, pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";

export const dynamic = "force-dynamic";

/** 10-16 进度表 67: 線上求籤 in the temple's order — 請示 → 抽籤 → 擲筊確認籤號 → the lot's page (lib/jiaobei.ts); 10-22 进度表 76 ⑤: on the product template */
const LOCALES = new Set(["zh-hant", "zh"]);
const TITLE = "線上求籤｜先擲筊請示，抽一支籤，再擲筊確認籤號";
const DESC = "免費線上求籤，照廟裡的順序：寫下想問的事、擲筊請示、搖籤筒抽一支、擲筊確認籤號，再看籤詩與白話。六十甲子籤、關帝籤、觀音籤、天后宮籤、月老籤、黃大仙籤等 14 套。";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ⑤: drawing the market's own set in another language
  if (isLocale(locale) && isForeign(locale) && serviceOpenIn("jieqian", locale)) { const m = foreignQiuqianMeta(locale); return { title: { absolute: `${m.title} — ${brandName(locale)}` }, description: m.description, alternates: pageAlternates(locale, "/qiuqian", serviceLocales("jieqian")) }; }
  const zh = locale === "zh";
  const t = zh ? toHans(TITLE) : TITLE, d = zh ? toHans(DESC) : DESC;
  return {
    title: { absolute: `${t} — ${brandName(locale)}` }, description: d,
    alternates: { canonical: `/${locale}/qiuqian`, languages: { "zh-Hant": "/zh-hant/qiuqian", "zh-CN": "/zh/qiuqian", "x-default": "/zh-hant/qiuqian" } },
    ...productOg(locale, t, d, null), // 10-26 进度表 116
  };
}

export default async function QiuqianPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string }> }) {
  const { locale } = await params;
  if (isLocale(locale) && isForeign(locale) && serviceOpenIn("jieqian", locale)) {
    if (!(await canSee("jiaobei"))) notFound();
    let me0 = null;
    try { me0 = await currentCustomer(); } catch { /* no database */ }
    return <ForeignQiuqian l={locale} signedIn={!!me0} q={(await searchParams).q ?? ""} />;
  }
  if (!LOCALES.has(locale)) notFound();
  if (!(await canSee("jiaobei"))) notFound();
  const hans = locale === "zh";
  const hk = !hans && hkReader(await headers());
  const w = (s: string) => { const x = hk ? hkWords(s) : s; return hans ? toHans(x) : x; };
  const ui = jiaobeiUi({ hans, hk });
  const temples = qiuqianTemples().map((t) => ({ ...t, name: w(t.name), setName: w(t.setName) }));
  const notes = NOTES.filter((n) => /求籤|聖筊大約/.test(n.h)).map((n) => ({ h: w(n.h), p: w(n.p) }));
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: notes.map((n) => ({ "@type": "Question", name: n.h, acceptedAnswer: { "@type": "Answer", text: n.p } })) };
  const qq = cleanQuestion((await searchParams).q ?? "");
  return (
    <ProductPage
      locale={locale as Locale}
      preview={featureState("jiaobei") === "preview"}
      title={w("線上求籤")}
      lead={w("照廟裡的順序：想好一件事，擲筊請示，抽一支籤，再擲筊確認籤號。")}
      input={
        <>
          <JsonLd data={faq} />
          <Qiuqian locale={locale} ui={ui} temples={temples} initialQ={qq} />
          <p className="t-small mt-[var(--s-5)] text-center"><Link href={`/${locale}/jiaobei`} className="underline underline-offset-4">{w("只想擲筊問一件事 →")}</Link></p>
          {/* 10-29 进度表 127: the 尋物 page, no account needed */}
          <FeatureLink name="xunwu" from="qiuqian" locale={locale} href={`/${locale}/xunwu`} text={w("東西不見了？擲三顆骰子，看先往哪裡找 →")} className="mt-[var(--s-2)] text-center" />
        </>
      }
      fit={{
        yes: [w("一件具體的事，想知道大方向和心態"), w("沒辦法去廟裡，或去之前先問一次"), w("已經選好要求哪一套籤、哪一間廟")],
        no: [w("一次問好幾件事"), w("想知道事情落在哪幾天（那要起一卦）"), w("抽到不喜歡的籤就重抽")],
      }}
      how={[w("選籤的種類和求籤的廟，寫下想問的一件事。"), w("擲筊請示可不可以抽；聖筊才抽。"), w("搖籤筒抽一支，再擲筊確認籤號。"), w("看籤詩與白話；想放在你這件事上讀，再決定要不要解籤。")]}
      free={w("求籤、看籤詩免費，不用註冊；白話解說要通卡或會員。")}
      paid={w("把這支籤放在你這件事上讀的專屬解讀，含一次追問；一次輕解讀的價格，會員已含。")}
      boundary={[w("線上求籤不取代到廟裡親手求籤。"), w("籤給方向；哪幾天會有動靜，要為同一件事起一卦。")]}
      faq={notes.map((n) => ({ q: n.h, a: n.p }))}
      promo={<PromoStrip surface="jiaobei" locale={locale as Locale} exclude={["jiaobei"]} />}
    />
  );
}
