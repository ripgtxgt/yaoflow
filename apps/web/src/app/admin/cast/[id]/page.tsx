import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import type { LogRow } from "@/lib/cast-log";
import { fillNudge, variantById, variantGoal } from "@/lib/nudge";
import { netOf } from "@/lib/browser-net";
import { currencyForCountry, DEFAULT_CURRENCY, type Currency } from "@/lib/money";
import { asLocale } from "@/lib/locales";
import { hexName } from "@/lib/names";
import { homeMinute } from "@/lib/clock";
import ReaderCastView from "@/components/admin/ReaderCastView";
import { AdminLogin } from "../../ui";

export const dynamic = "force-dynamic";

/** 11-05 (Neil: 「只还原读者当时那一页」): one unpaid cast, as the reader saw it after the coins fell. Admin only. */
const LOCALE_CUR: Record<string, Currency> = { "zh-hant": "TWD", zh: "CNY", ja: "JPY", ko: "KRW" };
const dayOf = (at: number, tz: number) => new Date(at + tz * 60_000).toISOString().slice(0, 10);

export default async function AdminCastPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string; denied?: string }> }) {
  const { id } = await params;
  const { key, denied } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back={`/admin/cast/${id}`} />;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const row = db().prepare("SELECT * FROM cast_log WHERE id = ?").get(Number(id)) as LogRow | undefined;
  if (!row) notFound();
  const locale = asLocale(row.locale ?? "zh-hant");
  const values = (row.values_str.match(/[6-9]/g) ?? []).map(Number) as LineValue[];

  // the casts before it on this matter, as the page listed them
  const earlier = row.thread_id
    ? (db().prepare("SELECT at, tz, primary_num FROM cast_log WHERE thread_id = ? AND at < ? ORDER BY at DESC LIMIT 5").all(row.thread_id, row.at) as { at: number; tz: number; primary_num: number }[]).reverse()
    : [];
  const chain = earlier.map((e) => { const h = hexagramByNumber(e.primary_num); return { day: dayOf(e.at, e.tz), hex: h ? hexName(h, locale) : `#${e.primary_num}` }; });

  // the block before the price: the words written for this reader, else the version picked
  let nudge: { title: string; body: string; cta: string; goal: "deep" | "member" } | null = null;
  if (row.nudge && row.nudge_seen) {
    const v = variantById(row.nudge);
    let own: { title?: string; body?: string; cta?: string } | null = null;
    try { own = row.nudge_text ? JSON.parse(row.nudge_text) : null; } catch { own = null; }
    const tx = own?.title ? own : v ? (v.texts[locale] ?? v.texts["*"] ?? null) : null;
    if (tx?.title && tx.body && tx.cta) {
      // {n} {k} {span} {deep} as the server filled them for the page (lib/nudge.ts fillNudge)
      const firstAt = row.thread_id ? ((db().prepare("SELECT MIN(at) AS a FROM cast_log WHERE thread_id = ?").get(row.thread_id) as { a: number | null }).a ?? row.at) : row.at;
      const span = Math.max(1, Math.round((Date.parse(dayOf(row.at, row.tz)) - Date.parse(dayOf(firstAt, row.tz))) / 86_400_000) + 1);
      const f = fillNudge({ title: tx.title, body: tx.body, cta: tx.cta }, { n: row.thread_n ?? 1, span }, locale);
      nudge = { ...f, goal: v ? variantGoal(v) : "deep" };
    }
  }

  // the currency the page priced in: their country, else their language
  const country = netOf([row.bid])[0]?.country ?? null;
  const currency = currencyForCountry(country) ?? LOCALE_CUR[locale] ?? DEFAULT_CURRENCY;
  // the first 1 日通卡 price, unless they had paid before this cast
  const paidBefore = !!db().prepare("SELECT 1 FROM cast_log WHERE bid = ? AND at < ? AND paid_sid IS NOT NULL LIMIT 1").get(row.bid, row.at);

  return (
    <div className="min-h-screen bg-[var(--paper)]" style={{ fontFamily: locale === "zh" ? "var(--serif-zh)" : "var(--serif-hant)" }}>
      <p className="text-xs text-center py-2 bg-black/5 font-sans">
        后台还原 · 读者 {homeMinute(row.at)} 摇完卦看到的页面{row.teaser ? "（含免费一句）" : row.capped ? "（问满了，没有免费一句）" : "（那时没有免费一句）"} · 价格按 {currency}{paidBefore ? "" : "（首次价）"} · 按钮在这里不能点
        {row.paid_sid ? " · 这一卦后来看了解读" : ""}
      </p>
      <div className="pt-[var(--s-6)]">
        <ReaderCastView locale={locale} question={row.question} teaser={row.teaser} values={values} at={row.at} tz={row.tz} n={row.thread_n} chain={chain} nudge={nudge} currency={currency} first={!paidBefore} />
      </div>
    </div>
  );
}
