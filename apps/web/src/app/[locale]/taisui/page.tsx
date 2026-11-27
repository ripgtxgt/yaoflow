import type { Metadata } from "next";
import Link from "next/link";
import CrossCards from "@/components/CrossCards";
import type { Locale } from "@/lib/locales";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import { canSee } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES } from "@/lib/mingli/calendar/page-bits";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { GUIDE, KIND_WORDS, yearGanzhi, yearTable, ZODIACS, type TaisuiKind } from "@/lib/mingli/taisui";
import { brandName } from "@/lib/brand";
import { pageAlternates } from "@/lib/locales";
import { serviceLocales } from "@/lib/services";
import YearLookup from "@/components/mingli/YearLookup";
import { JA, KO, bornYears, koAnimalOf, samjaeLookup, samjaeTable, yakuLookup, yakuTable } from "@/lib/mingli/taisui-local";

export const dynamic = "force-dynamic";
/** 10-29 进度表 125 第一期: 2027 犯太歲查詢 — the year's table and the custom of 安太歲 (lib/mingli/taisui.ts) */
const YEAR = 2027;
const KINDS: TaisuiKind[] = ["值", "沖", "刑", "害", "破"];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ⑤: 厄年 for Japanese readers, 삼재 for Korean readers
  if (locale === "ja" || locale === "ko") {
    const T = locale === "ja" ? JA : KO;
    return { title: { absolute: `${T.metaTitle(YEAR)} — ${brandName(locale)}` }, description: T.metaDesc(YEAR), alternates: pageAlternates(locale, "/taisui", serviceLocales("taisui")) };
  }
  const l = locale as HlLocale;
  const t = yearTable(YEAR);
  const who = KINDS.flatMap((k) => t[k].map((z) => z.animal)).filter((x, i, a) => a.indexOf(x) === i).join("、");
  return {
    title: { absolute: `${loc(`${YEAR} 犯太歲生肖查詢｜${yearGanzhi(YEAR)}年 ${who}，安太歲怎麼安`, l)} — ${brandName(l)}` },
    description: loc(`${YEAR} 年（${yearGanzhi(YEAR)}年）值太歲、沖太歲、刑太歲、害太歲、破太歲的生肖一覽，以及依習俗安太歲的時間、地點、費用與在家怎麼拜。`, l),
    alternates: { canonical: `/${locale}/taisui`, languages: { "zh-Hant": "/zh-hant/taisui", "zh-CN": "/zh/taisui", "x-default": "/zh-hant/taisui" } },
  };
}

