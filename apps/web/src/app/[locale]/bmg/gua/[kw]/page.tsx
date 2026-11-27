import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import FigureMark from "@/components/FigureMark";
import { canSee } from "@/lib/features";
import { brandName } from "@/lib/brand";
import { isLocale, pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { dimLines, hexByKw, RESULT_COPY, stressChain } from "@/lib/bmg";

export const dynamic = "force-dynamic";

/**
 * 11-05 进度表 139 (开关 bmg-pages，默认关；文案待推广补写): one page per hexagram as a 本命卦 —「〇〇卦人格」. Built from the
 * same 64 entries the result page uses (推广 T-015), so nothing here says more than a result would.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; kw: string }> }): Promise<Metadata> {
  const { locale, kw } = await params;
  const h = isLocale(locale) ? hexByKw(Number(kw)) : null;
  if (!h || !serviceOpenIn("bmg", locale as "zh-hant") || !(await canSee("bmg-pages"))) return {};
  return {
    title: { absolute: `${h.name}人格：${h.title}｜本命卦 — ${brandName(locale as "zh-hant")}` }, description: `${h.oneLine}${h.strength}`,
    alternates: pageAlternates(locale as "zh-hant", `/bmg/gua/${h.kw}`, serviceLocales("bmg")),
  };
}

export default async function BmgGuaPage({ params }: { params: Promise<{ locale: string; kw: string }> }) {
  const { locale, kw } = await params;
  if (!isLocale(locale) || !serviceOpenIn("bmg", locale) || !(await canSee("bmg-pages"))) notFound();
  const h = hexByKw(Number(kw));
  if (!h) notFound();
  const dims = dimLines(h.lines);
  const [, pressure] = stressChain(h.lines);
  return (
    <PageShell>
      <p className="t-label !text-[var(--gold-text)]">本命卦 · 第 {h.kw} 卦</p>
      <div className="mt-[var(--s-4)] flex items-center gap-[var(--s-5)]">
        <FigureMark yangs={h.lines.map(Boolean)} width={72} />
        <div><h1 className="t-d1">{h.name}人格</h1><p className="t-d3 mt-1 !text-[var(--cinnabar)]">{h.title}</p></div>
      </div>
      <p className="t-body mt-[var(--s-4)]">{h.oneLine}</p>
      <section className="mt-[var(--s-6)]"><h2 className="t-sect">六個爻，六件事</h2>
        <ul className="mt-[var(--s-3)] grid gap-3">{dims.slice().reverse().map((d) => <li key={d.line} className="t-body"><span className="t-label !text-[var(--ink-45)] block">{d.label}</span><b>{d.name}</b>：{d.text}</li>)}</ul>
      </section>
      <section className="mt-[var(--s-6)]"><h2 className="t-sect">長處</h2><p className="t-body mt-2">{h.strength}</p></section>
      <section className="mt-[var(--s-6)]"><h2 className="t-sect">容易卡住的地方</h2><p className="t-body mt-2">{h.stuck}</p></section>
      <section className="mt-[var(--s-6)]"><h2 className="t-sect">壓力大的時候</h2><p className="t-body mt-2">容易變成<Link href={`/${locale}/bmg/gua/${pressure.kw}`} className="underline underline-offset-4">{pressure.name}</Link>：{pressure.oneLine}</p></section>
      <section className="mt-[var(--s-6)]"><h2 className="t-sect">{RESULT_COPY.tryTitle}</h2><p className="t-body mt-2">{h.tryThis}</p></section>
      <section className="mt-[var(--s-6)] ink-block p-[var(--s-5)]">
        <p className="t-body !text-[var(--paper)]">你是不是{h.name}？12 題，約 2 分鐘，不用生辰。</p>
        <Link href={`/${locale}/bmg?c=bmg-gua-${h.kw}`} className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3">看看我的本命卦 →</Link>
      </section>
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{RESULT_COPY.footer}</p>
    </PageShell>
  );
}
