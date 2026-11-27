import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
import { formatMoney, isCurrency, type Currency } from "@/lib/money";
import { ONE_OFF_KINDS, offerPassName, offerSummary, offerView, untilLabel } from "@/lib/recover-offer";
import { offerPageT } from "@/lib/dict/recover-offer-page";
import { offerT } from "@/lib/recover-offer-mail";
import { tongkaT } from "@/lib/tongka";
import { record } from "@/lib/analytics-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * 10-15 挽回信改版: where the one letter's link lands. While the hour runs: the cast (or the membership), the full price
 * struck through, the 70 % price, the minutes left and one button (a plain form — no script). After the hour: the discount
 * is gone and the way back is the ordinary one. The clock is the server's (lib/recover-offer.ts offerView).
 */
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

export default async function OfferPage({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const { e } = await searchParams;
  const v = offerView(token);
  if (v.state === "none") notFound();
  const t = offerPageT(l);
  const o = v.o;
  // 10-24 (Neil: 「会员是会员，通卡是通卡」): a pass is never 會員 here — its button and expired page name the pass
  const pass = o.kind === "pass";
  const member = o.kind === "month" || o.kind === "year";
  const passName = offerPassName(v.p, l, true);
  // 10-23 进度表 113 / 111 ③: no discount on this one — a membership or a one-off product, reopened at its own price
  const remind = o.offer_minor >= o.base_minor;
  const oneOff = ONE_OFF_KINDS.has(o.kind);
  const cur: Currency = isCurrency(o.currency) ? (o.currency as Currency) : "USD";
  try { record({ t: Date.now(), e: "recover_offer", s: token.slice(-12), locale: l, method: `view_${v.state}` }); } catch { /* */ }

  if (v.state === "used") {
    const to = oneOff ? (o.fallback_url ?? `/${l}`) : o.used_sid && !member && !pass ? `/${l}/reading?sid=${encodeURIComponent(o.used_sid)}` : `/${l}/account?tab=plan`;
    return (
      <div className="mx-auto w-full max-w-[40rem] px-[var(--s-4)] md:px-8 pt-12 pb-20">
        <h1 className="t-d2">{t.usedTitle}</h1>
        <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{remind ? t.usedRemind : t.used}</p>
        <a href={to} className="inline-block mt-[var(--s-5)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em]">{t.open} →</a>
      </div>
    );
  }
  if (v.state !== "open" || e === "expired") {
    return (
      <div className="mx-auto w-full max-w-[40rem] px-[var(--s-4)] md:px-8 pt-12 pb-20">
        <h1 className="t-d2">{remind ? t.expiredTitleRemind : t.expiredTitle}</h1>
        <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{remind ? (oneOff ? t.expiredProduct : t.expiredRemind) : pass ? fill(t.expiredPass, { name: passName }) : member ? t.expiredMember : t.expired}</p>
        {o.fallback_url && <a href={o.fallback_url} data-heat="offer-full" className="inline-block mt-[var(--s-5)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] border border-[var(--ink)] tracking-[0.12em]">{oneOff ? t.fullProduct : pass ? fill(t.fullPass, { name: passName }) : member ? t.fullMember : t.full} →</a>}
      </div>
    );
  }
  const { p, leftMs } = v;
  const sum = member || pass ? null : offerSummary(p, l);
  const minutes = Math.max(1, Math.ceil(leftMs / 60_000));
  return (
    <div className="mx-auto w-full max-w-[40rem] px-[var(--s-4)] md:px-8 pt-12 pb-20">
      {/* 10-22 (Neil: 「要」): a pass checkout's page names the pass (1 日／7 天／30 天通卡), not 「單月會員」 */}
      <h1 className="t-d2">{remind ? (oneOff ? fill(t.titleProduct, { product: p.product }) : t.titleRemind) : o.kind === "pass" ? fill(t.titlePass, { name: offerPassName(p, l) }) : member ? t.titleMember : t.titleDeep}</h1>
      {sum && <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{fill(sum.q ? t.asked : t.askedHex, { date: sum.date, q: sum.q ?? "", hex: sum.hex })}</p>}
      <div className="mt-[var(--s-5)] p-[var(--s-5)] border border-[var(--gold)] rounded-[2px]">
        {remind ? (
          <p className="t-d2 mt-1">{formatMoney(cur, o.offer_minor, l)}</p>
        ) : (<>
          <p className="t-small text-[var(--ink-45)]">{t.was} <s>{formatMoney(cur, o.base_minor, l)}</s></p>
          <p className="t-d2 mt-1 !text-[var(--cinnabar)]">{t.now} {formatMoney(cur, o.offer_minor, l)}</p>
        </>)}
        <p className="t-small mt-[var(--s-2)] text-[var(--ink-66)]">{fill(remind ? t.leftRemind : t.left, { m: minutes, until: untilLabel(o.expires_at, p, l) })}</p>
        <form method="post" action="/api/recover/checkout" className="mt-[var(--s-4)]">
          <input type="hidden" name="t" value={token} />
          <input type="hidden" name="l" value={l} />
          <button data-heat="offer-pay" className="min-h-[var(--s-6)] px-7 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.14em]">{remind ? t.btnRemind : pass ? fill(t.btnPass, { name: passName }) : member ? t.btnMember : t.btnDeep} · {formatMoney(cur, o.offer_minor, l)}</button>
        </form>
        {e === "failed" && <p className="t-small mt-[var(--s-3)] !text-[var(--cinnabar)]">{t.failed}</p>}
        <p className="t-small mt-[var(--s-3)] text-[var(--ink-45)]">{remind ? (oneOff ? t.noteProduct : t.noteRemind) : t.note}</p>
      </div>
      {/* 10-24 (#2915: ten taps here with only Alipay to pay with): a membership in yuan takes a card — the passes take Alipay */}
      {member && cur === "CNY" && (
        <p className="t-small mt-[var(--s-4)] !text-[var(--cinnabar)]">
          {tongkaT(l).memberCardOnly}{" "}
          <a href={`/${l}/account?want=pass`} className="underline underline-offset-4 !text-[var(--ink)]" data-heat="offer-card-only-pass">{offerT(l).tryPassBtn} →</a>
        </p>
      )}
    </div>
  );
}
