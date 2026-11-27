"use client";

import { useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import ShareButton from "@/components/ShareButton";

/**
 * 我的推荐 on the account page (总方案 §5.3 ⑧): four numbers, then the
 * rewards you can spend, the deep readings that still have a gift to give
 * (minted right here, same link as the reading page's panel), and the gifts
 * already sent with whether they were claimed. Dates arrive pre-formatted from
 * the server so the first paint and hydration agree.
 */
export interface RefView {
  broughtCasts: number;
  inviteLights: number;
  gifts: { token: string; url: string; created: string; expires: string; used: string | null; expired: boolean }[];
  rewards: { id: number; href: string | null; expires: string; used: string | null }[];
  giftable: { sid: string; date: string; title: string; question: string }[];
}

function Stat({ n, label, sub }: { n: number; label: string; sub?: string | null }) {
  return (
    <div>
      <dt className="t-label">{label}</dt>
      <dd className="t-d2 mt-1 tabular-nums">{n}</dd>
      {sub && <dd className="t-small mt-0.5">{sub}</dd>}
    </div>
  );
}

const ROW = "py-3 border-t border-dotted border-[var(--ink-16)] first:border-t-0";
const BTN = "shrink-0 min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] text-[13px] tracking-[0.16em] disabled:opacity-60";
const LINK_BOX = "font-[family-name:var(--mono)] text-[13px] break-all select-all border border-[var(--ink-16)] rounded-[2px] px-3 py-2";

export default function MyReferrals({ locale, view }: { locale: Locale; view: RefView }) {
  const [minted, setMinted] = useState<Record<string, string>>({}); // sid → gift url made on this page
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const mint = async (sid: string) => {
    if (busy) return;
    setBusy(sid);
    setFailed(null);
    try {
      const res = await fetch("/api/gift-cast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, locale }) });
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as { url: string };
      setMinted((m) => ({ ...m, [sid]: d.url }));
    } catch {
      setFailed(sid);
    } finally {
      setBusy(null);
    }
  };

  const mintedCount = Object.keys(minted).length;
  const giftsSent = view.gifts.length + mintedCount;
  const claimed = view.gifts.filter((g) => g.used).length;
  const usable = view.rewards.filter((r) => r.href).length;
  const canGive = view.giftable.length - mintedCount;
  const empty = view.broughtCasts === 0 && giftsSent === 0 && view.rewards.length === 0 && view.giftable.length === 0;

  return (
    <div>
      <p className="t-body text-[var(--ink-66)]">{t(locale, "refHow")}</p>
      {empty ? (
        <p className="t-body mt-[var(--s-4)]">{t(locale, "refEmpty")}</p>
      ) : (
        <>
          <dl className="mt-[var(--s-4)] grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 py-[var(--s-4)] border-y border-dotted border-[var(--ink-16)]">
            <Stat n={view.broughtCasts} label={t(locale, "refBrought")} sub={view.inviteLights > 0 ? t(locale, "refInviteLights", { n: view.inviteLights }) : null} />
            <Stat n={giftsSent} label={t(locale, "refGifts")} sub={claimed > 0 ? t(locale, "refGiftsClaimed", { n: claimed }) : null} />
            <Stat n={view.rewards.length} label={t(locale, "refRewards")} sub={usable > 0 ? t(locale, "refRewardsUsable", { n: usable }) : null} />
            <Stat n={canGive} label={t(locale, "refCanGive")} />
          </dl>

          {view.rewards.length > 0 && (
            <div className="mt-[var(--s-5)]">
              <p className="t-label mb-2">{t(locale, "refRewardsHead")}</p>
              <ul>
                {view.rewards.map((r) => (
                  <li key={r.id} className={`${ROW} flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1`}>
                    {r.href ? (
                      <>
                        <p className="t-body">{t(locale, "refRewardUsable", { date: r.expires })}</p>
                        <Link href={r.href} className="t-small !text-[var(--ink)] underline underline-offset-4">{t(locale, "refRewardUse")}</Link>
                      </>
                    ) : (
                      <p className="t-small">{r.used ? t(locale, "refRewardUsed", { date: r.used }) : t(locale, "refRewardExpired", { date: r.expires })}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.giftable.length > 0 && (
            <div className="mt-[var(--s-5)]">
              <p className="t-label mb-2">{t(locale, "refGiftableHead")}</p>
              <ul>
                {view.giftable.map((g) => (
                  <li key={g.sid} className={ROW}>
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <p className="t-label !text-[var(--ink-45)]">{g.date}<span className="mx-2">·</span>{g.title}</p>
                        <p className="t-body mt-1 truncate">{g.question}</p>
                      </div>
                      {!minted[g.sid] && (
                        <button type="button" onClick={() => void mint(g.sid)} disabled={busy === g.sid} className={`${BTN} border border-[var(--ink)] text-[var(--ink)]`}>
                          {t(locale, busy === g.sid ? "giftCastMinting" : "giftCastButton")}
                        </button>
                      )}
                    </div>
                    {failed === g.sid && <p className="t-small !text-[var(--cinnabar)] mt-1">{t(locale, "giftCastError")}</p>}
                    {minted[g.sid] && (
                      <div className="mt-2">
                        <p className="t-small mb-1">{t(locale, "giftCastReady")}</p>
                        <p className={LINK_BOX}>{minted[g.sid]}</p>
                        <ShareButton locale={locale} surface="referral" url="" text={t(locale, "giftCastShareText", { url: minted[g.sid]! })} className="mt-2" label={t(locale, "giftCastCopy")} copiedLabel={t(locale, "giftCastCopied")} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.gifts.length > 0 && (
            <div className="mt-[var(--s-5)]">
              <p className="t-label mb-2">{t(locale, "refGifts")}</p>
              <ul>
                {view.gifts.map((g) => {
                  const pending = !g.used && !g.expired;
                  return (
                    <li key={g.token} className={ROW}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                        <p className="t-label !text-[var(--ink-45)]">{g.created}</p>
                        <p className={pending ? "t-small !text-[var(--ink)]" : "t-small"}>
                          {g.used ? t(locale, "refGiftClaimed", { date: g.used }) : g.expired ? t(locale, "refGiftExpired", { date: g.expires }) : t(locale, "refGiftPending", { date: g.expires })}
                        </p>
                      </div>
                      {pending && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                          <p className={`${LINK_BOX} min-w-0 flex-1`}>{g.url}</p>
                          <ShareButton locale={locale} surface="referral" url="" text={t(locale, "giftCastShareText", { url: g.url })} label={t(locale, "giftCastCopy")} copiedLabel={t(locale, "giftCastCopied")} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
