import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
import { LOCALE_META } from "@/lib/locales";
import OutcomeRecords from "@/components/OutcomeRecords";
import { allAnswered, allRecords, outcomeRecordsOn, outcomeTotals, type OutcomeTotals } from "@/lib/outcome-records";
import { brandName } from "@/lib/brand";
import { resultsCounts, type ResultsCounts } from "@/lib/results-line";

/**
 * 10-14 进度表 §四 45 「應驗紀錄」總頁 (Neil: 「把这几个做了吧」). Only readings their owners chose to publish; every
 * answer listed, newest first, nothing picked; at the top the raw counts — never a percentage, never "accuracy".
 * 繁體與简体 (the Hong Kong register reads the 繁體 page). Off — 404 — while SHOW_OUTCOME_RECORDS is not 1.
 */
export const dynamic = "force-dynamic";
const PAGE_LOCALES = new Set<Locale>(["zh-hant", "zh"]);

const W = {
  "zh-hant": {
    title: "應驗紀錄", meta: "讀者自己選擇公開的卦例，應期到了之後自己回報的結果：應了、部分、沒應、不確定、還沒定，全部照實列出，不挑好的。",
    lead: "應期到了，我們回去問結果，讀者自己回報什麼，這裡就寫什麼。最上面是全站的件數（不公開的只計數）；逐件列出的，只有讀者自己選擇公開的卦例。",
    site: "全站已問 {asked} 件、回來作答 {answered} 件（不公開的只計數）。六爻解讀：應了 {hit}、部分 {partial}、沒應 {miss}、不確定 {unclear}、還沒定 {open}。",
    siteFacts: "塔羅與免費起卦，讀者自己說的：發生了 {happened}、有動靜 {stirred}、沒動靜 {nothing}、還沒定 {fopen}。",
    counts: "下面是讀者自己選擇公開的卦例：應期已過 {due} 件——應了 {hit}、部分 {partial}、沒應 {miss}、不確定 {unclear}、還沒定 {open}、未回報 {notReported}、已到期待問 {queued}；另有 {waiting} 件應期未到。",
    note: "讀者自己回報，不是準確率。",
    updated: "更新於 {date}", list: "讀者的回報（新的在上）", empty: "還沒有讀者回報。應期過後，這裡會慢慢多起來。",
    how: "應期是怎麼推出來的", cases: "所有公開卦例",
  },
  zh: {
    title: "应验记录", meta: "读者自己选择公开的卦例，应期到了之后自己回报的结果：应了、部分、没应、不确定、还没定，全部照实列出，不挑好的。",
    lead: "应期到了，我们回去问结果，读者自己回报什么，这里就写什么。最上面是全站的件数（不公开的只计数）；逐件列出的，只有读者自己选择公开的卦例。",
    site: "全站已问 {asked} 件、回来作答 {answered} 件（不公开的只计数）。六爻解读：应了 {hit}、部分 {partial}、没应 {miss}、不确定 {unclear}、还没定 {open}。",
    siteFacts: "塔罗与免费起卦，读者自己说的：发生了 {happened}、有动静 {stirred}、没动静 {nothing}、还没定 {fopen}。",
    counts: "下面是读者自己选择公开的卦例：应期已过 {due} 件——应了 {hit}、部分 {partial}、没应 {miss}、不确定 {unclear}、还没定 {open}、未回报 {notReported}、已到期待问 {queued}；另有 {waiting} 件应期未到。",
    note: "读者自己回报，不是准确率。",
    updated: "更新于 {date}", list: "读者的回报（新的在上）", empty: "还没有读者回报。应期过后，这里会慢慢多起来。",
    how: "应期是怎么推出来的", cases: "所有公开卦例",
  },
} as const;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !PAGE_LOCALES.has(locale as Locale) || !outcomeRecordsOn()) return {};
  const w = W[locale as "zh" | "zh-hant"];
  return {
    title: `${w.title} | ${brandName(locale)}`, description: w.meta,
    alternates: { canonical: `/${locale}/outcomes`, languages: { "zh-Hant": "/zh-hant/outcomes", "zh-Hans": "/zh/outcomes", "x-default": "/zh-hant/outcomes" } },
    openGraph: { title: w.title, description: w.meta, type: "article" },
  };
}

export default async function Outcomes({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !PAGE_LOCALES.has(locale as Locale) || !outcomeRecordsOn()) notFound();
  const l = locale as "zh" | "zh-hant";
  const w = W[l];
  let totals: OutcomeTotals = { due: 0, reported: 0, hit: 0, partial: 0, miss: 0, open: 0, unclear: 0, notReported: 0, queued: 0, waiting: 0 };
  try { totals = outcomeTotals(l, allRecords()); } catch { /* no database at build */ }
  // 10-23 进度表 104 ②: the whole site's figure first (the home page's, private ones counted only), then the public cases
  let site: ResultsCounts | null = null;
  try { site = resultsCounts(); } catch { /* no database at build */ }
  const records = allAnswered(l);
  const date = new Intl.DateTimeFormat(LOCALE_META[l].htmlLang, { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Taipei" }).format(Date.now());
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <header className="pt-10 pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        <h1 className="t-d1">{w.title}</h1>
        <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{w.lead}</p>
      </header>
      <section className="mt-[var(--s-5)]" data-heat="outcomes-counts">
        {site && (
          <p className="t-body leading-relaxed tabular-nums" data-heat="outcomes-site">
            {fill(w.site, { asked: site.asked, answered: site.answered, ...site.judged })}
            {/* the spreads' and free casts' part waits for their first answer */}
            {site.facts.happened + site.facts.stirred + site.facts.nothing + site.facts.open > 0
              ? fill(w.siteFacts, { happened: site.facts.happened, stirred: site.facts.stirred, nothing: site.facts.nothing, fopen: site.facts.open }) : null}
          </p>
        )}
        <p className={`t-body leading-relaxed tabular-nums ${site ? "mt-[var(--s-3)]" : ""}`}>{fill(w.counts, { ...totals })}</p>
        <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{w.note}</p>
        <p className="t-label mt-[var(--s-2)] !normal-case !tracking-[0.06em]">{fill(w.updated, { date })}</p>
      </section>
      {records.length > 0
        ? <OutcomeRecords records={records} l={l} title={w.list} />
        : <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{w.empty}</p>}
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)] flex flex-wrap gap-x-5 gap-y-2">
        <Link href={`/${l}/timing`} className="underline underline-offset-4">{w.how}</Link>
        <Link href={`/${l}/cases`} className="underline underline-offset-4">{w.cases}</Link>
      </p>
    </article>
  );
}
