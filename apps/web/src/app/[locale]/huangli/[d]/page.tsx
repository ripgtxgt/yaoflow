import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import FeatureLink from "@/components/FeatureLink";
import TrackOnce from "@/components/TrackOnce";
import HuangliDayView from "@/components/mingli/HuangliDayView";
import { DateJump } from "@/components/mingli/HuangliBits";
import { canSee, featureState } from "@/lib/features";
import { hkReader } from "@/lib/register";
import { huangliDay, parseYmd, term, WEEK_ZH, type HlLocale } from "@/lib/mingli/calendar/day";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES, shiftDay, shiftMonth, todayYmd } from "@/lib/mingli/calendar/page-bits";
import { brandName } from "@/lib/brand";
import { JaKoyomiToday, KoAlmanacToday, JaKoyomiDay, KoAlmanacDay, JaKoyomiMonth, KoAlmanacMonth, eastMeta } from "@/components/mingli/EastAlmanac";
import { pageAlternates } from "@/lib/locales";
import { WestAlmanacToday, WestAlmanacDay, WestAlmanacMonth, WestZeri, westHuangliMeta, westZeriMeta } from "@/components/mingli/WestAlmanac";
import { WEST } from "@/lib/mingli/calendar/almanac-west";
import type { Foreign } from "@/lib/l10n/core";
import { serviceLocales, serviceOpenIn } from "@/lib/services";

export const dynamic = "force-dynamic";

/** 10-17 进度表 69 黃曆: one day (/huangli/2026-10-17) or one month (/huangli/2026-10) */
const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s) && +s.slice(0, 4) >= 1901 && +s.slice(0, 4) <= 2099;

/**
 * 11-06 (Neil：「好，可以」, T-020): the foreign day and month pages are thin, expire with their date and drew no search
 * visitors in 14 days while taking a share of Google's crawl — kept for readers, out of the index (links still followed).
 */
const FOREIGN_DAY_ROBOTS = { index: false, follow: true } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; d: string }> }): Promise<Metadata> {
  const { locale, d: s } = await params;
  // 10-30 进度表 128 ⑤: 日本の暦 / 한국 음력·일진
  if ((locale === "ja" || locale === "ko") && serviceOpenIn("huangli", locale)) {
    if (!isMonth(s) && !parseYmd(s)) return {};
    const m = eastMeta(locale, s)!;
    return { title: { absolute: `${m.title} — ${brandName(locale)}` }, description: m.description, alternates: pageAlternates(locale, `/huangli/${s}`, serviceLocales("huangli")), robots: FOREIGN_DAY_ROBOTS };
  }
  if (WEST.has(locale) && serviceOpenIn("huangli", locale as Foreign)) {
    const m = isMonth(s) || parseYmd(s) ? westHuangliMeta(locale as Foreign, s) : null;
    if (!m) return {};
    return { title: { absolute: `${m.title} — ${brandName(locale as Foreign)}` }, description: m.description, alternates: pageAlternates(locale as Foreign, `/huangli/${s}`, serviceLocales("huangli")), robots: FOREIGN_DAY_ROBOTS };
  }
  const l = locale as HlLocale;
  const alt = (p: string) => ({ canonical: `/${locale}/huangli/${p}`, languages: { "zh-Hant": `/zh-hant/huangli/${p}`, "zh-CN": `/zh/huangli/${p}`, "x-default": `/zh-hant/huangli/${p}` } });
  if (isMonth(s)) {
    const [y, m] = s.split("-").map(Number);
    return { title: { absolute: `${loc(`${y}年${m}月黃曆｜農民曆每日宜忌、沖煞`, l)} — ${brandName(l)}` }, description: loc(`${y} 年 ${m} 月每天的農曆、宜忌、沖哪個生肖，一頁看完，點一天看全部。`, l), alternates: alt(s) };
  }
  const p = parseYmd(s);
  if (!p) return {};
  const d = huangliDay(p.y, p.m, p.d);
  const yi = d.yi.slice(0, 4).map((x) => term(x)).join("、");
  return {
    title: { absolute: `${loc(`${p.y}年${p.m}月${p.d}日黃曆｜農曆${term(d.lunar.month)}${term(d.lunar.day)} 宜忌沖煞`, l)} — ${brandName(l)}` },
    description: loc(`${p.y}/${p.m}/${p.d} 星期${WEEK_ZH[d.weekday]}，農曆${term(d.lunar.month)}${term(d.lunar.day)}，${d.gz.day}日。宜${yi || "—"}；沖${term(d.chong.zodiac)}煞${term(d.sha)}。`, l),
    alternates: alt(s),
  };
}

