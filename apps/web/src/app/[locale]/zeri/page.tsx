import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import FeatureLink from "@/components/FeatureLink";
import TrackOnce from "@/components/TrackOnce";
import TrackLink from "@/components/TrackLink";
import ZeriPanel from "@/components/mingli/ZeriPanel";
import { canSee, featureState } from "@/lib/features";
import { currentCustomer } from "@/lib/auth";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES, todayYmd } from "@/lib/mingli/calendar/page-bits";
import { MATTER_LIST, matterBySlug, zeriDays } from "@/lib/mingli/calendar/zeri";
import { zeriUi } from "@/lib/mingli/calendar/zeri-ui";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { brandName } from "@/lib/brand";
import ProductPage from "@/components/product/ProductPage";
import CrossCards from "@/components/CrossCards";
import type { Locale } from "@/lib/locales";
import { can, rightsFor } from "@/lib/entitlements";
import { myChart } from "@/lib/my-chart";
import { clashOf } from "@/lib/mingli/bazi/today";
import type { ZeriMine } from "@/components/mingli/ZeriPanel";
import { productOg } from "@/lib/og-product";
import { JaZeri, KoZeri, zeriMeta } from "@/components/mingli/EastAlmanac";
import { pageAlternates } from "@/lib/locales";
import { WestAlmanacToday, WestAlmanacDay, WestAlmanacMonth, WestZeri, westHuangliMeta, westZeriMeta } from "@/components/mingli/WestAlmanac";
import { WEST } from "@/lib/mingli/calendar/almanac-west";
import type { Foreign } from "@/lib/l10n/core";
import { serviceLocales, serviceOpenIn } from "@/lib/services";

export const dynamic = "force-dynamic";

/** 10-22 进度表 92: the matters read against both people's 日柱 when the partner's birth is on file */
const PAIR_MATTERS = new Set(["jiehun", "dinghun", "tiqin"]);

/** 10-17 进度表 70 擇日: pick a matter → the days ahead that suit it (the product page and its result, one page) */
const TITLE = "線上擇日｜搬家、入厝、開市、結婚吉日查詢";
const DESC = "選一件事：搬家、入厝、開市、結婚、訂婚、動土、安床…列出未來 60 天通書上適合的日子，可依生肖避開沖日、避開農曆七月。免費。";
const FAQ = [
  { q: "擇日要看什麼？", a: "先看黃曆上這天有沒有寫宜做這件事、有沒有寫忌，再看這天沖哪個生肖。家裡要辦事的人屬的生肖被沖到，多半會換一天。" },
  { q: "查到的日子都可以用嗎？", a: "列出的是通書上寫明適合的日子。結婚、動土、安葬這類大事，很多家庭還會請熟悉的老師看時辰與細節，可以把這份清單帶去參考。" },
  { q: "為什麼要選生肖？", a: "通書上每天都會沖一個生肖。選了生肖，就會去掉沖到你的那幾天；家裡有好幾個人時，以主事的人為主。" },
  { q: "農曆七月可以搬家、結婚嗎？", a: "台灣民間很多人會避開農曆七月辦喜事和搬家，但這是習俗，不是硬性規定。想避開的話，勾選「避開農曆七月」就好。" },
  { q: "沒有合適的日子怎麼辦？", a: "把範圍放寬到 90 天，或換一件相近的事來查；真的趕時間，可以挑沒有寫忌這件事的日子，或請教熟悉的老師。" },
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ⑤: 吉日カレンダー (ja), 손 없는 날 (ko)
  if ((locale === "ja" || locale === "ko") && serviceOpenIn("zeri", locale)) {
    const m = zeriMeta(locale, null);
    return { title: { absolute: `${m.title} — ${brandName(locale)}` }, description: m.description, alternates: pageAlternates(locale, "/zeri", serviceLocales("zeri")) };
  }
  if (WEST.has(locale) && serviceOpenIn("zeri", locale as Foreign)) {
    const m = westZeriMeta(locale as Foreign, null);
    return { title: { absolute: `${m.title} — ${brandName(locale as Foreign)}` }, description: m.description, alternates: pageAlternates(locale as Foreign, "/zeri", serviceLocales("zeri")) };
  }
  const l = locale as HlLocale;
  return { title: { absolute: `${loc(TITLE, l)} — ${brandName(l)}` }, description: loc(DESC, l), alternates: { canonical: `/${locale}/zeri`, languages: { "zh-Hant": "/zh-hant/zeri", "zh-CN": "/zh/zeri", "x-default": "/zh-hant/zeri" } }, ...productOg(locale, loc(TITLE, l), loc(DESC, l), null) };
}

