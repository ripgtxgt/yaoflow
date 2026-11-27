"use client";

import { useEffect, useRef, useState } from "react";
import { CURRENCIES, currencyName, type Currency } from "@/lib/money";
import type { Locale } from "@/lib/locales";

/**
 * The currency switch beside the prices: the current code with a small
 * caret; open, every priced currency with its name in the reader's language
 * (日元 / Japanese Yen / Yen japonais). Same manners as the language menu.
 */
export default function CurrencyMenu(
  { locale, value, onChange, align = "right" }: { locale: Locale; value: Currency; onChange: (c: Currency) => void; align?: "left" | "right" },
) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={ref} className="relative flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={currencyName(value, locale)}
        className="t-label hover:text-[var(--ink)] transition-colors !tracking-[0.12em]"
      >
        {value}<span className="hint-caret">▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} bottom-full mb-2 min-w-[13rem] max-h-[60vh] overflow-y-auto bg-[var(--paper)] border border-[var(--ink-16)] rounded-[2px] py-1 z-20 shadow-[0_8px_24px_rgba(20,21,28,0.08)] fade-in`}
        >
          {CURRENCIES.map((c) => (
            <li key={c} role="option" aria-selected={c === value}>
              <button
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={`w-full text-left flex items-baseline gap-3 px-4 py-2 text-[13px] hover:bg-[var(--ink-06,rgba(20,21,28,0.06))] transition-colors ${
                  c === value ? "text-[var(--ink)]" : "text-[var(--ink-66)]"
                }`}
              >
                <span className="font-[family-name:var(--mono)] text-[11px] tracking-[0.08em] w-9 shrink-0">{c}</span>
                <span>{currencyName(c, locale)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
