"use client";

import EmailField from "@/components/EmailField";
import { t, type Locale } from "@/lib/i18n";

/**
 * 10-22 进度表 76 (CastFlow 拆分 + 收郵箱 8 合 1): the one "address before the reading" box on the cast page —
 * a why-line, the field, one button. The first-price deep reading, the free light reading / the invite / the pair,
 * and a friend's gift all render this; each keeps its own state and words.
 */
export default function EmailAsk({
  locale, why, value, onChange, go, goLabel, error, invalid, heat, goHeat, required = true,
}: {
  locale: Locale;
  /** why we ask, above the field */
  why: string;
  value: string;
  onChange: (v: string) => void;
  /** Enter in the field and the button both run this */
  go: () => void;
  goLabel: string;
  /** the caller's own error line (null = none) */
  error: string | null;
  /** paint the border red (the "this is needed" state) */
  invalid?: boolean;
  heat?: string;
  goHeat?: string;
  required?: boolean;
}) {
  return (
    <div className="mt-[var(--s-3)] p-[var(--s-4)] border border-[var(--gold)] rounded-[2px] fade-in" data-heat={heat}>
      <p className="t-small !text-[var(--ink-66)]">{why}</p>
      <div className="mt-[var(--s-3)]">
        <EmailField locale={locale} required={required} value={value} invalid={invalid} placeholder={t(locale, "loginEmailPlaceholder")}
          onChange={onChange} onEnter={go} error={error} />
      </div>
      <button type="button" onClick={go} data-heat={goHeat}
        className="mt-[var(--s-3)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]">
        {goLabel}
      </button>
    </div>
  );
}
