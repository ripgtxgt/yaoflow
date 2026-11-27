"use client";

import type { Locale } from "@/lib/i18n";
import type { Entitlement } from "@/lib/sub-plan";
import { DEEP_PER_MONTH, GIFT_POOL_PER_MONTH, MEMBER_FOLLOWUP_LIMIT } from "@/lib/sub-plan";
import { formatMoney, passMinor, priceMinor, type Currency } from "@/lib/money";
import type { Tier } from "@/lib/reading";
import { tt } from "@/lib/dict/thread";
import { mg } from "@/lib/dict/member-gift";
import { passT } from "@/lib/dict/pass";
import { firstT } from "@/lib/dict/first-month";
import { track } from "@/lib/track";
import PackBuy from "@/components/PackBuy";
import ConsentLine from "@/components/ConsentLine";
import type { PriceLabels } from "@/lib/cast-ui/types";

/**
 * 10-22 进度表 76 (CastFlow 拆分): the offers and notices around the price — each a card with its own words and
 * one or two taps, none of them holding state. CastFlow decides when each shows.
 */

/** 09-26 (Neil: 非会员看到价格时突出会员优惠): the arithmetic, not a slogan — never shown to a member */
export function MemberCard({ locale, currency, price, firstMonth, firstLabel, visitDay, signedIn }: {
  locale: Locale; currency: Currency; price: PriceLabels; firstMonth: boolean; firstLabel: string; visitDay: number; signedIn: boolean;
}) {
  const monthMinor = priceMinor(currency, "month");
  const deepMinor = priceMinor(currency, "deep");
  const per = formatMoney(currency, Math.round(monthMinor / DEEP_PER_MONTH), locale);
  const pct = Math.max(0, Math.round(100 * (1 - monthMinor / (DEEP_PER_MONTH * deepMinor))));
  return (
    <div className="mt-[var(--s-4)] border border-[var(--gold)] bg-[var(--gold)]/[0.06] rounded-[2px] px-[var(--s-4)] py-[var(--s-4)] fade-in" data-heat="member-card">
      <p className="t-label mb-2 !text-[var(--gold-text)]">
        {visitDay >= 2 ? tt(locale, "subReturnTitle", { n: visitDay }) : tt(locale, "memberCardTitle")}
      </p>
      <p className="t-body !text-[15px]">
        {tt(locale, "memberCardCompare", { deep: price.deep, month: price.month, n: DEEP_PER_MONTH, per, pct })}{firstMonth ? firstT(locale, "paren", { first: firstLabel }) : ""}
      </p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">
        {tt(locale, "memberCardPerks", { f: MEMBER_FOLLOWUP_LIMIT, g: GIFT_POOL_PER_MONTH })}
      </p>
      <div className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-5 gap-y-2">
        <a href={`/${locale}/account#membership`} data-heat={visitDay >= 2 ? "sub-return" : "sub-upsell"}
           className="inline-block min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.12em]">
          {firstMonth ? firstT(locale, "cta", { first: firstLabel }) : tt(locale, "memberCardCta", { month: price.month })}
        </a>
        {!signedIn && (
          <a href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/cast`)}`} className="t-small underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">
            {tt(locale, "memberCardSignIn")}
          </a>
        )}
      </div>
      <a href={`/${locale}/account?want=pass#membership`} data-heat="pass-link" className="block t-small mt-[var(--s-2)] underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">
        {passT(locale, "link", { pass: formatMoney(currency, passMinor(currency), locale) })}
      </a>
    </div>
  );
}

/** the second reading of the day: the month, the pass, or this one alone */
export function SecondAsk({ locale, currency, price, firstMonth, firstLabel, tier, onSingle }: {
  locale: Locale; currency: Currency; price: PriceLabels; firstMonth: boolean; firstLabel: string; tier: Tier; onSingle: () => void;
}) {
  const passLabel = formatMoney(currency, passMinor(currency), locale);
  const save = formatMoney(currency, passMinor(currency) - priceMinor(currency, "month"), locale);
  return (
    <div className="mt-[var(--s-3)] p-[var(--s-4)] border border-[var(--gold)] bg-[var(--gold)]/[0.06] rounded-[2px] fade-in" data-heat="second-today">
      <p className="t-body !text-[16px]">{passT(locale, "title2nd")}</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{passT(locale, "body2nd")}</p>
      <div className="mt-[var(--s-3)] flex flex-col gap-2">
        <a href={`/${locale}/account#membership`} data-heat="second-sub" onClick={() => track("reading_click", { locale, tier, method: "second_sub" })}
          className="block rounded-[2px] px-4 py-3 bg-[var(--ink)] text-[var(--paper)]">
          <span className="text-[14px]">{firstMonth ? firstT(locale, "optSub", { first: firstLabel, month: price.month }) : passT(locale, "optSub", { month: price.month })}</span>
          <span className="block text-[12px] opacity-75 mt-0.5">{firstMonth ? firstT(locale, "optSubSave", { save }) : passT(locale, "optSubSave", { save })}</span>
        </a>
        <a href={`/${locale}/account?want=pass#membership`} data-heat="second-pass" onClick={() => track("reading_click", { locale, tier, method: "second_pass" })}
          className="block rounded-[2px] px-4 py-3 border border-[var(--ink)] text-[14px]">
          {passT(locale, "optPass", { pass: passLabel })}
        </a>
        <button type="button" data-heat="second-single" onClick={onSingle}
          className="self-start t-small underline underline-offset-4 !text-[var(--ink-66)] mt-1">
          {passT(locale, "single")}
        </button>
      </div>
    </div>
  );
}

