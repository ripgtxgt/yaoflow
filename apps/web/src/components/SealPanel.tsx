"use client";

import { t, type Locale } from "@/lib/i18n";
import ShareButton from "@/components/ShareButton";

/**
 * 封卦 (09-21, A1): the share moment for a deep reading that named a date.
 * The link is already minted server-side (it is just the revisit id and its
 * signature) — this is only the copy / share sheet. What goes out carries the
 * figure and that one line about timing, never the question.
 */
export default function SealPanel({ locale, url }: { locale: Locale; url: string }) {
  const text = t(locale, "sealShareText");

  return (
    <section id="seal" className="mt-[var(--s-6)] border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-5)]">
      <p className="t-label mb-2">{t(locale, "sealMake")}</p>
      <p className="t-body !text-[15px] text-[var(--ink-86)]">{t(locale, "sealMakeBody")}</p>
      <div className="mt-[var(--s-4)]">
        {/* 10-22 分享 13 合 1: the one share hook; the event stays seal_sent so the old counts still add up */}
        <ShareButton locale={locale} surface="seal" url={url} text={text} event="seal_sent" label={t(locale, "sealCopy")} copiedLabel={t(locale, "shareCopied")} copyLabel={t(locale, "shareCopy")} heat="seal-share" />
      </div>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-[var(--s-3)] font-[family-name:var(--mono)] text-[11px] w-full bg-transparent
                   border border-[var(--ink-16)] rounded-[2px] px-3 py-2 outline-none focus:border-[var(--ink-45)]"
      />
    </section>
  );
}
