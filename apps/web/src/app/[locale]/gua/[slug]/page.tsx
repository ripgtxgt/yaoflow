import JsonLd from "@/components/JsonLd";
import FeatureLink from "@/components/FeatureLink";
import AskFromPage from "@/components/AskFromPage";
import { askFromPageLocale } from "@/lib/ask-from-page";
import type { Metadata } from "next";
import Link from "next/link";
import { featureOn } from "@/lib/features";
import { notFound } from "next/navigation";
import { TRIGRAMS } from "@yaoflow/engine";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { LOCALE_META, DEFAULT_LOCALE } from "@/lib/locales";
import { GUA, guaBySlug, guaLocales, guaName, guaSlug, guaYangs } from "@/lib/gua";
import { TRIGRAM_NAMES } from "@/lib/trigram-names";
import { FULL_ZH_HANT } from "@/lib/hant-names";
import { hexName, judgmentFor, lineTextFor, scriptFor } from "@/lib/names";
import { forLocale } from "@/lib/hant";
import FigureMark from "@/components/FigureMark";
import { singleLineChanges, transitionPath } from "@/lib/transitions";
import { caseDay, caseForHex } from "@/lib/gua-cases";
import { listCases } from "@/lib/db";
import { casePath } from "@/lib/cases";
import GuaCta from "@/components/GuaCta";
import { guaExamples } from "@/lib/dict/gua-examples";
import { caseQuestion } from "@/lib/case-seo";
import { guaDescription } from "@/lib/seo-head";
import { recordsForPage } from "@/lib/outcome-records";
import { orT } from "@/lib/dict/outcome-records";
import OutcomeRecords from "@/components/OutcomeRecords";
import { tt } from "@/lib/dict/thread";
import { primaryYangs } from "@/components/FigureMark";
import { hasLiuyaoSection, lineHeading, lineLoveWork, liuyaoChart, loveWork, relatedHexagrams, tuanXiang } from "@/lib/gua-liuyao";
import { brandName } from "@/lib/brand";

/** 09-28 (进度表 14): the real reader cases on this hexagram change at runtime — rebuild hourly, not at deploy */
export const revalidate = 3600;

/**
 * One hexagram, one reference page — the organic-traffic base layer.
 * All content is static (pre-generated commentary + received text); the
 * only door out is the cast. 定位：文化解读与自我反思参考。
 */

export function generateStaticParams() {
  return guaLocales().flatMap((locale) => GUA.map((h) => ({ locale, slug: guaSlug(h) })));
}

interface Params { locale: string; slug: string }

function guaAlternates(slug: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of guaLocales()) out[LOCALE_META[l].hreflang] = `/${l}/gua/${slug}`;
  out["x-default"] = `/${DEFAULT_LOCALE}/gua/${slug}`;
  return out;
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const d = guaBySlug(slug, locale);
  if (!d) return {};
  const title = t(locale, "guaMetaTitle", { name: guaName(d.hex, locale), n: d.hex.number });
  // 10-02 进度表 27: in 繁體 the description also says what the page holds, with 卜卦 once
  const description = guaDescription(d.seo.meta, guaName(d.hex, locale), locale);
  return {
    title: `${title} | ${brandName(locale)}`,
    description,
    alternates: { canonical: `/${locale}/gua/${slug}`, languages: guaAlternates(slug) },
    openGraph: { title, description },
  };
}

