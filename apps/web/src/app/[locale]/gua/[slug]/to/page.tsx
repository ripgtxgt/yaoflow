import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUA, guaSlug, guaYangs } from "@/lib/gua";
import { changesFrom, hexBySlug, transitionPath } from "@/lib/transitions";
import FigureMark from "@/components/FigureMark";

/** Index of the 63 changes from one hexagram, grouped by how many lines move. English only for now. */

export function generateStaticParams() {
  return GUA.map((h) => ({ locale: "en", slug: guaSlug(h) }));
}

interface Params { locale: string; slug: string }

const COUNT_WORD = ["", "one line", "two lines", "three lines", "four lines", "five lines", "all six lines"];

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const a = p.locale === "en" ? hexBySlug(p.slug) : null;
  if (!a) return {};
  const path = `/en/gua/${guaSlug(a)}/to`;
  const title = `All changes from hexagram ${a.number} ${a.en}`;
  return {
    title: `${title} | YaoFlow`,
    description: `Every hexagram ${a.en} (${a.number}) can change into, by which lines move — one page for each of the 63 changes, plus the still chart.`,
    alternates: { canonical: path, languages: { en: path, "x-default": path } },
    openGraph: { title },
  };
}

export default async function ChangesIndexPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const a = p.locale === "en" ? hexBySlug(p.slug) : null;
  if (!a) notFound();
  const groups = changesFrom(a);
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <nav className="pt-8">
        <Link href={`/en/gua/${guaSlug(a)}`} className="t-label hover:text-[var(--ink)] transition-colors">← Hexagram {a.number} · {a.en}</Link>
      </nav>
      <header className="mt-[var(--s-5)] pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        <div className="flex items-start gap-[var(--s-5)]">
          <FigureMark yangs={guaYangs(a)} width={56} className="mt-2 shrink-0" />
          <div className="min-w-0">
            <p className="t-label !text-[var(--gold-text)]">Hexagram {a.number} · {a.pinyin}</p>
            <h1 className="t-d1 mt-1">All changes from {a.en}</h1>
            <p className="t-body mt-2 text-[var(--ink-66)]">
              A moving line turns into its opposite, so {a.en} can become any of the other 63 hexagrams. Each change is one cast; each has its own page.{" "}
              <Link href={transitionPath("en", a, a)} className="underline underline-offset-4">The still chart</Link> is the sixty-fourth.
            </p>
          </div>
        </div>
      </header>
      {groups.map((g) => (
        <section key={g.count} className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-4)]">{COUNT_WORD[g.count]} moving · {g.items.length}</h2>
          <ul className="grid sm:grid-cols-2 gap-x-8">
            {g.items.map(({ b, moving }) => (
              <li key={b.number} className="py-2 border-t border-dotted border-[var(--ink-16)]">
                <Link href={transitionPath("en", a, b)} className="group flex items-center gap-3">
                  <FigureMark yangs={guaYangs(b)} width={22} className="shrink-0 opacity-70 group-hover:opacity-100" />
                  <span className="t-small !text-[var(--ink)] group-hover:text-[var(--cinnabar)] transition-colors">{b.number} · {b.en}</span>
                  <span className="t-label !text-[var(--ink-45)] ml-auto">{g.count === 6 ? "1–6" : moving.join(" ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
