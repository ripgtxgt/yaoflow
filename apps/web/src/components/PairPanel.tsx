"use client";

import { useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { track } from "@/lib/track";

/**
 * 同题合参 (裂变 V2 ⑥): under a reading about a two-person matter, the
 * inviter writes the wording the other person will see, gets one link, and
 * — once the other side has cast — the door to the joint page. The
 * inviter's own question never leaves this page.
 */
export interface PairState { status: string; framing: string; url: string; expiresAt: number; page: string }

export default function PairPanel({ locale, sid, question, initial, expiresLabel }: {
  locale: Locale; sid: string; question: string; initial: PairState | null;
  /** pre-formatted expiry for the initial state (server-side, hydration-safe) */
  expiresLabel: string | null;
}) {
  const [framing, setFraming] = useState(question.slice(0, 120));
  const [pair, setPair] = useState<PairState | null>(initial);
  const [expires, setExpires] = useState<string | null>(expiresLabel);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const mint = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, framing, locale }) });
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as PairState;
      setPair(d);
      setExpires(new Date(d.expiresAt).toLocaleDateString(locale === "zh" ? "zh-CN" : locale === "zh-hant" ? "zh-TW" : locale, { year: "numeric", month: "short", day: "numeric" }));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!pair) return;
    const text = t(locale, "pairShareText", { framing: pair.framing, url: pair.url });
    try {
      if (navigator.share) {
        await navigator.share({ text });
        track("share_click", { locale, method: "native" });
        return;
      }
    } catch { /* cancelled */ }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      track("share_click", { locale, method: "copy" });
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  return (
    <section id="pair" className="mt-[var(--s-6)] border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-5)]">
      <p className="t-label mb-2">{t(locale, "pairTitle")}</p>
      <p className="t-body !text-[15px] text-[var(--ink-86)]">{t(locale, "pairBody")}</p>

      {!pair ? (
        <div className="mt-[var(--s-4)]">
          <p className="t-label mb-2">{t(locale, "pairFramingLabel")}</p>
          <input
            value={framing}
            maxLength={120}
            onChange={(e) => setFraming(e.target.value)}
            className="t-body w-full bg-transparent border-b border-current/25 pb-2 outline-none focus:border-current/60"
          />
          <p className="t-small mt-2">{t(locale, "pairFramingHint")}</p>
          <div className="mt-[var(--s-4)] flex flex-wrap items-center gap-x-6 gap-y-3">
            <button
              type="button"
              onClick={() => void mint()}
              disabled={busy || framing.trim().length < 2}
              className="min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em] disabled:opacity-60"
            >
              {t(locale, busy ? "pairMinting" : "pairButton")}
            </button>
            {failed && <p className="t-small !text-[var(--cinnabar)]">{t(locale, "pairError")}</p>}
          </div>
        </div>
      ) : pair.status === "claimed" ? (
        <div className="mt-[var(--s-4)]">
          <p className="t-body">{t(locale, "pairAnswered")}</p>
          <Link href={pair.page} className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]">
            {t(locale, "pairView")}
          </Link>
        </div>
      ) : pair.status === "open" ? (
        <div className="mt-[var(--s-4)]">
          <p className="t-small mb-1">{t(locale, "pairFramingLabel")}: <span className="!text-[var(--ink)]">{pair.framing}</span></p>
          <p className="t-small mb-2">{t(locale, "pairReady")}</p>
          <p className="font-[family-name:var(--mono)] text-[13px] break-all select-all border border-[var(--ink-16)] rounded-[2px] px-3 py-2">{pair.url}</p>
          <div className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-6 gap-y-3">
            <button type="button" onClick={() => void share()} className="min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]">
              {t(locale, copied ? "giftCastCopied" : "giftCastCopy")}
            </button>
            {expires && <p className="t-small">{t(locale, "pairWaiting", { date: expires })}</p>}
          </div>
        </div>
      ) : (
        <p className="t-small mt-[var(--s-4)]">{pair.status === "dissolved" ? t(locale, "pairDissolved") : t(locale, "refGiftExpired", { date: expires ?? "" })}</p>
      )}
    </section>
  );
}