export default async function GuaPage(
  { params }: { params: Promise<Params> },
) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const d = guaBySlug(slug, l);
  if (!d) notFound();

  const { hex, seo, texts } = d;
  const lower = TRIGRAMS[hex.lower];
  const upper = TRIGRAMS[hex.upper];
  const prev = hex.number > 1 ? GUA[hex.number - 2]! : null;
  const next = hex.number < 64 ? GUA[hex.number]! : null;
  const cjkScript = scriptFor(l) !== "en";
  const local = TRIGRAM_NAMES[l];
  const trig = (tr: typeof lower) => (cjkScript ? forLocale(tr.zh, l) : local?.[tr.key][0] ?? tr.en);
  const nature = (tr: typeof lower) => (cjkScript ? forLocale(tr.natureZh, l) : local?.[tr.key][1] ?? tr.natureEn);

  /** 爻辞 rows: label + received text (script per locale) + commentary. */
  const lineRows = texts.zh.lines.map((_, i) => {
    const lt = lineTextFor(texts, i + 1, l);
    return {
      label: cjkScript ? lt.label : `${i + 1}`,
      original: seo.originals?.[i] ?? lt.main,
      plain: seo.lines[i] ?? "",
    };
  });
  const extraOriginal = seo.extraOriginal ?? (texts.zh.extra
    ? (scriptFor(l) === "hans" ? texts.zh.extra.hans : scriptFor(l) === "hant" ? texts.zh.extra.hant : texts.en.extra ?? "")
    : "");

  // 09-23 (§14 ⑯): one real cast per page, verdict and timing word for word
  const example = caseForHex(hex.number, l);
  // 09-28 (进度表 14): the readers' own published cases that landed on this hexagram (primary or changed)
  let readerCases: ReturnType<typeof listCases> = [];
  try { readerCases = listCases(l, 5, null, { hex: hex.number }); } catch { /* no database at build time: the page stands without them */ }
  // 10-02 进度表 28: readers' reported outcomes on this hexagram — empty (and not queried) while SHOW_OUTCOME_RECORDS is off
  const records = recordsForPage({ locale: l, hex: hex.number, limit: 5 });

  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const jsonLd = [{
    "@context": "https://schema.org",
    "@type": "Article",
    headline: t(l, "guaMetaTitle", { name: guaName(hex, l), n: hex.number }),
    inLanguage: LOCALE_META[l].htmlLang,
    description: seo.meta,
    author: { "@type": "Organization", name: "YaoFlow" },
  }, {
    // 10-16 进度表 64: the page's place in the site (首頁 › 六十四卦 › 這一卦)
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "YaoFlow", item: `${site}/${l}` },
      { "@type": "ListItem", position: 2, name: t(l, "guaBack").replace(/^←\s*/, ""), item: `${site}/${l}/gua` },
      { "@type": "ListItem", position: 3, name: guaName(hex, l), item: `${site}/${l}/gua/${slug}` },
    ],
  }];
  // 10-16 进度表 64: 六爻 reference — 彖传、象传、静卦排盘、错综互、一爻变 (Chinese pages)
  const zhDeep = hasLiuyaoSection(l);
  const z = (s: string) => forLocale(s, l);
  const tx = zhDeep ? tuanXiang(hex.number, l) : null;
  const chart = zhDeep ? liuyaoChart(hex, l) : null;
  const related = zhDeep ? relatedHexagrams(hex) : null;
  const lw = loveWork(hex.number, l);
  const lineLW = lineLoveWork(hex.number, l);

  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <JsonLd data={jsonLd} />

      <nav className="pt-8">
        <Link href={`/${l}/gua`} className="t-label hover:text-[var(--ink)] transition-colors">
          {t(l, "guaBack")}
        </Link>
      </nav>

      {/* ---- masthead: the figure names itself ---- */}
      <header className="mt-[var(--s-5)] pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        <div className="flex items-start gap-[var(--s-5)]">
          <FigureMark yangs={guaYangs(hex)} width={64} className="mt-2 shrink-0" />
          <div className="min-w-0">
            <p className="t-label !text-[var(--gold-text)]">{t(l, "guaNumber", { n: hex.number })}</p>
            <h1 className="t-d1 mt-1">{guaName(hex, l)}</h1>
            <p className="t-body mt-2 text-[var(--ink-66)]">
              {cjkScript ? `${hex.pinyin} · ${hex.en}` : <>{hex.pinyin} · <span lang="zh-Hant">{FULL_ZH_HANT[hex.number] ?? hex.fullZh}</span></>}
            </p>
            <p className="t-small mt-[var(--s-3)] text-[var(--ink-45)]">
              {t(l, "guaTrigrams", { upper: trig(upper), un: nature(upper), lower: trig(lower), ln: nature(lower) })}
            </p>
          </div>
        </div>
      </header>

      {/* ---- 卦辞 ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-3)]">{t(l, "guaJudgment")}</h2>
        <p className="t-d3 leading-relaxed">{seo.judgment ?? judgmentFor(texts, l).main}</p>
        <p className="t-body mt-[var(--s-4)] leading-relaxed text-[var(--ink-66)]">{seo.summary}</p>
      </section>

      {/* ---- 10-16 进度表 64: 彖传、大象 (原文) ---- */}
      {tx && (
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-3)]">{z("彖传 · 象传")}</h2>
          <div className="grid md:grid-cols-[112px_1fr] gap-x-6 gap-y-1">
            <h3 className="t-label !text-[var(--cinnabar)] pt-[3px]">{z("彖曰")}</h3>
            <p className="t-body leading-relaxed">{tx.tuan}</p>
          </div>
          <div className="mt-[var(--s-3)] grid md:grid-cols-[112px_1fr] gap-x-6 gap-y-1">
            <h3 className="t-label !text-[var(--gold-text)] pt-[3px]">{z("象曰")}</h3>
            <p className="t-body leading-relaxed">{tx.daxiang}</p>
          </div>
          <p className="t-small mt-[var(--s-3)] text-[var(--ink-45)]">{z("《周易》十翼原文：彖传解卦辞，大象说卦象与君子之用；各爻的小象附在下面爻辞里。")}</p>
        </section>
      )}

      {/* ---- 六爻 ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-4)]">{t(l, "guaLines")}</h2>
        <div className="flex flex-col">
          {lineRows.map((r, i) => (
            // 10-28 进度表 117 ④: on the Chinese pages each 爻 is its own H2 with an anchor (#yao-1 … #yao-6), and says what it
            // means for 感情 and 工作 in one sentence each — readers search one line at a time (「地山謙 初」)
            <div
              key={i}
              id={lineLW ? `yao-${i + 1}` : undefined}
              className={`py-[var(--s-4)] scroll-mt-20 ${i > 0 ? "border-t border-dotted border-[var(--ink-16)]" : ""}`}
            >
              {lineLW && <h2 className="t-d3 mb-[var(--s-2)]"><a href={`#yao-${i + 1}`} className="hover:text-[var(--cinnabar)] no-underline">{lineHeading(r.label, r.original)}</a></h2>}
              <div className="grid grid-cols-[52px_1fr] gap-x-4">
                <span className="t-label !text-[var(--cinnabar)] pt-[3px]">{r.label}</span>
                <div className="min-w-0">
                  <p className="t-body">{r.original}</p>
                  <p className="t-small mt-[var(--s-2)] text-[var(--ink-66)]">{r.plain}</p>
                  {tx?.xiaoxiang[i] && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{z("象曰：")}{tx.xiaoxiang[i]}</p>}
                  {lineLW?.[i] && (
                    <dl className="mt-[var(--s-3)] grid grid-cols-[3em_1fr] gap-x-2 gap-y-1 t-small">
                      <dt className="!text-[var(--gold-text)]">{z("感情")}</dt><dd className="text-[var(--ink-66)]">{lineLW[i]!.love}</dd>
                      <dt className="!text-[var(--gold-text)]">{z("工作")}</dt><dd className="text-[var(--ink-66)]">{lineLW[i]!.work}</dd>
                    </dl>
                  )}
                </div>
              </div>
            </div>
          ))}
          {texts.zh.extra && seo.extra && (
            <div className="py-[var(--s-4)] border-t border-dotted border-[var(--ink-16)]">
              <div className="grid grid-cols-[52px_1fr] gap-x-4">
                <span className="t-label !text-[var(--gold-text)] pt-[3px]">{texts.zh.extra.label}</span>
                <div className="min-w-0">
                  <p className="t-body">{extraOriginal}</p>
                  <p className="t-small mt-[var(--s-2)] text-[var(--ink-66)]">{seo.extra}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---- 10-16 进度表 64: 静卦排盘 — the same engine that casts ---- */}
      {chart && (
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-3)]">{z("六爻排盘（静卦）")}</h2>
          <p className="t-body leading-relaxed">
            {z(`${guaName(hex, l)}属${chart.palace}，五行属${chart.palacePhase}，是${chart.category}；世爻在第${chart.world}爻（${chart.lines[chart.world - 1]!.ganzhi}${chart.lines[chart.world - 1]!.relation}），应爻在第${chart.response}爻（${chart.lines[chart.response - 1]!.ganzhi}${chart.lines[chart.response - 1]!.relation}）。`)}
          </p>
          <table className="mt-[var(--s-4)] w-full t-small tabular-nums">
            <thead>
              <tr className="text-left text-[var(--ink-45)]">
                <th className="py-1 pr-3 font-normal">{z("爻")}</th><th className="pr-3 font-normal">{z("纳甲")}</th><th className="pr-3 font-normal">{z("五行")}</th><th className="pr-3 font-normal">{z("六亲")}</th><th className="font-normal">{z("世应")}</th>
              </tr>
            </thead>
            <tbody>
              {[...chart.lines].reverse().map((x) => (
                <tr key={x.pos} className="border-t border-dotted border-[var(--ink-16)]">
                  <td className="py-1.5 pr-3">{x.label}</td>
                  <td className="pr-3">{x.ganzhi}</td>
                  <td className="pr-3">{x.phase}</td>
                  <td className="pr-3">{x.relation}</td>
                  <td className={x.mark ? "!text-[var(--cinnabar)]" : ""}>{x.mark ? z(x.mark) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="t-small mt-[var(--s-3)] text-[var(--ink-45)]">{z("这是没有动爻时的盘。真正起卦还要看起卦那天的月建、日辰、旬空和六神，以及哪几爻在动——起一卦，盘会照那天排好。")}</p>
        </section>
      )}

      {/* ---- 问事倾向 ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-4)]">{t(l, "guaThemes")}</h2>
        <div className="flex flex-col gap-[var(--s-4)]">
          {([
            [t(l, "guaThemeCareer"), lw?.work ?? seo.career],
            [t(l, "guaThemeLove"), lw?.love ?? seo.love],
            [t(l, "guaThemeMoney"), seo.money],
          ] as const).map(([h2, body]) => (
            <div key={h2} className="grid md:grid-cols-[112px_1fr] gap-x-6 gap-y-1">
              <h3 className="t-d3">{h2}</h3>
              <p className="t-small leading-relaxed text-[var(--ink-66)]">{body}</p>
            </div>
          ))}
        </div>
        <p className="t-small mt-[var(--s-4)] text-[var(--ink-45)]">{t(l, "guaThemesNote")}</p>
        {/* 10-17 承接: a love / work question not settled yet — moon blocks first (zh pages; shows once the switch is open) */}
        {(l === "zh-hant" || l === "zh") && <FeatureLink name="jiaobei" from="gua" locale={l} href={`/${l}/jiaobei`} text={l === "zh" ? "感情、工作的事还拿不定主意？先擲个筊 →".replace("擲", "掷") : "感情、工作的事還拿不定主意？先擲個筊 →"} className="mt-[var(--s-3)]" />}
      </section>

      {/* ---- 10-14 进度表 48: the next step for a reader who searched their way here ---- */}
      <GuaCta locale={l} hex={hex.number} examples={guaExamples(l, hex.number)} />

      {/* ---- 卦例: a real cast of this hexagram (09-23) ---- */}
      {example && (
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-3)]">{t(l, "guaCaseTitle")}</h2>
          <p className="t-label !normal-case !tracking-[0.04em] text-[var(--ink-45)]">{t(l, "guaCaseCast", { date: caseDay(example, LOCALE_META[l].htmlLang) })}</p>
          <p className="t-d3 mt-[var(--s-2)]">{example.question}</p>
          <div className="mt-[var(--s-4)] grid md:grid-cols-[112px_1fr] gap-x-6 gap-y-1">
            <h3 className="t-label !text-[var(--cinnabar)] pt-[3px]">{t(l, "guaCaseVerdict")}</h3>
            <p className="t-body leading-relaxed">{example.verdict}</p>
          </div>
          <div className="mt-[var(--s-3)] grid md:grid-cols-[112px_1fr] gap-x-6 gap-y-1">
            <h3 className="t-label !text-[var(--gold-text)] pt-[3px]">{t(l, "guaCaseTiming")}</h3>
            <p className="t-small leading-relaxed text-[var(--ink-66)]">{example.timing}</p>
          </div>
          <p className="t-small mt-[var(--s-4)] text-[var(--ink-45)]">{t(l, "guaCaseNote")}</p>
        </section>
      )}

      {/* ---- 09-28: readers' published cases on this hexagram ---- */}
      {readerCases.length > 0 && (
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-3)]">{tt(l, "guaCasesTitle")}</h2>
          <ul className="flex flex-col">
            {readerCases.map((c) => {
              const v = c.values_str.split(",").map(Number) as import("@yaoflow/engine").LineValue[];
              const fields = JSON.parse(c.fields_json) as Record<string, string>;
              return (
                <li key={c.public_id} className="py-3 border-t border-dotted border-[var(--ink-16)] first:border-t-0">
                  <Link href={casePath(l, c.public_id)} className="group flex gap-4 items-start">
                    <FigureMark yangs={primaryYangs(v)} width={22} className="shrink-0 pt-1 opacity-70 group-hover:opacity-100" />
                    <span className="min-w-0">
                      <span className="t-body block group-hover:text-[var(--cinnabar)] transition-colors">{caseQuestion(c, l)}</span>
                      <span className="t-small block mt-1 line-clamp-2 !text-[var(--ink-66)]">{Object.values(fields)[0]}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="t-small mt-[var(--s-3)]"><Link href={`/${l}/cases?hex=${hex.number}`} className="underline underline-offset-4">{t(l, "caseMore")}</Link></p>
        </section>
      )}

      {/* ---- 10-02 (进度表 28): reported outcomes — renders nothing while the switch is off ---- */}
      <OutcomeRecords records={records} l={l} title={orT(l, "titleGua")} />

      {/* ---- 10-16 进度表 64: 错卦、综卦、互卦，与一爻动变成的卦 ---- */}
      {related && (
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-3)]">{z("相关的卦")}</h2>
          <ul className="t-body flex flex-col gap-1">
            {([["错卦", "六爻全变", related.cuo], ["综卦", "上下颠倒", related.zong], ["互卦", "取二至五爻", related.hu]] as const).map(([k, how, g]) => (
              <li key={k}>
                <span className="t-label !text-[var(--gold-text)] mr-3">{z(k)}</span>
                {g.number === hex.number
                  ? <span className="text-[var(--ink-66)]">{z(`${how}后还是本卦`)}</span>
                  : <Link href={`/${l}/gua/${guaSlug(g)}`} className="underline underline-offset-4 hover:text-[var(--cinnabar)] transition-colors">{hexName(g, l)}</Link>}
                {g.number !== hex.number && <span className="t-small ml-2 text-[var(--ink-45)]">{z(how)}</span>}
              </li>
            ))}
          </ul>
          <h3 className="t-label mt-[var(--s-4)] mb-[var(--s-2)]">{z("一爻动，变成哪一卦")}</h3>
          <ul className="t-body flex flex-col gap-1">
            {singleLineChanges(hex).map(({ position, b }) => (
              <li key={position}>
                <span className="text-[var(--ink-66)] mr-2">{chart?.lines[position - 1]?.label}{z("动")} →</span>
                <Link href={`/${l}/gua/${guaSlug(b)}`} className="underline underline-offset-4 hover:text-[var(--cinnabar)] transition-colors">{hexName(b, l)}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- where each moving line leads (the 本卦→之卦 pages; English first) ---- */}
      {l === "en" && (
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-3)]">When a line moves</h2>
          <p className="t-small text-[var(--ink-66)]">A moving line turns into its opposite and {hex.en} becomes another hexagram. One line at a time:</p>
          <ul className="mt-[var(--s-3)] t-body flex flex-col gap-1">
            {singleLineChanges(hex).map(({ position, b }) => (
              <li key={position}>
                <Link href={transitionPath("en", hex, b)} className="underline underline-offset-4 hover:text-[var(--cinnabar)] transition-colors">
                  Line {position} moving → {b.number} {b.en}
                </Link>
              </li>
            ))}
          </ul>
          <p className="t-small mt-[var(--s-3)]">
            <Link href={`/en/gua/${guaSlug(hex)}/to`} className="underline underline-offset-4">All 63 changes from {hex.en} →</Link>
            <span className="mx-3 text-[var(--ink-16)]">·</span>
            <Link href={transitionPath("en", hex, hex)} className="underline underline-offset-4">The still chart</Link>
          </p>
        </section>
      )}

      {/* 11-05 进度表 139 (Neil: 「看看要放在哪个版块」): the same figure read as a person — 繁中 only, while the pages are on */}
      {l === "zh-hant" && featureOn("bmg") && featureOn("bmg-pages") && (
        <p className="t-small mt-[var(--s-6)]">
          <Link href={`/${l}/bmg/gua/${hex.number}?c=gua-page`} data-heat="gua-to-bmg" className="underline underline-offset-4 hover:text-[var(--cinnabar)]">如果這一卦是一個人的本命卦——它是什麼樣的人？ →</Link>
          <span className="!text-[var(--ink-45)]">　</span>
          <Link href={`/${l}/bmg?c=gua-page`} data-heat="gua-to-bmg-quiz" className="underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">你自己是哪一卦？12 題</Link>
        </p>
      )}
      {/* ---- the one door out ---- 11-04: in the foreign languages, the question box itself (components/AskFromPage) */}
      {askFromPageLocale(l) ? <AskFromPage locale={l} from="gua" /> : <section className="ink-block mt-[var(--s-6)] p-[var(--s-5)]">
        <h2 className="t-d3">{t(l, "guaCtaTitle")}</h2>
        <p className="t-small mt-[var(--s-2)] !text-[var(--paper-66)]">{t(l, "guaCtaBody")}</p>
        <Link
          href={`/${l}/cast`}
          className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors"
        >
          {t(l, "guaCtaButton")}
        </Link>
      </section>}

      {/* ---- prev / next ---- */}
      <nav className="flex justify-between gap-6 mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
        {prev ? (
          <Link href={`/${l}/gua/${guaSlug(prev)}`} className="t-label hover:text-[var(--ink)] transition-colors">
            ← {cjkScript ? hexName(prev, l) : `${prev.number} · ${guaName(prev, l)}`}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/${l}/gua/${guaSlug(next)}`} className="t-label text-right hover:text-[var(--ink)] transition-colors">
            {cjkScript ? hexName(next, l) : `${next.number} · ${guaName(next, l)}`} →
          </Link>
        ) : <span />}
      </nav>
    </article>
  );
}
