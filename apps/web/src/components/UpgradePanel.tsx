"use client";

import { useEffect, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { attribution, track } from "@/lib/track";
import { deviceTimeZone, useCurrency } from "@/lib/use-currency";
import { formatMoney, isCurrency, priceMinor, tongkaMinor, type Currency } from "@/lib/money";
import { fill, tongkaT } from "@/lib/tongka";
import EmailField from "@/components/EmailField";
import ConsentLine from "@/components/ConsentLine";
import { tt } from "@/lib/dict/thread";
import { cv } from "@/lib/dict/convert";
import { mg } from "@/lib/dict/member-gift";
import { includedNote, upgradePanelView, type MemberState } from "@/lib/upgrade-panel";
import { MP_OFF_REGIONS_DEFAULT, plainCheckoutRegion } from "@/lib/geo";
import { emailNeedsAttention, emailSyntaxOk, normalizeEmail } from "@/lib/email-check";

/**
 * 09-17, Neil, testing his own product: after a light reading he tapped for the
 * deep one and was sent back to the cast page to re-type the question and the
 * address he had just given. The upgrade is not a new cast — it is the same
 * figure, read further — so it happens here, in one tap, and the server takes
 * the cast, the language and the address off the light reading's own session
 * (`from`, see /api/checkout).
 *
 * 09-18: the first version of this panel stopped the whole reading page from
 * hydrating and was rolled back. This one imports exactly what CasePanel
 * (which hydrates fine on the same page) imports, and nothing else; whether an
 * address is still needed is decided on the server and passed in.
 *
 * 09-22: this panel used to send only {from, tier, locale, email}. The server
 * routes Managed Payments off for a mainland buyer by looking at the device
 * clock — which was not in the payload — so the same person, one minute apart,
 * had Managed Payments off for the light reading and on for the upgrade
 * (orders #541/#542), and the upgrade carried no record of why its currency
 * was chosen. The clock travels with the tap now; the currency itself is still
 * inherited from the session we came from, which is what we want.
 *
 * `hasEmail` is only whether we already hold one; the address itself never
 * comes back to the browser.
 */
/*
 * 10-02 (转化率): the button never said a price, and an upgrade from a FREE light reading (no currency of its own) was
 * charged in USD — readers in Taipei met US$2.99 on Stripe and 17% paid it. The panel now resolves the reader's money the
 * way the cast page does (the light reading's own, when it was paid for), shows the price on the button (the first deep
 * reading's price when it is still theirs), and sends the currency with the tap.
 *
 * 10-05 (进度表 §四 28, 真 bug; 客服 #838): the 10-02 change showed the price + pay-consent to MEMBERS too — reading
 * page rendered this panel without membership, so a member viewing their own light reading saw 「看這一卦的深斷 ·
 * NT$269」 and the consent line and thought the deep reading needed a one-time payment (clicking it actually redeems
 * their allowance, no charge). `member` carries the viewer's own-reading entitlement: with deep left, the button has
 * no price and no consent and says what membership includes (the cast page's own wording — 「已用 N 次」, not a
 * counting-down 「還剩 N」, by the 09-22 decision); with the month spent, it falls to the light add-on price (what the
 * server charges). A non-member, or anyone on a forwarded link, is unchanged.
 */
/*
 * 10-23 进度表 101 (Neil: 「目前是不是还有一次深断的价格在啊」→「把 101 的 ①②③都做完吧」): under the 通卡 model no full reading is
 * sold on its own. A light reading's way to its full reading is a 1-day pass bought on this cast — 「用 1 日通卡看這一卦的深斷」,
 * the first pass at the old light price, and the day covers anything else they ask. The tap sends `pass: 1` with `from`, so
 * the server takes the cast off the light reading and the full reading comes right after payment, as an upgrade always did.
 * A member or pass holder redeems as before (no price). `tongka` null = the old model (the switch off): unchanged.
 */
export default function UpgradePanel(
  { locale, pageLocale, sid, hasEmail, needsEmail, firstDeep = false, priorCurrency = null, initialCurrency, member = null, tongka = null }: {
    locale: Locale; pageLocale: Locale; sid: string; hasEmail: boolean; needsEmail: boolean;
    firstDeep?: boolean; priorCurrency?: string | null; initialCurrency?: Currency;
    /** the viewer's own-reading membership (null = non-member, a forwarded link, or paywall off) */
    member?: MemberState;
    /** 10-23 进度表 101: the 通卡 model is open for this reader — the upgrade is a 1-day pass; `firstPass` = the first-pass price applies */
    tongka?: { firstPass: boolean } | null;
  },
) {
  const [seen, , curSrc] = useCurrency(initialCurrency);
  const prior = (priorCurrency ?? "").toUpperCase();
  const currency: Currency = isCurrency(prior) ? prior : seen;
  const price = formatMoney(currency, priceMinor(currency, firstDeep ? "one" : "deep"), locale);
  const full = formatMoney(currency, priceMinor(currency, "deep"), locale);
  // 10-05: a member redeems their allowance (no charge) while deep readings are left; once spent, an extra costs the
  // light price (the server's 09-24 M2 add-on, api/checkout memberAddon). priceOne is that add-on price.
  const priceOne = formatMoney(currency, priceMinor(currency, "one"), locale);
  const { allowance, addOnMember, usingPack, usedThisPeriod } = upgradePanelView(member);
  // 10-23 进度表 101: the 1-day pass this upgrade buys (only when the reader has nothing to redeem)
  const viaPass = !!tongka && !allowance;
  const tk = tongkaT(locale);
  const passPrice = formatMoney(currency, tongkaMinor(currency, 1, !!tongka?.firstPass), locale);
  const passRegular = formatMoney(currency, tongkaMinor(currency, 1, false), locale);
  // 09-26: TW/HK pay on YaoFlow's own Stripe page; everyone else sees Link's — decided on the device, after mount
  const [linkPage, setLinkPage] = useState(false);
  useEffect(() => { setLinkPage(!plainCheckoutRegion(null, deviceTimeZone(), MP_OFF_REGIONS_DEFAULT)); }, []);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [failed, setFailed] = useState(false);
  const [emailErr, setEmailErr] = useState<null | "bad" | "domain">(null); // 09-26 邮箱校对

  const go = async () => {
    if (busy) return;
    const typed = normalizeEmail(email);
    if (needsEmail && !emailSyntaxOk(typed)) { setInvalid(true); return; }
    if (typed && emailNeedsAttention(typed)) return; // the "did you mean" line is showing
    setInvalid(false);
    setFailed(false);
    setBusy(true);
    track("reading_click", { locale, tier: "deep", method: viaPass ? "upgrade_pass" : "upgrade", cur: currency });
    try {
      // `locale` here is the page's: it is what the delivery URL is built from.
      // The reading's own language travels with the session we came from.
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...attribution(),
          from: sid, tier: "deep", locale: pageLocale,
          ...(viaPass ? { pass: 1 } : {}),
          tzOffsetMinutes: -new Date().getTimezoneOffset(),
          timeZone: deviceTimeZone(),
          currency, ...(isCurrency(prior) ? {} : { curSrc }),
          ...(typed ? { email: typed } : {}),
        }),
      });
      if (res.status === 400) {
        const x = (await res.json().catch(() => ({}))) as { error?: string };
        if (x.error === "bad_email" || x.error === "email_domain") { setEmailErr(x.error === "bad_email" ? "bad" : "domain"); setBusy(false); return; }
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <section className="mt-[var(--s-6)] border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-5)]">
      {/* 10-14 进度表 43: the light reading's upgrade says the reader's question, the three things, and what it is not */}
      <p className="t-small mb-1 !text-[var(--ink-66)]">{cv(locale, "cdLead")}</p>
      <p className="t-body !text-[15px] text-[var(--ink)] mb-2">{cv(locale, "cdTitle")}</p>
      <ul className="space-y-1">
        <li className="t-small !text-[var(--ink)]">{cv(locale, "cdWin")}</li>
        <li className="t-small !text-[var(--ink)]">{cv(locale, "cdBasis")}</li>
        <li className="t-small !text-[var(--ink)]">{cv(locale, "cdRevisit")}</li>
      </ul>
      {hasEmail && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{t(locale, "upgradeSameInbox")}</p>}
      {needsEmail && (
        <>
          <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{t(locale, "giftEmailWhy")}</p>
          <div className="mt-[var(--s-2)]">
            <EmailField locale={locale} value={email} invalid={invalid} placeholder="you@example.com" onChange={(v) => { setEmail(v); setInvalid(false); setEmailErr(null); }} onEnter={() => void go()}
              error={invalid ? t(locale, "giftEmailNeeded") : emailErr ? t(locale, emailErr === "domain" ? "emailNoDomain" : "emailBad") : null} />
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em] disabled:opacity-60"
      >
        {busy
          ? t(locale, "aiLoading")
          : allowance
            ? t(locale, "oneUpsellCta")                                   /* member with allowance: no price */
            : viaPass
              ? `${tk.upgradeBtn} · ${passPrice}`                         /* 10-23 进度表 101: the 1-day pass */
              : `${t(locale, "oneUpsellCta")} · ${addOnMember ? priceOne : price}`}
      </button>
      {viaPass && (
        <p className="t-small mt-1 !text-[var(--ink-66)]">
          {tongka?.firstPass && passPrice !== passRegular ? <span className="!text-[var(--gold-text)]">{fill(tk.upgradeFirst, { p: passPrice, full: passRegular })} · </span> : null}
          {tk.upgradeNote}
        </p>
      )}
      {/* 10-05: member sees what membership includes (cast page's wording), not a price; non-member keeps the price note.
          10-23 进度表 96 ④: under the 通卡 model the note comes from lib/tongka.ts (pass with its end / member), never 「本月 N 次」 */}
      {allowance ? (
        <p className="t-small mt-1 !text-[var(--ink-66)]">
          {includedNote(member, locale)
            ?? (usingPack
              ? mg(locale, "packUsing", { n: member!.packLeft })
              : t(locale, "subIncludedDeep", { used: usedThisPeriod }))}
        </p>
      ) : viaPass ? null : addOnMember ? (
        <p className="t-small mt-1 !text-[var(--ink-66)]">{t(locale, "subExhausted", { price: priceOne })}</p>
      ) : firstDeep && price !== full ? (
        <p className="t-small mt-1 !text-[var(--ink-66)]">{t(locale, "payDeepFirstNote", { price, full })}</p>
      ) : null}
      {!allowance && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]" data-heat="card-trust">{cv(locale, "cdTrust")}</p>}
      <p className="t-label mt-1 !normal-case !tracking-[0.04em]">{cv(locale, "cdNot")}</p>
      {/* 09-26: the consent lives on our side only, and the Link page is announced before it opens — neither is a
          payment for a member redeeming allowance, so both are hidden there (10-05) */}
      {!allowance && <div className="mt-[var(--s-2)]"><ConsentLine locale={locale} k="payConsent" /></div>}
      {!allowance && linkPage && <p className="t-small mt-1 !text-[var(--ink-45)]">{tt(locale, "payLinkNote")}</p>}
      {failed && <p className="t-small mt-[var(--s-2)] !text-[var(--cinnabar)]">{t(locale, "aiError")}</p>}
    </section>
  );
}
