import RefundedNote from "@/components/RefundedNote";
import { sessionRefunded } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCheckoutSession, type CheckoutSession } from "@/lib/stripe";
import { canSee } from "@/lib/features";
import AutoRefresh from "@/components/AutoRefresh";
import ResultPage from "@/components/product/ResultPage";
import CrossCards from "@/components/CrossCards";
import type { Locale } from "@/lib/locales";
import ReaskForm from "@/components/mingli/BaziReask";
import { toHans } from "@/lib/hant";
import {
  HEPAN_TOKEN_RE, HP_CHAPTERS, HP_UI, chipOf, ensureHepanReport, fulfilHepanPayment, hepanReport, hpBodyOf, hpFactsOf, hpGroupOf, mailHepanOnce, palaceWord,
  type CoreF, type HepanBody, type HepanFacts,
} from "@/lib/mingli/hepan/report";
import type { ReactNode } from "react";
import type { FactF } from "@/lib/mingli/hepan/facts";
import { isForeign, type Foreign } from "@/lib/l10n/core";
import { hepanT } from "@/lib/mingli/hepan/page-ui";
import { hepanNames } from "@/lib/mingli/hepan/names-data";
import { hpNameOf, type HpName } from "@/lib/mingli/hepan/names";
import { chipIn, coreRowsIn, yearChipsIn, type HpT } from "@/lib/mingli/hepan/text-in";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ④: the title in the report's language
  return { title: isForeign(locale) ? hepanT(locale).metaReport : locale === "zh" ? toHans("你們的合盤報告") : "你們的合盤報告", robots: { index: false, follow: false } };
}

/**
 * 10-20 合盤報告 — the report's own page (token URL; no birth data on it — only the pair's computed facts), as
 * /xingpan/r/<token>: ten chapters, the facts each rests on shown above its text as chips. Visible once paid (or made
 * for a tester); an unpaid one follows the hepan switch; refunded → RefundedNote. The owner can ask again in chapter 10.
 */
export default async function HepanReportPage({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { locale, token } = await params;
  if (!HEPAN_TOKEN_RE.test(token)) notFound();
  let r = hepanReport(token);
  if (!r || r.locale !== locale) notFound();
  if (!r.paid_at && !(await canSee("hepan"))) notFound();
  const hans = locale === "zh";
  const w = (s: string) => (hans ? toHans(s).replace(/国历/g, "公历") : s);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

  const { paid } = await searchParams;
  if (!r.paid_at && paid && /^cs_[A-Za-z0-9_]{10,200}$/.test(paid)) {
    try {
      const s = await getCheckoutSession(paid);
      if (s.metadata?.hepan === token) fulfilHepanPayment(s as CheckoutSession);
    } catch { /* the sweep will catch it */ }
    r = hepanReport(token) ?? r;
  }
  if (r.paid_at && sessionRefunded(r.paid_session)) return <RefundedNote hans={hans} locale={locale} home={`/${locale}`} />;
  if (r.paid_at && r.status !== "done" && r.status !== "incomplete") {
    await Promise.race([ensureHepanReport(token).catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 2500))]);
    r = hepanReport(token) ?? r;
  }
  const body: HepanBody = hpBodyOf(r);
  const finished = r.status === "done" || r.status === "incomplete";
  if (finished) void mailHepanOnce(token, site).catch(() => null);
  const f = hpFactsOf(r);
  // 10-30 进度表 128 ④: a report written for a page in another language has that language's words and names
  if (isForeign(locale)) return <ForeignReport l={locale} token={token} paid={!!r.paid_at} question={r.question ?? null} f={f} parts={body.parts} finished={finished} />;
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{w(finished ? HP_UI.failedChapter : HP_UI.writingChapter)}</p>;

  // 10-22 进度表 87 (设计稿第 5 節): the pair report on the result template; 进度表 86 承接地圖: 六爻 next, then 擇日
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<Link href={`/${locale}/hepan`} className="hover:text-[var(--ink)] transition-colors">← {w(HP_UI.back)}</Link>}
      head={{ label: w(HP_UI.kindLabel), question: w(`你 × TA`), meta: w(HP_UI.kindSub) }}
      answer={<CoreTable f={f} w={w} />}
      pay={!r.paid_at ? (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
          <h2 className="t-sect mb-[var(--s-2)]">{w(HP_UI.unpaidHead)}</h2>
          <p className="t-body">{w(HP_UI.unpaidBody)}</p>
        </section>
      ) : undefined}
      free={<>
        {r.paid_at && !finished && (
          <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-4)]">
            <p className="t-body">{w(HP_UI.writingAll)}</p>
            <AutoRefresh every={6000} max={40} />
          </section>
        )}
        {r.paid_at && <Chapters f={f} parts={body.parts} w={w} pending={pending} locale={locale} question={r.question ?? null} token={token} />}
      </>}
      cross={<CrossCards source="hepan" locale={locale as Locale} exclude={["hepan"]} />}
    />
  );
}

