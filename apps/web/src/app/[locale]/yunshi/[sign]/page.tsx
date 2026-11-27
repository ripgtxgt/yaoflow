import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import FeatureLink from "@/components/FeatureLink";
import TrackOnce from "@/components/TrackOnce";
import TrackLink from "@/components/TrackLink";
import { canSee, featureState } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES, shiftDay, todayYmd } from "@/lib/mingli/calendar/page-bits";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { C, SIGNS, signBySlug, yunshiFor, type Relation } from "@/lib/mingli/yunshi/zodiac";
import { brandName } from "@/lib/brand";
import CrossCards from "@/components/CrossCards";
import type { Locale } from "@/lib/locales";
import { isLocale, LOCALE_META, pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { fmt, isForeign, type Foreign } from "@/lib/l10n/core";
import { animalsOnly, ysPage, ysStar, ysZodiac } from "@/lib/mingli/yunshi/foreign-text";
import { horoscopeFor, starBySlug, STAR_SIGNS, starDatesIn, starNameIn } from "@/lib/mingli/yunshi/horoscope";
import { BAZI_NAMES, bzName } from "@/lib/mingli/bazi/names";
import { signName } from "@/lib/mingli/astro/page-ui";
import { SIGNS as ASTRO_SIGNS } from "@/lib/mingli/astro/chart";

export const dynamic = "force-dynamic";

/** 10-18 进度表 73 每日運勢: one sign today (/yunshi/tiger) — the answer card, the day in a paragraph, the sign's page */
const REL: Record<Relation, string> = { chong: "相沖", xing: "相刑", hai: "相害", po: "相破", liuhe: "六合", sanhe: "三合", same: "同支（本命日）", ping: "沒有沖合，平常日" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string; sign: string }> }): Promise<Metadata> {
  const { locale, sign } = await params;
  // 10-30 进度表 128 ⑤: a sign or an animal in another language
  if (isLocale(locale) && isForeign(locale) && serviceOpenIn("yunshi", locale)) {
    const P = ysPage(locale), si = starBySlug(sign), ai = signBySlug(sign);
    const alt = pageAlternates(locale, `/yunshi/${sign}`, si >= 0 ? serviceLocales("yunshi").filter((x) => isForeign(x) && !animalsOnly(x)) : serviceLocales("yunshi"));
    if (si >= 0 && !animalsOnly(locale)) { const z = starNameIn(locale, si); return { title: { absolute: `${fmt(P.starMeta, { z })} — ${brandName(locale)}` }, description: fmt(P.starMetaDesc, { z, d: starDatesIn(locale, si) }), alternates: alt }; }
    if (ai >= 0) { const z = BAZI_NAMES[locale].animals[ai]!; return { title: { absolute: `${fmt(P.animalMeta, { z })} — ${brandName(locale)}` }, description: fmt(P.animalMetaDesc, { z }), alternates: alt }; }
    return {};
  }
  const l = locale as HlLocale;
  const i = signBySlug(sign);
  if (i < 0) return {};
  const name = C.zodiac[SIGNS[i]!].name;
  return {
    title: { absolute: `${loc(`屬${name}今日運勢｜生肖${name}每日運勢`, l)} — ${brandName(l)}` },
    description: loc(`屬${name}的人今天的節奏：適合怎麼安排、哪件事先別急，每天更新。免費、不用註冊。`, l),
    alternates: { canonical: `/${locale}/yunshi/${sign}`, languages: { "zh-Hant": `/zh-hant/yunshi/${sign}`, "zh-CN": `/zh/yunshi/${sign}`, "x-default": `/zh-hant/yunshi/${sign}` } },
  };
}

