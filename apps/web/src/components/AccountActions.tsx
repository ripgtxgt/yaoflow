"use client";

import ConsentLine from "@/components/ConsentLine";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locales";
import type { Plan } from "@/lib/subscription";
import { countryFromTimeZone, firstMonthExtraMinor, firstMonthMinor, formatMoney, isMainlandTimeZone, passMinor, priceLabels, yearlySavePct, type Currency } from "@/lib/money";
import { firstT } from "@/lib/dict/first-month";
import { passT } from "@/lib/dict/pass";
import { tt } from "@/lib/dict/thread";
import { marketingBoxStartsTicked } from "@/lib/consent";
import Link from "next/link";
import { deviceTimeZone, useCurrency } from "@/lib/use-currency";
import CurrencyMenu from "@/components/CurrencyMenu";
import { attribution, track } from "@/lib/track";
import TongkaPanel from "@/components/TongkaPanel";
import { checkoutV2 } from "@/lib/checkout-client";
import { tongkaT } from "@/lib/tongka";

/**
 * Sign out: end the session server-side, drop the cookies, go home. 11-10 (Neil, #3639 signed out 1.7 s after opening the
 * account page, then bought a pass she did not need): two taps — the first asks 「確定登出？」 for 5 seconds.
 */
const LOGOUT_SURE: Record<string, string> = { zh: "确定登出？", "zh-hant": "確定登出？", en: "Sign out?", ja: "ログアウトしますか？", ko: "로그아웃할까요?", fr: "Se déconnecter ?", de: "Abmelden?", es: "¿Cerrar sesión?", pt: "Sair?" };
export function LogoutButton({ locale }: { locale: Locale }) {
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const id = setTimeout(() => setSure(false), 5000); return () => clearTimeout(id); }, [sure]);
  return (
    <button
      type="button"
      disabled={busy}
      data-heat={sure ? "logout-confirm" : "logout"}
      onClick={async () => {
        if (!sure) { setSure(true); return; }
        setBusy(true);
        try {
          const res = await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }) });
          const data = (await res.json()) as { to?: string };
          window.location.href = data.to ?? `/${locale}`;
        } catch {
          setBusy(false);
        }
      }}
      className="t-label hover:text-[var(--ink)] transition-colors disabled:opacity-50"
    >
      {sure ? (LOGOUT_SURE[locale] ?? LOGOUT_SURE.en) : t(locale, "accountLogout")}
    </button>
  );
}

