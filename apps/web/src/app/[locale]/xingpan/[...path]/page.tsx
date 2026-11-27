import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canSee } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { PLANET_SLUG, planetOfSlug, SIGN_SLUG, signOfSlug, xIn } from "@/lib/mingli/astro/content";
import { astroPage, planetName, signName, type AstroPage } from "@/lib/mingli/astro/page-ui";
import { brandName } from "@/lib/brand";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { fmt, isForeign } from "@/lib/l10n/core";

export const dynamic = "force-dynamic";

/**
 * 10-18 进度表 74: the 星盤 library pages — /xingpan/planets (index), /xingpan/moon-cancer (行星×星座),
 * /xingpan/moon-house-4 (行星×宮位), /xingpan/rising/cancer (上升星座).
 * 10-30 进度表 128 ④: in every language the 星盤 is open in — the library from xIn, the names from lib/mingli/astro/names.ts,
 * the titles from the page templates (page-ui.ts PAGE).
 */
type Page = { kind: "index" } | { kind: "ps"; planet: string; sign: string } | { kind: "ph"; planet: string; house: number } | { kind: "rising"; sign: string };
function parse(path: string[]): Page | null {
  if (path.length === 1 && path[0] === "planets") return { kind: "index" };
  if (path.length === 2 && path[0] === "rising") { const s = signOfSlug(path[1]!); return s ? { kind: "rising", sign: s } : null; }
  if (path.length !== 1) return null;
  const m = /^([a-z]+)-house-(\d{1,2})$/.exec(path[0]!);
  if (m) { const p = planetOfSlug(m[1]!); const h = +m[2]!; return p && h >= 1 && h <= 12 ? { kind: "ph", planet: p, house: h } : null; }
  const [a, b] = path[0]!.split("-");
  const p = planetOfSlug(a ?? ""), s = signOfSlug(b ?? "");
  return p && s ? { kind: "ps", planet: p, sign: s } : null;
}
/** English houses are ordinals (the 1st house); the other languages write the number as the template has it */
const houseNum = (n: number, l: string) => (l === "en" ? `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}` : String(n));
function titleOf(x: Page, l: string, P: AstroPage): string {
  if (!isForeign(l)) return loc(x.kind === "index" ? "行星在各星座與宮位" : x.kind === "ps" ? `${x.planet}${x.sign}` : x.kind === "ph" ? `${x.planet}在第${x.house}宮` : `上升${x.sign}`, l as HlLocale);
  if (x.kind === "index") return P.libIndex;
  if (x.kind === "ps") return fmt(P.tPS, { p: planetName(x.planet, l), s: signName(x.sign, l) });
  if (x.kind === "ph") return fmt(P.tPH, { p: planetName(x.planet, l), h: houseNum(x.house, l) });
  return fmt(P.tRising, { s: signName(x.sign, l) });
}
/** a description of about 80 Chinese characters — outside Chinese, up to the end of a sentence near 160 characters */
function clip(s: string, l: string): string {
  if (!isForeign(l)) return s.slice(0, 80);
  if (s.length <= 160) return s;
  const cut = s.slice(0, 160), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("。"), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 60 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; path: string[] }> }): Promise<Metadata> {
  const { locale, path } = await params;
  const x = parse(path);
  if (!x || !isLocale(locale) || !serviceOpenIn("xingpan", locale)) return {};
  const P = astroPage(locale), X = xIn(locale);
  const desc = x.kind === "ps" ? X.ps[`${x.planet}|${x.sign}`]?.plain : x.kind === "ph" ? X.ph[`${x.planet}|${x.house}`] : x.kind === "rising" ? X.rising[x.sign]?.plain : isForeign(locale) ? P.libIndexDesc : "十大行星落在十二星座與十二宮的白話說明。";
  const title = isForeign(locale) ? fmt(P.libSuffix, { t: titleOf(x, locale, P) }) : loc(`${titleOf(x, "zh-hant", P)}｜星盤白話說明`, locale as HlLocale);
  const d = clip(desc ?? "", locale);
  return { title: { absolute: `${title} — ${brandName(locale)}` }, description: isForeign(locale) ? d : loc(d, locale as HlLocale), alternates: pageAlternates(locale, `/xingpan/${path.join("/")}`, serviceLocales("xingpan")) };
}

