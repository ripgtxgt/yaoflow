import type { Metadata } from "next";
import Link from "next/link";
import { howToAskFor } from "@/lib/how-to-ask";
import { notFound } from "next/navigation";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { asLocale, DEFAULT_LOCALE, LOCALE_META, LOCALES } from "@/lib/locales";
import { caseHexCounts, caseTopicCounts, countCases, listCases } from "@/lib/db";
import { tt } from "@/lib/dict/thread";
import { GUA, guaLocales, guaSlug } from "@/lib/gua";
import { caseQuestion } from "@/lib/case-seo";
import { casesIndexHead } from "@/lib/seo-head";
import { casePath } from "@/lib/cases";
import { hexName } from "@/lib/names";
import { TOPIC_NAMES, type Topic } from "@/lib/topic";
import FigureMark, { primaryYangs } from "@/components/FigureMark";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

const INTL: Record<Locale, string> = { zh: "zh-CN", "zh-hant": "zh-TW", en: "en-US", ja: "ja-JP", ko: "ko-KR", fr: "fr-FR", de: "de-DE", es: "es-ES", pt: "pt-BR" };

const PAGE = 30;
type Q = { topic?: string; hex?: string; page?: string };
const parseQ = (q: Q) => ({
  topic: q.topic && q.topic in TOPIC_NAMES ? q.topic : null,
  hex: q.hex && /^\d{1,2}$/.test(q.hex) && Number(q.hex) >= 1 && Number(q.hex) <= 64 ? Number(q.hex) : null,
  page: q.page && /^\d{1,3}$/.test(q.page) && Number(q.page) >= 1 ? Number(q.page) : 1,
});
const qs = (o: { topic?: string | null; hex?: number | null; page?: number }) => {
  const p = new URLSearchParams();
  if (o.topic) p.set("topic", o.topic);
  if (o.hex) p.set("hex", String(o.hex));
  if (o.page && o.page > 1) p.set("page", String(o.page));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** 10-16: below this many public cases a language's index is not offered to search engines */
const CASES_MIN = 5;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Q> }): Promise<Metadata> {
  const { locale } = await params;
  const l = asLocale(locale);
  const f = parseQ(await searchParams);
  // 10-16 进度表 61 (深挖调研 SEO 体检 §10): an index with almost nothing on it (/ko/cases: 318 characters) is a thin
  // page — not indexed, and left out of the other languages' hreflang, until it holds CASES_MIN cases
  const enough = (x: string) => { try { return countCases(x) >= CASES_MIN; } catch { return true; } };
  const languages: Record<string, string> = {};
  for (const x of LOCALES) if (enough(x)) languages[LOCALE_META[x].hreflang] = `/${x}/cases`;
  if (enough(DEFAULT_LOCALE)) languages["x-default"] = `/${DEFAULT_LOCALE}/cases`;
  const thin = !enough(l);
  // 09-28 (进度表 14): filtered / paged views are crawlable but canonical to the plain index
  const filtered = !!(f.topic || f.hex || f.page > 1);
  const bits = [f.topic ? TOPIC_NAMES[f.topic as Topic][l] : null, f.hex ? hexName(hexagramByNumber(f.hex), l) : null, f.page > 1 ? tt(l, "casesPage", { n: f.page }) : null].filter(Boolean);
  // 10-02 进度表 27: the 繁體 index says 卜卦 once in its head; the H1 stays 「公開卦例」
  const head = casesIndexHead(l);
  const title = `${head?.title ?? t(l, "casesTitle")}${bits.length ? ` · ${bits.join(" · ")}` : ""}`;
  const description = head?.description ?? t(l, "casesLead");
  return {
    title: `${title} | ${brandName(l)}`,
    description,
    alternates: filtered ? { canonical: `/${l}/cases` } : { canonical: `/${l}/cases`, languages },
    robots: { index: !filtered && !thin, follow: true },
    openGraph: { title, description },
  };
}

