import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { currentCustomer } from "@/lib/auth";
import { BID_COOKIE } from "@/lib/browsers";
import { homeDay } from "@/lib/clock";
import { hkReader } from "@/lib/register";
import { toHans } from "@/lib/hant";
import { LISTED_TEMPLES, QIAN_SETS } from "@/lib/qian-meta";
import { accessOf, activeCard, adoptBrowser, drawnOn, lotToHans, lotView, monthDraws, prefsFor, sectionFor, subjectOf, streakOf } from "@/lib/today-qian";
import TodayQian from "@/components/TodayQian";
import { canSee, featureState } from "@/lib/features";
import ProductPage from "@/components/product/ProductPage";
import CrossCards from "@/components/CrossCards";
import { ForeignTodayQian, foreignTodayMeta } from "@/components/ForeignQian";
import { marketSet, setCount } from "@/lib/qian-foreign";
import { lotNumberFor } from "@/lib/today-qian";
import { isForeign, type Foreign } from "@/lib/l10n/core";
import { isLocale, pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * 10-14 进度表 50 今日一籤 (/zh-hant/today-qian, /zh/today-qian): one lot a day from our 12 real sets, the same all day,
 * and this month's calendar — free. Members and 籤卡 holders also see the words for their own matter, 今日宜／忌, past
 * days, and can have it mailed at 07:30. Data and rules: lib/today-qian.ts.
 * 10-22 进度表 92: the 籤卡 is no longer sold; the full lot is the membership's (cards and pre-split passes run to their end).
 */
const PAGE_LOCALES = new Set(["zh-hant", "zh"]);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ⑤: today's lot from the market's own set in another language
  if (isLocale(locale) && isForeign(locale) && serviceOpenIn("today-qian", locale)) { const m = foreignTodayMeta(locale); return { title: { absolute: m.title }, description: m.description, alternates: pageAlternates(locale, "/today-qian", serviceLocales("today-qian")) }; }
  const zh = locale === "zh";
  const title = zh ? "今日一签 · 每天抽一支真签 · YaoFlow" : "今日一籤 · 每天抽一支真籤 · YaoFlow";
  const description = zh
    ? "每天抽一支签，六十甲子签、关帝、天后宫、观音、月老等 14 套庙里的真签，当天固定不变，附本月签日历。免费。"
    : "每天抽一支籤，六十甲子籤、關帝、天后宮、觀音、月老等 14 套廟裡的真籤，附本月籤日曆。免費。";
  return {
    title, description,
    alternates: { canonical: `/${zh ? "zh" : "zh-hant"}/today-qian`, languages: { "zh-Hant": "/zh-hant/today-qian", "zh-Hans": "/zh/today-qian" } },
    openGraph: { title, description, type: "website" },
  };
}

export default async function TodayQianPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ card?: string; mail?: string; buy?: string }> }) {
  const { locale } = await params;
  if (isLocale(locale) && isForeign(locale) && serviceOpenIn("today-qian", locale)) {
    if (!(await canSee("today-qian"))) notFound();
    const me0 = await currentCustomer().catch(() => null);
    const bid0 = (await cookies()).get(BID_COOKIE)?.value ?? null;
    const subj = subjectOf(me0?.customerId, bid0);
    const day0 = homeDay(Date.now());
    const set0 = marketSet(locale);
    let num0 = subj ? lotNumberFor(subj, day0, set0) : 0;
    if (!(num0 >= 1 && num0 <= setCount(locale))) { let h = 0; for (const ch of `${day0}:${set0}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0; num0 = (h % setCount(locale)) + 1; }
    return <ForeignTodayQian l={locale} day={day0} num={num0} />;
  }
  if (!PAGE_LOCALES.has(locale)) notFound();
  // 10-15 功能开关: in preview only a browser signed in to the admin sees it (lib/features.ts)
  if (!(await canSee("today-qian"))) notFound();
  const previewing = featureState("today-qian") === "preview";
  const l = locale as "zh-hant" | "zh";
  const sp = await searchParams;
  const me = await currentCustomer();
  const bid = (await cookies()).get(BID_COOKIE)?.value ?? null;
  if (me) adoptBrowser(me.customerId, bid);
  const subject = subjectOf(me?.customerId, bid);
  const now = Date.now();
  const day = homeDay(now);
  const access = accessOf(me?.customerId, now);
  const hk = hkReader(await headers()) && l === "zh-hant";
  const z = (s: string) => (l === "zh" ? toHans(s) : s);
  const today = subject ? drawnOn(subject, day) : null;
  const v0 = today ? lotView(today, { full: !!access, section: sectionFor(me?.customerId, bid, now), hk }) : null;
  const lot = v0 && l === "zh" ? lotToHans(v0) : v0;
  const ym = day.slice(0, 7);
  const month = subject ? monthDraws(subject, ym) : [];
  const prefs = subject ? prefsFor(subject) : { set: "liushi-jiazi", temple: null, mail: false };
  const card = me ? activeCard(me.customerId, now) : null;
  const sets = QIAN_SETS.map((s) => ({ id: s.id, name: z(s.name) }));
  const temples = LISTED_TEMPLES.map((t) => ({ id: t.id, name: z(t.name), set: t.set }));

  // 10-22 进度表 87 (设计稿第 5 節): 今日一籤 on the product template; 进度表 86 承接地圖: 六爻 first, 擇日 next
  return (
    <ProductPage
      locale={l}
      preview={previewing}
      title={z("今日一籤")}
      lead={z(`${day} · 每天從廟裡的真籤抽一支。籤看的是大方向和心態；你心裡那件事落在哪幾天，起一卦看日子。`)}
      input={<>
      <TodayQian
        locale={l} day={day} lot={lot} month={month} prefs={prefs} access={access} signedIn={!!me}
        cardEnds={card?.ends_at ?? null} sets={sets} temples={temples} streak={subject ? streakOf(subject, now) : 0}
        notice={sp.mail === "off" ? "mail_off" : sp.mail === "bad" ? "mail_bad" : sp.card === "no" ? "card_no" : null}
        cardSession={sp.card && /^cs_[a-zA-Z0-9_]+$/.test(sp.card) ? sp.card : null} wantBuy={sp.buy === "1"}
      />
      </>}
      fit={{ yes: [z("每天抽一支，看今天的大方向和心態"), z("這個月的籤日曆")], no: [z("一件事落在哪幾天——起一卦看日子"), z("吉凶判決")] }}
      how={[z("選一套籤：六十甲子、關帝、天后宮、觀音、月老等 14 套"), z("抽今天的一支，整天固定不變"), z("每天回來抽，月曆上留著每一天")]}
      free={z("抽籤、籤題與籤詩、本月的籤日曆。")}
      paid={z("會員：今天這支放在感情、工作上的白話、今日宜忌、回看每一天、每天早上 7:30 寄信。")}
      boundary={z("籤看的是方向和心態，不是吉凶判決；不談健康診斷、投資與法律。")}
      promo={<CrossCards source="daily" locale={l} exclude={["today-qian"]} />}
    />
  );
}
