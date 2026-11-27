import type { Metadata } from "next";
import Link from "next/link";
import CrossCards from "@/components/CrossCards";
import type { Locale } from "@/lib/locales";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import { canSee } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES } from "@/lib/mingli/calendar/page-bits";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { GUIDE, KIND_WORDS, taisuiOf, yearGanzhi, zodiacBySlug, ZODIACS } from "@/lib/mingli/taisui";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";
/** 10-29 进度表 125 第一期: one 生肖 — 2027 犯不犯太歲、哪一種、依習俗怎麼安 */
const YEAR = 2027;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const z = zodiacBySlug(slug);
  if (!z) return {};
  const l = locale as HlLocale;
  const k = taisuiOf(z.branch, YEAR);
  const head = k.length ? `${YEAR} 屬${z.animal}${k.map((x) => KIND_WORDS[x].name.replace(/（.*）/, "")).join("、")}` : `${YEAR} 屬${z.animal}犯太歲嗎`;
  return {
    title: { absolute: `${loc(`${head}｜屬${z.animal}${YEAR}要安太歲嗎、怎麼安`, l)} — ${brandName(l)}` },
    description: loc(`${YEAR} 年（${yearGanzhi(YEAR)}年）屬${z.animal}${k.length ? `是${k.map((x) => KIND_WORDS[x].name).join("、")}` : "不犯太歲"}。這一年要留意什麼、依習俗安太歲的時間、地點與費用。`, l),
    alternates: { canonical: `/${locale}/taisui/${slug}`, languages: { "zh-Hant": `/zh-hant/taisui/${slug}`, "zh-CN": `/zh/taisui/${slug}`, "x-default": `/zh-hant/taisui/${slug}` } },
  };
}

export default async function TaisuiZodiacPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("taisui"))) notFound();
  const z = zodiacBySlug(slug);
  if (!z) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const k = taisuiOf(z.branch, YEAR), k0 = taisuiOf(z.branch, YEAR - 1), k1 = taisuiOf(z.branch, YEAR + 1);
  const name = (ks: typeof k) => (ks.length ? ks.map((x) => KIND_WORDS[x].name).join("、") : "不犯太歲");
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
    { "@type": "Question", name: w(`${YEAR} 屬${z.animal}犯太歲嗎？`), acceptedAnswer: { "@type": "Answer", text: w(`${YEAR} 年是${yearGanzhi(YEAR)}年，屬${z.animal}${k.length ? `是${name(k)}` : "不犯太歲"}。`) } },
    ...GUIDE.slice(0, 3).map((g) => ({ "@type": "Question", name: w(g.h), acceptedAnswer: { "@type": "Answer", text: w(g.p) } })),
  ] };
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <JsonLd data={faq} />
      <TrackOnce event="taisui" locale={l} method={`view:${z.slug}`} />
      <nav className="t-label"><Link href={`/${l}/taisui`} className="hover:text-[var(--ink)]">← {w(`${YEAR} 犯太歲查詢`)}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{w(`${YEAR} 屬${z.animal}犯太歲嗎`)}</h1>
      <p className="t-d3 mt-[var(--s-4)]">{w(`${YEAR}（${yearGanzhi(YEAR)}年）屬${z.animal}：${name(k)}`)}</p>
      {k.length ? k.map((x) => <p key={x} className="t-body mt-[var(--s-3)] leading-relaxed">{w(KIND_WORDS[x].plain)}</p>)
        : <p className="t-body mt-[var(--s-3)] leading-relaxed">{w("屬這個生肖的人這一年不在犯太歲之列，照平常的節奏過就好；要安太歲祈福也可以，依個人習慣。")}</p>}
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{w(`前一年 ${YEAR - 1}：${name(k0)}；後一年 ${YEAR + 1}：${name(k1)}。`)}</p>
      <section className="mt-[var(--s-6)]">
        <h2 className="t-d3">{w("依習俗，安太歲怎麼安")}</h2>
        {GUIDE.map((g) => (
          <div key={g.h} className="mt-[var(--s-4)]">
            <h3 className="t-sect">{w(g.h)}</h3>
            <p className="t-body mt-[var(--s-2)] leading-relaxed">{w(g.p)}</p>
          </div>
        ))}
      </section>
      <section className="mt-[var(--s-6)] grid gap-3">
        <p className="t-body">{w("比起犯不犯太歲，更實在的是：這一年哪幾個月順、哪幾個月要放慢。")}</p>
        <p><Link href={`/${l}/nianshu`} className="inline-block px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px]">{w(`看 ${YEAR} 年書 →`)}</Link></p>
        <p className="t-small"><Link href={`/${l}/yunshi/${z.slug}`} className="underline underline-offset-4 !text-[var(--ink-66)]">{w(`屬${z.animal}的今日運勢 →`)}</Link></p>
      </section>
      <p className="mt-[var(--s-5)] flex flex-wrap gap-2">{ZODIACS.filter((x) => x.slug !== z.slug).map((x) => <Link key={x.slug} href={`/${l}/taisui/${x.slug}`} className="t-small underline underline-offset-4 !text-[var(--ink-66)]">{w(`屬${x.animal}`)}</Link>)}</p>
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{w("依民間通書與習俗整理，各地、各宮廟做法不同；這些是習俗與參考，不代表一定會發生什麼。")}</p>
      {/* 10-29 (Neil: 产品之间的互相引导): lib/cross-map.ts — the 年書 and this sign's 運勢 are linked above */}
      <CrossCards source="taisui" locale={l as Locale} exclude={["taisui", "yunshi"]} skipMain />
    </article>
  );
}