export default async function YunshiSign({ params }: { params: Promise<{ locale: string; sign: string }> }) {
  const { locale, sign } = await params;
  if (isLocale(locale) && isForeign(locale) && serviceOpenIn("yunshi", locale)) {
    if (!(await canSee("yunshi"))) notFound();
    const si = starBySlug(sign), ai = signBySlug(sign);
    if (si >= 0 && !animalsOnly(locale)) return <ForeignStar l={locale} i={si} />;
    if (ai >= 0) return <ForeignAnimal l={locale} i={ai} />;
    notFound();
  }
  if (!HL_LOCALES.has(locale)) notFound();
  const i = signBySlug(sign);
  if (i < 0) notFound();
  if (!(await canSee("yunshi"))) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const ymd = todayYmd();
  const y = yunshiFor(i, ymd)!;
  const tmr = yunshiFor(i, shiftDay(ymd, 1))!;
  const z = C.zodiac[y.sign];
  const [, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const tone = y.tier === "smooth" ? "!text-[var(--gold-text)]" : y.tier === "careful" ? "!text-[var(--cinnabar)]" : "";
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: z.faq.map((f) => ({ "@type": "Question", name: w(f.q), acceptedAnswer: { "@type": "Answer", text: w(f.a) } })) };
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <JsonLd data={faq} />
      <TrackOnce event="yunshi" locale={l} method={`view:${y.sign}`} />
      {featureState("yunshi") === "preview" && <p className="t-small mb-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px]">預覽中：只有登入後台的瀏覽器看得到。</p>}
      <p className="t-small"><Link href={`/${l}/yunshi`} className="underline underline-offset-4 !text-[var(--ink-66)]">← {w("十二生肖")}</Link></p>
      <h1 className="t-d1 mt-[var(--s-3)]">{w(`屬${z.name}`)}</h1>
      <p className="t-body mt-1 text-[var(--ink-66)]">{w(`${m} 月 ${d} 日（${y.dayGz}日）`)}</p>

      {/* the answer */}
      <section className="mt-[var(--s-5)] rounded-[2px] border border-[var(--ink-16)] px-[var(--s-4)] py-[var(--s-5)]">
        <p className={`t-sect ${tone}`}>{w(y.tierName)}</p>
        <p className="t-d3 mt-[var(--s-2)]">{w(y.line)}</p>
        <dl className="mt-[var(--s-4)] grid grid-cols-[5.5em_1fr] gap-x-3 gap-y-2 t-body">
          <dt className="t-sect pt-0.5">{w("今天適合")}</dt><dd>{w(y.yi)}</dd>
          <dt className="t-sect pt-0.5 !text-[var(--cinnabar)]">{w("今天先別")}</dt><dd>{w(y.ji)}</dd>
        </dl>
        {y.rhythm && <p className="t-small mt-[var(--s-4)] !text-[var(--ink-66)]">{w(y.rhythm)}</p>}
      </section>

      <p className="t-body mt-[var(--s-5)] leading-relaxed border-l-2 border-[var(--gold)] pl-4">{w(y.plain)}</p>
      <details className="mt-[var(--s-4)]">
        <summary className="cursor-pointer t-small !text-[var(--ink-66)]">{w("今天和屬" + z.name + "的關係")}</summary>
        <p className="t-small mt-2">{w(`今天${y.dayBranch}日，屬${z.name}（${z.branch}）：${REL[y.relation]}。`)}</p>
      </details>

      <section className="mt-[var(--s-6)] grid gap-3">
        <p className="t-body">{w("今天有一件放不下的事嗎？")}</p>
        <p><TrackLink event="yunshi" locale={l} method="to_cast" href={`/${l}/cast?c=yunshi`} className="inline-block px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px]">{w("起一卦問那件事 →")}</TrackLink></p>
        <FeatureLink name="huangli" from="yunshi" locale={l} href={`/${l}/huangli`} text={w("看今天的黃曆宜忌 →")} />
        {/* 10-29 (Neil: 产品之间的互相引导): this sign's 2027 太歲 */}
        <FeatureLink name="taisui" from="yunshi" locale={l} href={`/${l}/taisui/${y.sign}`} text={w(`屬${z.name} 2027 犯太歲嗎？依習俗怎麼安 →`)} />
        <p className="t-small !text-[var(--ink-66)]">{w(`明天（${tmr.dayGz}日）：${tmr.tierName}。明天再來看。`)}</p>
      </section>

      <nav className="mt-[var(--s-6)] flex flex-wrap gap-2">
        {SIGNS.map((s) => (
          <Link key={s} href={`/${l}/yunshi/${s}`} className={`w-11 py-1.5 text-center rounded-[2px] border t-body !text-[15px] ${s === y.sign ? "border-[var(--ink)] bg-[var(--ink)] !text-[var(--paper)]" : "border-[var(--ink-16)] hover:border-[var(--ink)]"}`}>{w(C.zodiac[s].name)}</Link>
        ))}
      </nav>

      <section className="mt-[var(--s-6)] border-t border-[var(--ink-16)] pt-[var(--s-6)]">
        <h2 className="t-sect">{w(`關於屬${z.name}`)}</h2>
        <p className="t-body mt-[var(--s-2)] leading-relaxed text-[var(--ink-86)]">{w(z.intro)}</p>
        {z.faq.map((f) => (
          <div key={f.q} className="mt-[var(--s-5)]">
            <h3 className="t-sect">{w(f.q)}</h3>
            <p className="t-body mt-[var(--s-2)] leading-relaxed text-[var(--ink-86)]">{w(f.a)}</p>
          </div>
        ))}
        <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{w("依傳統生肖與當日干支的關係整理，看的是今天的節奏，不是吉凶判決，僅供參考。")}</p>
      </section>
      {/* 10-22 进度表 86 承接地圖: 六爻 first, 擇日 next */}
      <CrossCards source="daily" locale={l as Locale} exclude={["yunshi"]} />
    </div>
  );
}