export default async function ZeriPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ do?: string }> }) {
  const { locale } = await params;
  if ((locale === "ja" || locale === "ko") && serviceOpenIn("zeri", locale)) {
    if (!(await canSee("zeri"))) notFound();
    return locale === "ja" ? <JaZeri purpose={null} /> : <KoZeri />;
  }
  if (WEST.has(locale) && serviceOpenIn("zeri", locale as Foreign)) {
    if (!(await canSee("zeri"))) notFound();
    return <WestZeri l={locale as Foreign} purpose={null} />;
  }
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("zeri"))) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const { do: slug } = await searchParams;
  const m = slug ? matterBySlug(slug) : null;
  const from = todayYmd();
  // 10-18: signed in → the reminder goes to the account's address, shown masked (ab***@gmail.com)
  const me = m ? await currentCustomer().catch(() => null) : null;
  const account = me ? me.email.replace(/^(.{1,2})[^@]*(@.*)$/, "$1***$2") : null;
  // 10-22 进度表 92: a member sees the whole year, and the days that 沖／刑 their own 日柱 (with the partner's for 結婚,
  // 訂婚, 提親) are left out — only which days, never the chart, goes to the page
  const member = !!me && can(await rightsFor(me.customerId).catch(() => rightsFor(null)), "daily_personal");
  const res = m ? zeriDays(m, from, member ? 366 : 90, l) : null;
  let mine: ZeriMine = null;
  if (m && res && member && me) {
    const self = myChart(me.customerId, "self");
    const partner = PAIR_MATTERS.has(m.slug) ? myChart(me.customerId, "partner") : null;
    if (!self) mine = { need: true };
    else {
      const out: Record<string, string> = {};
      for (const d of res.days) {
        const a = clashOf(d.gz, self.dayBranch).length > 0, b = !!partner && clashOf(d.gz, partner.dayBranch).length > 0;
        if (a || b) out[d.ymd] = a && b ? w("你和對方") : a ? w("你") : w("對方");
      }
      mine = { out, pair: !!partner };
    }
  }
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: w(f.q), acceptedAnswer: { "@type": "Answer", text: w(f.a) } })) };
  // 10-22 进度表 87 (设计稿第 5 節): 擇日 on the product template — the matter chips are the input, the days the result;
  // the result already carries its 承接 (起一卦 with the matter, 黃曆); without one, 进度表 86 承接地圖 (六爻, 黃曆)
  return (
    <ProductPage
      locale={l as Locale}
      preview={featureState("zeri") === "preview"}
      title={w("擇日")}
      lead={w("想做什麼事？選一件，列出接下來通書上適合的日子。")}
      input={<>
      <ul className="flex flex-wrap gap-2">
        {MATTER_LIST.map((x) => (
          <li key={x.slug}>
            <Link href={`/${l}/zeri?do=${x.slug}`} scroll={false} className={`inline-block px-3 py-1.5 rounded-[2px] border t-body !text-[15px] ${m?.slug === x.slug ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink-16)] hover:border-[var(--ink)]"}`}>{w(x.tw)}</Link>
          </li>
        ))}
      </ul>
      {/* 10-29 进度表 123: the three uses readers search by name, three months at a time */}
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{w("按用途看接下來三個月：")}<Link href={`/${l}/zeri/wedding`} className="underline underline-offset-4">{w("結婚好日子")}</Link>{" · "}<Link href={`/${l}/zeri/move`} className="underline underline-offset-4">{w("搬家吉日")}</Link>{" · "}<Link href={`/${l}/zeri/opening`} className="underline underline-offset-4">{w("開市吉日")}</Link></p>
      </>}
      fit={{ yes: [w("搬家、入宅、開市、結婚、動土這類要挑一天動手的事"), w("避開沖你生肖的日子")], no: [w("這件事會不會成、順不順——起一卦問"), w("婚嫁、動土、安葬等大事的個人化擇日——可再請教熟悉的老師")] }}
      how={[w("選一件想做的事"), w("看接下來 90 天通書上適合的日子，可以排除沖你生肖的"), w("挑一天設提醒：前一天寄信；那天過了三天，再問你辦得順不順")]}
      free={w("查 60／90 天內的吉日、依生肖避開沖日、設提醒，全部免費。")}
      paid={w("會員：看一整年，並按你的八字（結婚、訂婚、提親可加上對方的）再篩掉沖、刑日柱的日子。")}
      boundary={w("依民間通書宜忌推算，各家擇日做法不同；婚嫁、動土、安葬等大事可再請教熟悉的老師。")}
      faq={FAQ.map((f) => ({ q: w(f.q), a: w(f.a) }))}
      promo={m && res ? undefined : <CrossCards source="zeri" locale={l as Locale} exclude={["zeri"]} />}
    >
      <JsonLd data={faq} />
      <TrackOnce event="zeri" locale={l} method={m ? `view:${m.slug}` : "view"} />
      {m && res && (
        <section className="mt-[var(--s-5)]">
          <ZeriPanel locale={l} slug={m.slug} matter={w(m.tw)} from={from} days={res.days} excluded={res.excluded} ui={zeriUi(l === "zh")} account={account} member={member} chartCut={mine} />
          <div className="mt-[var(--s-5)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-4)]">
            <h3 className="t-sect mb-[var(--s-2)] !text-[var(--gold-text)]">{w("事前提醒")}</h3>
            <ul className="t-body list-disc pl-5 space-y-1">{m.tips.map((t) => <li key={t}>{w(t)}</li>)}</ul>
          </div>
          <div className="mt-[var(--s-5)] grid gap-3">
            <p className="t-body">{w("這件事你還想知道會順不順、哪幾天有動靜嗎？")}</p>
            <p><TrackLink event="zeri" locale={l} method="to_cast" href={`/${l}/cast?${new URLSearchParams({ q: w(`${m.tw}這件事順不順？`), c: "zeri" })}`} className="inline-block px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px]">{w("起一卦看這件事 →")}</TrackLink></p>
            <p className="t-small"><Link href={`/${l}/zeri/${m.slug}`} className="underline underline-offset-4 !text-[var(--ink-66)]">{w(`${m.tw}怎麼挑日子 →`)}</Link></p>
            <FeatureLink name="huangli" from="zeri" locale={l} href={`/${l}/huangli`} text={w("看今天的黃曆 →")} />
          </div>
        </section>
      )}
    </ProductPage>
  );
}
