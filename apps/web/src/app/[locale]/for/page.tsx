import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { LOCALE_META } from "@/lib/locales";
import { sceneLocales, scenePath, scenesFor } from "@/lib/scenes";
import { TOPIC_NAMES, type Topic } from "@/lib/topic";
import { brandName } from "@/lib/brand";

export function generateStaticParams() {
  return sceneLocales().map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !sceneLocales().includes(locale)) return {};
  const languages: Record<string, string> = {};
  for (const l of sceneLocales()) languages[LOCALE_META[l].hreflang] = `/${l}/for`;
  languages["x-default"] = `/${sceneLocales().includes("en") ? "en" : locale}/for`;
  return {
    title: `${t(locale, "scenesTitle")} | ${brandName(locale)}`,
    description: t(locale, "scenesLead"),
    alternates: { canonical: `/${locale}/for`, languages },
  };
}

/** The situations people bring to a cast, one page each. */
export default async function ScenesIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !sceneLocales().includes(locale)) notFound();
  const l = locale as Locale;
  const scenes = scenesFor(l);
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
      <h1 className="t-d1">{t(l, "scenesTitle")}</h1>
      <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{t(l, "scenesLead")}</p>
      <ol className="mt-[var(--s-6)] flex flex-col">
        {scenes.map((s, i) => (
          <li key={s.slug} className={`py-[var(--s-4)] ${i > 0 ? "border-t border-dotted border-[var(--ink-16)]" : ""}`}>
            <Link href={scenePath(l, s.slug)} className="group block">
              <p className="t-label !text-[var(--gold-text)]">{TOPIC_NAMES[(s.topic in TOPIC_NAMES ? s.topic : "other") as Topic][l]}</p>
              <p className="t-d3 mt-1 group-hover:text-[var(--cinnabar)] transition-colors">{s.h1}</p>
              <p className="t-small mt-1 line-clamp-2">{s.meta}</p>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