/** 10-04 支付宝: a mainland clock — Alipay is there for CNY / USD; otherwise Stripe's page needs an international card */
export function CnPayNote({ locale, currency, onContinue, onCancel }: { locale: Locale; currency: Currency; onContinue: () => void; onCancel: () => void }) {
  const ali = currency === "CNY" || currency === "USD";
  return (
    <div className={`mt-[var(--s-3)] p-[var(--s-4)] border ${ali ? "border-[var(--gold)]" : "border-[var(--cinnabar)]"} rounded-[2px] fade-in`} role="alert">
      <p className="t-body !text-[15px]">{tt(locale, ali ? "cnPayTitleAli" : "cnPayTitle")}</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{tt(locale, ali ? "cnPayBodyAli" : "cnPayBody")}</p>
      <div className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="button" onClick={onContinue}
          className="min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.12em]">
          {tt(locale, ali ? "cnPayGoAli" : "cnPayGo")}
        </button>
        <button type="button" onClick={onCancel} className="t-small underline underline-offset-4 !text-[var(--ink-66)]">{tt(locale, "cnPayCancel")}</button>
      </div>
    </div>
  );
}

/** 09-29 会员裂变 ②: the allowance ran out — the cheapest way to more is a friend, said before the price; the pack after */
export function MemberOutGift({ locale, entitlement }: { locale: Locale; entitlement: Entitlement }) {
  return (
    <div className="mt-[var(--s-3)] border border-[var(--cinnabar)]/50 rounded-[2px] px-[var(--s-4)] py-[var(--s-3)]" data-heat="member-out-gift">
      <p className="t-body !text-[15px]">{mg(locale, "outTitle")}</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{mg(locale, "outBody")}</p>
      <a href={`/${locale}/account#gift`} className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">{mg(locale, "outGo")}</a>
      {/* 09-29 会员增购包: the other way to more, after the friend */}
      {entitlement.packBuyable && (
        <div className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-[var(--ink-16)]">
          <p className="t-small mb-2 !text-[var(--ink-66)]">{mg(locale, "packLead")}</p>
          <PackBuy locale={locale} quotes={entitlement.packQuotes} singles={entitlement.singlesThisPeriod ?? 0} />
        </div>
      )}
    </div>
  );
}

/** 09-28: the second cast of the visit — a word instead of a third throw */
export function SecondCastNote({ locale, price }: { locale: Locale; price: string }) {
  return (
    <div className="mt-[var(--s-3)] border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-3)] fade-in" data-heat="second-cast">
      <p className="t-body !text-[15px]">{tt(locale, "secondCastTitle")}</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{tt(locale, "secondCastBody", { price })}</p>
    </div>
  );
}

/** 09-26 挽回: the figure is back from an unfinished checkout; say what usually stops people on Stripe's page, and one tap returns there */
export function PayBackPanel({ locale, tier, firstPrice, firstNote = null, alipay, mainland, plainPay, busy, onRetry }: {
  locale: Locale; tier: "one" | "deep";
  /** the first-time price line, when this reader still has it */
  firstPrice: string | null;
  /** 10-23 进度表 101: under the 通卡 model, the first 1-day pass's line instead (no 「首次深斷」 any more) */
  firstNote?: string | null;
  alipay: boolean; mainland: boolean; plainPay: boolean; busy: boolean; onRetry: () => void;
}) {
  return (
    <div className="mt-[var(--s-4)] p-[var(--s-4)] border border-[var(--gold)] bg-[var(--gold)]/[0.06] rounded-[2px] fade-in">
      <p className="t-body !text-[16px]">{tt(locale, "payBackTitle")}</p>
      <ul className="t-small mt-[var(--s-2)] !text-[var(--ink-66)] list-disc pl-5 space-y-1">
        {/* 10-09 (Neil: 「做第1个吧」): Alipay refuses without a reason (one reader, three tries on 10-09) — nothing was
            charged; another source inside Alipay or a Visa / Mastercard usually goes through */}
        {alipay && <li>{tt(locale, "payBackAlipay")}</li>}
        {!mainland && !plainPay && <li>{tt(locale, "payLinkNote")}</li>}
        <li>{tt(locale, "payBackWallet")}</li>
        {/* 09-26: of the risk-check blocks, most people paid later with another card or Apple Pay — tell the rest */}
        <li>{tt(locale, "payBackDeclined")}</li>
        {/* 10-06 (Neil: 「你加吧」): three Taiwan cards in two days declined with transaction_not_allowed — debit cards
            there often have online / overseas payments switched off; the bank app turns them on */}
        {plainPay && <li>{tt(locale, "payBackDebit")}</li>}
        <li>{tt(locale, "payBackSafe")}</li>
        <li>{tt(locale, "payBackCur")}</li>
      </ul>
      {firstNote ? <p className="t-small mt-[var(--s-2)] !text-[var(--gold-text)]">{firstNote}</p>
        : tier === "deep" && firstPrice && <p className="t-small mt-[var(--s-2)] !text-[var(--gold-text)]">{tt(locale, "payBackFirst", { price: firstPrice })}</p>}
      <button type="button" onClick={onRetry} disabled={busy}
        className="mt-[var(--s-3)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em] disabled:opacity-50">
        {tt(locale, "payBackGo")}
      </button>
      <div className="mt-[var(--s-2)]"><ConsentLine locale={locale} k="payConsent" /></div>
    </div>
  );
}
