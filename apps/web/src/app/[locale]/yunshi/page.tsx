import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import YunshiPicker from "@/components/mingli/YunshiPicker";
import { canSee, featureState } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES, todayYmd } from "@/lib/mingli/calendar/page-bits";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { C, lichunTable, SIGNS, yunshiFor } from "@/lib/mingli/yunshi/zodiac";
import { brandName } from "@/lib/brand";
import ProductPage from "@/components/product/ProductPage";
import CrossCards from "@/components/CrossCards";
import type { Locale } from "@/lib/locales";
import { currentCustomer } from "@/lib/auth";
import { myDay } from "@/lib/my-chart";
import MyTodayCard from "@/components/mingli/MyTodayCard";
import { isLocale, pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { fmt, isForeign, type Foreign } from "@/lib/l10n/core";
import { animalsOnly, ysPage, ysStar, ysZodiac } from "@/lib/mingli/yunshi/foreign-text";
import { horoscopeFor, STAR_SIGNS, starNameIn } from "@/lib/mingli/yunshi/horoscope";
import { BAZI_NAMES, bzName } from "@/lib/mingli/bazi/names";
import { LOCALE_META } from "@/lib/locales";

export const dynamic = "force-dynamic";

/** 10-18 进度表 73 每日運勢（生肖版）: today for all twelve signs, and the reader picks theirs */
const TITLE = "今日生肖運勢｜十二生肖每日運勢";
const DESC = "選你的生肖，看今天的節奏：今天適合怎麼安排、哪件事先別急。十二生肖每天更新，免費、不用註冊。";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ⑤: the other languages (signs and animals; Korean the animals only)
  if (isLocale(locale) && isForeign(locale) && serviceOpenIn("yunshi", locale)) {
    const P = ysPage(locale), a = animalsOnly(locale);
    return { title: { absolute: `${a ? P.metaTitleAnimals : P.metaTitle} — ${brandName(locale)}` }, description: a ? P.metaDescAnimals : P.metaDesc, alternates: pageAlternates(locale, "/yunshi", serviceLocales("yunshi")) };
  }
  const l = locale as HlLocale;
  return { title: { absolute: `${loc(TITLE, l)} — ${brandName(l)}` }, description: loc(DESC, l), alternates: { canonical: `/${locale}/yunshi`, languages: { "zh-Hant": "/zh-hant/yunshi", "zh-CN": "/zh/yunshi", "x-default": "/zh-hant/yunshi" } } };
}

export default async function YunshiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (isLocale(locale) && isForeign(locale) && serviceOpenIn("yunshi", locale)) {
    if (!(await canSee("yunshi"))) notFound();
    return <ForeignYunshi l={locale} />;
  }
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("yunshi"))) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const ymd = todayYmd();
  // 10-22 进度表 92: 「你的今天」 for a member (by their own 八字); a line on it for everyone else
  const me = await currentCustomer().catch(() => null);
  const mine = await myDay(me?.customerId, ymd).catch(() => ({ state: "teaser" as const }));
  const all = SIGNS.map((_, i) => yunshiFor(i, ymd)!);
  const rows = all.map((y) => ({ slug: y.sign, name: w(y.name), tier: w(y.tierName), tierKey: y.tier, line: w(y.line) }));
  const [, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: C.faq.map((f) => ({ "@type": "Question", name: w(f.q), acceptedAnswer: { "@type": "Answer", text: w(f.a) } })) };
  // 10-22 进度表 87 (设计稿第 5 節): 每日運勢 on the product template; 进度表 86 承接地圖: 六爻 first, 擇日 next
  return (
    <ProductPage
      locale={l as Locale}
      preview={featureState("yunshi") === "preview"}
      title={w("今日生肖運勢")}
      lead={w(`${m} 月 ${d} 日（${all[0]!.dayGz}日）· 選你的生肖，看今天適合怎麼安排。`)}
      input={<>
        {mine.state !== "teaser" && <MyTodayCard locale={l} day={mine} />}
        <YunshiPicker locale={l} rows={rows} lichun={lichunTable()} ui={{
          pick: w("你屬什麼？"), mine: w("你的生肖"), unsure: w("不確定自己屬什麼？用生日查"), birth: w("生日"), result: w("你屬{z}，看今天 →"), open: "", y: w("年"), m: w("月"), d: w("日"),
        }} />
        {mine.state === "teaser" && <MyTodayCard locale={l} day={mine} />}
      </>}
      fit={{ yes: [w("今天大概怎麼安排"), w("哪件事先別急")], no: [w("一件具體的事會不會成——起一卦問那件事"), w("吉凶判決")] }}
      how={[w("選你的生肖；不確定就用生日查"), w("看今天的節奏和一句提醒"), w("每天更新")]}
      free={w("十二生肖每天都免費看，不用註冊。")}
      paid={w("會員：按你的八字算的「你的今天」——今天是你的什麼日、和你的日柱沖不沖，也寫進每天早上的信。")}
      boundary={w("依傳統生肖與當日干支的關係整理，看的是今天的節奏，不是吉凶判決，僅供參考。")}
      faq={C.faq.map((f) => ({ q: w(f.q), a: w(f.a) }))}
      promo={<CrossCards source="daily" locale={l as Locale} exclude={["yunshi"]} />}
    >
      <JsonLd data={faq} />
      <TrackOnce event="yunshi" locale={l} method="view:all" />
      {/* 10-23 进度表 106 ②: how often a member's 「你的今天」 is shown (and a teaser in its place) */}
      <TrackOnce event="yunshi" locale={l} method={mine.state === "show" ? "mine:shown" : mine.state === "need" ? "mine:need" : "mine:teaser"} />
    </ProductPage>
  );
}

