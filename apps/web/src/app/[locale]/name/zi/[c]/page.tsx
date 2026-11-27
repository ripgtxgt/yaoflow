import type { Metadata } from "next";
import Link from "next/link";
import CrossCards from "@/components/CrossCards";
import type { Locale } from "@/lib/locales";
import type { ReactNode } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import TrackOnce from "@/components/TrackOnce";
import { featureOn } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES } from "@/lib/mingli/calendar/page-bits";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { NAME_UI } from "@/lib/mingli/name/ui";
import { NAME_CHARS, charInfo, charText, type CharInfo } from "@/lib/mingli/name/chars";
import { brandName } from "@/lib/brand";

/**
 * 10-29 进度表 122 姓名學: one page per character — /zh-hant/name/zi/<繁體>, /zh/name/zi/<简体> (another form of the same
 * character is sent to the right one). Its meaning, three words, how it sits in a name, the 諧音 to watch, readings, the
 * 康熙筆劃 and the 五行 with which rule gave it. Static data, rendered per request (the page reads the request through the shared header).
 */
export const dynamic = "force-dynamic";

const pageChar = (raw: string, locale: string): { info: CharInfo; ch: string } | null => {
  let c: string;
  try { c = decodeURIComponent(raw); } catch { return null; }
  if ([...c].length !== 1) return null;
  const info = charInfo(c);
  return info ? { info, ch: locale === "zh" ? info.s : info.h } : null;
};
const metaDesc = (i: CharInfo, l: HlLocale) => {
  const t = charText(i, l);
  return loc(`「${t.ch}」字：${t.d} 讀音 ${i.zy ?? ""} ${i.py}，粵拼 ${i.jp}；康熙筆劃 ${i.k} 劃，五行屬${i.wx}。常見詞：${t.w.join("、")}。放在名字裡：${t.p}`, l).slice(0, 160);
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string; c: string }> }): Promise<Metadata> {
  const { locale, c } = await params;
  const x = pageChar(c, locale);
  if (!x) return {};
  const l = locale as HlLocale;
  return {
    title: { absolute: `${loc(`${x.ch}字的意思、讀音、康熙筆劃（${x.info.k}劃）與五行（屬${x.info.wx}）｜取名用字`, l)} — ${brandName(l)}` },
    description: metaDesc(x.info, l),
    alternates: { canonical: `/${locale}/name/zi/${encodeURIComponent(x.ch)}`, languages: { "zh-Hant": `/zh-hant/name/zi/${encodeURIComponent(x.info.h)}`, "zh-CN": `/zh/name/zi/${encodeURIComponent(x.info.s)}`, "x-default": `/zh-hant/name/zi/${encodeURIComponent(x.info.h)}` } },
  };
}

export default async function CharPage({ params }: { params: Promise<{ locale: string; c: string }> }) {
  const { locale, c } = await params;
  if (!HL_LOCALES.has(locale)) notFound();
  if (!featureOn("name")) notFound();
  const x = pageChar(c, locale);
  if (!x) notFound();
  let raw = c; try { raw = decodeURIComponent(c); } catch { /* as is */ }
  if (raw !== x.ch) permanentRedirect(`/${locale}/name/zi/${encodeURIComponent(x.ch)}`);
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const { info } = x;
  const t = charText(info, l);
  const other = l === "zh" ? info.h : info.s;
  const same = NAME_CHARS.filter((y) => y.wx === info.wx && y.o === 2 && y.h !== info.h && Math.abs(y.k - info.k) <= 1).slice(0, 16);
  const row = (k: string, v: ReactNode) => <div className="flex gap-3 py-2"><dt className="t-label w-20 shrink-0 !text-[var(--ink-45)]">{w(k)}</dt><dd className="t-body">{v}</dd></div>;
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="name" locale={l} method="zi" />
      <p className="t-small"><Link href={`/${l}/name`} className="underline underline-offset-4">← {w(NAME_UI.head.split("：")[0]!)}</Link></p>
      <h1 className="mt-[var(--s-3)] flex items-baseline gap-4"><span className="text-[72px] leading-none">{t.ch}</span><span className="t-d3">{w(`${t.ch}字的意思與取名`)}</span></h1>
      <p className="t-body mt-[var(--s-4)] leading-relaxed">{t.d}</p>
      <dl className="mt-[var(--s-4)] divide-y divide-dotted divide-[var(--ink-16)]">
        {other !== t.ch && row(l === "zh" ? "繁體" : "简体", other)}
        {row("讀音", <>{info.zy && <span className="mr-3">{info.zy}</span>}<span className="mr-3">{info.py}</span><span className="!text-[var(--ink-66)]">{w("粵拼")} {info.jp}</span></>)}
        {row("康熙筆劃", <>{info.k}{w(" 劃")}{info.kn && <span className="t-small ml-2 !text-[var(--ink-45)]">{w(info.kn)}</span>}<span className="t-small ml-2 !text-[var(--ink-45)]">{w(`（一般筆劃 ${info.t}）`)}</span></>)}
        {row("五行", <>{w(`屬${info.wx}`)}<span className="t-small ml-2 !text-[var(--ink-45)]">{w(info.by === "部首" ? "（依部首）" : "（依讀音，參考）")}</span></>)}
        {row("常見詞", t.w.join("、"))}
        {row("放在名字裡", t.p)}
        {t.x && row("留意", <span className="!text-[var(--cinnabar)]">{t.x}</span>)}
      </dl>
      <p className="mt-[var(--s-5)]"><Link href={`/${l}/name`} className="inline-block px-5 py-2.5 rounded-full bg-[var(--ink)] !text-[var(--paper)] text-[14px]">{w("把這個字放進名字查一下")}</Link></p>
      {same.length > 0 && (
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect">{w(`同樣屬${info.wx}、筆劃相近的取名用字`)}</h2>
          <p className="mt-[var(--s-2)] flex flex-wrap gap-2">{same.map((y) => { const ch = l === "zh" ? y.s : y.h; return <Link key={y.h} href={`/${l}/name/zi/${encodeURIComponent(ch)}`} className="w-10 h-10 grid place-items-center rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] t-body !text-[18px]">{ch}</Link>; })}</p>
        </section>
      )}
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)] leading-relaxed">{w(NAME_UI.howStroke)}</p>
      <p className="t-small mt-2 !text-[var(--ink-45)]">{w(NAME_UI.note)}</p>
      {/* 10-29 (Neil: 产品之间的互相引导): lib/cross-map.ts */}
      <CrossCards source="name" locale={l as Locale} exclude={["name"]} />
    </article>
  );
}