/** Every case its owner made public, in this language, newest first. */
export default async function CasesIndex({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Q> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const f = parseQ(await searchParams);
  const total = countCases(l, f.topic, f.hex);
  const cases = listCases(l, PAGE, f.topic, { hex: f.hex, offset: (f.page - 1) * PAGE });
  const topics = caseTopicCounts(l);
  const hexes = caseHexCounts(l);
  const hasGua = guaLocales().includes(l);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const chip = (active: boolean) => `inline-block px-2.5 py-1 rounded-[2px] border t-small ${active ? "border-[var(--ink)] bg-[var(--ink)] !text-[var(--paper)]" : "border-[var(--ink-16)] hover:border-[var(--ink-45)]"}`;
  // 11-01 T-014: the publishing day (台北) as a machine mark for the promotion runs — not shown to readers
  const pubDay = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(INTL[l], { year: "numeric", month: "short", day: "numeric" });
  const topicName = (tp: string | null) => TOPIC_NAMES[(tp && tp in TOPIC_NAMES ? tp : "other") as Topic][l];
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
      <h1 className="t-d1">{t(l, "casesTitle")}</h1>
      <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{t(l, "casesLead")}</p>
      {/* 09-28 (进度表 14): by kind of matter and by hexagram — plain links, so a crawler can walk them */}
      {topics.length > 1 && (
        <p className="mt-[var(--s-5)] flex flex-wrap items-center gap-2">
          <span className="t-label !text-[var(--ink-45)] mr-1">{tt(l, "casesByTopic")}</span>
          <Link href={`/${l}/cases${qs({ hex: f.hex })}`} className={chip(!f.topic)}>{tt(l, "casesAll")}</Link>
          {topics.map((x) => <Link key={x.topic} href={`/${l}/cases${qs({ topic: x.topic, hex: f.hex })}`} className={chip(f.topic === x.topic)}>{topicName(x.topic)} <span className="opacity-50">{x.n}</span></Link>)}
        </p>
      )}
      {hexes.length > 1 && (
        <p className="mt-[var(--s-3)] flex flex-wrap items-center gap-2">
          <span className="t-label !text-[var(--ink-45)] mr-1">{tt(l, "casesByHex")}</span>
          {f.hex ? <Link href={`/${l}/cases${qs({ topic: f.topic })}`} className={chip(false)}>{tt(l, "casesAll")}</Link> : null}
          {hexes.slice(0, 24).map((x) => <Link key={x.hex} href={`/${l}/cases${qs({ topic: f.topic, hex: x.hex })}`} className={chip(f.hex === x.hex)}>{hexName(hexagramByNumber(x.hex), l)} <span className="opacity-50">{x.n}</span></Link>)}
        </p>
      )}
      {f.hex && hasGua ? <p className="t-small mt-[var(--s-3)]"><Link href={`/${l}/gua/${guaSlug(hexagramByNumber(f.hex))}`} className="underline underline-offset-4">{hexName(hexagramByNumber(f.hex), l)} →</Link></p> : null}
      {cases.length === 0 ? (
        <p className="t-body mt-[var(--s-6)]">{t(l, "casesEmpty")}</p>
      ) : (
        <ol className="mt-[var(--s-6)] flex flex-col">
          {cases.map((c, i) => {
            const v = c.values_str.split(",").map(Number) as LineValue[];
            const p = hexagramByNumber(c.primary_num);
            const ch = c.changed_num ? hexagramByNumber(c.changed_num) : null;
            const fields = JSON.parse(c.fields_json) as Record<string, string>;
            const line = caseQuestion(c, l) + " " + (Object.values(fields)[0] ?? "");
            return (
              <li key={c.public_id} data-series={c.series} data-published={pubDay(c.published_at)} className={`py-[var(--s-4)] ${i > 0 ? "border-t border-dotted border-[var(--ink-16)]" : ""}`}>
                <Link href={casePath(l, c.public_id)} className="group flex gap-[var(--s-4)] items-start">
                  <FigureMark yangs={primaryYangs(v)} width={26} className="shrink-0 pt-1 opacity-80 group-hover:opacity-100" />
                  <div className="min-w-0 flex-1">
                    <p className="t-label !text-[var(--ink-45)]">
                      {fmt(c.cast_at)}<span className="mx-2">·</span>{topicName(c.topic)}<span className="mx-2">·</span>{hexName(p, l)}{ch ? ` → ${hexName(ch, l)}` : ""}
                      {c.outcome === "hit" && <span className="ml-2 text-[var(--cinnabar)]">{t(l, "caseOutcomeHit")}</span>}
                    </p>
                    <p className="t-body mt-1 line-clamp-2 group-hover:text-[var(--cinnabar)] transition-colors">{line}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      {/* 09-30 (进度表 23): the cases show real questions — the page on how to phrase one sits under them */}
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]"><Link href={`/${l}/how-to-ask`} className="underline underline-offset-4">{howToAskFor(l).entry.back}</Link></p>
      {pages > 1 && (
        <p className="mt-[var(--s-5)] flex items-center gap-4 t-small">
          {f.page > 1 ? <Link href={`/${l}/cases${qs({ topic: f.topic, hex: f.hex, page: f.page - 1 })}`} className="underline underline-offset-4">← {tt(l, "casesPrev")}</Link> : null}
          <span className="!text-[var(--ink-45)]">{tt(l, "casesPage", { n: f.page })} / {pages}</span>
          {f.page < pages ? <Link href={`/${l}/cases${qs({ topic: f.topic, hex: f.hex, page: f.page + 1 })}`} className="underline underline-offset-4">{tt(l, "casesNext")} →</Link> : null}
        </p>
      )}
    </div>
  );
}
