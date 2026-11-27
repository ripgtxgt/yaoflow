import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { allQian, HK_SETS, QIAN_SET_SOURCE, isQianSet, qianWording, JIEQIAN_PATH, qianIndexPath, qianPath, QIAN_LOCALE, QIAN_SET, QIAN_SETS, qianSet, qianTag } from "@/lib/qian";
import QianFooter from "@/components/QianFooter";
import { ForeignQianIndex, foreignIndexMeta } from "@/components/ForeignQian";
import { marketSet } from "@/lib/qian-foreign";
import { isForeign, type Foreign } from "@/lib/l10n/core";
import { isLocale, pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";

/**
 * 10-12 籤系 (进度表 40 ④ 每套籤的索引页): /zh-hant/qian/<set> — every lot of one set, each linked to its page, and the
 * door to the entry with this set already chosen. Static.
 */
interface Params { locale: string; set: string }

export function generateStaticParams() {
  return QIAN_SETS.map((s) => ({ locale: QIAN_LOCALE, set: s.id }));
}

const titleOf = (name: string, count: number) => `${name}全部 ${count} 首｜籤詩白話、感情與工作怎麼看`;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  // 10-30 进度表 128 ⑤: the market's own set in another language
  if (isLocale(p.locale) && isForeign(p.locale) && serviceOpenIn("jieqian", p.locale) && p.set === marketSet(p.locale)) { const m = foreignIndexMeta(p.locale); return { title: { absolute: m.title }, description: m.description, alternates: { canonical: `/${p.locale}/qian/${p.set}` } }; }
  if (p.locale !== QIAN_LOCALE || !isQianSet(p.set)) return {};
  const s = qianSet(p.set);
  const desc = `${s.name}第 1 到 ${s.count} 籤的籤詩與白話解說：${s.where}。點進每一籤看感情、工作怎麼讀；想知道事情落在哪幾天，再為同一件事起一卦。`;
  return { title: { absolute: titleOf(s.name, s.count) }, description: desc, alternates: { canonical: qianIndexPath(s.id) }, openGraph: { title: titleOf(s.name, s.count), description: desc } };
}

export default async function QianIndexPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  if (isLocale(p.locale) && isForeign(p.locale) && serviceOpenIn("jieqian", p.locale) && p.set === marketSet(p.locale)) return <ForeignQianIndex l={p.locale} />;
  if (p.locale !== QIAN_LOCALE || !isQianSet(p.set)) notFound();
  const s = qianSet(p.set);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const jsonLd = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "YaoFlow", item: `${site}/${QIAN_LOCALE}` },
    { "@type": "ListItem", position: 2, name: "線上解籤", item: `${site}${JIEQIAN_PATH}` },
    { "@type": "ListItem", position: 3, name: s.name, item: `${site}${qianIndexPath(s.id)}` },
  ] };
  const other = QIAN_SETS.filter((x) => x.id !== s.id);
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <JsonLd data={jsonLd} />
      <nav className="pt-8 t-label"><Link href={JIEQIAN_PATH} className="hover:text-[var(--ink)] transition-colors">← 線上解籤</Link></nav>
      <header className="mt-[var(--s-4)] pb-[var(--s-5)]">
        <p className="t-label !text-[var(--gold-text)]">解籤 · {s.name}</p>
        <h1 className="t-d1 mt-1">{s.name}，全部 {s.count} 首</h1>
        <p className="t-body mt-[var(--s-3)] leading-relaxed text-[var(--ink-66)]">{s.where}。每一籤一頁：籤詩、白話，和放在感情、工作上怎麼讀。</p>
        {QIAN_SET_SOURCE[s.id] && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{QIAN_SET_SOURCE[s.id]}</p>}
        <Link href={`${JIEQIAN_PATH}${s.id !== QIAN_SET ? `?s=${s.id}` : ""}`} data-heat={`qian-index-go-${s.id}`} className="inline-block mt-[var(--s-4)] t-label border border-[var(--ink-45)] rounded-[2px] px-5 py-3 hover:border-[var(--ink)] transition-colors">我抽到{s.short}，幫我對照我的事</Link>
      </header>
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        {allQian(s.id).map((e0) => qianWording(e0, HK_SETS.has(s.id))).map((e) => (
          <li key={e.num} className="py-2 border-t border-dotted border-[var(--ink-16)]">
            <Link href={qianPath(e.num, s.id)} className="group flex gap-3 items-baseline">
              <span className={`t-label tabular-nums shrink-0 !text-[var(--ink-45)] ${!qianTag(e) ? "w-[4.5rem]" : e.ganzhi && e.ganzhi.length <= 2 ? "w-[4.5rem]" : "w-[9.5rem]"}`}>第 {e.num} 籤 {qianTag(e)}</span>
              <span className="t-small group-hover:text-[var(--cinnabar)] transition-colors">{e.title}</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">
        {other.map((o, i) => <span key={o.id}>{i ? "、" : ""}<Link href={qianIndexPath(o.id)} className="underline underline-offset-4">{o.name}全部 {o.count} 首</Link></span>)}
      </p>
      <QianFooter />
    </article>
  );
}
