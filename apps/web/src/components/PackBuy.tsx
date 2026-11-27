"use client";

import { useState } from "react";
import { formatMoney, isCurrency, packMinor, priceMinor, type Currency } from "@/lib/money";
import { mg } from "@/lib/dict/member-gift";
import { PACK_MAX_PER_PERIOD, PACK_NUDGE_SINGLES, PACK_SMALL_UNITS, PACK_UNITS, type PackQuote } from "@/lib/sub-plan";
import type { Locale } from "@/lib/locales";
import { checkoutV2 } from "@/lib/checkout-client";

/**
 * 09-29 会员增购包 (Neil: 「15 份 699」): takes a member whose period's readings are gone to a one-off checkout.
 * 10-02 (Neil: 「1，出一个小包」「2，3 都做吧」): two sizes now — 5 and 15 — priced by the server for this member
 * (lib/pack-quote.ts). When this period's single extras / small packs count towards the 15, its button says what is
 * left to pay; from the third single on, a line says so first. Charged in the membership's own currency; the server
 * checks the limits and the price again, and a page that priced it before a later purchase reloads.
 */
type Quotes = { small: PackQuote | null; large: PackQuote | null } | null | undefined;

export default function PackBuy({ locale, quotes, singles = 0 }: { locale: string; quotes: Quotes; singles?: number }) {
  const [state, setState] = useState<"idle" | "limit" | "error">("idle");
  const [busy, setBusy] = useState<"small" | "large" | null>(null);
  const small = quotes?.small ?? null;
  const large = quotes?.large ?? null;
  const any = large ?? small;
  if (!any) return null;
  const cur = any.currency.toUpperCase();
  if (!isCurrency(cur)) return null;
  const c = cur as Currency;
  const f = (m: number) => formatMoney(c, m, locale as Locale);
  // per reading: whole units where prices are whole (NT$47, not NT$46.60)
  const whole = ["TWD", "HKD", "CNY", "MXN"].includes(c);
  const per = (m: number, n: number) => f(whole ? Math.round(m / n / 100) * 100 : Math.round(m / n));
  const credit = !!large && large.creditUnits > 0;

  const go = async (q: PackQuote) => {
    if (busy) return;
    setBusy(q.size);
    try {
      const res = await checkoutV2(q.size === "small" ? "pack_s" : "pack_l", { locale, expect: q.minor, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tzOffsetMinutes: -new Date().getTimezoneOffset() }); // 10-22 进度表 57
      const d = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.status === 409 && d.error === "quote_changed") { window.location.reload(); return; }
      if (res.status === 409) { setState("limit"); setBusy(null); return; }
      if (res.status === 401) { window.location.href = `/${locale}/login?next=${encodeURIComponent(`/${locale}/account#membership`)}`; return; }
      if (!res.ok || !d.url) throw new Error(String(res.status));
      window.location.href = d.url;
    } catch {
      setState("error");
      setBusy(null);
    }
  };

  const btn = "inline-block min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] border border-[var(--ink)] text-[13px] tracking-[0.1em] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors disabled:opacity-50 text-left";
  return (
    <div>
      {credit && singles >= PACK_NUDGE_SINGLES && (
        <p className="t-small mb-2 !text-[var(--gold-text)]" data-heat="pack-nudge">{mg(locale, "packNudge", { s: singles, price: f(large!.minor) })}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {small && (
          <button type="button" data-heat="pack-buy-small" onClick={() => void go(small)} disabled={busy !== null || state === "limit"} className={btn}>
            {mg(locale, "packBtn", { n: small.units, price: f(small.minor) })}
          </button>
        )}
        {large && (
          <button type="button" data-heat="pack-buy" onClick={() => void go(large)} disabled={busy !== null || state === "limit"} className={btn}>
            {credit ? mg(locale, "packCreditBtn", { price: f(large.minor) }) : mg(locale, "packBtn", { n: large.units, price: f(large.minor) })}
          </button>
        )}
      </div>
      {credit && (
        <p className="t-small mt-1 !text-[var(--ink-66)]">{mg(locale, "packCreditNote", { k: large!.creditUnits, credit: f(large!.creditMinor), n: large!.units })}</p>
      )}
      <p className="t-small mt-1 !text-[var(--ink-45)]">
        {mg(locale, "packCompare", {
          one: f(priceMinor(c, "one")),
          smallPer: per(packMinor(c, "small"), PACK_SMALL_UNITS),
          largePer: per(packMinor(c, "large"), PACK_UNITS),
        })}
      </p>
      <p className="t-small mt-1 !text-[var(--ink-45)]">
        {state === "limit" ? mg(locale, "packLimit") : state === "error" ? mg(locale, "packError") : mg(locale, "packNote", { max: PACK_MAX_PER_PERIOD })}
      </p>
    </div>
  );
}