const longDay = (l: Foreign, ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(LOCALE_META[l].htmlLang, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
};
const toneOf = (t: string) => (t === "smooth" ? "!text-[var(--gold-text)]" : t === "careful" ? "!text-[var(--cinnabar)]" : "");

/** the answer card, the paragraph, the way to a cast and the list of the twelve — shared by a sign and an animal */
function ForeignDay({ l, back, title, sub, tierKey, tierName, line, yi, ji, rhythm, plain, extra, tomorrow, nav, about, aboutHead, faq, boundary, method }: {
  l: Foreign; back: { href: string; text: string }; title: string; sub: string; tierKey: string; tierName: string; line: string; yi: string; ji: string; rhythm: string; plain: string;
  extra: React.ReactNode; tomorrow: string; nav: { href: string; name: string; on: boolean }[]; about: string; aboutHead: string; faq: { q: string; a: string }[]; boundary: string; method: string;
}) {
  const P = ysPage(l);
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <JsonLd data={ld} />
      <TrackOnce event="yunshi" locale={l} method={method} />
      <p className="t-small"><Link href={back.href} className="underline underline-offset-4 !text-[var(--ink-66)]">← {back.text}</Link></p>
      <h1 className="t-d1 mt-[var(--s-3)]">{title}</h1>
      <p className="t-body mt-1 text-[var(--ink-66)]">{sub}</p>
      <section className="mt-[var(--s-5)] rounded-[2px] border border-[var(--ink-16)] px-[var(--s-4)] py-[var(--s-5)]">
        <p className={`t-sect ${toneOf(tierKey)}`}>{tierName}</p>
        <p className="t-d3 mt-[var(--s-2)]">{line}</p>
        <dl className="mt-[var(--s-4)] grid grid-cols-[minmax(5.5em,auto)_1fr] gap-x-3 gap-y-2 t-body">
          <dt className="t-sect pt-0.5">{P.todayYes}</dt><dd>{yi}</dd>
          <dt className="t-sect pt-0.5 !text-[var(--cinnabar)]">{P.todayNo}</dt><dd>{ji}</dd>
        </dl>
        {rhythm && <p className="t-small mt-[var(--s-4)] !text-[var(--ink-66)]">{rhythm}</p>}
      </section>
      <p className="t-body mt-[var(--s-5)] leading-relaxed border-l-2 border-[var(--gold)] pl-4">{plain}</p>
      {extra}
      <section className="mt-[var(--s-6)] grid gap-3">
        <p className="t-body">{P.castLead}</p>
        <p><TrackLink event="yunshi" locale={l} method="to_cast" href={`/${l}/cast?c=yunshi`} className="inline-block px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px]">{P.castBtn}</TrackLink></p>
        <p className="t-small !text-[var(--ink-66)]">{tomorrow}</p>
      </section>
      <nav className="mt-[var(--s-6)] flex flex-wrap gap-2">
        {nav.map((n) => <Link key={n.href} href={n.href} className={`px-3 py-1.5 text-center rounded-[2px] border t-body !text-[15px] ${n.on ? "border-[var(--ink)] bg-[var(--ink)] !text-[var(--paper)]" : "border-[var(--ink-16)] hover:border-[var(--ink)]"}`}>{n.name}</Link>)}
      </nav>
      <section className="mt-[var(--s-6)] border-t border-[var(--ink-16)] pt-[var(--s-6)]">
        <h2 className="t-sect">{aboutHead}</h2>
        <p className="t-body mt-[var(--s-2)] leading-relaxed text-[var(--ink-86)]">{about}</p>
        {faq.map((f) => (
          <div key={f.q} className="mt-[var(--s-5)]">
            <h3 className="t-sect">{f.q}</h3>
            <p className="t-body mt-[var(--s-2)] leading-relaxed text-[var(--ink-86)]">{f.a}</p>
          </div>
        ))}
        <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{boundary}</p>
      </section>
      <CrossCards source="daily" locale={l} exclude={["yunshi"]} />
    </div>
  );
}