/** The two ways in: monthly or yearly. Both go to Stripe Checkout and come back to this page. */
export function SubscribeButtons(
  { locale, initialCurrency, edgeCountry, yearly = false, firstMonth = false, tongka = false, firstTongka = false }: { locale: Locale; initialCurrency?: Currency; edgeCountry?: string | null; yearly?: boolean; /** 10-22 通卡: the passes instead of the one-off month */ tongka?: boolean; firstTongka?: boolean; /** 10-10 首月同价: never a member before — the first month costs the one-off month's price */ firstMonth?: boolean },
) {
  const [busy, setBusy] = useState<Plan | "pass" | null>(null);
  const [error, setError] = useState(false);
  // the painted door (PAYWALL=gift): the tap was counted, nothing opens — say so
  const [doorNote, setDoorNote] = useState(false);
  const [currency, chooseCurrency] = useCurrency(initialCurrency, edgeCountry ?? null);
  const price = priceLabels(currency, locale);
  const [mainland, setMainland] = useState(false);
  useEffect(() => { setMainland(isMainlandTimeZone(deviceTimeZone(), locale, navigator.language)); }, []);
  // 10-12 挽回信序列: 「沒付完時寄信提醒我」 — for a membership, one letter an hour later; ticked where the law allows
  const [remind, setRemind] = useState(false);
  useEffect(() => { setRemind(marketingBoxStartsTicked(countryFromTimeZone(deviceTimeZone()), edgeCountry ?? null)); }, [edgeCountry]);
  // 10-10 首月同价: say both numbers — the first month, and the monthly fee it renews at
  const first = firstMonth && firstMonthExtraMinor(currency) > 0;
  const firstLabel = formatMoney(currency, firstMonthMinor(currency), locale);
  const label = (plan: Plan) =>
    plan === "month"
      ? (first ? firstT(locale, "monthly", { first: firstLabel, month: price.month }) : t(locale, "subMonthly", { price: price.month }))
      : t(locale, "subYearly", { price: price.year, save: yearlySavePct(currency) });
  const passLabel = formatMoney(currency, passMinor(currency), locale);
  const go = async (plan: Plan | "pass") => {
    if (busy) return;
    setBusy(plan);
    setError(false);
    try {
      // 09-26 会员单月: the one-off month has its own checkout (one payment, no subscription)
      // 10-22 进度表 57: the one checkout entrance (the one-off month is the 30-day pass)
      const res = await checkoutV2(plan === "pass" ? "pass_30" : plan, { ...attribution(), locale, currency, tzOffsetMinutes: -new Date().getTimezoneOffset(), timeZone: deviceTimeZone(), ...(remind ? { remind: true } : {}) });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { url?: string; gift?: boolean };
      if (data.gift) {
        track("sub_intent", { locale, tier: plan, cur: currency });
        setDoorNote(true);
        setBusy(null);
        return;
      }
      if (!data.url) throw new Error("no url");
      window.location.href = data.url;
    } catch {
      setError(true);
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className={`grid gap-3 ${yearly ? "sm:grid-cols-2" : ""}`}>
        {/* 09-27: the yearly plan is off the shelf (yearlyOn) */}
        {(yearly ? (["month", "year"] as const) : (["month"] as const)).map((plan) => (
          <button
            key={plan}
            type="button"
            disabled={busy !== null}
            onClick={() => go(plan)}
            className="text-left rounded-[2px] p-[var(--s-4)] border border-[var(--ink-16)] hover:border-[var(--ink-45)] transition-colors disabled:opacity-50 min-h-[var(--s-6)]"
          >
            <p className="t-body !text-[15px] mb-1">{label(plan)}</p>
            <p className="t-small !text-[var(--ink-45)]">{busy === plan ? t(locale, "payRedirect") : t(locale, "subSubscribe")}</p>
          </button>
        ))}
      </div>
      {/* 10-24 (#2915: 14 tries at a membership with only Alipay to pay with): Stripe takes no Alipay for a subscription —
          a mainland reader hears it before tapping, and that the passes below can be paid with Alipay */}
      {(mainland || currency === "CNY") && <p className="t-small !text-[var(--cinnabar)]" data-heat="sub-card-only">{tongkaT(locale).memberCardOnly}</p>}
      {/* 09-26 会员单月 (Neil chose B): for whoever would rather not be renewed — a little dearer, so subscribing stays the better deal */}
      {/* 10-22 通卡: the three passes take the one-off month's place (the 30 天通卡 is that month) */}
      {tongka ? (
        <TongkaPanel locale={locale} currency={currency} first={firstTongka} member={false} compact title={null} returnTo={`/${locale}/account`} />
      ) : (
      <button type="button" disabled={busy !== null} onClick={() => go("pass")} data-heat="pass-buy"
        className="text-left rounded-[2px] px-[var(--s-4)] py-[var(--s-3)] border border-dashed border-[var(--ink-16)] hover:border-[var(--ink-45)] transition-colors disabled:opacity-50">
        <p className="t-body !text-[15px]">{passT(locale, "btnPass", { pass: passLabel })}</p>
        <p className="t-small !text-[var(--ink-45)]">{busy === "pass" ? t(locale, "payRedirect") : passT(locale, "btnPassNote")}</p>
      </button>
      )}
      <div className="flex justify-end">
        <CurrencyMenu locale={locale} value={currency} onChange={chooseCurrency} />
      </div>
      <label className="flex items-start gap-2 cursor-pointer" data-heat="sub-remind">
        <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="mt-[3px] accent-[var(--ink)]" />
        <span className="t-small !text-[var(--ink-66)]">{tt(locale, "payRemindMember")}</span>
      </label>
      {mainland && <p className="t-small !text-[var(--ink-45)]">{t(locale, "payNetworkHint")}</p>}
      {/* 09-25 合规: auto-renewal terms adjacent to the subscribe buttons (California ARL §17602, CRD Art.6) */}
      <ConsentLine locale={locale} k="subConsent" vars={yearly ? { cycle: `${t(locale, "cycleMonth")} / ${t(locale, "cycleYear")}`, price: `${price.month} / ${price.year}` } : { cycle: t(locale, "cycleMonth"), price: price.month }}
        text={first && !yearly ? firstT(locale, "consent", { first: firstLabel, month: price.month }) : undefined} />
      <p className="t-small !text-[var(--ink-45)] leading-relaxed">
        {passT(locale, "consentPre")}<Link href={`/${locale}/terms`} target="_blank" className="underline decoration-[var(--ink-16)] underline-offset-4 hover:decoration-current">{passT(locale, "consentLink")}</Link>{passT(locale, "consentPost")}
      </p>
      {doorNote && (
        <p className="t-small p-[var(--s-3)] border border-[var(--gold)] rounded-[2px] !text-[var(--ink)]">{t(locale, "giftSubNote")}</p>
      )}
      {error && <p className="t-small !text-[var(--cinnabar)]">{t(locale, "subCheckoutError")}</p>}
    </div>
  );
}

/**
 * Stripe's own portal: change card, cancel, invoices. 09-30 续订专属: the account page labels it 换卡 / 发票 and
 * sends "cancel" through /account/cancel first; that page calls this with flow="cancel" (Stripe opens on the cancel step).
 */
export function ManageButton({ locale, flow, label, primary = false }: { locale: Locale; flow?: "cancel"; label?: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          try {
            const res = await fetch("/api/sub/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale, ...(flow ? { flow } : {}) }) });
            if (!res.ok) throw new Error(String(res.status));
            const data = (await res.json()) as { url: string };
            window.location.href = data.url;
          } catch {
            setError(true);
            setBusy(false);
          }
        }}
        data-heat={flow === "cancel" ? "cancel-go" : "sub-manage"}
        className={primary
          ? "min-h-[var(--s-6)] px-6 rounded-[2px] border border-[var(--ink-16)] t-label hover:text-[var(--ink)] transition-colors disabled:opacity-50"
          : "t-label hover:text-[var(--ink)] transition-colors disabled:opacity-50"}
      >
        {label ?? t(locale, "subManage")}{primary ? "" : " →"}
      </button>
      {error && <p className="t-small mt-2 !text-[var(--cinnabar)]">{t(locale, "aiError")}</p>}
    </div>
  );
}

/**
 * Back from Checkout with ?sub=cs_…: mirror the new subscription right now,
 * then re-render the page — no waiting on a webhook.
 */
export function SubSync({ session }: { session: string }) {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    fetch("/api/sub/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session }) })
      .catch(() => null)
      .then(() => { if (alive) router.replace(window.location.pathname); });
    return () => { alive = false; };
  }, [session, router]);
  return null;
}

/** 09-26 会员单月: back from Checkout with ?pass=cs_… — record the month now, then re-render. */
export function PassSync({ session }: { session: string }) {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    fetch("/api/pass/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session }) })
      .catch(() => null)
      .then(() => { if (alive) router.replace(window.location.pathname + "#membership"); });
    return () => { alive = false; };
  }, [session, router]);
  return null;
}

/** 09-29 会员增购包: back from Checkout with ?pack=cs_… — add the readings now, then re-render with a line that says so. */
export function PackSync({ session }: { session: string }) {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    fetch("/api/pack/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session }) })
      .then((r) => r.ok)
      .catch(() => false)
      .then((ok) => { if (alive) router.replace(window.location.pathname + (ok ? "?packed=1" : "") + "#membership"); });
    return () => { alive = false; };
  }, [session, router]);
  return null;
}
