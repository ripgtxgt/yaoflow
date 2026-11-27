"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import ShareButton from "@/components/ShareButton";

/** On the joint page: share the (figures-only) link, or end the pairing. */
export default function PairActions({ locale, token, sid, shareUrl }: { locale: Locale; token: string; sid: string | null; shareUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const dissolve = async () => {
    if (!sid || busy) return;
    if (!window.confirm(t(locale, "pairDissolveConfirm"))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pair/dissolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, sid }) });
      if (res.ok) { router.push(`/${locale}/account`); return; }
    } catch { /* keep the page */ }
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {/* 10-22 分享 13 合 1 */}
      <ShareButton locale={locale} surface="pair" url="" text={t(locale, "pairShareGuestText", { url: shareUrl })} label={t(locale, "pairShare")} copiedLabel={t(locale, "giftCastCopied")} heat="pair-share" />
      {sid && (
        <button type="button" onClick={() => void dissolve()} disabled={busy} className="t-label hover:text-[var(--cinnabar)] transition-colors disabled:opacity-50">
          {t(locale, "pairDissolve")}
        </button>
      )}
    </div>
  );
}
