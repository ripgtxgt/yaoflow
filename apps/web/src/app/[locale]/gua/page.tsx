import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { LOCALE_META, DEFAULT_LOCALE } from "@/lib/locales";
import { GUA, guaLocales, guaName, guaSlug, guaYangs } from "@/lib/gua";
import FigureMark from "@/components/FigureMark";
import { referenceFor } from "@/lib/reference";
import { brandName } from "@/lib/brand";

/** The 64-hexagram index — the hub the reference pages hang off. */

export function generateStaticParams() {
  return guaLocales().map((locale) => ({ locale }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const languages: Record<string, string> = {};
  for (const l of guaLocales()) languages[LOCALE_META[l].hreflang] = `/${l}/gua`;
  languages["x-default"] = `/${DEFAULT_LOCALE}/gua`;
  return {
    title: `${t(locale, "guaIndexMetaTitle")} | ${brandName(locale)}`,
    description: t(locale, "guaIndexMetaDesc"),
    alternates: { canonical: `/${locale}/gua`, languages },
    openGraph: { title: t(locale, "guaIndexMetaTitle"), description: t(locale, "guaIndexMetaDesc") },
  };
}

export default async function GuaIndex(
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale) || !guaLocales().includes(locale)) notFound();
  const l = locale as Locale;
  // Wilhelm-lineage names run to four words ("Le Pouvoir d'apprivoisement du petit"); CJK names are two to four characters
  const cjk = LOCALE_META[l].cjk;

  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <header className="pt-10 md:pt-14 pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        <h1 className="t-d1">{t(l, "guaIndexTitle")}</h1>
        <p className="t-body mt-4 max-w-[52ch] text-[var(--ink-66)]">{t(l, "guaIndexIntro")}</p>
        {/* 09-28 (进度表 12): the three reference pages */}
        <p className="t-small mt-4 !text-[var(--ink-66)]">
          <Link href={`/${l}/gua/table`} className="underline underline-offset-4">{referenceFor(l).table.title}</Link>
          <span className="mx-2 text-[var(--ink-16)]">·</span>
          <Link href={`/${l}/glossary`} className="underline underline-offset-4">{referenceFor(l).glossary.title}</Link>
          <span className="mx-2 text-[var(--ink-16)]">·</span>
          <Link href={`/${l}/timing`} className="underline underline-offset-4">{referenceFor(l).timing.title}</Link>
        </p>
      </header>

      <ol className={`grid grid-cols-2 ${cjk ? "sm:grid-cols-4 gap-x-4" : "sm:grid-cols-3 gap-x-6"} gap-y-1 mt-[var(--s-5)] list-none`}>
        {GUA.map((h) => (
          <li key={h.number}>
            <Link
              href={`/${l}/gua/${guaSlug(h)}`}
              className="group flex items-start gap-3 py-[10px] rounded-[2px]"
            >
              {/* the figure sits on the number's line, so every row's top edge aligns however long the name wraps */}
              <FigureMark yangs={guaYangs(h)} width={26} className="shrink-0 mt-[5px] opacity-80 group-hover:opacity-100" />
              <span className="min-w-0">
                <span className="t-label block !tracking-[0.08em] !text-[var(--ink-45)]">
                  {String(h.number).padStart(2, "0")}
                </span>
                <span
                  className={`t-body block group-hover:text-[var(--cinnabar)] transition-colors ${
                    cjk ? "!text-[15px]" : "!text-[14px] !leading-[1.5] [hyphens:auto]"
                  }`}
                >
                  {guaName(h, l)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
        <Link href={`/${l}/cast`} className="t-label hover:text-[var(--ink)] transition-colors">
          {t(l, "guaCastLink")}
        </Link>
      </div>
    </div>
  );
}
