import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import HuangliDayView from "@/components/mingli/HuangliDayView";
import { DateJump } from "@/components/mingli/HuangliBits";
import { canSee, featureState } from "@/lib/features";
import { hkReader } from "@/lib/register";
import { huangliDay, parseYmd, type HlLocale } from "@/lib/mingli/calendar/day";
import { loc, N } from "@/lib/mingli/calendar/content";
import { HL_LOCALES, shiftDay, todayYmd } from "@/lib/mingli/calendar/page-bits";
import { brandName } from "@/lib/brand";
import ProductPage from "@/components/product/ProductPage";
import CrossCards from "@/components/CrossCards";
import type { Locale } from "@/lib/locales";
import { currentCustomer } from "@/lib/auth";
import { myDay } from "@/lib/my-chart";
import MyTodayCard from "@/components/mingli/MyTodayCard";
import { productOg } from "@/lib/og-product";
import { JaKoyomiToday, KoAlmanacToday, JaKoyomiDay, KoAlmanacDay, JaKoyomiMonth, KoAlmanacMonth, eastMeta } from "@/components/mingli/EastAlmanac";
import { pageAlternates } from "@/lib/locales";
import { WestAlmanacToday, WestAlmanacDay, WestAlmanacMonth, WestZeri, westHuangliMeta, westZeriMeta } from "@/components/mingli/WestAlmanac";
import { WEST } from "@/lib/mingli/calendar/almanac-west";
import type { Foreign } from "@/lib/l10n/core";
import { serviceLocales, serviceOpenIn } from "@/lib/services";

export const dynamic = "force-dynamic";

/** 10-17 进度表 69 黃曆: today's almanac — the product page */
const TITLE = "今日黃曆｜農民曆宜忌、沖煞、吉時查詢";
const DESC = "今天的黃曆：農曆日期、干支、節氣、宜忌、沖煞、彭祖百忌、吉神凶煞與十二時辰，每個宜忌詞點開有白話說明；也能查任一天和整個月。免費、不用註冊。";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ⑤: 今日の暦 (ja), 오늘의 음력·일진 (ko)
  if ((locale === "ja" || locale === "ko") && serviceOpenIn("huangli", locale)) {
    const m = eastMeta(locale, null)!;
    return { title: { absolute: `${m.title} — ${brandName(locale)}` }, description: m.description, alternates: pageAlternates(locale, "/huangli", serviceLocales("huangli")) };
  }
  // 10-30 进度表 128 ⑤: the Chinese almanac in the Western languages
  if (WEST.has(locale) && serviceOpenIn("huangli", locale as Foreign)) {
    const m = westHuangliMeta(locale as Foreign, null)!;
    return { title: { absolute: `${m.title} — ${brandName(locale as Foreign)}` }, description: m.description, alternates: pageAlternates(locale as Foreign, "/huangli", serviceLocales("huangli")) };
  }
  const l = locale as HlLocale;
  return {
    title: { absolute: `${loc(TITLE, l)} — ${brandName(l)}` }, description: loc(DESC, l),
    alternates: { canonical: `/${locale}/huangli`, languages: { "zh-Hant": "/zh-hant/huangli", "zh-CN": "/zh/huangli", "x-default": "/zh-hant/huangli" } },
    ...productOg(locale, loc(TITLE, l), loc(DESC, l), null),
  };
}

