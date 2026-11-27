"use client";

import EmailHint from "@/components/EmailHint";
import type { Locale } from "@/lib/i18n";

/**
 * 10-22 进度表 76 (收郵箱 8 合 1) — the one address box. Every place that asks for an address (the free reading's claim,
 * the gift, the saved cast, the matter letters, the 封卦 watch, the 今日一籤 letter, the lot's reading, the 擇日
 * reminder, the waitlist, the upgrade panel, the sent-to line) renders this: the same input attributes, the typo hint
 * (EmailHint) under it, and the error line in the caller's own words. The caller keeps its state; nothing else moves.
 *   variant  box   = the full-width panel field (px-4 py-3)      field = the inline field next to a button (px-3 py-2)
 *            line  = the underlined field inside a sentence (SentTo)
 */
export const EMAIL_LOOKS_DONE = /@[^@]+\.[^@]{2,}$/;
export default function EmailField({
  locale, value, onChange, onEnter, placeholder = "name@example.com", variant = "box", required, error, hint = true, id, className = "", autoFocus, disabled, label, note, invalid,
}: {
  locale: Locale; value: string; onChange: (v: string) => void; onEnter?: () => void;
  placeholder?: string; variant?: "box" | "field" | "line"; required?: boolean;
  /** the caller's own error line, already in words (null = none) */
  error?: string | null;
  /** the typo hint under the box (off for the one-line variant) */
  hint?: boolean;
  id?: string; className?: string; autoFocus?: boolean; disabled?: boolean;
  /** paint the border red (the caller's "this is needed" state) */
  invalid?: boolean;
  /** a label above (the lot form) and a note under (why we ask) */
  label?: string; note?: string;
}) {
  const look = variant === "line"
    ? "flex-1 min-w-[12rem] bg-transparent border-b border-[var(--ink-16)] py-1 outline-none focus:border-[var(--ink-45)]"
    : variant === "field"
      ? "flex-1 min-w-[12rem] t-body bg-transparent border border-[var(--ink-16)] rounded-[2px] px-3 py-2 outline-none focus:border-[var(--ink-45)] placeholder:text-[var(--ink-45)]"
      : "w-full t-body bg-transparent border border-[var(--ink-16)] rounded-[2px] px-4 py-3 outline-none focus:border-[var(--ink-45)] placeholder:text-[var(--ink-45)]";
  const input = (
    <input
      id={id} type="email" inputMode="email" autoComplete="email" maxLength={200} required={required} disabled={disabled} autoFocus={autoFocus}
      value={value} onChange={(e) => onChange(e.target.value)}
      onKeyDown={onEnter ? (e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } } : undefined}
      placeholder={placeholder} className={`${look} ${invalid ? "!border-[var(--cinnabar)]" : ""} ${className}`}
    />
  );
  if (variant === "line") return input;
  return (
    <div className="min-w-0">
      {label && <label htmlFor={id} className="t-label block mb-[var(--s-2)]">{label}</label>}
      {input}
      {hint && <EmailHint locale={locale} value={value} onChange={onChange} />}
      {note && !error && <p className="t-small mt-1 !text-[var(--ink-45)]">{note}</p>}
      {error && <p className="t-small mt-1 !text-[var(--cinnabar)]" role="alert">{error}</p>}
    </div>
  );
}
