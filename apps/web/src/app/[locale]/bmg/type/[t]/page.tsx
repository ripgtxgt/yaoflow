import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import FigureMark from "@/components/FigureMark";
import { canSee } from "@/lib/features";
import { brandName } from "@/lib/brand";
import { isLocale, pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { hexesOfType4, isType4, RESULT_COPY } from "@/lib/bmg";

export const dynamic = "force-dynamic";

/**
 * 11-05 进度表 139 (开关 bmg-pages，默认关): 「INFJ 是哪一卦？」 — the four letters fix lines 1–4; lines 5 and 6 (how you
 * push yourself, how you are with people) make it one of four hexagrams. Never 「MBTI 測驗」, never its marks.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; t: string }> }): Promise<Metadata> {
  const { locale, t } = await params;
  const T = t.toUpperCase();
  if (!isLocale(locale) || !isType4(T) || !serviceOpenIn("bmg", locale) || !(await canSee("bmg-pages"))) return {};
  const hs = hexesOfType4(T);
  return {
    title: { absolute: `${T} 是哪一卦？本命卦裡的四種 ${T} — ${brandName(locale)}` },
    description: `${T} 在本命卦裡會是${hs.map((h) => h.name).join("、")}其中之一，差在你怎麼推動自己、怎麼和人相處。`,
    alternates: pageAlternates(locale, `/bmg/type/${t.toLowerCase()}`, serviceLocales("bmg")),
  };
}

export default async function BmgTypePage({ params }: { params: Promise<{ locale: string; t: string }> }) {
  const { locale, t } = await params;
  const T = t.toUpperCase();
  if (!isLocale(locale) || !isType4(T) || !serviceOpenIn("bmg", locale) || !(await canSee("bmg-pages"))) notFound();
  const hs = hexesOfType4(T);
  return (
    <PageShell>
      <p className="t-label !text-[var(--gold-text)]">本命卦</p>
      <h1 className="t-d1 mt-1">{T} 是哪一卦？</h1>
      <p className="t-body mt-[var(--s-3)]">{RESULT_COPY.quickNote} 同樣是 {T}，五爻（怎麼推動自己）和上爻（怎麼和人相處）不同，就是四個不同的卦：</p>
      <ul className="mt-[var(--s-5)] grid gap-[var(--s-4)]">
        {hs.map((h) => (
          <li key={h.kw} className="flex gap-[var(--s-4)] items-start border-t border-[var(--ink-16)] pt-[var(--s-4)]">
            <FigureMark yangs={h.lines.map(Boolean)} width={40} />
            <div>
              <Link href={`/${locale}/bmg/gua/${h.kw}`} className="t-d3 underline underline-offset-4">{h.name}</Link>
              <p className="t-small !text-[var(--cinnabar)]">{h.title} · {h.line5}・{h.line6}</p>
              <p className="t-body mt-1">{h.oneLine}</p>
            </div>
          </li>
        ))}
      </ul>
      <section className="mt-[var(--s-6)] ink-block p-[var(--s-5)]">
        <p className="t-body !text-[var(--paper)]">你是哪一個？選好四個字母，再答兩題就知道。</p>
        <Link href={`/${locale}/bmg?c=bmg-type-${T.toLowerCase()}`} className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3">看看我的本命卦 →</Link>
      </section>
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{RESULT_COPY.footer}</p>
    </PageShell>
  );
}
