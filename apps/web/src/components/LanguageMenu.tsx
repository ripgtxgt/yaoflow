"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/locales";

/**
 * The language switch in the masthead: the current language's own name with
 * a small caret; open, a quiet column of all languages in their own names.
 * Switching keeps the current page — only the locale segment changes.
 */
export default function LanguageMenu({ current }: { current: Locale }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname() ?? `/${current}`;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  /** A deliberate switch is remembered for a year, so yaoflow.com/ opens in that language next time — a shared deep link never sets it. */
  const remember = (to: Locale) => {
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `yf_lang=${to}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  };

  const swap = (to: Locale) => {
    const parts = pathname.split("/");
    if (parts.length > 1 && (LOCALES as readonly string[]).includes(parts[1]!)) parts[1] = to;
    else return `/${to}`;
    return parts.join("/") || `/${to}`;
  };

  // flex, not block: a block wrapper would carry the body's 24px line strut and drop the
  // 10px button onto that strut's baseline — 2–3px below the sign-in link beside it
  return (
    <div ref={ref} className="relative flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="t-label hover:text-[var(--ink)] transition-colors !normal-case !tracking-[0.06em]"
      >
        {LOCALE_META[current].native}<span className="hint-caret">▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-2 min-w-[9rem] bg-[var(--paper)] border border-[var(--ink-16)] rounded-[2px] py-1 z-20 shadow-[0_8px_24px_rgba(20,21,28,0.08)] fade-in"
        >
          {LOCALES.map((l) => (
            <li key={l} role="option" aria-selected={l === current}>
              <Link
                href={swap(l)}
                hrefLang={LOCALE_META[l].hreflang}
                onClick={() => { remember(l); setOpen(false); }}
                className={`block px-4 py-2 text-[13px] hover:bg-[var(--ink-06,rgba(20,21,28,0.06))] transition-colors ${
                  l === current ? "text-[var(--ink)]" : "text-[var(--ink-66)]"
                }`}
              >
                {LOCALE_META[l].native}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
