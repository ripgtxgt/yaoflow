import JsonLd from "@/components/JsonLd";
import { featureOn } from "@/lib/features";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { qianTagSuffix, allQian, BASE_TEMPLE, HK_SETS, qianWording, isQianSet, JIEQIAN_PATH, qianByNum, qianIndexPath, qianTempleName, qianVariants, TEMPLE_POEM_SOURCES, QIAN_SET_SOURCE, qianOrdinal, qianPageDescription, qianPageTitle, qianPath, QIAN_LOCALE, QIAN_SET, QIAN_SETS, qianSet, qianSetName, qianTag, qianSamePoem } from "@/lib/qian";
import { qianShareUrl } from "@/lib/qian-meta";
import QianCard from "@/components/QianCard";
import QianShare from "@/components/QianShare";
import QianFriend from "@/components/QianFriend";
import QianFooter from "@/components/QianFooter";
import { ForeignQianLot, foreignLotMeta } from "@/components/ForeignQian";
import { marketSet } from "@/lib/qian-foreign";
import { isForeign, type Foreign } from "@/lib/l10n/core";
import { isLocale, pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";

/**
 * 10-12 解籤 (进度表 §四 36 ③⑤): one page per lot — /zh-hant/qian/liushi-jiazi/<1–60>. The poem as a card and the door
 * to reading it. 10-13: the plain reading and love / work moved behind the paid reading (Neil: 解籤一律付费). Static.
 * 10-12 籤系: also /zh-hant/qian/huangdaxian/<1–100> (黃大仙靈籤).
 */
interface Params { locale: string; set: string; n: string }

export function generateStaticParams() {
  return QIAN_SETS.flatMap((s) => allQian(s.id).map((e) => ({ locale: QIAN_LOCALE, set: s.id, n: String(e.num) })));
}

function entryOf(p: Params) {
  if (p.locale !== QIAN_LOCALE || !isQianSet(p.set) || !/^\d{1,3}$/.test(p.n)) return null;
  const e = qianByNum(Number(p.n), p.set);
  // 10-12 读者识别: the 黃大仙靈籤 pages are read mostly from Hong Kong — Hong Kong wording (static pages, one version)
  return e ? qianWording(e, HK_SETS.has(e.set)) : null;
}

/** 10-30 进度表 128 ⑤: the lot in another language — the market's own set only (ja 淺草寺, others 觀音) */
function foreignOf(p: Params): { l: Foreign; n: number } | null {
  if (!isLocale(p.locale) || !isForeign(p.locale) || !serviceOpenIn("jieqian", p.locale) || p.set !== marketSet(p.locale) || !/^\d{1,3}$/.test(p.n)) return null;
  return foreignLotMeta(p.locale, Number(p.n)) ? { l: p.locale, n: Number(p.n) } : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const pp = await params;
  const f = foreignOf(pp);
  if (f) { const m = foreignLotMeta(f.l, f.n)!; return { title: { absolute: m.title }, description: m.description, alternates: { canonical: `/${f.l}/qian/${pp.set}/${f.n}` } }; }
  const e = entryOf(pp);
  if (!e) return {};
  return {
    title: { absolute: qianPageTitle(e) },
    description: qianPageDescription(e),
    alternates: { canonical: qianPath(e.num, e.set) },
    openGraph: { title: qianPageTitle(e), description: qianPageDescription(e), type: "article", images: [{ url: cardUrl(e), width: 1080, height: 1350 }] },
  };
}

const cardUrl = (e: { num: number; set: string }) => `/api/qian/card/${e.num}${e.set !== QIAN_SET ? `?s=${e.set}` : ""}`;

export default async function QianPage({ params }: { params: Promise<Params> }) {
  const pp = await params;
  const f = foreignOf(pp);
  if (f) return <ForeignQianLot l={f.l} n={f.n} />;
  const e = entryOf(pp);
  if (!e) notFound();
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const name = qianTag(e) ? `${qianSetName(e)}第 ${e.num} 籤（${qianTag(e)}）` : `${qianSetName(e)}第 ${e.num} 籤`;
  const st = qianSet(e.set);
  const faq = [
    { q: `${name}的白話是什麼意思？`, a: `輸入籤號「${e.num}」和你想問的事，就能看這支籤的白話、放在感情或工作上怎麼讀，以及放在你這件事上的專屬解讀（含一次追問）。一次輕解讀的價格，會員已含。` },
    // 10-28 进度表 117 ②: readers search 「…第21簽姻緣」 — the question in their word, never a verdict (that is the paid reading)
    { q: `${name}放在姻緣上怎麼看？`, a: `姻緣要看你問的是哪一段：還在等人出現、曖昧中、已經在一起，或想復合，同一支籤的讀法都不同。輸入籤號「${e.num}」，寫下你想問的那段關係，解讀會照你的情況說；想知道哪幾天有動靜，再為同一件事起一卦。` },
    { q: `${name}能看出事情哪一天發生嗎？`, a: "籤只給方向，不給日子。想知道落在哪幾天，可以帶著同一個問題起一卦，卦會給日期或幾天的窗口，到那天我們回來問你。" },
  ];
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "YaoFlow", item: `${site}/${QIAN_LOCALE}` },
      { "@type": "ListItem", position: 2, name: "線上解籤", item: `${site}${JIEQIAN_PATH}` },
      { "@type": "ListItem", position: 3, name: st.name, item: `${site}${qianIndexPath(st.id)}` },
      { "@type": "ListItem", position: 4, name: `第 ${e.num} 籤`, item: `${site}${qianPath(e.num, st.id)}` },
    ] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
  const prev = e.num > 1 ? e.num - 1 : null;
  const next = e.num < st.count ? e.num + 1 : null;
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <JsonLd data={jsonLd} />
      <nav className="pt-8 t-label"><Link href={JIEQIAN_PATH} className="hover:text-[var(--ink)] transition-colors">← 線上解籤</Link></nav>
      <header className="mt-[var(--s-4)] pb-[var(--s-5)]">
        <p className="t-label !text-[var(--gold-text)]">{st.name} · 第{qianOrdinal(e.num)}籤{qianTagSuffix(e)}</p>
        <h1 className="t-d1 mt-1">第 {e.num} 籤：{e.title}</h1>
      </header>
      <QianCard num={e.num} ganzhi={qianTag(e)} poem={e.poem} setName={st.name} />
      <QianShare surface="lot" num={e.num} title={e.title} url={qianShareUrl(site, e.num, st.id)} image={cardUrl(e)} setName={st.name} />
      <QianFriend surface="lot" />
      {QIAN_SET_SOURCE[e.set] && (
        <p className="t-small mt-[var(--s-5)] !text-[var(--ink-66)] leading-relaxed">{QIAN_SET_SOURCE[e.set]}</p>
      )}
      {/* 10-12 各廟用字: which temples print this lot word for word as above, and where the others differ */}
      {e.set === QIAN_SET && (() => {
        const vs = qianVariants(e);
        const differing = new Set(vs.flatMap((v) => v.temples));
        const same = [qianTempleName(BASE_TEMPLE), ...Object.keys(TEMPLE_POEM_SOURCES).map(qianTempleName).filter((n) => !differing.has(n))];
        return (
          <section className="mt-[var(--s-5)]">
            <h2 className="t-label !text-[var(--ink-66)] mb-[var(--s-2)]">各廟籤上的用字</h2>
            <p className="t-small !text-[var(--ink-66)] leading-relaxed">上面是{qianTempleName(BASE_TEMPLE)}的籤文{same.length > 1 ? `；${same.slice(1).join("、")}的籤文相同` : ""}。</p>
            {vs.map((v, i) => (
              <p key={i} className="t-small !text-[var(--ink-66)] leading-relaxed mt-1">
                {v.temples.join("、")}：{v.diffs.map((x) => `第${["", "一", "二", "三", "四"][x.line]}句作「${x.theirs}」`).join("，")}。
              </p>
            ))}
          </section>
        );
      })()}

      {/* 10-13 (Neil: 「解签一律不免费啊，都是需要付费的，免费的白话我也是有成本的」): the poem stays — it is what the reader
          holds in their hand — but our plain reading and what it says for love and work are part of the paid reading */}
      <section className="ink-block mt-[var(--s-6)] p-[var(--s-5)]">
        <p className="t-label !text-[var(--paper-66)]">這支籤的白話與解讀</p>
        <h2 className="t-d3 mt-1">抽到第 {e.num} 籤？寫下你想問的事，看這支籤怎麼說</h2>
        <ul className="mt-[var(--s-3)] space-y-1 t-small !text-[var(--paper-66)]">
          <li>· 籤詩白話：每一句在說什麼</li>
          <li>· 放在感情、工作上怎麼讀，和放在你這件事上的專屬解讀</li>
          <li>· 含一次追問；想知道哪幾天，再為同一件事起一卦</li>
        </ul>
        <p className="t-small mt-[var(--s-3)] !text-[var(--paper-66)]">一次輕解讀的價格，會員已含。</p>
        <Link href={`${JIEQIAN_PATH}?n=${e.num}${st.id !== QIAN_SET ? `&s=${st.id}` : ""}`} data-heat={`qian-page-go-${st.id === QIAN_SET ? "" : "hdx-"}${e.num}`} className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors">解這支籤 →</Link>
      </section>

      {/* 10-14 进度表 50 */}
      {featureOn("jiaobei") && <p className="t-small mt-[var(--s-5)]"><Link href="/zh-hant/jiaobei" data-heat="qian-page-jb" className="underline underline-offset-4 hover:text-[var(--cinnabar)]">線上擲筊：一件事擲一次，聖筊、笑筊、陰筊怎麼看 →</Link></p>}
      {featureOn("today-qian") && <p className="t-small mt-[var(--s-5)]"><Link href="/zh-hant/today-qian" data-heat="qian-page-tq" className="underline underline-offset-4 hover:text-[var(--cinnabar)]">今日一籤：每天從廟裡的真籤抽一支，附籤日曆 →</Link></p>}

      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-4)]">常見問題</h2>
        <div className="flex flex-col gap-[var(--s-4)]">
          {faq.map((f, i) => (
            <div key={i}>
              <h3 className="t-body !font-medium">{f.q}</h3>
              <p className="t-body mt-1 leading-relaxed text-[var(--ink-66)]">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <nav className="mt-[var(--s-6)] flex justify-between t-small">
        {prev ? <Link href={qianPath(prev, st.id)} className="underline underline-offset-4">← 第 {prev} 籤</Link> : <span />}
        <Link href={qianIndexPath(st.id)} className="underline underline-offset-4">{st.name}全部 {st.count} 籤</Link>
        {next ? <Link href={qianPath(next, st.id)} className="underline underline-offset-4">第 {next} 籤 →</Link> : <span />}
      </nav>
      {/* 10-28 进度表 117 ③: the same poem as other temples print it, under their own numbers */}
      {(() => {
        const same = qianSamePoem(e);
        if (!same.length) return null;
        return (
          <section className="mt-[var(--s-6)]">
            <h2 className="t-sect mb-[var(--s-3)]">其他廟的同一首</h2>
            <p className="t-small !text-[var(--ink-66)] leading-relaxed">這首籤詩在別的籤系裡也有，籤號不同、字句或有一兩字出入：</p>
            <ul className="mt-[var(--s-2)] flex flex-col gap-1 t-small">
              {same.map((x) => (
                <li key={`${x.set}-${x.num}`}><Link href={qianPath(x.num, x.set)} data-heat="qian-same-poem" className="underline underline-offset-4 hover:text-[var(--cinnabar)]">{qianSet(x.set).name}第 {x.num} 籤{qianTag(x) ? `（${qianTag(x)}）` : ""}</Link></li>
              ))}
            </ul>
          </section>
        );
      })()}
      {/* 进度表 40 ④: the same number in the other sets */}
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">
        其他籤的第 {e.num} 籤：{QIAN_SETS.filter((o) => o.id !== st.id && e.num <= o.count).map((o, i) => <span key={o.id}>{i ? "、" : ""}<Link href={qianPath(e.num, o.id)} className="underline underline-offset-4">{o.name}</Link></span>)}
      </p>
      <QianFooter />
    </article>
  );
}
