"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { tt } from "@/lib/dict/thread";
import { track } from "@/lib/track";

/**
 * 公开卦例 (裂变 V2 ⑦; 09-26 Neil: 「要做到有引导客户去做这件事」).
 *
 * A visible card under the conversation, not a folded row: why it matters to
 * someone else, exactly what would be shown (a preview built from this very
 * reading), and what comes back — a reading the owner gives to themselves or
 * to a friend. After publishing, the same card asks who the reading is for,
 * and later shows what the case did (reads, and people who cast after it).
 */
export interface CaseState { publicId: string; framing: string | null; url: string }
export type RewardView =
  | { state: "none"; why?: "cap_person" | "cap_site" | "no_owner" | "free_reading" }
  | { state: "open"; member: boolean; selfCapped?: boolean }
  | { state: "chosen"; choice: "self_light" | "self_deep" | "gift"; url: string | null };
export interface CasePreview { hex: string; fields: { label: string; text: string }[] }

export default function CasePanel({ locale, sid, initial, initialReward, preview, member, impact, rewardable = true }: {
  locale: Locale; sid: string; initial: CaseState | null; initialReward?: RewardView | null;
  /** 09-27: free light readings can still be published, but earn nothing back — so promise nothing */
  rewardable?: boolean;
  preview: CasePreview; member: boolean; impact?: { reads: number; casts: number } | null;
}) {
  const [state, setState] = useState<CaseState | null>(initial);
  const [reward, setReward] = useState<RewardView | null>(initialReward ?? null);
  const [withQuestion, setWithQuestion] = useState(!!initial?.framing);
  const [framing, setFraming] = useState(initial?.framing ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const publish = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/case", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, framing: withQuestion ? framing : "", locale }) });
      const d = (await res.json()) as CaseState & { error?: string; reward?: RewardView };
      if (!res.ok) { setError(d.error === "link" ? t(locale, "caseNoLinks") : t(locale, "caseError")); return; }
      setState({ publicId: d.publicId, framing: d.framing, url: d.url });
      setReward(d.reward ?? null);
      track("share_click", { locale, method: "case" });
    } catch {
      setError(t(locale, "caseError"));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (who: "self" | "gift") => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/case", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, action: "reward", who, locale }) });
      const d = (await res.json()) as { reward?: RewardView };
      if (d.reward) setReward(d.reward);
      track("share_click", { locale, method: who === "gift" ? "case_gift" : "case_self" });
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/case", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, action: "unpublish" }) });
      setState(null);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* blocked */ }
  };

  const btn = "min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] text-[13px] tracking-[0.12em] disabled:opacity-50";

  return (
    <section id="case" className="mt-[var(--s-6)] scroll-mt-20 border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-5)]">
      <p className="t-label mb-2 !text-[var(--gold-text)]">{tt(locale, state ? "acctCasesTitle" : "pubInviteTitle")}</p>

      {!state && (
        <>
          <p className="t-body !text-[15px]">{tt(locale, "pubInviteBody")}</p>
          {rewardable && <p className="t-small mt-[var(--s-2)] !text-[var(--gold-text)]">{tt(locale, member ? "pubRewardMember" : "pubRewardGuest")}</p>}

          {/* the preview: exactly what would be public, from this reading */}
          <div className="mt-[var(--s-4)] rounded-[2px] bg-[var(--ink)]/[0.04] px-[var(--s-3)] py-[var(--s-3)]">
            <p className="t-label mb-2">{tt(locale, "pubPreview")}</p>
            <p className="t-small !text-[var(--ink)] mb-1">{preview.hex}</p>
            {withQuestion && framing.trim() && <p className="t-small !text-[var(--ink)] mb-1">「{framing.trim()}」</p>}
            {preview.fields.map((f) => (
              <p key={f.label} className="t-small !text-[var(--ink-66)] mt-1"><span className="!text-[var(--ink-45)]">{f.label}：</span>{f.text}</p>
            ))}
            {!withQuestion && <p className="t-small mt-2 !text-[var(--ink-45)]">{tt(locale, "pubPreviewNoQ")}</p>}
          </div>

          <label className="mt-[var(--s-3)] flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={withQuestion} onChange={(e) => setWithQuestion(e.target.checked)} className="mt-[3px] accent-[var(--ink)]" />
            <span className="t-small !text-[var(--ink)]">{t(locale, "caseWithQuestion")}</span>
          </label>
          {withQuestion && (
            <div className="mt-2 pl-7">
              <input value={framing} maxLength={80} onChange={(e) => setFraming(e.target.value)} placeholder={t(locale, "caseQuestionPlaceholder")}
                className="t-body w-full bg-transparent border-b border-current/25 pb-2 outline-none focus:border-current/60 placeholder:opacity-35" />
              <p className="t-small mt-1">{t(locale, "caseQuestionHint")}</p>
            </div>
          )}
          <div className="mt-[var(--s-4)] flex flex-wrap items-center gap-x-6 gap-y-3">
            <button type="button" onClick={() => void publish()} disabled={busy || (withQuestion && framing.trim().length < 2)} data-heat="case-publish"
              className={`${btn} bg-[var(--ink)] text-[var(--paper)]`}>
              {t(locale, busy ? "casePublishing" : "casePublish")}
            </button>
            {error && <p className="t-small !text-[var(--cinnabar)]">{error}</p>}
          </div>
        </>
      )}

      {state && (
        <>
          {/* the reading it earned: who is it for */}
          {reward?.state === "open" && (
            <div className="mb-[var(--s-4)] fade-in">
              <p className="t-body !text-[16px] mb-[var(--s-3)]">{tt(locale, "rwTitle")}</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={() => void choose("gift")} disabled={busy} data-heat="case-reward-gift" className={`${btn} bg-[var(--ink)] text-[var(--paper)]`}>
                  {tt(locale, "rwGift")}
                </button>
                {/* 10-02: a member who has kept this period's five for themselves can only give this one */}
                {!reward.selfCapped && (
                  <button type="button" onClick={() => void choose("self")} disabled={busy} data-heat="case-reward-self" className={`${btn} border border-[var(--ink)]`}>
                    {tt(locale, reward.member ? "rwSelfMember" : "rwSelfGuest")}
                  </button>
                )}
              </div>
              {reward.selfCapped && <p className="t-small mt-2 !text-[var(--ink-45)]">{tt(locale, "rwSelfCapped")}</p>}
            </div>
          )}
          {reward?.state === "chosen" && (
            <div className="mb-[var(--s-4)] fade-in">
              {reward.choice === "self_deep" ? (
                <p className="t-small !text-[var(--gold-text)]">{tt(locale, "rwDoneDeep")} <a href={`/${locale}/cast`} className="underline underline-offset-4">{tt(locale, "rwOpen")} →</a></p>
              ) : reward.url ? (
                <>
                  <p className="t-small !text-[var(--gold-text)] mb-2">{tt(locale, reward.choice === "gift" ? "rwDoneGift" : "rwDoneLight")}</p>
                  {reward.choice === "gift" && <p className="t-small !text-[var(--ink-66)] mb-2">{tt(locale, "giftRewardNote")}</p>}
                  <p className="font-[family-name:var(--mono)] text-[13px] break-all select-all border border-[var(--ink-16)] rounded-[2px] px-3 py-2">{reward.url}</p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 items-center">
                    <button type="button" onClick={() => void copy(reward.url!)} className={`${btn} bg-[var(--ink)] text-[var(--paper)]`}>
                      {t(locale, copied === reward.url ? "giftCastCopied" : "giftCastCopy")}
                    </button>
                    {reward.choice === "self_light" && <a href={reward.url} className="t-small underline underline-offset-4">{tt(locale, "rwOpen")} →</a>}
                  </div>
                </>
              ) : null}
            </div>
          )}
          {reward?.state === "none" && (reward.why === "cap_person" || reward.why === "cap_site") && (
            <p className="t-small mb-[var(--s-4)] !text-[var(--ink-45)]">{tt(locale, reward.why === "cap_person" ? "rwCapPerson" : "rwCapSite")}</p>
          )}

          <p className="t-small !text-[var(--ink)] mb-2">{t(locale, "casePublished")}</p>
          <p className="font-[family-name:var(--mono)] text-[13px] break-all select-all border border-[var(--ink-16)] rounded-[2px] px-3 py-2">{state.url}</p>
          {impact && impact.reads > 0 && (
            <p className="t-small mt-2 !text-[var(--gold-text)]">{tt(locale, "impact", { reads: impact.reads, casts: impact.casts })}</p>
          )}
          <div className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-6 gap-y-3">
            <button type="button" onClick={() => void copy(state.url)} className={`${btn} border border-[var(--ink)]`}>
              {t(locale, copied === state.url ? "giftCastCopied" : "giftCastCopy")}
            </button>
            <button type="button" onClick={() => void withdraw()} disabled={busy} className="t-label hover:text-[var(--cinnabar)] transition-colors disabled:opacity-50">
              {t(locale, "caseWithdraw")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
