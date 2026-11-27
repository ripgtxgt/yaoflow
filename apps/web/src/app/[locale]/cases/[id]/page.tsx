import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { isLocale, t, type DictKey, type Locale } from "@/lib/i18n";
import { asLocale, LOCALE_META } from "@/lib/locales";
import { caseRewardFor, caseView, listCases, type CaseView } from "@/lib/db";
import { tt } from "@/lib/dict/thread";
import { CASE_FIELD_LABELS, casePath, outcomeKey, outcomeWord, PUBLIC_ID_RE } from "@/lib/cases";
import { guaLocales, guaSlug } from "@/lib/gua";
import { caseDescription, caseIndexable, caseJsonLd, caseTitle } from "@/lib/case-seo";
import { caseDescriptionHead } from "@/lib/seo-head";
import { recordsForPage } from "@/lib/outcome-records";
import { orT } from "@/lib/dict/outcome-records";
import OutcomeRecords from "@/components/OutcomeRecords";
import { scenesFor, scenePath } from "@/lib/scenes";
import { hexName } from "@/lib/names";
import { TOPIC_NAMES, type Topic } from "@/lib/topic";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

const INTL: Record<Locale, string> = { zh: "zh-CN", "zh-hant": "zh-TW", en: "en-US", ja: "ja-JP", ko: "ko-KR", fr: "fr-FR", de: "de-DE", es: "es-ES", pt: "pt-BR" };
const fmt = (ms: number, l: Locale) => new Date(ms).toLocaleDateString(INTL[l], { year: "numeric", month: "short", day: "numeric" });

function load(id: string): CaseView | null {
  if (!PUBLIC_ID_RE.test(id)) return null;
  return caseView(id);
}

/** The case lives in the language it was read in; another locale's URL shows the same page, canonical to its own. */
function topicName(topic: string | null, l: Locale): string {
  return TOPIC_NAMES[(topic && topic in TOPIC_NAMES ? topic : "other") as Topic][l];
}

/**
 * 10-28 进度表 117 ⑤ (GSC: 54 case pages, 530 impressions, 3 clicks): the snippet says whether this one came true — the
 * 應期 and the result in the words the page uses (應了／沒應／部分…), or that we go back and ask when the day comes.
 * Chinese pages; the call is shortened to make room, never the result.
 */
