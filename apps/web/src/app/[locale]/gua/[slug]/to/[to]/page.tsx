import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { textsFor } from "@yaoflow/engine";
import { isLocale } from "@/lib/i18n";
import { LOCALE_META } from "@/lib/locales";
import { GUA, guaSeoFor, guaSlug, guaYangs } from "@/lib/gua";
import {
  changedYangsOf, changeHeadline, changeSentence, COUNT_WORD, hexBySlug, movingLabel, palaceNote, POS_EN, readingRule, shapeNote,
  singleLineChanges, transition, transitionPath, worldResponseNote, type Transition,
} from "@/lib/transitions";
import { RELATION_EN } from "@/lib/labels";
import FigureMark from "@/components/FigureMark";

/**
 * 本卦 → 之卦: one page per ordered pair of hexagrams (4,096), English first.
 * The lines that differ are the moving lines, so each page is a cast the
 * reader may have thrown: the moving lines' texts, what each becomes in the
 * Liu Yao chart, the classical rule for how many lines move, and the
 * date-free structure beneath. The still charts and the six single-line
 * changes of every hexagram are pre-rendered; the rest render on first
 * request and stay cached.
 */

export const dynamicParams = true;

export function generateStaticParams() {
  const out: { locale: string; slug: string; to: string }[] = [];
  for (const a of GUA) {
    out.push({ locale: "en", slug: guaSlug(a), to: guaSlug(a) });
    for (const { b } of singleLineChanges(a)) out.push({ locale: "en", slug: guaSlug(a), to: guaSlug(b) });
  }
  return out;
}

interface Params { locale: string; slug: string; to: string }

function resolve(p: Params): Transition | null {
  if (p.locale !== "en") return null;
  const a = hexBySlug(p.slug);
  const b = hexBySlug(p.to);
  if (!a || !b) return null;
  return transition(a.number, b.number);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const t = resolve(p);
  if (!t) return {};
  const still = t.a.number === t.b.number;
  const title = still
    ? `Hexagram ${t.a.number} ${t.a.en} with no line moving`
    : `Hexagram ${t.a.number} → ${t.b.number}: ${t.a.en} changing to ${t.b.en} (${movingLabel(t)} moving)`;
  const description = still
    ? `${t.a.en} (hexagram ${t.a.number}) as a still chart: the Judgment is the answer, plus the Self and Other lines, palace and six-relation structure that a Liu Yao reading starts from.`
    : `${t.a.en} (hexagram ${t.a.number}) with ${movingLabel(t)} moving becomes ${t.b.en} (${t.b.number}). The moving line${t.moving.length > 1 ? "s'" : "'s"} text, what each line turns into in the Liu Yao chart, and the rule for reading a ${COUNT_WORD[t.moving.length]}-line change.`;
  const path = transitionPath("en", t.a, t.b);
  return {
    title: `${title} | YaoFlow`,
    description,
    alternates: { canonical: path, languages: { en: path, "x-default": path } },
    openGraph: { title, description },
  };
}

const PH_CLASS = "t-label !text-[var(--ink-45)]";