function ForeignStar({ l, i }: { l: Foreign; i: number }) {
  const P = ysPage(l), S = ysStar(l), Z = ysZodiac(l);
  const ymd = todayYmd();
  const h = horoscopeFor(i, ymd, S)!, t = horoscopeFor(i, shiftDay(ymd, 1), S)!;
  const s = { ...S.signs[h.sign], name: starNameIn(l, i), dates: starDatesIn(l, i) };
  const moonSign = signName(ASTRO_SIGNS[h.moonSign]!, l);
  return (
    <ForeignDay l={l} back={{ href: `/${l}/yunshi`, text: P.back }} title={fmt(P.starTitle, { z: s.name })} sub={`${longDay(l, ymd)} · ${fmt(P.starDates, { d: s.dates })}`}
      tierKey={h.tier} tierName={Z.tiers[h.tier].name} line={h.line} yi={h.yi} ji={h.ji} rhythm={h.phaseLine} plain={h.plain}
      extra={<>
        <p className="t-small mt-[var(--s-4)] !text-[var(--ink-66)]">{fmt(P.moonLine, { s: moonSign, z: s.name, h: h.house })}</p>
        <p className="t-small mt-[var(--s-2)]"><Link href={`/${l}/xingpan`} className="underline underline-offset-4">{P.natalLink}</Link></p>
      </>}
      tomorrow={fmt(P.tomorrow, { t: Z.tiers[t.tier].name })}
      nav={STAR_SIGNS.map((x, k) => ({ href: `/${l}/yunshi/${x}`, name: starNameIn(l, k), on: x === h.sign }))}
      about={s.intro} aboutHead={fmt(P.aboutStar, { z: s.name })} faq={s.faq} boundary={P.boundary} method={`view:${h.sign}`} />
  );
}

function ForeignAnimal({ l, i }: { l: Foreign; i: number }) {
  const P = ysPage(l), Z = ysZodiac(l), N = BAZI_NAMES[l], F = bzName(l);
  const ymd = todayYmd();
  const y = yunshiFor(i, ymd, Z)!, t = yunshiFor(i, shiftDay(ymd, 1), Z)!;
  const z = N.animals[i]!, zc = Z.zodiac[y.sign];
  const relKey = y.relation as keyof typeof P.rel;
  return (
    <ForeignDay l={l} back={{ href: `/${l}/yunshi`, text: animalsOnly(l) ? P.backAnimals : P.back }} title={fmt(P.animalTitle, { z })} sub={`${longDay(l, ymd)} · ${F.gz(y.dayGz)}`}
      tierKey={y.tier} tierName={y.tierName} line={y.line} yi={y.yi} ji={y.ji} rhythm={y.rhythm} plain={y.plain}
      extra={<details className="mt-[var(--s-4)]">
        <summary className="cursor-pointer t-small !text-[var(--ink-66)]">{fmt(P.relHead, { z })}</summary>
        <p className="t-small mt-2">{fmt(P.relLine, { gz: F.gz(y.dayGz), z, b: F.branch(zc.branch), rel: P.rel[relKey] })}</p>
      </details>}
      tomorrow={fmt(P.tomorrow, { t: t.tierName })}
      nav={SIGNS.map((x, k) => ({ href: `/${l}/yunshi/${x}`, name: N.animals[k]!, on: x === y.sign }))}
      about={zc.intro} aboutHead={fmt(P.aboutAnimal, { z })} faq={zc.faq} boundary={P.boundaryAnimals} method={`view:${y.sign}`} />
  );
}
