"use client";

import EmailField from "@/components/EmailField";
import { t, type Locale } from "@/lib/i18n";
import type { Tier } from "@/lib/reading";
import { giftEmailRequired } from "@/lib/paywall";

/**
 * 10-22 进度表 76 (CastFlow 拆分): the painted door's claim panel (paywall mode `gift`) — the price stood, the tap was
 * counted; now the truth — this one is a gift — and an optional address so delivery works as it would for a buyer.
 * The deep reading insists on an address (its timing revisit has to go somewhere); the light one may skip.
 */
export default function GiftClaimPanel({ locale, tier, signedIn, email, setEmail, invalid, emailErr, limited, notify, setNotify, claim }: {
  locale: Locale; tier: Tier; signedIn: boolean;
  email: string; setEmail: (v: string) => void;
  /** the "this is needed" state, cleared as they type */
  invalid: boolean;
  /** the server's answer to the address (bad shape / no such domain) */
  emailErr: null | "bad" | "domain";
  /** the server's five-a-day brake answered 429 */
  limited: boolean;
  notify: boolean; setNotify: (v: boolean) => void;
  claim: (tier: Tier, email: string | null) => void;
}) {
  const required = giftEmailRequired(tier);
  return (
    <div className="mt-[var(--s-3)] p-[var(--s-4)] border border-[var(--gold)] rounded-[2px] fade-in">
      <p className="t-body !text-[15px]">{t(locale, "giftTitle")}</p>
      {!signedIn && (
        <>
          <p className="t-small mt-1 !text-[var(--ink-66)]">{t(locale, required ? "giftEmailWhy" : "giftEmailHint")}</p>
          <div className="mt-[var(--s-3)]">
            <EmailField locale={locale} required={required} value={email} invalid={invalid} placeholder={t(locale, "loginEmailPlaceholder")}
              onChange={setEmail} onEnter={() => claim(tier, email)}
              error={invalid ? t(locale, required ? "giftEmailNeeded" : "giftEmailInvalid") : emailErr ? t(locale, emailErr === "domain" ? "emailNoDomain" : "emailBad") : null} />
          </div>
        </>
      )}
      {limited && <p className="t-small mt-2 !text-[var(--cinnabar)]">{t(locale, "giftLimitBody")}</p>}
      <label className="mt-[var(--s-3)] flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-[3px] accent-[var(--ink)]" />
        <span className="t-small !text-[var(--ink-66)]">{t(locale, "notifyOptIn")}</span>
      </label>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-[var(--s-3)]">
        <button
          type="button"
          onClick={() => claim(tier, signedIn ? null : email)}
          className="min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]"
        >
          {t(locale, "giftClaim")}
        </button>
        {!signedIn && !required && (
          <button type="button" onClick={() => claim(tier, null)} className="t-label hover:text-[var(--ink)] transition-colors">
            {t(locale, "giftSkip")}
          </button>
        )}
      </div>
    </div>
  );
}