export default async function TransitionPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  if (!isLocale(p.locale)) notFound();
  const t = resolve(p);
  if (!t) notFound();
  const { a, b } = t;
  const still = a.number === b.number;
  const ta = textsFor(a.number);
  const seoA = guaSeoFor(a.number, "en");
  const rule = readingRule(t);
  const yangsA = guaYangs(a);
  const yangsB = changedYangsOf(t);
  const marks = t.lines.map((l) => l.changing);
  const shapeA = shapeNote(t.shape.primary, a.en);
  const shapeB = !still ? shapeNote(t.shape.changed, b.en) : null;
  const singles = singleLineChanges(a);
  const title = still ? `${a.en}, no line moving` : `${a.en} changing to ${b.en}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: still ? `Hexagram ${a.number} ${a.en} with no line moving` : `Hexagram ${a.number} → ${b.number}: ${a.en} changing to ${b.en}`,
    inLanguage: LOCALE_META.en.htmlLang,
    author: { "@type": "Organization", name: "YaoFlow" },
  };

  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <JsonLd data={jsonLd} />

      <nav className="pt-8 flex flex-wrap gap-x-6 gap-y-2">
        <Link href={`/en/gua/${guaSlug(a)}`} className="t-label hover:text-[var(--ink)] transition-colors">← Hexagram {a.number} · {a.en}</Link>
        <Link href={`/en/gua/${guaSlug(a)}/to`} className="t-label hover:text-[var(--ink)] transition-colors">All changes from {a.en}</Link>
      </nav>

      {/* ---- masthead: two figures, the moving lines in cinnabar ---- */}
      <header className="mt-[var(--s-5)] pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        <div className="flex items-start gap-[var(--s-5)]">
          <div className="flex items-center gap-4 shrink-0 mt-2">
            <FigureMark yangs={yangsA} width={56} marks={marks} />
            {!still && <span className="t-label !text-[var(--ink-45)]">→</span>}
            {!still && <FigureMark yangs={yangsB} width={56} className="opacity-60" />}
          </div>
          <div className="min-w-0">
            <p className="t-label !text-[var(--gold-text)]">
              {still ? `Hexagram ${a.number} · ${a.pinyin}` : `Hexagram ${a.number} → ${b.number} · ${a.pinyin} → ${b.pinyin}`}
            </p>
            <h1 className="t-d1 mt-1">{title}</h1>
            <p className="t-body mt-2 text-[var(--ink-66)]">
              {still
                ? `Six still lines — the cast ${t.code}. Nothing turns into anything else; the figure is read as it stands.`
                : `${movingLabel(t).replace(/^./, (c) => c.toUpperCase())} moving — the cast ${t.code}. Where ${a.en} has ${t.moving.length === 1 ? "an old line" : "old lines"}, ${b.en} has the opposite; everything else stays.`}
            </p>
          </div>
        </div>
      </header>

      {/* ---- what moves ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-4)]">{still ? "What stands" : "What moves"}</h2>
        {still ? (
          <div>
            <p className="t-d3 leading-relaxed">{ta.en.judgment}</p>
            <p lang="zh-Hant" className="t-small mt-2 text-[var(--ink-45)]">{ta.zh.judgmentHant}</p>
            {seoA && <p className="t-body mt-[var(--s-4)] leading-relaxed text-[var(--ink-66)]">{seoA.summary}</p>}
          </div>
        ) : (
          <div className="flex flex-col">
            {t.changes.map((c, i) => (
              <div key={c.position} className={`py-[var(--s-4)] ${i > 0 ? "border-t border-dotted border-[var(--ink-16)]" : ""}`}>
                <div className="grid grid-cols-[52px_1fr] gap-x-4">
                  <span className="t-label !text-[var(--cinnabar)] pt-[3px]">{POS_EN[c.position - 1].replace("Line ", "L")}</span>
                  <div className="min-w-0">
                    <p className={PH_CLASS}>{changeHeadline(c)}</p>
                    <p className="t-body mt-2">{ta.en.lines[c.position - 1]}</p>
                    <p lang="zh-Hant" className="t-small mt-1 text-[var(--ink-45)]">{ta.zh.lines[c.position - 1]!.label} · {ta.zh.lines[c.position - 1]!.hant}</p>
                    {seoA?.lines[c.position - 1] && <p className="t-small mt-[var(--s-2)] text-[var(--ink-66)]">{seoA.lines[c.position - 1]}</p>}
                    <p className="t-small mt-[var(--s-2)]">{changeSentence(c)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- the rule for this many moving lines ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-3)]">How to read this change</h2>
        <p className="t-body leading-relaxed">{rule.rule}</p>
        <p className="t-small mt-2 text-[var(--ink-45)]">The rule of Zhu Xi's <i>Yixue Qimeng</i> (1186), by how many lines move.</p>
        <div className="mt-[var(--s-4)] flex flex-col gap-[var(--s-3)]">
          {rule.weigh.map((w) => (
            <div key={w.label} className="grid md:grid-cols-[160px_1fr] gap-x-6 gap-y-1">
              <p className="t-label !text-[var(--gold-text)] pt-[3px]">{w.label}{w.note ? ` · ${w.note}` : ""}</p>
              <p className="t-body leading-relaxed">{w.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- the date-free structure ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-3)]">The chart beneath</h2>
        <p className="t-body leading-relaxed text-[var(--ink-66)]">{palaceNote(t)}</p>
        <p className="t-body mt-2 leading-relaxed text-[var(--ink-66)]">{worldResponseNote(t)}</p>
        {shapeA && <p className="t-body mt-2 leading-relaxed text-[var(--ink-66)]">{shapeA}</p>}
        {shapeB && <p className="t-body mt-2 leading-relaxed text-[var(--ink-66)]">{shapeB}</p>}
        <div className="mt-[var(--s-4)] overflow-x-auto">
          <table className="w-full text-left t-small">
            <thead>
              <tr className="t-label !text-[var(--ink-45)]">
                <th className="py-2 pr-4 font-normal">Line</th>
                <th className="py-2 pr-4 font-normal">Relation</th>
                <th className="py-2 pr-4 font-normal">Branch</th>
                <th className="py-2 pr-4 font-normal">Mark</th>
                {!still && <th className="py-2 font-normal">Becomes</th>}
              </tr>
            </thead>
            <tbody>
              {t.lines.slice().reverse().map((l) => {
                const c = t.changes.find((x) => x.position === l.position);
                return (
                  <tr key={l.position} className={`border-t border-dotted border-[var(--ink-16)]${l.changing ? " text-[var(--ink)]" : ""}`}>
                    <td className="py-2 pr-4 whitespace-nowrap">{POS_EN[l.position - 1]} · {l.yang ? "yang" : "yin"}{l.changing ? <span className="text-[var(--cinnabar)]"> · moving</span> : ""}</td>
                    <td className="py-2 pr-4">{RELATION_EN[l.relation]}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{l.branch} {l.phase}</td>
                    <td className="py-2 pr-4">{l.isWorld ? "Self 世" : l.isResponse ? "Other 应" : ""}</td>
                    {!still && <td className="py-2">{c ? `${RELATION_EN[c.to.relation]} · ${c.to.branch} ${c.to.phase}` : ""}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- what a page cannot know: the day ---- */}
      <section className="ink-block mt-[var(--s-6)] p-[var(--s-5)]">
        <h2 className="t-d3">What this page cannot tell you</h2>
        <p className="t-small mt-[var(--s-2)] !text-[var(--paper-66)]">
          Which lines are void this ten-day cycle, which are broken by the month, and how strong each phase runs in the season — all of that depends on the day you cast, and it is what turns a figure into an answer about one question. A real cast has a date.
        </p>
        <Link href="/en/cast" className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors">
          Cast for your own question →
        </Link>
      </section>

      {/* ---- related ---- */}
      <section className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
        <h2 className="t-sect mb-[var(--s-3)]">Related</h2>
        <ul className="t-body flex flex-col gap-1">
          <li><Link href={`/en/gua/${guaSlug(a)}`} className="underline underline-offset-4">Hexagram {a.number} · {a.en} — meaning and lines</Link></li>
          {!still && <li><Link href={`/en/gua/${guaSlug(b)}`} className="underline underline-offset-4">Hexagram {b.number} · {b.en} — meaning and lines</Link></li>}
          {!still && <li><Link href={transitionPath("en", b, a)} className="underline underline-offset-4">The way back: {b.en} changing to {a.en}</Link></li>}
          {!still && <li><Link href={transitionPath("en", a, a)} className="underline underline-offset-4">{a.en} with no line moving</Link></li>}
        </ul>
        <p className="t-label mt-[var(--s-4)] mb-2">One line of {a.en} moving</p>
        <ul className="t-small flex flex-wrap gap-x-5 gap-y-1">
          {singles.map(({ position, b: tb }) => (
            <li key={position}>
              <Link href={transitionPath("en", a, tb)} className={`underline underline-offset-4${tb.number === b.number ? " text-[var(--cinnabar)]" : ""}`}>
                line {position} → {tb.number} {tb.en}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