export default async function TaisuiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale === "ja" || locale === "ko") {
    if (!(await canSee("taisui"))) notFound();
    return locale === "ja" ? <JaYaku /> : <KoSamjae />;
  }
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("taisui"))) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const t = yearTable(YEAR), prev = yearTable(YEAR - 1);
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: GUIDE.map((g) => ({ "@type": "Question", name: w(g.h), acceptedAnswer: { "@type": "Answer", text: w(g.p) } })) };
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <JsonLd data={faq} />
      <TrackOnce event="taisui" locale={l} method="view" />
      <h1 className="t-d1">{w(`${YEAR} 犯太歲查詢`)}</h1>
      <p className="t-body mt-[var(--s-4)] leading-relaxed">{w(`${YEAR} 年是${yearGanzhi(YEAR)}年，生肖年從立春開始算。依民間通書，和這一年的地支同支、相沖、相刑、相害、相破的生肖，俗稱「犯太歲」。下面是一覽，點生肖看那一年要留意什麼、依習俗怎麼安太歲。`)}</p>
      <section className="mt-[var(--s-5)]">
        <ul className="divide-y divide-dotted divide-[var(--ink-16)]">
          {KINDS.map((k) => (
            <li key={k} className="py-3">
              <p className="t-sect">{w(KIND_WORDS[k].name)}：{t[k].length ? t[k].map((z, i) => <span key={z.slug}>{i ? "、" : ""}<Link href={`/${l}/taisui/${z.slug}`} className="underline underline-offset-4">{w(`屬${z.animal}`)}</Link></span>) : w("無")}</p>
              <p className="t-small mt-1 !text-[var(--ink-66)] leading-relaxed">{w(KIND_WORDS[k].plain)}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-[var(--s-5)]">
        <h2 className="t-sect">{w("十二生肖")}</h2>
        <p className="mt-[var(--s-2)] flex flex-wrap gap-2">{ZODIACS.map((z) => <Link key={z.slug} href={`/${l}/taisui/${z.slug}`} className="px-3 py-1.5 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] t-body !text-[15px]">{w(`屬${z.animal}`)}</Link>)}</p>
        <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{w(`對照：${YEAR - 1} 年（${yearGanzhi(YEAR - 1)}年）值太歲屬${prev.值.map((z) => z.animal).join("、")}，沖太歲屬${prev.沖.map((z) => z.animal).join("、")}。`)}</p>
      </section>
      <section className="mt-[var(--s-6)]">
        <h2 className="t-d3">{w("依習俗，安太歲怎麼安")}</h2>
        {GUIDE.map((g) => (
          <div key={g.h} className="mt-[var(--s-4)]">
            <h3 className="t-sect">{w(g.h)}</h3>
            <p className="t-body mt-[var(--s-2)] leading-relaxed">{w(g.p)}</p>
          </div>
        ))}
      </section>
      <section className="mt-[var(--s-6)] grid gap-3">
        <p className="t-body">{w("想看這一年自己哪幾個月比較順、哪幾個月要放慢？")}</p>
        <p><Link href={`/${l}/nianshu`} className="inline-block px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px]">{w(`看 ${YEAR} 年書 →`)}</Link></p>
        <p className="t-small"><Link href={`/${l}/cast`} className="underline underline-offset-4 !text-[var(--ink-66)]">{w("有一件放不下的事，起一卦看哪幾天有動靜 →")}</Link></p>
      </section>
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{w("依民間通書與習俗整理，各地、各宮廟做法不同；這些是習俗與參考，不代表一定會發生什麼。")}</p>
      {/* 10-29 (Neil: 产品之间的互相引导): lib/cross-map.ts — the page points at the 年書 itself */}
      <CrossCards source="taisui" locale={l as Locale} exclude={["taisui"]} skipMain />
    </article>
  );
}

/** the shared lower half: the sections, the FAQ, the way to the year book and a cast */
function LocalTail({ l, T }: { l: Locale; T: typeof JA | typeof KO }) {
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: T.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <>
      <JsonLd data={faq} />
      {T.sections.map((g) => (
        <section key={g.h} className="mt-[var(--s-5)]">
          <h2 className="t-sect">{g.h}</h2>
          <p className="t-body mt-[var(--s-2)] leading-relaxed">{g.p}</p>
        </section>
      ))}
      <section className="mt-[var(--s-6)]">
        {T.faq.map((f) => (
          <div key={f.q} className="mt-[var(--s-4)]">
            <h3 className="t-sect">{f.q}</h3>
            <p className="t-body mt-[var(--s-2)] leading-relaxed">{f.a}</p>
          </div>
        ))}
      </section>
      <section className="mt-[var(--s-6)] grid gap-3">
        <p className="t-body">{T.bookLead}</p>
        <p><Link href={`/${l}/nianshu`} className="inline-block px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px]">{T.bookBtn(YEAR)}</Link></p>
        <p className="t-small"><Link href={`/${l}/cast`} className="underline underline-offset-4 !text-[var(--ink-66)]">{T.castLink}</Link></p>
      </section>
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{T.boundary}</p>
      <CrossCards source="taisui" locale={l} exclude={["taisui"]} skipMain />
    </>
  );
}

