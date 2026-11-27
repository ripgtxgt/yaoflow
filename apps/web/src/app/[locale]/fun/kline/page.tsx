import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TrackOnce from "@/components/TrackOnce";
import { canSee } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import { HL_LOCALES } from "@/lib/mingli/calendar/page-bits";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { FUN_UI } from "@/lib/mingli/fun/ui";
import { klineFromBirth, type Candle } from "@/lib/mingli/fun/kline";
import { currentCustomer } from "@/lib/auth";
import { can, rightsFor } from "@/lib/entitlements";
import { listProfiles } from "@/lib/birth-profiles";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";
/** 10-29 进度表 126 運勢 K 線 — 會員 only (right daily_personal), from the 生辰檔案 marked 自己; nothing is stored */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!(await canSee("fun"))) return {}; // a preview page says nothing about itself to a visitor (the 404 had its title)
  return { title: { absolute: `${loc(FUN_UI.klHead!, locale as HlLocale)} — ${brandName(locale)}` }, robots: { index: false, follow: false } };
}

function Chart({ c, now, w }: { c: Candle[]; now: number; w: (s: string) => string }) {
  const lo = Math.min(...c.map((x) => x.low)) - 0.25, hi = Math.max(...c.map((x) => x.high)) + 0.25;
  const W = 22, H = 220, pad = 24;
  const y = (v: number) => pad + (hi - v) / (hi - lo) * (H - 2 * pad);
  return (
    <div className="overflow-x-auto mt-[var(--s-4)]">
      <svg width={c.length * W + 20} height={H + 30} role="img" aria-label={w("運勢 K 線")}>
        {c.map((k, i) => {
          const x = 10 + i * W + W / 2, upward = k.close >= k.open;
          const col = upward ? "var(--cinnabar)" : "var(--ink)";
          const top = y(Math.max(k.open, k.close)), bot = y(Math.min(k.open, k.close));
          return (
            <g key={k.year}>
              <title>{w(`${k.year}（${k.gz}，${k.age} 歲${k.decade ? `，大運${k.decade}` : ""}）${k.tags.join("、")}`)}</title>
              {k.year === now && <rect x={x - W / 2} y={pad / 2} width={W} height={H - pad} fill="var(--gold)" opacity={0.12} />}
              <line x1={x} x2={x} y1={y(k.high)} y2={y(k.low)} stroke={col} strokeWidth={1} />
              <rect x={x - 6} y={top} width={12} height={Math.max(2, bot - top)} fill={upward ? col : "var(--paper)"} stroke={col} />
              {(k.year % 5 === 0 || k.year === now) && <text x={x} y={H + 14} textAnchor="middle" fontSize={10} fill="var(--ink-66)">{k.year === now ? w("今年") : k.year}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default async function KlinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!HL_LOCALES.has(locale)) notFound();
  if (!(await canSee("fun"))) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const me = await currentCustomer().catch(() => null);
  const member = !!me && can(await rightsFor(me.customerId), "daily_personal");
  const p = member ? listProfiles(me!.customerId).find((x) => x.who === "self") : undefined;
  const now = new Date().getFullYear();
  const candles = p ? klineFromBirth(p.input, p.gender ?? p.input.gender ?? "male", now - 20, now + 20) : null;
  return (
    <article className="mx-auto w-full max-w-[52rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="fun" locale={l} method="kline:view" />
      <p className="t-small"><Link href={`/${l}/fun`} className="underline underline-offset-4">← {w(FUN_UI.head!)}</Link></p>
      <h1 className="t-d1 mt-[var(--s-3)]">{w(FUN_UI.klHead!)}</h1>
      <p className="t-body mt-[var(--s-4)]">{w(FUN_UI.klLead!)}</p>
      {!member ? <p className="t-body mt-[var(--s-4)]">{w(FUN_UI.klNeedMember!)} <Link href={`/${l}/services`} className="underline underline-offset-4">{w(FUN_UI.plans!)}</Link></p>
        : !candles ? <p className="t-body mt-[var(--s-4)]">{w(FUN_UI.klNeedProfile!)} <Link href={`/${l}/account`} className="underline underline-offset-4">{w("我的")}</Link></p>
        : <><p className="t-small mt-[var(--s-4)] !text-[var(--gold-text)]">{w(FUN_UI.klNote!)}</p><Chart c={candles} now={now} w={w} /></>}
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)] leading-relaxed">{w(FUN_UI.klRule!)}</p>
    </article>
  );
}
