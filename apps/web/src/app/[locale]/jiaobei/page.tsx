import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import JsonLd from "@/components/JsonLd";
import FeatureLink from "@/components/FeatureLink";
import { JiaobeiAsk } from "@/components/JiaobeiFlow";
import ProductPage from "@/components/product/ProductPage";
import PromoStrip from "@/components/PromoStrip";
import { canSee, featureOn, featureState } from "@/lib/features";
import { hkReader } from "@/lib/register";
import { hkWords, NOTES } from "@/lib/jiaobei";
import { jiaobeiUi } from "@/lib/jiaobei-ui";
import { toHans } from "@/lib/hant";
import type { Locale } from "@/lib/locales";
import { brandName } from "@/lib/brand";
import { isLocale, pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { isForeign } from "@/lib/l10n/core";
import { jbText, jiaobeiUiIn } from "@/lib/jiaobei-text";
import { productOg } from "@/lib/og-product";

export const dynamic = "force-dynamic";

/** 10-16 进度表 67: 線上擲筊 — one matter, one toss, the first sign stands (lib/jiaobei.ts); 10-22 进度表 76 ⑤: on the product template */
const TITLE = "線上擲筊｜聖筊、笑筊、陰筊是什麼，一件事擲一次";
const DESC = "免費線上擲筊：先寫下想問的一件事，擲一次，或問大事擲到三個聖筊。聖筊約一半、笑筊與陰筊各約四分之一，附正確擲筊步驟、求籤要幾個聖筊、連續笑筊怎麼辦。";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("jiaobei", locale)) return {};
  const zh = locale === "zh";
  // 10-30 进度表 128 ⑤: the other languages (擲筊照原样翻译介绍)
  const F = isForeign(locale) ? jbText(locale).page : null;
  const t = F ? F.metaTitle : zh ? toHans(TITLE) : TITLE, d = F ? F.metaDesc : zh ? toHans(DESC) : DESC;
  return {
    title: { absolute: `${t} — ${brandName(locale)}` }, description: d,
    alternates: pageAlternates(locale, "/jiaobei", serviceLocales("jiaobei")),
    ...productOg(locale, t, d, F ? null : "jiaobei"), // 10-26 进度表 116 (the card is drawn in Chinese)
  };
}

export default async function JiaobeiPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string }> }) {
  const { locale } = await params;
  const { q } = await searchParams;
  const initialQ = typeof q === "string" ? q.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!isLocale(locale) || !serviceOpenIn("jiaobei", locale)) notFound();
  if (!(await canSee("jiaobei"))) notFound();
  const hans = locale === "zh";
  const F = isForeign(locale) ? jbText(locale) : null;
  const hk = !hans && !F && hkReader(await headers());
  const w = (s: string) => { const x = hk ? hkWords(s) : s; return hans ? toHans(x) : x; };
  const ui = F ? jiaobeiUiIn(locale as Parameters<typeof jiaobeiUiIn>[0]) : jiaobeiUi({ hans, hk });
  const notes = F ? F.notes : NOTES.map((n) => ({ h: w(n.h), p: w(n.p) }));
  // 求籤 opens with the 籤 batch; until then a 聖筊 leads to the cast
  const qq = serviceOpenIn("jieqian", locale as Parameters<typeof serviceOpenIn>[1]);
  const P = F ? F.page : null;
  const pw = (k: keyof NonNullable<typeof P>, zh: string) => (P ? (P[k] as string) : w(zh));
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: notes.map((n) => ({ "@type": "Question", name: n.h, acceptedAnswer: { "@type": "Answer", text: n.p } })) };
  return (
    <ProductPage
      locale={locale as Locale}
      preview={featureState("jiaobei") === "preview"}
      title={P ? P.title : w("線上擲筊")}
      lead={P ? (qq ? P.lead : P.leadNoQian) : w("心裡先想好一件具體的事再擲。聖筊可以接著抽一支籤；陰筊可以起一卦看這件事哪幾天有動靜。")}
      input={
        <>
          <JsonLd data={faq} />
          <JiaobeiAsk locale={locale} ui={ui} region={hans ? "cn" : hk ? "hk" : "tw"} tarotOn={await canSee("tarot")} initialQ={initialQ} qiuqian={qq} />
          {qq && <p className="t-small mt-[var(--s-5)] text-center"><Link href={`/${locale}/qiuqian`} className="underline underline-offset-4">{pw("toQiuqian", "直接線上求籤（先擲筊請示，再抽籤、確認籤號）→")}</Link></p>}
          {featureOn("tarot") && <p className="t-small mt-[var(--s-2)] text-center"><Link href={`/${locale}/tarot`} className="underline underline-offset-4">{pw("toTarot", "用塔羅看這件事現在怎樣 →")}</Link></p>}
          {/* 10-29 进度表 127: the 尋物 page, no account needed */}
          <FeatureLink name="xunwu" from="jiaobei" locale={locale} href={`/${locale}/xunwu`} text={pw("toXunwu", "東西不見了？擲三顆骰子，看先往哪裡找 →")} className="mt-[var(--s-2)] text-center" />
        </>
      }
      fit={P ? { yes: P.fitYes, no: P.fitNo } : {
        yes: [w("一件具體的事：誰、什麼事、什麼時間範圍"), w("去廟裡之前，先把想問的事想清楚"), w("日常小事擲一次；問大事擲到三個聖筊")],
        no: [w("一次問好幾件事，或問法還很模糊"), w("為了想要的結果一直重擲"), w("取代到廟裡親手擲筊")],
      }}
      how={P ? (qq ? P.how : P.howNoQian) : [w("寫下想問的一件事。"), w("擲一次，接受第一個杯象；問大事可以擲到三個聖筊，中途出現陰筊就停。"), w("聖筊可以接著抽一支籤；陰筊或笑筊，可以起一卦看這件事哪幾天有動靜。")]}
      free={P ? P.free : w("擲筊、求籤都免費，不用註冊。")}
      boundary={P ? P.boundary : [w("結果是給你參考的方向，不是保證。"), w("連續笑筊，先把問題縮到一件事、一個時間範圍再擲。")]}
      faq={notes.map((n) => ({ q: n.h, a: n.p }))}
      promo={<PromoStrip surface="jiaobei" locale={locale as Locale} exclude={["jiaobei"]} />}
      disclaimer={P ? P.disclaimer : w("機率出處：嘉義市第 37 屆科展國小組「擲出我的幸福滿杯」等科展實測。")}
    />
  );
}