export default async function XingpanLib({ params }: { params: Promise<{ locale: string; path: string[] }> }) {
  const { locale, path } = await params;
  if (!isLocale(locale) || !serviceOpenIn("xingpan", locale)) notFound();
  const x = parse(path);
  if (!x) notFound();
  if (!(await canSee("astro"))) notFound();
  const l = locale as Locale;
  const P = astroPage(l), X = xIn(l);
  const foreign = isForeign(l);
  /** fixed copy and the 繁體 library convert for the 简体 page; a foreign page has its own words already */
  const w = (s: string) => (foreign ? s : loc(s, l as HlLocale));
  const back = <p className="t-small"><Link href={x.kind === "index" ? `/${l}/xingpan` : `/${l}/xingpan/planets`} className="underline underline-offset-4 !text-[var(--ink-66)]">← {x.kind === "index" ? P.title : P.libIndex}</Link></p>;
  let body: React.ReactNode = null;
  if (x.kind === "index") {
    body = (
      <>
        {Object.entries(PLANET_SLUG).map(([p, ps]) => (
          <section key={p} className="mt-[var(--s-5)]">
            <h2 className="t-sect">{foreign ? planetName(p, l) : w(p)}</h2>
            <p className="t-small mt-1 !text-[var(--ink-66)]">{w(X.planets[p] ?? "")}</p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 t-small">{Object.entries(SIGN_SLUG).map(([s, ss]) => <Link key={s} href={`/${l}/xingpan/${ps}-${ss}`} className="underline underline-offset-4">{foreign ? signName(s, l) : w(s)}</Link>)}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 t-small">{Array.from({ length: 12 }, (_, i) => <Link key={i} href={`/${l}/xingpan/${ps}-house-${i + 1}`} className="underline underline-offset-4 !text-[var(--ink-66)]">{foreign ? fmt(P.houseShort, { n: i + 1 }) : w(`${i + 1}宮`)}</Link>)}</p>
          </section>
        ))}
        <section className="mt-[var(--s-5)]">
          <h2 className="t-sect">{P.risingHead}</h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 t-small">{Object.entries(SIGN_SLUG).map(([s, ss]) => <Link key={s} href={`/${l}/xingpan/rising/${ss}`} className="underline underline-offset-4">{foreign ? fmt(P.tRising, { s: signName(s, l) }) : w(`上升${s}`)}</Link>)}</p>
        </section>
      </>
    );
  } else if (x.kind === "ps") {
    const t = X.ps[`${x.planet}|${x.sign}`];
    if (!t) notFound();
    body = (
      <>
        <p className="t-d3 mt-2">{w(t.title)}</p>
        <p className="t-body mt-[var(--s-4)] leading-relaxed">{w(t.plain)}</p>
        <h2 className="t-sect mt-[var(--s-5)]">{P.love}</h2><p className="t-body mt-2 leading-relaxed">{w(t.love)}</p>
        <h2 className="t-sect mt-[var(--s-5)]">{P.work}</h2><p className="t-body mt-2 leading-relaxed">{w(t.work)}</p>
        <h2 className="t-sect mt-[var(--s-5)] !text-[var(--cinnabar)]">{P.watch}</h2><p className="t-body mt-2 leading-relaxed">{w(t.watch)}</p>
      </>
    );
  } else if (x.kind === "ph") {
    const t = X.ph[`${x.planet}|${x.house}`];
    if (!t) notFound();
    body = <p className="t-body mt-[var(--s-4)] leading-relaxed">{w(t)}</p>;
  } else {
    const t = X.rising[x.sign];
    if (!t) notFound();
    body = (
      <>
        <p className="t-body mt-[var(--s-4)] leading-relaxed">{w(t.plain)}</p>
        {t.faq.map((f) => <div key={f.q} className="mt-[var(--s-5)]"><h2 className="t-sect">{w(f.q)}</h2><p className="t-body mt-2 leading-relaxed">{w(f.a)}</p></div>)}
      </>
    );
  }
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      {back}
      <h1 className="t-d1 mt-[var(--s-3)]">{titleOf(x, l, P)}</h1>
      {body}
      <p className="mt-[var(--s-6)]"><Link href={`/${l}/xingpan`} className="inline-block px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px]">{P.cta}</Link></p>
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{P.note}</p>
    </div>
  );
}
