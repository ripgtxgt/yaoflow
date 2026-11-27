"use client";

import { useCurrency } from "@/lib/use-currency";
import { formatMoney, type Currency } from "@/lib/money";
import type { Locale } from "@/lib/locales";

/**
 * 10-22 进度表 58: the price line of a service card on /services — the visitor's currency is settled in the browser
 * (cookie, clock, language), so the page hands every currency and this picks one. `parts` = [{key, label?}]: the
 * headline (first) and the rest after it, e.g. 1 日 / 7 天 / 30 天.
 */
export type PricePart = { key: string; label?: string; strike?: string; /** appended to this part alone, e.g. /月 */ suffix?: string };
export default function ServicePrice({ table, parts, locale, note, per }: { table: Record<string, Record<Currency, number>>; parts: PricePart[]; locale: Locale; note?: string | null; per?: string }) {
  const [currency] = useCurrency();
  const fmt = (key: string) => { const row = table[key]; return row ? formatMoney(currency, row[currency], locale) : ""; };
  return (
    <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">
      {parts.map((p, i) => (
        <span key={p.key} className={i === 0 ? "!text-[var(--ink)]" : ""}>
          {i > 0 && <span className="opacity-50"> · </span>}
          {p.label ? `${p.label} ` : ""}
          {p.strike && table[p.strike] && table[p.strike]![currency] !== table[p.key]![currency] ? <s className="opacity-60 mr-1">{fmt(p.strike)}</s> : null}
          {fmt(p.key)}{p.suffix ?? (i === 0 && per ? per : "")}
        </span>
      ))}
      {note ? <span className="block mt-0.5 !text-[var(--ink-45)]">{note}</span> : null}
    </p>
  );
}
