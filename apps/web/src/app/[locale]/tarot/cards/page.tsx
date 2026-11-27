import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canSee } from "@/lib/features";
import { cardImage, TAROT_CARDS, tarotSlug } from "@/lib/tarot";
import { tarotText } from "@/lib/tarot-text";
import { isLocale, pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * 10-17 (Neil: 「这个每张牌面的意思不应该放在这个页面吧……之后每个产品也是一样的」): the 78 cards on their own page —
 * the draw page stays the draw; the library lives here, one link away (and in the sitemap once open).
 * 10-30 进度表 128 ②: in every language the tarot is open in, the cards under their standard names there.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("tarot", locale)) return {};
  const t = tarotText(locale).library;
  return {
    title: { absolute: `${t.metaTitle} — ${brandName(locale)}` }, description: t.metaDesc,
    alternates: pageAlternates(locale, "/tarot/cards", serviceLocales("tarot")),
  };
}

export default async function TarotCardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("tarot", locale)) notFound();
  if (!(await canSee("tarot"))) notFound();
  const t = tarotText(locale);
  const groups = (["major", "wands", "cups", "swords", "pentacles"] as const).map((g) => [g, t.library.groups[g]] as const);
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
      <nav className="t-label"><Link href={`/${locale}/tarot`} className="hover:text-[var(--ink)] transition-colors">← {t.library.back}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-4)]">{t.library.title}</h1>
      {groups.map(([g, label]) => (
        <section key={g} className="mt-[var(--s-6)]">
          <h2 className="t-sect">{label}</h2>
          <ul className="mt-[var(--s-3)] grid grid-cols-4 sm:grid-cols-7 gap-2">
            {TAROT_CARDS.filter((c) => (g === "major" ? c.arcana === "major" : c.id.startsWith(`${g}-`))).map((c) => (
              <li key={c.id}>
                <Link href={`/${locale}/tarot/${tarotSlug(c)}`} className="block text-center group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cardImage(c, true)} alt={t.cards[c.id] ?? c.en} loading="lazy" width={240} height={420} className="w-full h-auto rounded-[3px] border border-[var(--ink-16)] group-hover:border-[var(--ink-45)] transition" />
                  <span className="t-small block mt-1 [overflow-wrap:anywhere]">{t.cards[c.id] ?? c.en}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-[var(--s-6)] text-center"><Link href={`/${locale}/tarot`} className="underline underline-offset-4">{t.library.drawOne}</Link></p>
    </div>
  );
}
