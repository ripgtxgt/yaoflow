import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import YearWaitlistForm from "@/components/YearWaitlistForm";
import { featureOn } from "@/lib/features";

/**
 * 10-12 「2027，這件事的年卦」预约页 (进度表 §四 38; 《下一个产品选型-2026-10.md》): validation only. One sentence on
 * what it is, an address and the kind of matter; ≥ 100 sign-ups before the product is built (12 月中). 繁體 only.
 * 10-22 (Neil: 按建議全部做 → 38 併入年書): once the 三合一年書 is open, the page also points at it — it sells 2027 from
 * 11/1 with an early-bird price, which is what most of this list was waiting for; the list itself keeps collecting.
 */
const YEAR_PAGE_LOCALE = "zh-hant";
const TITLE = "2027，這件事的年卦｜一件事一卦，按月看，標出關鍵的月份和日子";
const DESC = "不是整年運勢。挑一件 2027 年最放不下的事，起一卦，按月看它的起落，標出 2–3 個關鍵月份和日子。現在先留信箱，開放時通知你。不收錢。";

export function generateStaticParams() { return [{ locale: YEAR_PAGE_LOCALE }]; }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== YEAR_PAGE_LOCALE) return {};
  return { title: { absolute: TITLE }, description: DESC, alternates: { canonical: `/${YEAR_PAGE_LOCALE}/nian-gua-2027` }, openGraph: { title: TITLE, description: DESC } };
}

export default async function YearGuaPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ c?: string }> }) {
  const { locale } = await params;
  if (locale !== YEAR_PAGE_LOCALE) notFound();
  const { c } = await searchParams;
  const via = c && /^[a-z0-9_-]{1,40}$/i.test(c) ? c : undefined;
  return (
    <article className="mx-auto w-full max-w-[40rem] px-[var(--s-4)] md:px-8 pb-20">
      <header className="pt-10 pb-[var(--s-5)]">
        <p className="t-label !text-[var(--gold-text)]">預約名單 · 不收錢</p>
        <h1 className="t-d1 mt-1">2027，這件事的年卦</h1>
        <p className="t-body mt-[var(--s-3)] leading-relaxed">不是整年運勢。挑一件 2027 年你最放不下的事，起一卦，按月看它的起落，標出 2–3 個關鍵月份和日子，掛在這件事上，到了那幾天提醒你。</p>
        <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">還在做，預計 12 月中開放。先留信箱，開放時第一個通知你。</p>
      </header>
      {featureOn("nianshu") && (
        <p className="t-body mb-[var(--s-5)] leading-relaxed">想先看整年的？<Link href={`/${YEAR_PAGE_LOCALE}/nianshu?c=nian-gua-2027`} className="underline underline-offset-4">三合一年書</Link>（八字＋紫微＋星盤，一年一本）國曆 11/1 起賣 2027 年，早鳥價到 1/31。</p>
      )}
      <YearWaitlistForm via={via} />
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">現在就有一件事想問？<Link href={`/${YEAR_PAGE_LOCALE}/cast?c=nian-gua-2027`} className="underline underline-offset-4">先起一卦 →</Link></p>
    </article>
  );
}
