import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canSee } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { PALACE_SLUG, palaceOfSlug, STAR_SLUG, starOfSlug, zIn } from "@/lib/mingli/ziwei/content";
import { palaceLabel } from "@/lib/mingli/ziwei/chart";
import { ziweiPage } from "@/lib/mingli/ziwei/page-ui";
import { zwName } from "@/lib/mingli/ziwei/names";
import { brandName } from "@/lib/brand";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { fmt, isForeign } from "@/lib/l10n/core";

export const dynamic = "force-dynamic";

/** 10-18 进度表 71: one main star (/ziwei/stars/tai-yin) or a star in a palace (/ziwei/stars/tai-yin/fu-qi) */
function parse(path: string[]) {
  const star = starOfSlug(path[0] ?? "");
  const palace = path[1] ? palaceOfSlug(path[1]) : null;
  if (!star || path.length > 2 || (path[1] && !palace)) return null;
  return { star, palace };
}

/** a description of about 80 Chinese characters — outside Chinese, up to the end of a sentence near 160 characters */
function clip(s: string, l: string): string {
  if (!isForeign(l)) return s.slice(0, 80);
  if (s.length <= 160) return s;
  const cut = s.slice(0, 160), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("。"), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 60 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

/** 10-30 进度表 128 ④: every language the 紫微 is open in */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; path: string[] }> }): Promise<Metadata> {
  const { locale, path } = await params;
  const x = parse(path);
  if (!x || !isLocale(locale) || !serviceOpenIn("ziwei", locale)) return {};
  const D = zIn(locale), alternates = pageAlternates(locale, `/ziwei/stars/${path.join("/")}`, serviceLocales("ziwei"));
  if (isForeign(locale)) {
    const P = ziweiPage(locale), Z = zwName(locale);
    if (x.palace) {
      const t = D.pairs[`${x.star}|${x.palace}`];
      return { title: { absolute: `${Z.josa(fmt(P.pairMetaTitle, { s: Z.star(x.star), p: Z.palaceFull(x.palace), t: t?.title ?? "" }))} — ${brandName(locale)}` }, description: clip(t?.plain ?? "", locale), alternates };
    }
    return { title: { absolute: `${fmt(P.starMetaTitle, { s: Z.star(x.star) })} — ${brandName(locale)}` }, description: clip(D.overview[x.star]?.intro ?? "", locale), alternates };
  }
  const l = locale as HlLocale;
  if (x.palace) {
    const t = D.pairs[`${x.star}|${x.palace}`];
    return { title: { absolute: `${loc(`${x.star}在${palaceLabel(x.palace)}｜${t?.title ?? ""}`, l)} — ${brandName(l)}` }, description: loc(t?.plain.slice(0, 80) ?? "", l), alternates };
  }
  return { title: { absolute: `${loc(`${x.star}星｜紫微斗數主星白話說明`, l)} — ${brandName(l)}` }, description: loc(D.overview[x.star]?.intro.slice(0, 80) ?? "", l), alternates };
}

export default async function StarPage({ params }: { params: Promise<{ locale: string; path: string[] }> }) {
  const { locale, path } = await params;
  if (!isLocale(locale) || !serviceOpenIn("ziwei", locale)) notFound();
  const x = parse(path);
  if (!x) notFound();
  if (!(await canSee("ziwei"))) notFound();
  const l = locale as Locale;
  const foreign = isForeign(l);
  const P = ziweiPage(l), D = zIn(l), Z = foreign ? zwName(l) : null;
  const w = (s: string) => (foreign ? s : loc(s, l as HlLocale));
  const starName = Z ? Z.star(x.star) : w(x.star);
  const pal = (p: string) => (Z ? Z.palaceFull(p) : w(palaceLabel(p)));
  const o = D.overview[x.star];
  const slug = STAR_SLUG[x.star]!;
  const t = x.palace ? D.pairs[`${x.star}|${x.palace}`] : null;
  const title = (tpl: string, v: Record<string, string>) => (Z ? Z.josa(fmt(tpl, v)) : fmt(tpl, v));
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <p className="t-small"><Link href={x.palace ? `/${l}/ziwei/stars/${slug}` : `/${l}/ziwei/stars`} className="underline underline-offset-4 !text-[var(--ink-66)]">← {x.palace ? starName : P.starsIndex}</Link></p>
      {t ? (
        <>
          <h1 className="t-d1 mt-[var(--s-3)]">{title(P.pairTitle, { s: starName, p: pal(x.palace!) })}</h1>
          <p className="t-d3 mt-2">{w(t.title)}</p>
          <p className="t-body mt-[var(--s-4)] leading-relaxed">{w(t.plain)}</p>
          <h2 className="t-sect mt-[var(--s-5)]">{P.strength}</h2><p className="t-body mt-2 leading-relaxed">{w(t.strength)}</p>
          <h2 className="t-sect mt-[var(--s-5)] !text-[var(--cinnabar)]">{P.watch}</h2><p className="t-body mt-2 leading-relaxed">{w(t.watch)}</p>
          <p className="t-body mt-[var(--s-5)] border-l-2 border-[var(--gold)] pl-4">{w(t.ask_next)}</p>
        </>
      ) : o ? (
        <>
          <h1 className="t-d1 mt-[var(--s-3)]">{title(P.starTitle, { s: starName })}</h1>
          {Z && Z.gloss(x.star) && <p className="t-small mt-1 !text-[var(--ink-45)]">{Z.gloss(x.star)}</p>}
          <p className="t-body mt-[var(--s-4)] leading-relaxed">{w(o.intro)}</p>
          <h2 className="t-sect mt-[var(--s-5)]">{P.personality}</h2><p className="t-body mt-2 leading-relaxed">{w(o.personality)}</p>
          <h2 className="t-sect mt-[var(--s-5)]">{P.love}</h2><p className="t-body mt-2 leading-relaxed">{w(o.love)}</p>
          <h2 className="t-sect mt-[var(--s-5)]">{P.work}</h2><p className="t-body mt-2 leading-relaxed">{w(o.work)}</p>
          <h2 className="t-sect mt-[var(--s-6)]">{title(P.inPalaces, { s: starName })}</h2>
          <ul className="mt-2 divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
            {Object.entries(PALACE_SLUG).map(([p, ps]) => (
              <li key={p} className="py-2.5"><Link href={`/${l}/ziwei/stars/${slug}/${ps}`} className="flex gap-3 hover:underline underline-offset-4"><span className={`t-body ${Z && l !== "ja" && l !== "ko" ? "w-40 shrink-0" : "w-16"}`}>{pal(p)}</span><span className="t-small flex-1">{w(D.pairs[`${x.star}|${p}`]?.title ?? "")}</span></Link></li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="mt-[var(--s-6)]"><Link href={`/${l}/ziwei`} className="inline-block px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px]">{P.cta}</Link></p>
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{P.note}</p>
    </div>
  );
}