function withOutcome(desc: string, c: CaseView, l: Locale): string {
  if ((l !== "zh" && l !== "zh-hant") || !c.window_days) return desc;
  const k = outcomeKey(c);
  if (!k) return desc;
  const hans = l === "zh";
  const due = c.due_at ? `${hans ? "应期" : "應期"} ${fmt(c.due_at, l)}` : "";
  const answered = ["caseOutcomeHit", "caseOutcomeMiss", "caseOutcomePartial", "caseOutcomeUnclear", "caseOutcomeOpen"].includes(k);
  const res = answered ? `${hans ? "结果" : "結果"}：${outcomeWord(k, l)}` : hans ? "应期到了我们回来问" : "應期到了我們回來問";
  const tail = `（${[due, res].filter(Boolean).join("，")}）`;
  const room = 160 - [...tail].length;
  const head = [...desc].length > room ? `${[...desc].slice(0, room - 1).join("")}…` : desc;
  return `${head}${tail}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const c = load(id);
  if (!c) return { title: "YaoFlow" };
  const l = asLocale(c.locale);
  const primary = hexagramByNumber(c.primary_num);
  const changed = c.changed_num ? hexagramByNumber(c.changed_num) : null;
  // 09-28 (进度表 14): a question for a title — the author's public wording or one for the kind of matter — never the private question
  void primary; void changed;
  const title = caseTitle(c, l);
  const fields = JSON.parse(c.fields_json) as Record<string, string>;
  // 10-02 进度表 27: in 繁體 the call is introduced as the 卜卦's (once, and not if the text already says it)
  const description = withOutcome(caseDescriptionHead(caseDescription(fields) || (c.framing ?? Object.values(fields)[0] ?? "").slice(0, 160), l), c, l);
  const path = casePath(l, c.public_id);
  return {
    title: `${title} | ${brandName(l)}`,
    description,
    alternates: { canonical: path, languages: { [LOCALE_META[l].hreflang]: path, "x-default": path } },
    // thin cases (a few symbols, a line) stay out of the index so they do not drag the site down
    robots: { index: caseIndexable(c, locale), follow: true },
    openGraph: { title, description, type: "article" },
  };
}

/**
 * 公开卦例 (裂变 V2 ⑦): one reading its owner published — figure, date,
 * kind of matter, a few plain-language passages, and what came of the
 * timing window. Never the person, never the original question.
 */
export default async function CasePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const c = load(id);
  if (!c) notFound();
  const l = asLocale(c.locale); // the page reads in the language the reading was written in
  const values = c.values_str.split(",").map(Number) as LineValue[];
  const primary = hexagramByNumber(c.primary_num);
  const changed = c.changed_num ? hexagramByNumber(c.changed_num) : null;
  const fields = JSON.parse(c.fields_json) as Record<string, string>;
  const ok = outcomeKey(c);
  const code = values.join("");
  const more = listCases(l, 6).filter((x) => x.public_id !== c.public_id).slice(0, 4);
  const hasGua = guaLocales().includes(l);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  // 09-28 (进度表 14): QAPage when the author gave a public wording, Article otherwise; the same-kind scene pages link out
  const jsonLd = caseJsonLd(c, site, casePath(l, c.public_id));
  const scenes = scenesFor(l).filter((sc) => sc.topic === (c.topic ?? "other")).slice(0, 3);
  // 10-02 进度表 28: other reported outcomes on this case's hexagram — empty while SHOW_OUTCOME_RECORDS is off
  const records = recordsForPage({ locale: l, hex: c.primary_num, limit: 5, excludePublicId: c.public_id });

  return (
    <article data-series={c.series} data-published={new Date(c.published_at + 8 * 3_600_000).toISOString().slice(0, 10)} className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
      <JsonLd data={jsonLd} />
      <p className="t-label">
        <Link href={`/${l}/cases`} className="hover:text-[var(--ink)] transition-colors">{t(l, "casesTitle")}</Link>
        <span className="mx-3 text-[var(--ink-16)]">·</span>
        {fmt(c.cast_at, l)}
        <span className="mx-3 text-[var(--ink-16)]">·</span>
        {topicName(c.topic, l)}
        <span className="mx-3 text-[var(--ink-16)]">·</span>
        {t(l, c.tier === "deep" ? "accountTierDeep" : "accountTierOne")}
      </p>

      <h1 className="t-d3 mt-[var(--s-4)]">
        {c.framing ? (
          <>
            <span className="text-[var(--ink-45)]" aria-hidden>{l === "zh" || l === "zh-hant" || l === "ja" ? "「" : "“"}</span>
            {c.framing}
            <span className="text-[var(--ink-45)]" aria-hidden>{l === "zh" || l === "zh-hant" || l === "ja" ? "」" : "”"}</span>
          </>
        ) : t(l, "caseAskedAbout", { topic: topicName(c.topic, l) })}
      </h1>

      {/* ---- the figure ---- */}
      <div className="flex items-center gap-6 mt-[var(--s-5)] pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        <div>
          <FigureMark yangs={primaryYangs(values)} width={52} className="mb-2.5" />
          <p className="t-body !text-[15px]">
            {hasGua ? <Link href={`/${l}/gua/${guaSlug(primary)}`} className="hover:text-[var(--cinnabar)] transition-colors">{hexName(primary, l)}</Link> : hexName(primary, l)}
          </p>
        </div>
        {changed && (
          <>
            <span className="t-label !text-[16px] self-center pt-2">→</span>
            <div className="text-[var(--ink-66)]">
              <FigureMark yangs={changedYangs(values)} width={52} className="mb-2.5" />
              <p className="t-body !text-[15px] text-[var(--ink)]">
                {hasGua ? <Link href={`/${l}/gua/${guaSlug(changed)}`} className="hover:text-[var(--cinnabar)] transition-colors">{hexName(changed, l)}</Link> : hexName(changed, l)}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ---- the passages ---- */}
      <div className="mt-[var(--s-5)] flex flex-col gap-[var(--s-5)]">
        {Object.entries(fields).map(([k, text]) => (
          <section key={k}>
            <h2 className="t-sect mb-[var(--s-2)]">{t(l, (CASE_FIELD_LABELS[k] ?? "secSummary") as DictKey)}</h2>
            <p className="t-body leading-relaxed">{text}</p>
          </section>
        ))}
      </div>

      {/* ---- the window and what came of it ---- */}
      {ok && (
        <dl className="mt-[var(--s-6)] grid grid-cols-2 gap-x-6 gap-y-4 py-[var(--s-4)] border-y border-dotted border-[var(--ink-16)]">
          <div>
            <dt className="t-label">{t(l, "caseWindow")}</dt>
            {/* the reading's own timing passage is already on the page: the window shows as days, not the quote again */}
            <dd className="t-body mt-1">{fields.timing || !c.timing_quote ? t(l, "caseWindowDays", { n: c.window_days ?? 0 }) : c.timing_quote}</dd>
          </div>
          <div>
            <dt className="t-label">{t(l, "caseOutcome")}</dt>
            <dd className={`t-body mt-1 ${c.outcome === "hit" ? "text-[var(--cinnabar)]" : ""}`}>
              {outcomeWord(ok, l)}{c.outcome_at && c.outcome ? <span className="t-small ml-2">{fmt(c.outcome_at, l)}</span> : null}
            </dd>
          </div>
        </dl>
      )}

      {/* 10-02 (进度表 28): the same hexagram's other reported outcomes — nothing at all while the switch is off */}
      <OutcomeRecords records={records} l={l} title={orT(l, "titleCase")} />

      {/* 09-28: the same kind of matter, explained — and the 64 pages already link from the figure above */}
      {scenes.length > 0 && (
        <p className="t-small mt-[var(--s-4)] !text-[var(--ink-66)]">
          {scenes.map((sc, i) => (
            <span key={sc.slug}>{i > 0 ? <span className="mx-2 text-[var(--ink-16)]">·</span> : null}<Link href={scenePath(l, sc.slug)} className="underline underline-offset-4 decoration-[var(--ink-16)] hover:decoration-current">{sc.h1}</Link></span>
          ))}
        </p>
      )}

      {/* ---- the door out ---- */}
      <section className="ink-block mt-[var(--s-6)] p-[var(--s-5)]">
        <h2 className="t-d3">{t(l, "guaCtaTitle")}</h2>
        <p className="t-small mt-[var(--s-2)] !text-[var(--paper-66)]">{t(l, "guaCtaBody")}</p>
        <Link href={`/${l}/cast?via=${code}`} className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors">
          {t(l, "guaCtaButton")}
        </Link>
      </section>

      {/* ---- more cases ---- */}
      {more.length > 0 && (
        <section className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
          <h2 className="t-sect mb-[var(--s-3)]">{t(l, "casesTitle")}</h2>
          <ul className="flex flex-col">
            {more.map((x) => {
              const v = x.values_str.split(",").map(Number) as LineValue[];
              const p = hexagramByNumber(x.primary_num);
              const ch = x.changed_num ? hexagramByNumber(x.changed_num) : null;
              return (
                <li key={x.public_id} className="py-3 border-t border-dotted border-[var(--ink-16)] first:border-t-0">
                  <Link href={casePath(l, x.public_id)} className="group flex items-center gap-4">
                    <FigureMark yangs={primaryYangs(v)} width={22} className="shrink-0 opacity-70 group-hover:opacity-100" />
                    <span className="t-small !text-[var(--ink)] group-hover:text-[var(--cinnabar)] transition-colors">{hexName(p, l)}{ch ? ` → ${hexName(ch, l)}` : ""}</span>
                    <span className="t-label !text-[var(--ink-45)] ml-auto">{topicName(x.topic, l)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="t-small mt-[var(--s-3)]"><Link href={`/${l}/cases`} className="underline underline-offset-4">{t(l, "caseMore")}</Link></p>
        </section>
      )}
      {/* 09-26: a published case earns its author a reading — said on the page, plainly */}
      {caseRewardFor(c.session_id) && <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{tt(l, "caseDisclosure")}</p>}
    </article>
  );
}
