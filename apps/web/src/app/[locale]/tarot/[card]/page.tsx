import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { canSee, featureState } from "@/lib/features";
import { cardBySlug, cardImage, TAROT_CARDS, tarotSlug, type TarotCard } from "@/lib/tarot";
import { tarotText, type TarotText } from "@/lib/tarot-text";
import { meaningIn } from "@/lib/tarot-meaning-text";
import { fmt } from "@/lib/l10n/core";
import { isLocale, LOCALE_META, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * 10-16 进度表 68: one page per card — upright and reversed, overall / love / work, from the meaning library.
 * 10-30 进度表 128 ②: in every language the tarot is open in — the card under its standard name there, the meanings
 * translated from 推广's reviewed 牌義定稿; the English name stays beside it where the page is not English.
 */
const cjk = (l: Locale) => LOCALE_META[l].cjk;
/** the page's name for the card: 「戀人牌」 / 「恋人のカード」 for a major in the CJK languages, the plain name elsewhere */
const titleName = (c: TarotCard, l: Locale, t: TarotText) => {
  const name = t.cards[c.id] ?? c.en;
  return c.arcana === "major" && cjk(l) ? fmt(t.card.majorName, { name }) : name;
};
/** the English name in brackets: the data's short one on the Chinese pages (as they always were), the standard one elsewhere */
const enName = (c: TarotCard, l: Locale) => (l === "zh" || l === "zh-hant" ? c.en : tarotText("en").cards[c.id] ?? c.en);
/** 「{name}（{en}）…」 — without the bracket on the English page */
const metaTitle = (c: TarotCard, l: Locale, t: TarotText) => {
  const tpl = l === "en" ? t.card.metaTitle.replace(/\s*[（(]\{en\}[）)]/, "") : t.card.metaTitle;
  return fmt(tpl, { name: titleName(c, l, t), en: enName(c, l) });
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string; card: string }> }): Promise<Metadata> {
  const { locale, card } = await params;
  const c = cardBySlug(card);
  if (!c || !isLocale(locale) || !serviceOpenIn("tarot", locale)) return {};
  const t = tarotText(locale);
  const m = meaningIn(c.id, locale);
  const sep = cjk(locale) ? "、" : ", ";
  const title = metaTitle(c, locale, t);
  const d = fmt(t.card.metaDesc, { name: titleName(c, locale, t), up: m?.keywords.upright.join(sep) ?? "", rev: m?.keywords.reversed.join(sep) ?? "", overall: (m?.upright.overall ?? "").slice(0, cjk(locale) ? 70 : 150) });
  const slug = tarotSlug(c);
  return {
    title: { absolute: `${title} — ${brandName(locale)}` }, description: d,
    alternates: pageAlternates(locale, `/tarot/${slug}`, serviceLocales("tarot")),
    openGraph: { title, description: d, type: "article", images: [{ url: cardImage(c), width: 600, height: 1050 }] },
  };
}

export default async function TarotCardPage({ params }: { params: Promise<{ locale: string; card: string }> }) {
  const { locale, card } = await params;
  if (!isLocale(locale) || !serviceOpenIn("tarot", locale)) notFound();
  const c = cardBySlug(card);
  const m = c ? meaningIn(c.id, locale) : null;
  if (!c || !m) notFound();
  if (!(await canSee("tarot"))) notFound();
  const t = tarotText(locale);
  const name = (x: TarotCard) => t.cards[x.id] ?? x.en;
  const sep = cjk(locale) ? "、" : ", ";
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const i = TAROT_CARDS.findIndex((x) => x.id === c.id);
  const prev = TAROT_CARDS[(i + TAROT_CARDS.length - 1) % TAROT_CARDS.length]!, next = TAROT_CARDS[(i + 1) % TAROT_CARDS.length]!;
  const crumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "YaoFlow", item: `${site}/${locale}` },
      { "@type": "ListItem", position: 2, name: t.library.title, item: `${site}/${locale}/tarot/cards` },
      { "@type": "ListItem", position: 3, name: titleName(c, locale, t), item: `${site}/${locale}/tarot/${tarotSlug(c)}` },
    ],
  };
  const side = (label: string, x: typeof m.upright, kw: string[]) => (
    <section className="mt-[var(--s-6)]">
      <h2 className="t-d3">{label}</h2>
      <p className="t-small mt-1 !text-[var(--gold-text)]">{kw.join(" · ")}</p>
      <p className="t-body mt-[var(--s-3)] leading-relaxed">{x.overall}</p>
      <h3 className="t-sect mt-[var(--s-4)]">{t.card.love}</h3>
      <p className="t-body mt-[var(--s-2)] leading-relaxed text-[var(--ink-86)]">{x.love}</p>
      <h3 className="t-sect mt-[var(--s-4)]">{t.card.work}</h3>
      <p className="t-body mt-[var(--s-2)] leading-relaxed text-[var(--ink-86)]">{x.work}</p>
      <p className="t-small mt-[var(--s-3)] border-l-2 border-[var(--gold)] pl-3 !text-[var(--ink-66)]">{x.ask_next}</p>
    </section>
  );
  // the English name beside the card's own, except on the English page (where it is the name)
  const enTag = locale === "en" ? "" : ` · ${enName(c, locale)}`;
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <JsonLd data={crumbs} />
      <nav className="pt-8 t-label"><Link href={`/${locale}/tarot/cards`} className="hover:text-[var(--ink)] transition-colors">← {t.library.title}</Link></nav>
      {featureState("tarot") === "preview" && <p className="t-small mt-[var(--s-3)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px]">{t.card.preview}</p>}
      <header className="mt-[var(--s-4)] grid grid-cols-[120px_1fr] sm:grid-cols-[180px_1fr] gap-[var(--s-5)] items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cardImage(c)} alt={name(c)} width={600} height={1050} className="w-full h-auto rounded-[4px] border border-[var(--ink-16)]" />
        <div>
          <p className="t-label !text-[var(--gold-text)]">{c.arcana === "major" ? fmt(t.card.major, { roman: c.roman ?? "" }).trim() : t.card.minor}{enTag}</p>
          <h1 className="t-d1 mt-1">{titleName(c, locale, t)}</h1>
          <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{fmt(t.card.keywordsLine, { side: t.ui.upright, words: m.keywords.upright.join(sep) })}</p>
          <p className="t-small mt-1 !text-[var(--ink-66)]">{fmt(t.card.keywordsLine, { side: t.ui.reversed, words: m.keywords.reversed.join(sep) })}</p>
          <Link href={`/${locale}/tarot`} className="inline-block mt-[var(--s-4)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px] hover:opacity-90 transition">{t.card.draw}</Link>
        </div>
      </header>
      {side(t.ui.upright, m.upright, m.keywords.upright)}
      {side(t.ui.reversed, m.reversed, m.keywords.reversed)}
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{t.card.revNote}</p>
      <nav className="mt-[var(--s-5)] flex justify-between gap-4 t-small">
        <Link href={`/${locale}/tarot/${tarotSlug(prev)}`} className="underline underline-offset-4">← {name(prev)}</Link>
        <Link href={`/${locale}/tarot/${tarotSlug(next)}`} className="underline underline-offset-4 text-right">{name(next)} →</Link>
      </nav>
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{t.card.faces}</p>
    </article>
  );
}