/** 10-30 进度表 128 ⑤: 厄年早見表 — the year's 前厄・本厄・後厄 by gender, a lookup by birth year */
function JaYaku() {
  const t = yakuTable(YEAR);
  const col = (g: "male" | "female") => (
    <div>
      <h3 className="t-sect">{g === "male" ? JA.male : JA.female}</h3>
      <ul className="mt-[var(--s-2)] divide-y divide-dotted divide-[var(--ink-16)]">
        {t[g].map((r) => (
          <li key={r.age} className={`py-1.5 flex gap-3 t-body !text-[15px] ${r.kind === "本厄" ? "" : "!text-[var(--ink-66)]"}`}>
            <span className={`w-10 shrink-0 ${r.kind === "本厄" ? "!text-[var(--cinnabar)]" : ""}`}>{r.kind}</span>
            <span className="w-12 shrink-0">{JA.ageOf(r.age)}</span>
            <span>{JA.bornIn(r.born)}{r.big && r.kind === "本厄" ? <span className="t-label ml-2 !text-[var(--gold-text)]">{JA.big}</span> : null}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="taisui" locale="ja" method="view" />
      <h1 className="t-d1">{JA.title(YEAR)}</h1>
      <p className="t-body mt-[var(--s-4)] leading-relaxed">{JA.lead(YEAR)}</p>
      <section className="mt-[var(--s-5)] grid gap-6 sm:grid-cols-2">{col("male")}{col("female")}</section>
      <div className="mt-[var(--s-5)]">
        <YearLookup locale="ja" head={JA.lookupHead} yearLabel={JA.lookupYear} genderLabel={JA.lookupGender} genders={[["male", JA.male], ["female", JA.female]]}
          lines={yakuLookup(YEAR)} note={JA.lookupNote} initial={1986} />
      </div>
      <LocalTail l="ja" T={JA} />
    </article>
  );
}

/** 10-30 进度表 128 ⑤: 삼재띠 — the year's 띠 in 삼재, the four groups' turns, the 띠 by birth year, a lookup */
function KoSamjae() {
  const rows = samjaeTable(YEAR);
  const now = rows.find((r) => r.now);
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="taisui" locale="ko" method="view" />
      <h1 className="t-d1">{KO.title(YEAR)}</h1>
      <p className="t-body mt-[var(--s-4)] leading-relaxed">{KO.lead(YEAR)}</p>
      {now && (
        <section className="mt-[var(--s-5)] rounded-[2px] border border-[var(--ink-16)] px-[var(--s-4)] py-[var(--s-4)]">
          <h2 className="t-sect">{KO.nowHead(YEAR)}</h2>
          <p className="t-d3 mt-[var(--s-2)]">{KO.nowLine(now.animals, now.now!)}</p>
        </section>
      )}
      <section className="mt-[var(--s-5)]">
        <h2 className="t-sect">{KO.tableHead}</h2>
        <ul className="mt-[var(--s-2)] divide-y divide-dotted divide-[var(--ink-16)]">
          {rows.map((r) => (
            <li key={r.animals.join()} className="py-2 t-body !text-[15px]">{KO.tableRow(r.animals, r.from, r.to)}{r.now ? <span className="t-label ml-2 !text-[var(--cinnabar)]">{KO.nowTag(r.now)}</span> : null}</li>
          ))}
        </ul>
      </section>
      <section className="mt-[var(--s-5)]">
        <h2 className="t-sect">{KO.bornHead}</h2>
        <ul className="mt-[var(--s-2)] grid gap-1 sm:grid-cols-2 t-small">
          {[..."子丑寅卯辰巳午未申酉戌亥"].map((b) => <li key={b}>{koAnimalOf(b)}띠: {bornYears(b, YEAR).filter((y) => y >= 1950).join(", ")}</li>)}
        </ul>
      </section>
      <div className="mt-[var(--s-5)]">
        <YearLookup locale="ko" head={KO.lookupHead} yearLabel={KO.lookupYear} lines={samjaeLookup(YEAR)} note={KO.lookupNote} initial={1987} />
      </div>
      <LocalTail l="ko" T={KO} />
    </article>
  );
}
