"use client";

import { useState } from "react";
import { checkEmail, confirmEmailAsTyped } from "@/lib/email-check";
import { t, type Locale } from "@/lib/i18n";

/**
 * 邮箱校对 (09-26): under any address box. A probable typo → 「是不是 x@gmail.com？」
 * with one tap to take it, or one to keep what they typed. Quiet until the
 * address looks finished (has an @ and a dot after it).
 */
export default function EmailHint({ locale, value, onChange }: { locale: Locale; value: string; onChange: (v: string) => void }) {
  const [kept, setKept] = useState<string | null>(null);
  const v = value.trim();
  if (!/@[^@]+\.[^@]{2,}$/.test(v)) return null;
  const r = checkEmail(v);
  if (r.ok || r.kind !== "typo" || kept === r.email) return null;
  return (
    <p className="t-small mt-1 !text-[var(--gold-text)] fade-in" role="status">
      {t(locale, "emailDidYouMean", { email: r.suggestion })}{" "}
      <button type="button" onClick={() => onChange(r.suggestion)} className="underline underline-offset-4 !text-[var(--ink)]">
        {t(locale, "emailUseSuggestion")}
      </button>
      {" · "}
      <button type="button" onClick={() => { confirmEmailAsTyped(v); setKept(r.email); }} className="underline underline-offset-4 opacity-70">
        {t(locale, "emailKeepTyped")}
      </button>
    </p>
  );
}