/** today's date in the page's language, with its weekday */
const longDay = (l: Foreign, ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(LOCALE_META[l].htmlLang, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
};

/** 10-30 进度表 128 ⑤: the index in another language — the twelve signs first (not for Korean), then the twelve animals */
function ForeignYunshi({ l }: { l: Foreign }) {
  const P = ysPage(l), Z = ysZodiac(l), S = ysStar(l), N = BAZI_NAMES[l], F = bzName(l);
  const a = animalsOnly(l);
  const ymd = todayYmd();
  const animals = SIGNS.map((_, i) => yunshiFor(i, ymd, Z)!);
  const aRows = animals.map((y, i) => ({ slug: y.sign, name: N.animals[i]!, tier: Z.tiers[y.tier].name, tierKey: y.tier, line: y.line }));
  const sRows = STAR_SIGNS.map((s, i) => { const h = horoscopeFor(i, ymd, S)!; return { slug: s, name: starNameIn(l, i), tier: Z.tiers[h.tier].name, tierKey: h.tier, line: h.line }; });
  const gz = F.gz(animals[0]!.dayGz);
  const date = longDay(l, ymd);
  const faqs = [...(a ? [] : S.faq), ...Z.faq];
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  const ui = (kind: "star" | "animal") => kind === "star"
    ? { pick: P.starPick, mine: P.starMine, unsure: P.starUnsure, birth: P.birth, result: P.starResult, open: "", y: P.y, m: P.m, d: P.d }
    : { pick: P.pick, mine: P.mine, unsure: P.unsure, birth: P.birth, result: P.result, open: "", y: P.y, m: P.m, d: P.d };
  return (
    <ProductPage
      locale={l}
      preview={featureState("yunshi") === "preview"}
      title={a ? P.titleAnimals : P.title}
      lead={a ? fmt(P.leadAnimals, { date, gz }) : fmt(P.lead, { date })}
      input={<>
        {!a && <>
          <h2 className="t-sect mb-[var(--s-3)]">{P.starHead}</h2>
          <YunshiPicker locale={l} rows={sRows} lichun={{}} kind="star" wide ui={ui("star")} />
          <h2 className="t-sect mt-[var(--s-6)] mb-1">{P.zodiacHead}</h2>
          <p className="t-small mb-[var(--s-3)] !text-[var(--ink-66)]">{fmt(P.zodiacNote, { gz })}</p>
        </>}
        <YunshiPicker locale={l} rows={aRows} lichun={lichunTable()} wide ui={ui("animal")} />
      </>}
      fit={{ yes: P.fitYes, no: P.fitNo }}
      how={a ? P.howAnimals : P.how}
      free={P.free}
      boundary={a ? P.boundaryAnimals : P.boundary}
      faq={faqs}
      promo={<CrossCards source="daily" locale={l} exclude={["yunshi"]} />}
    >
      <JsonLd data={faq} />
      <TrackOnce event="yunshi" locale={l} method="view:all" />
    </ProductPage>
  );
}
