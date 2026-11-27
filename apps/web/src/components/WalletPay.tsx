"use client";

import { track } from "@/lib/track";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locales";
import { LOCALE_META } from "@/lib/locales";
import { tt } from "@/lib/dict/thread";

/* Stripe.js is loaded from js.stripe.com on demand (no package) — only the bits we call are typed here. */
interface StripeJs {
  elements(o: Record<string, unknown>): StripeElements;
  confirmPayment(o: Record<string, unknown>): Promise<{ error?: { message?: string } }>;
}
interface StripeElements {
  create(type: "expressCheckout", o: Record<string, unknown>): StripeElement;
  submit(): Promise<{ error?: { message?: string } }>;
}
interface StripeElement {
  mount(el: HTMLElement): void;
  destroy(): void;
  on(ev: string, cb: (e: Record<string, unknown>) => void): void;
}
declare global { interface Window { Stripe?: (pk: string, o?: Record<string, unknown>) => StripeJs } }

let loading: Promise<void> | null = null;
function loadStripe(): Promise<void> {
  if (typeof window !== "undefined" && window.Stripe) return Promise.resolve();
  loading ??= new Promise<void>((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.async = true;
    s.onload = () => res();
    s.onerror = () => { loading = null; rej(new Error("stripe.js")); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * 09-26 钱包直付 (Neil: 「第一个吧」). 60 of 88 successful payments were Apple Pay;
 * most of those who left Stripe's page never typed a thing. So for Taiwan / Hong
 * Kong buyers the price button opens this: Apple Pay / Google Pay right on our
 * page, confirmed with Face ID, no redirect. If the device has neither wallet,
 * or anything is off, `onFallback` sends them to the ordinary checkout at once.
 */
export default function WalletPay({ locale, pk, amountMinor, currency, priceLabel, createIntent, onFallback, onPaid, probe, onAvailable, mailNote = true, onSaveInstead }: {
  locale: Locale; pk: string; amountMinor: number; currency: string; priceLabel: string;
  /** 09-26 (Neil: 「跳转还是有点慢」): mounted off-screen before any tap, only to learn whether this device has a wallet */
  probe?: boolean;
  onAvailable?: (ok: boolean) => void;
  /** say that the reading goes to the payment sheet's address — only when we have no address of theirs */
  mailNote?: boolean;
  /** asks our server for the PaymentIntent at the moment of paying */
  createIntent: (email: string | null) => Promise<{ clientSecret: string; sid: string } | null>;
  onFallback: (why: string) => void;
  onPaid: (sid: string) => void;
  /** 10-12 B①: after the Apple / Google Pay sheet was closed unpaid — keep the cast in the reader's inbox instead (signed-out readers only) */
  onSaveInstead?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "paying" | "error" | "closed">("loading");

  useEffect(() => {
    let el: StripeElement | null = null;
    let alive = true;
    const give = setTimeout(() => { if (!alive) return; if (probe) onAvailable?.(false); else onFallback("timeout"); }, probe ? 5000 : 2500);
    loadStripe().then(() => {
      if (!alive || !window.Stripe || !box.current) return;
      const stripe = window.Stripe(pk, { locale: LOCALE_META[locale].stripe });
      const elements = stripe.elements({ mode: "payment", amount: amountMinor, currency, appearance: { theme: "stripe" } });
      el = elements.create("expressCheckout", {
        emailRequired: true,
        buttonHeight: 48,
        paymentMethods: { applePay: "auto", googlePay: "auto", link: "never", paypal: "never", amazonPay: "never", klarna: "never" },
      });
      el.on("ready", (e) => {
        clearTimeout(give);
        if (!alive) return;
        if (probe) { onAvailable?.(!!e.availablePaymentMethods); return; }
        if (!e.availablePaymentMethods) onFallback("no_wallet");
        else setState("ready");
      });
      // 10-12 B① (10-12 复查: 20 of 63 tabs closed the sheet and neither paid nor tried a card): closing the sheet unpaid
      // turns the box into the two ways on — the card, or the cast kept in the reader's inbox
      el.on("cancel", () => { if (!alive) return; setState("closed"); track("reading_click", { locale, method: "wallet_closed" }); });
      el.on("loaderror", () => { clearTimeout(give); if (!alive) return; if (probe) onAvailable?.(false); else onFallback("loaderror"); });
      el.on("confirm", async (e) => {
        setState("paying");
        const sub = await elements.submit();
        if (sub.error) { setState("error"); return; }
        const email = ((e.billingDetails as { email?: string } | undefined)?.email ?? null) || null;
        const intent = await createIntent(email).catch(() => null);
        if (!intent) { onFallback("intent"); return; }
        const r = await stripe.confirmPayment({
          elements, clientSecret: intent.clientSecret, redirect: "if_required",
          confirmParams: { return_url: `${window.location.origin}/${locale}/reading?sid=${intent.sid}&fresh=1` },
        });
        if (r.error) { setState("error"); return; }
        onPaid(intent.sid);
      });
      el.mount(box.current);
    }).catch(() => { clearTimeout(give); if (!alive) return; if (probe) onAvailable?.(false); else onFallback("script"); });
    return () => { alive = false; clearTimeout(give); try { el?.destroy(); } catch { /* gone */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pk, amountMinor, currency]);

  if (probe) return <div ref={box} aria-hidden style={{ position: "absolute", left: -10000, top: 0, width: 320, height: 60, overflow: "hidden" }} />;
  return (
    <div className="mt-[var(--s-3)] p-[var(--s-4)] border border-[var(--ink-16)] rounded-[2px] fade-in" data-heat="wallet">
      <p className="t-body !text-[15px] mb-1">{tt(locale, "walletTitle", { price: priceLabel })}</p>
      <p className="t-small !text-[var(--ink-45)] mb-[var(--s-3)]">{tt(locale, state === "paying" ? "walletPaying" : "walletNote")}</p>
      <div ref={box} className={state === "loading" ? "min-h-[48px] opacity-40" : ""} />
      {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{tt(locale, "walletError")}</p>}
      {/* 09-26: no email field on our side — say where the reading goes, and that it can be changed */}
      {mailNote && <p className="t-small mt-2 !text-[var(--ink-45)]">{tt(locale, "walletMail")}</p>}
      {state === "closed" ? (
        <div className="mt-[var(--s-3)] pt-[var(--s-3)] border-t border-dotted border-[var(--ink-16)] fade-in" data-heat="wallet-closed">
          <p className="t-small !text-[var(--ink-66)]">{tt(locale, "walletClosed")}</p>
          <div className="mt-2 flex flex-col gap-2 items-start">
            <button type="button" onClick={() => onFallback("card_after_close")} data-heat="wallet-closed-card"
              className="min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.12em]">
              {tt(locale, "walletClosedCard")}
            </button>
            {onSaveInstead && (
              <button type="button" onClick={() => { track("reading_click", { locale, method: "wallet_save" }); onSaveInstead(); }} data-heat="wallet-closed-save"
                className="t-small underline underline-offset-4 !text-[var(--ink-66)]">
                {tt(locale, "walletClosedSave")}
              </button>
            )}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => onFallback("card")} data-heat="wallet-card" className="mt-[var(--s-3)] t-small underline underline-offset-4 !text-[var(--ink-66)]">
          {tt(locale, "walletCard")}
        </button>
      )}
    </div>
  );
}