export default async function HuangliDayPage({ params }: { params: Promise<{ locale: string; d: string }> }) {
  const { locale, d: s } = await params;
  if ((locale === "ja" || locale === "ko") && serviceOpenIn("huangli", locale)) {
    if (!(await canSee("huangli"))) notFound();
    if (isMonth(s)) return locale === "ja" ? <JaKoyomiMonth ym={s} /> : <KoAlmanacMonth ym={s} />;
    if (!parseYmd(s)) notFound();
    return locale === "ja" ? <JaKoyomiDay ymd={s} /> : <KoAlmanacDay ymd={s} />;
  }
  if (WEST.has(locale) && serviceOpenIn("huangli", locale as Foreign)) {
    if (!(await canSee("huangli"))) notFound();
    if (isMonth(s)) return <WestAlmanacMonth l={locale as Foreign} ym={s} />;
    if (!parseYmd(s)) notFound();
    return <WestAlmanacDay l={locale as Foreign} ymd={s} />;
  }
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("huangli"))) notFound();
  const l = locale as HlLocale;
  const w = (x: string) => loc(x, l);
  let hk = false;
  try { hk = l === "zh-hant" && hkReader(await headers()); } catch { /* */ }
  const preview = featureState("huangli") === "preview" && <p className="t-small mb-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px]">預覽中：只有登入後台的瀏覽器看得到。</p>;

  if (isMonth(s)) {
    const [y, m] = s.split("-").map(Number) as [number, number];
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const first = huangliDay(y, m, 1).weekday;
    const today = todayYmd();
    const cells = Array.from({ length: days }, (_, i) => huangliDay(y, m, i + 1));
    return (
      <div className="mx-auto w-full max-w-[56rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
        {preview}
        <TrackOnce event="huangli" locale={l} method="view:month" />
        <nav className="t-label"><Link href={`/${l}/huangli`} className="hover:text-[var(--ink)]">← {w("今日黃曆")}</Link></nav>
        <h1 className="t-d1 mt-[var(--s-3)]">{w(`${y}年${m}月黃曆`)}</h1>
        <nav className="mt-[var(--s-3)] flex gap-5 t-small">
          <Link href={`/${l}/huangli/${shiftMonth(s, -1)}`} className="underline underline-offset-4">← {w("上個月")}</Link>
          <Link href={`/${l}/huangli/${shiftMonth(s, 1)}`} className="underline underline-offset-4">{w("下個月")} →</Link>
        </nav>
        <div className="mt-[var(--s-5)] grid grid-cols-7 gap-px bg-[var(--ink-16)] border border-[var(--ink-16)] text-center">
          {WEEK_ZH.map((x) => <div key={x} className="bg-[var(--paper)] t-sect py-2">{w(x)}</div>)}
          {Array.from({ length: first }, (_, i) => <div key={`e${i}`} className="bg-[var(--paper)]" />)}
          {cells.map((c) => {
            const mark = c.term.today ? term(c.term.name) : c.lunar.dayNum === 1 ? term(c.lunar.month) : term(c.lunar.day);
            return (
              <Link key={c.ymd} href={`/${l}/huangli/${c.ymd}`} className={`bg-[var(--paper)] px-1 py-2 min-h-[5.5rem] hover:bg-[var(--gold)]/[0.08] ${c.ymd === today ? "outline outline-1 outline-[var(--ink)] -outline-offset-1" : ""}`}>
                <span className="block t-body tabular-nums">{c.d}</span>
                <span className={`block text-[11px] ${c.term.today || c.festivals.length ? "!text-[var(--gold-text)]" : "!text-[var(--ink-45)]"}`}>{w(c.festivals[0] ? term(c.festivals[0]) : mark)}</span>
                <span className="hidden sm:block text-[11px] mt-1 !text-[var(--ink-66)] leading-tight">{w(c.nothing ? "諸事不宜" : c.yi.slice(0, 2).map((x) => term(x)).join(" "))}</span>
                <span className="block text-[10px] mt-0.5 !text-[var(--cinnabar)]">{w(`沖${term(c.chong.zodiac)}`)}</span>
              </Link>
            );
          })}
        </div>
        <p className="t-small mt-[var(--s-4)] !text-[var(--ink-45)]">{w("民間通書常見宜忌，各家不一，僅供參考。")}</p>
      </div>
    );
  }

  const p = parseYmd(s);
  if (!p) notFound();
  const d = huangliDay(p.y, p.m, p.d);
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      {preview}
      <TrackOnce event="huangli" locale={l} method="view:day" />
      <nav className="t-label"><Link href={`/${l}/huangli`} className="hover:text-[var(--ink)]">← {w("今日黃曆")}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{w(`${p.y}年${p.m}月${p.d}日黃曆`)}</h1>
      <nav className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-5 gap-y-2 t-small">
        <Link href={`/${l}/huangli/${shiftDay(s, -1)}`} className="underline underline-offset-4">← {w("前一天")}</Link>
        <Link href={`/${l}/huangli/${shiftDay(s, 1)}`} className="underline underline-offset-4">{w("後一天")} →</Link>
        <Link href={`/${l}/huangli/${s.slice(0, 7)}`} className="underline underline-offset-4">{w("這個月")}</Link>
        <DateJump locale={l} value={s} label={w("查別天")} />
      </nav>
      <div className="mt-[var(--s-5)]"><HuangliDayView d={d} locale={l} hk={hk} /></div>
      {/* 10-29 (Neil: 产品之间的互相引导): the 擇日 pages by use, one tap from the day */}
      <p className="t-small mt-[var(--s-3)] flex flex-wrap gap-x-4 gap-y-1 !text-[var(--ink-66)]" data-heat="huangli-to-zeri-use">
        <span>{w("要辦事，按用途挑日子：")}</span>
        {(["wedding", "move", "opening"] as const).map((k) => <Link key={k} href={`/${l}/zeri/${k}?c=huangli`} className="underline underline-offset-4 hover:!text-[var(--ink)]">{w(k === "wedding" ? "結婚好日子" : k === "move" ? "搬家吉日" : "開市吉日")}</Link>)}
      </p>
      <section className="mt-[var(--s-6)] grid gap-3">
        <p className="t-body">{w("這天你有想做的事嗎？")}</p>
        <FeatureLink name="zeri" from="huangli-day" locale={l} href={`/${l}/zeri`} text={w("找適合的日子：搬家、開市、結婚… →")} />
        <p className="t-small"><Link href={`/${l}/cast?c=huangli`} className="underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">{w("想知道那件事會怎樣、哪幾天有動靜？起一卦 →")}</Link></p>
      </section>
    </div>
  );
}