export default async function HuangliToday({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if ((locale === "ja" || locale === "ko") && serviceOpenIn("huangli", locale)) {
    if (!(await canSee("huangli"))) notFound();
    return locale === "ja" ? <JaKoyomiToday /> : <KoAlmanacToday />;
  }
  if (WEST.has(locale) && serviceOpenIn("huangli", locale as Foreign)) {
    if (!(await canSee("huangli"))) notFound();
    return <WestAlmanacToday l={locale as Foreign} />;
  }
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("huangli"))) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  let hk = false;
  try { hk = l === "zh-hant" && hkReader(await headers()); } catch { /* */ }
  const ymd = todayYmd();
  const p = parseYmd(ymd)!;
  const d = huangliDay(p.y, p.m, p.d);
  // 10-22 进度表 92: 「今天對你」 — today's 日柱 against a member's own (one line); a line on it for everyone else
  const me = await currentCustomer().catch(() => null);
  const mine = await myDay(me?.customerId, ymd).catch(() => ({ state: "teaser" as const }));
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: N.faq.map((f) => ({ "@type": "Question", name: w(f.q), acceptedAnswer: { "@type": "Answer", text: w(f.a) } })) };
  // 10-22 进度表 87 (设计稿第 5 節): 黃曆 on the product template; 进度表 86 承接地圖: 六爻 first, 擇日 next
  return (
    <ProductPage
      locale={l as Locale}
      preview={featureState("huangli") === "preview"}
      title={w(hk ? "今日黃曆／通勝" : "今日黃曆")}
      lead={w("今天宜什麼、忌什麼、沖哪個生肖；往前往後翻、查別天都可以。")}
      input={
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 t-small">
          <Link href={`/${l}/huangli/${shiftDay(ymd, -1)}`} className="underline underline-offset-4">← {w("前一天")}</Link>
          <Link href={`/${l}/huangli/${shiftDay(ymd, 1)}`} className="underline underline-offset-4">{w("後一天")} →</Link>
          <Link href={`/${l}/huangli/${ymd.slice(0, 7)}`} className="underline underline-offset-4">{w("這個月")}</Link>
          <DateJump locale={l} value={ymd} label={w("查別天")} />
        </nav>
      }
      fit={{ yes: [w("今天宜什麼、忌什麼"), w("今天沖哪個生肖、煞哪個方位"), w("農曆、干支與節氣")], no: [w("一件事會不會成、哪幾天有動靜——起一卦"), w("替一件事挑日子——去擇日")] }}
      how={[w("打開就是今天"), w("往前、往後翻，或查任何一天"), w("要辦事，去擇日挑一天，可以設提醒")]}
      free={w("全部免費，不用註冊。")}
      paid={w("會員：多一行「今天對你」——今天的日柱和你的日柱沖不沖、合不合，也寫進每天早上的信。")}
      boundary={w("依民間通書推算，各家做法不同，只供參考；大事可再請教熟悉的老師。")}
      faq={N.faq.map((f) => ({ q: w(f.q), a: w(f.a) }))}
      promo={<CrossCards source="daily" locale={l as Locale} exclude={["huangli"]} />}
    >
      <JsonLd data={faq} />
      <TrackOnce event="huangli" locale={l} method="view:today" />
      {mine.state !== "teaser" && <MyTodayCard locale={l} day={mine} mode="almanac" />}
      <div className="mt-[var(--s-5)]"><HuangliDayView d={d} locale={l} hk={hk} /></div>
      {/* 10-29 (Neil: 产品之间的互相引导): the 擇日 pages by use, one tap from the day */}
      <p className="t-small mt-[var(--s-3)] flex flex-wrap gap-x-4 gap-y-1 !text-[var(--ink-66)]" data-heat="huangli-to-zeri-use">
        <span>{w("要辦事，按用途挑日子：")}</span>
        {(["wedding", "move", "opening"] as const).map((k) => <Link key={k} href={`/${l}/zeri/${k}?c=huangli`} className="underline underline-offset-4 hover:!text-[var(--ink)]">{w(k === "wedding" ? "結婚好日子" : k === "move" ? "搬家吉日" : "開市吉日")}</Link>)}
      </p>
      {mine.state === "teaser" && <MyTodayCard locale={l} day={mine} mode="almanac" />}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect">{w("黃曆怎麼看")}</h2>
        <p className="t-body mt-[var(--s-2)] leading-relaxed text-[var(--ink-86)]">{w(N.howTo)}</p>
      </section>
    </ProductPage>
  );
}
