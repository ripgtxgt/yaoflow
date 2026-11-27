import type { Metadata } from "next";
import Link from "next/link";
import CrossCards from "@/components/CrossCards";
import type { Locale } from "@/lib/locales";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import TrackLink from "@/components/TrackLink";
import { canSee } from "@/lib/features";
import { currentCustomer } from "@/lib/auth";
import { can, rightsFor } from "@/lib/entitlements";
import { myChart } from "@/lib/my-chart";
import { clashOf } from "@/lib/mingli/bazi/today";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES, todayYmd } from "@/lib/mingli/calendar/page-bits";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { PURPOSES, purposeDays, purposeTitle, type PurposeSlug } from "@/lib/mingli/calendar/zeri-purpose";
import { brandName } from "@/lib/brand";

/** 10-29 进度表 123: 結婚／搬家／開市 — the next three months of suitable days, by month (lib/mingli/calendar/zeri-purpose.ts) */
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

export async function purposeMetadata(locale: string, slug: PurposeSlug): Promise<Metadata> {
  if (!HL_LOCALES.has(locale)) return {};
  const l = locale as HlLocale;
  const p = PURPOSES[slug];
  const months = purposeDays(p, todayYmd(), l);
  const title = purposeTitle(p, months, l);
  return {
    title: { absolute: `${title} — ${brandName(l)}` },
    description: loc(p.desc, l),
    alternates: { canonical: `/${locale}/zeri/${slug}`, languages: { "zh-Hant": `/zh-hant/zeri/${slug}`, "zh-CN": `/zh/zeri/${slug}`, "x-default": `/zh-hant/zeri/${slug}` } },
  };
}

export default async function ZeriPurposePage({ locale, slug }: { locale: string; slug: PurposeSlug }) {
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("zeri"))) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const p = PURPOSES[slug];
  const months = purposeDays(p, todayYmd(), l);
  // a member: the days that 沖／刑 their own 日柱 (and the partner's, for 結婚) are crossed out — only which days reach the page
  const me = await currentCustomer().catch(() => null);
  const member = !!me && can(await rightsFor(me.customerId).catch(() => rightsFor(null)), "daily_personal");
  let cut: Record<string, string> | null = null;
  let need = false;
  if (member && me) {
    const self = myChart(me.customerId, "self");
    const partner = p.pair ? myChart(me.customerId, "partner") : null;
    if (!self) need = true;
    else {
      cut = {};
      for (const m of months) for (const d of m.days) {
        const a = clashOf(d.gz, self.dayBranch).length > 0, b = !!partner && clashOf(d.gz, partner.dayBranch).length > 0;
        if (a || b) cut[d.ymd] = a && b ? w("你和對方") : a ? w("你") : w("對方");
      }
    }
  }
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: w(f.q), acceptedAnswer: { "@type": "Answer", text: w(f.a) } })) };
  const title = purposeTitle(p, months, l);
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <JsonLd data={faq} />
      <TrackOnce event="zeri" locale={l} method={`purpose:${slug}`} />
      <nav className="t-label"><Link href={`/${l}/zeri`} className="hover:text-[var(--ink)]">← {w("擇日")}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{title.split("｜")[0]}</h1>
      <p className="t-body mt-[var(--s-4)] leading-relaxed">{w(p.intro)}</p>
      {member && need && <p className="t-small mt-[var(--s-3)] !text-[var(--gold-text)]"><Link href={`/${l}/bazi`} className="underline underline-offset-4">{w("填上你的生辰，就會按你的八字去掉沖、刑日柱的日子 →")}</Link></p>}
      {!member && <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{w(p.pair ? "會員可再按自己和另一半的八字，去掉沖、刑日柱的日子。" : "會員可再按自己的八字，去掉沖、刑日柱的日子。")}</p>}
      {months.length === 0 && <p className="t-body mt-[var(--s-5)]">{w("接下來三個月沒有查到合適的日子，可以到擇日頁放寬範圍。")}</p>}
      {months.map((m) => (
        <section key={m.ym} className="mt-[var(--s-6)]">
          <h2 className="t-sect">{w(`${m.ym.slice(0, 4)} 年 ${m.label}${p.word}好日子`)}</h2>
          <ul className="mt-[var(--s-3)] divide-y divide-dotted divide-[var(--ink-16)]">
            {m.days.map((d) => {
              const x = cut?.[d.ymd];
              return (
                <li key={d.ymd} className={`py-2 flex flex-wrap items-baseline gap-x-3 ${x ? "opacity-45" : ""}`}>
                  <Link href={`/${l}/huangli/${d.ymd}`} className={`t-body tabular-nums underline-offset-4 hover:underline ${x ? "line-through" : ""}`}>{+d.ymd.slice(5, 7)}/{+d.ymd.slice(8)}（{w(WEEK[d.weekday]!)}）</Link>
                  <span className="t-small !text-[var(--ink-66)]">{d.lunar}</span>
                  <span className="t-small !text-[var(--ink-45)]">{w(`沖${d.chong}`)}</span>
                  {d.weekend && <span className="t-small !text-[var(--gold-text)]">{w("週末")}</span>}
                  {x && <span className="t-small !text-[var(--cinnabar)]">{w(`沖／刑${x}的日柱`)}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="mt-[var(--s-6)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-4)]">
        <h2 className="t-sect mb-[var(--s-2)] !text-[var(--gold-text)]">{w("事前提醒")}</h2>
        <ul className="t-body list-disc pl-5 space-y-1">{p.tips.map((t) => <li key={t}>{w(t)}</li>)}</ul>
      </div>
      <div className="mt-[var(--s-5)] grid gap-3">
        <p className="t-body">{w("日子挑好了，還想知道這件事順不順、哪幾天有動靜？")}</p>
        <p><TrackLink event="zeri" locale={l} method={`purpose_cast:${slug}`} href={`/${l}/cast?${new URLSearchParams({ q: w(p.ask), c: "zeri" })}`} className="inline-block px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px]">{w("起一卦看這件事 →")}</TrackLink></p>
        <p className="t-small"><Link href={`/${l}/zeri?do=${p.matters[0]}`} className="underline underline-offset-4 !text-[var(--ink-66)]">{w("依生肖再篩、設提醒 →")}</Link></p>
      </div>
      {p.faq.map((f) => (
        <div key={f.q} className="mt-[var(--s-5)]">
          <h2 className="t-sect">{w(f.q)}</h2>
          <p className="t-body mt-[var(--s-2)] leading-relaxed">{w(f.a)}</p>
        </div>
      ))}
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{w("依民間通書宜忌推算，各家擇日做法不同；婚嫁、開市等大事可再請教熟悉的老師。")}</p>
      {/* 10-29 (Neil: 产品之间的互相引导): lib/cross-map.ts — the page asks for the cast itself (婚期 points at 合盤 first) */}
      <CrossCards source={slug === "wedding" ? "zeri_wedding" : slug === "move" ? "zeri_move" : "zeri_opening"} locale={l as Locale} exclude={["zeri"]} skipMain={slug !== "wedding"} />
    </article>
  );
}