type W = (s: string) => string;
function Chip({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "gold" }) {
  return <span className={`t-small inline-block rounded-[2px] border px-2 py-[1px] ${tone === "gold" ? "border-[var(--gold)] !text-[var(--gold-text)]" : "border-[var(--ink-16)] !text-[var(--ink-66)]"}`}>{children}</span>;
}
function Chapter({ n, id, title, children }: { n: number; id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-[var(--s-7,3rem)] scroll-mt-20">
      <p className="t-label !text-[var(--ink-45)]">{String(n).padStart(2, "0")}</p>
      <h2 className="t-sect mt-1">{title}</h2>
      {children}
    </section>
  );
}
const Text = ({ v }: { v: unknown }) => <p className="t-body mt-[var(--s-3)] leading-relaxed whitespace-pre-line">{String(v ?? "")}</p>;

/** the two people side by side: 生肖・日柱, 日主・強弱, 喜用, 紫微命宮, 太陽・月亮・上升, 金星・火星 */
function CoreTable({ f, w }: { f: HepanFacts; w: W }) {
  const moon = (c: CoreF) => (c.astro.moon ? `${c.astro.moon}` : c.astro.moonSplit ? `${c.astro.moonSplit[0]}／${c.astro.moonSplit[1]}` : "—");
  const rows: [string, (c: CoreF) => string][] = [
    [HP_UI.rowZodiac, (c) => `屬${c.zodiac}・${c.dayPillar}`],
    [HP_UI.rowDm, (c) => `${c.dayMaster}${c.dmEl}・${c.strength}`],
    [HP_UI.rowFavour, (c) => (c.favour.length ? c.favour.join("、") : "—")],
    [HP_UI.rowZiwei, (c) => (c.ziwei ? `${c.ziwei.soul.stars.join("、") || "—"}${c.ziwei.soul.borrowed ? "（借對宮）" : ""}` : "—")],
    [HP_UI.rowAstro, (c) => `${c.astro.sun}・${moon(c)}・${c.astro.asc ?? "—"}`],
    [HP_UI.rowVenus, (c) => `${c.astro.venus}・${c.astro.mars}`],
  ];
  return (
    <table className="mt-[var(--s-4)] w-full t-small" aria-label={w(HP_UI.coreHead)}>
      <thead><tr className="!text-[var(--ink-45)]"><th className="text-left font-normal py-1 w-[34%]" /><th className="text-left font-normal">{w(HP_UI.me)}</th><th className="text-left font-normal">{HP_UI.ta}</th></tr></thead>
      <tbody>
        {rows.map(([label, get]) => (
          <tr key={label} className="border-t border-[var(--ink-16)]">
            <td className="py-1.5 !text-[var(--ink-45)]">{w(label)}</td><td>{w(get(f.a))}</td><td>{w(get(f.b))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Chapters({ f, parts, w, pending, locale, question, token }: {
  f: HepanFacts; parts: HepanBody["parts"]; w: W; pending: () => ReactNode; locale: string; question: string | null; token: string;
}) {
  const byId = new Map(f.facts.map((x) => [x.id, x]));
  const qa = parts.qa as { answer?: string } | undefined;
  const prevAsked = ((parts.qaPrev as { list?: { question: string; answer: string }[] } | undefined)?.list ?? []);
  const y = f.year;
  const yearChips: string[] = y ? [
    ...y.bazi.a.map((x) => `你・${x}`), ...y.bazi.b.map((x) => `TA・${x}`),
    ...(y.ziwei ? [...y.ziwei.a.mut.filter((m) => ["命宮", "夫妻"].includes(m.palace)).map((m) => `你・今年化${m.m}（${m.star}）在${palaceWord(m.palace)}`), ...y.ziwei.b.mut.filter((m) => ["命宮", "夫妻"].includes(m.palace)).map((m) => `TA・今年化${m.m}（${m.star}）在${palaceWord(m.palace)}`)] : []),
    ...y.transits.map((t) => `${t.who}・${t.planet}${t.aspect}${t.point}・${t.exact.length ? t.exact.map((d) => `國曆 ${d}`).join("、") : `國曆 ${t.from}–${t.to}`}`),
  ] : [];
  return (
    <>
      {HP_CHAPTERS.map((ch, i) => {
        if (ch.key === "qa") return null;
        const p = parts[hpGroupOf(ch.key)] as Record<string, unknown> | undefined;
        const theme = ch.theme ? f.themes.find((t) => t.key === ch.theme) : undefined;
        const chips = theme ? theme.facts.map((id) => byId.get(id)).filter((x) => !!x).map((x) => ({ text: chipOf(x!), tone: x!.tone })) : [];
        return (
          <Chapter key={ch.key} n={i + 1} id={ch.key} title={w(ch.title)}>
            {chips.length > 0 && (
              <details className="mt-[var(--s-3)]" open={chips.length <= 6}>
                <summary className="cursor-pointer t-small !text-[var(--ink-45)]">{w(HP_UI.basis)}</summary>
                <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">{chips.map((c, k) => <Chip key={k} tone={c.tone === "順" ? "gold" : "ink"}>{w(c.text)}</Chip>)}</p>
              </details>
            )}
            {ch.key === "liunian" && (
              <>
                <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{w(`${y ? `${y.gz}年 · ` : ""}${HP_UI.yearNote}`)}</p>
                {yearChips.length > 0 && <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">{yearChips.map((c, k) => <Chip key={k}>{w(c)}</Chip>)}</p>}
              </>
            )}
            {!p ? pending() : ch.key === "jianyi" ? (
              <ol className="mt-[var(--s-3)] space-y-3">
                {((p.jianyi as string[] | undefined) ?? []).map((x, k) => (
                  <li key={k} className="flex gap-3"><span className="t-label !text-[var(--gold-text)] shrink-0 mt-[0.2em]">{k + 1}</span><p className="t-body leading-relaxed">{x}</p></li>
                ))}
              </ol>
            ) : <Text v={p[ch.key]} />}
          </Chapter>
        );
      })}
      <Chapter n={HP_CHAPTERS.length} id="question" title={w("答你的問題")}>
        {question && (
          <blockquote className="mt-[var(--s-3)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-3)]">
            <p className="t-small !text-[var(--gold-text)]">{w(HP_UI.questionYou)}</p>
            <p className="t-body mt-1">{question}</p>
          </blockquote>
        )}
        {!question ? null : qa?.answer ? (
          <>
            <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{qa.answer}</p>
            <Link href={`/${locale}/cast?q=${encodeURIComponent([...question].slice(0, 100).join(""))}&c=hepan`} className="inline-block mt-[var(--s-4)] t-body border border-[var(--ink)] rounded-full px-5 py-2.5 hover:bg-[var(--ink)] hover:!text-[var(--paper)] transition-colors">{w(HP_UI.questionCast)}</Link>
          </>
        ) : pending()}
        {prevAsked.length > 0 && (
          <details className="mt-[var(--s-4)]">
            <summary className="cursor-pointer t-small !text-[var(--ink-66)]">{w(HP_UI.prevAsked)}</summary>
            {prevAsked.map((x, k) => (
              <div key={k} className="mt-[var(--s-3)] border-t border-[var(--ink-16)] pt-[var(--s-3)]">
                <p className="t-small !text-[var(--gold-text)]">{x.question}</p>
                <p className="t-body mt-1 leading-relaxed whitespace-pre-line">{x.answer}</p>
              </div>
            ))}
          </details>
        )}
        <ReaskForm token={token} hans={locale === "zh"} endpoint="/api/hepan/ask" copy={{ head: w(HP_UI.reaskHead), ph: w(HP_UI.reaskPh) }} />
      </Chapter>
    </>
  );
}

/* ------------------------------------------------------------------ 10-30 进度表 128 ④: the other languages */

const fillT = (t: string | undefined, v: Record<string, string>) => (t ?? "").replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

/** the same page for a report written in another language: the page's words (hepanT), the names (hpNameOf), the facts in them (text-in.ts) */
function ForeignReport({ l, token, paid, question, f, parts, finished }: {
  l: Foreign; token: string; paid: boolean; question: string | null; f: HepanFacts; parts: HepanBody["parts"]; finished: boolean;
}) {
  const T = hepanT(l), H = hpNameOf(hepanNames(l));
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{finished ? T.failedChapter : T.writingChapter}</p>;
  return (
    <ResultPage
      locale={l}
      nav={<Link href={`/${l}/hepan`} className="hover:text-[var(--ink)] transition-colors">← {T.back}</Link>}
      head={{ label: T.kindLabel ?? "", question: T.pairHead ?? "", meta: T.kindSub }}
      answer={<CoreTableIn f={f} T={T} H={H} />}
      pay={!paid ? (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
          <h2 className="t-sect mb-[var(--s-2)]">{T.unpaidHead}</h2>
          <p className="t-body">{T.unpaidBody}</p>
        </section>
      ) : undefined}
      free={<>
        {paid && !finished && (
          <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-4)]">
            <p className="t-body">{T.writingAll}</p>
            <AutoRefresh every={6000} max={40} />
          </section>
        )}
        {paid && <ChaptersIn f={f} parts={parts} T={T} H={H} pending={pending} locale={l} question={question} token={token} />}
      </>}
      cross={<CrossCards source="hepan" locale={l} exclude={["hepan"]} />}
    />
  );
}

function CoreTableIn({ f, T, H }: { f: HepanFacts; T: HpT; H: HpName }) {
  return (
    <table className="mt-[var(--s-4)] w-full t-small" aria-label={T.coreHead}>
      <thead><tr className="!text-[var(--ink-45)]"><th className="text-left font-normal py-1 w-[34%]" /><th className="text-left font-normal">{T.you}</th><th className="text-left font-normal">{T.taName}</th></tr></thead>
      <tbody>
        {coreRowsIn(T, H).map(([label, get]) => (
          <tr key={label} className="border-t border-[var(--ink-16)] align-top">
            <td className="py-1.5 pr-2 !text-[var(--ink-45)]">{label}</td><td className="py-1.5 pr-2">{get(f.a)}</td><td className="py-1.5">{get(f.b)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChaptersIn({ f, parts, T, H, pending, locale, question, token }: {
  f: HepanFacts; parts: HepanBody["parts"]; T: HpT; H: HpName; pending: () => ReactNode; locale: Foreign; question: string | null; token: string;
}) {
  const byId = new Map(f.facts.map((x) => [x.id, x]));
  const qa = parts.qa as { answer?: string } | undefined;
  const prevAsked = ((parts.qaPrev as { list?: { question: string; answer: string }[] } | undefined)?.list ?? []);
  const y = f.year;
  const yearChips = y ? yearChipsIn(y, T, H, locale) : [];
  return (
    <>
      {HP_CHAPTERS.map((ch, i) => {
        if (ch.key === "qa") return null;
        const p = parts[hpGroupOf(ch.key)] as Record<string, unknown> | undefined;
        const theme = ch.theme ? f.themes.find((t) => t.key === ch.theme) : undefined;
        const chips = theme ? theme.facts.map((id) => byId.get(id)).filter((x): x is FactF => !!x).map((x) => ({ text: chipIn(f, x, T, H, 160), tone: x.tone })) : [];
        return (
          <Chapter key={ch.key} n={i + 1} id={ch.key} title={T[`ch_${ch.key}`] ?? ch.title}>
            {chips.length > 0 && (
              <details className="mt-[var(--s-3)]" open={chips.length <= 6}>
                <summary className="cursor-pointer t-small !text-[var(--ink-45)]">{T.basis}</summary>
                <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">{chips.map((c, k) => <Chip key={k} tone={c.tone === "順" ? "gold" : "ink"}>{c.text}</Chip>)}</p>
              </details>
            )}
            {ch.key === "liunian" && (
              <>
                <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{`${y ? `${fillT(T.y_year, { gz: H.B.gz(y.gz) })} · ` : ""}${T.yearNoteF}`}</p>
                {yearChips.length > 0 && <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">{yearChips.map((c, k) => <Chip key={k}>{c}</Chip>)}</p>}
              </>
            )}
            {!p ? pending() : ch.key === "jianyi" ? (
              <ol className="mt-[var(--s-3)] space-y-3">
                {((p.jianyi as string[] | undefined) ?? []).map((x, k) => (
                  <li key={k} className="flex gap-3"><span className="t-label !text-[var(--gold-text)] shrink-0 mt-[0.2em]">{k + 1}</span><p className="t-body leading-relaxed">{x}</p></li>
                ))}
              </ol>
            ) : <Text v={p[ch.key]} />}
          </Chapter>
        );
      })}
      <Chapter n={HP_CHAPTERS.length} id="question" title={T.qaTitle ?? ""}>
        {question && (
          <blockquote className="mt-[var(--s-3)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-3)]">
            <p className="t-small !text-[var(--gold-text)]">{T.questionYou}</p>
            <p className="t-body mt-1">{question}</p>
          </blockquote>
        )}
        {!question ? null : qa?.answer ? (
          <>
            <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{qa.answer}</p>
            <Link href={`/${locale}/cast?q=${encodeURIComponent([...question].slice(0, 100).join(""))}&c=hepan`} className="inline-block mt-[var(--s-4)] t-body border border-[var(--ink)] rounded-full px-5 py-2.5 hover:bg-[var(--ink)] hover:!text-[var(--paper)] transition-colors">{T.questionCast}</Link>
          </>
        ) : pending()}
        {prevAsked.length > 0 && (
          <details className="mt-[var(--s-4)]">
            <summary className="cursor-pointer t-small !text-[var(--ink-66)]">{T.prevAsked}</summary>
            {prevAsked.map((x, k) => (
              <div key={k} className="mt-[var(--s-3)] border-t border-[var(--ink-16)] pt-[var(--s-3)]">
                <p className="t-small !text-[var(--gold-text)]">{x.question}</p>
                <p className="t-body mt-1 leading-relaxed whitespace-pre-line">{x.answer}</p>
              </div>
            ))}
          </details>
        )}
        <ReaskForm token={token} hans={false} endpoint="/api/hepan/ask"
          copy={{ head: T.reaskHead ?? "", ph: T.reaskPh ?? "", go: T.reaskGo, going: T.reaskGoing, err: T.reaskErr, login: T.reaskLogin }} />
      </Chapter>
    </>
  );
}
