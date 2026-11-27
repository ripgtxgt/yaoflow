"use client";

import { useEffect, useState } from "react";
import { firstMonthMinor, formatMoney, priceMinor, tongkaMinor, type Currency } from "@/lib/money";
import { asLocale } from "@/lib/locales";
import { fill, TONGKA_DAYS, tongkaT, type TongkaDays } from "@/lib/tongka";
import { track } from "@/lib/track";
import { passT } from "@/lib/dict/pass";
import { checkoutV2 } from "@/lib/checkout-client";

/**
 * 10-22 通卡 — the one pay panel (进度表 75 ⑧, the 76A 「一個付費面板」): three passes and the member line. Two ways to use it:
 *   - with `onPick`: the page does the buying (the cast page sends `pass: days` to /api/checkout, so the reading comes
 *     right after payment);
 *   - without: the panel buys a pass by itself (POST /api/pass/checkout) and comes back to `returnTo` (this page) with
 *     ?pass=…, which PassReturn turns into an entitlement.
 * Prices are shown in the reader's currency; the first 1 日通卡 of an account shows the first-time price.
 */
/**
 * 10-23 进度表 101: the panel's frame while the page does not yet know who is reading (the cast page waits for /api/me) —
 * the three passes by name, no prices, so a slow connection never shows the old two prices first and then swaps them.
 */
export function TongkaSkeleton({ locale }: { locale: string }) {
  const t = tongkaT(locale);
  return (
    <section data-heat="tongka-skeleton" className="mt-[var(--s-3)]" aria-busy="true">
      <p className="t-body !text-[15px] mb-1">{t.title}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {TONGKA_DAYS.map((d) => (
          <div key={d} className={`rounded-[2px] p-[var(--s-3)] border min-h-[var(--s-6)] ${d === 1 ? "border-[var(--ink)]" : "border-[var(--ink-16)]"} opacity-60`}>
            <p className="t-body !text-[15px]">{t.name[d]}</p>
            <p className="t-small mt-1 !text-[var(--ink-45)]">{t.loading}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 11-10 (lib/member-hint.ts): one question per page load — is this signed-out browser a member's? */
let memberHint: Promise<boolean> | null = null;
const askMemberHint = (): Promise<boolean> =>
  (memberHint ??= fetch("/api/me/member-hint", { cache: "no-store" }).then((r) => r.json()).then((j: { member?: boolean }) => j.member === true).catch(() => false));
const MEMBER_HINT: Record<string, { title: string; body: string; cta: string }> = {
  zh: { title: "你是会员，不用另外买通卡", body: "这台设备登录过会员帐号。登录后，问事、本命报告都直接用会员的额度。", cta: "登录" },
  "zh-hant": { title: "你是會員，不用另外買通卡", body: "這台裝置登入過會員帳號。登入後，問事、本命報告都直接用會員的額度。", cta: "登入" },
  en: { title: "You're a member — no pass needed", body: "This device has signed in to a member account. Sign in and use your membership.", cta: "Sign in" },
  ja: { title: "会員の方はパスの購入は不要です", body: "この端末は会員アカウントでログインしたことがあります。ログインすると会員の枠で使えます。", cta: "ログイン" },
  ko: { title: "회원이시면 패스를 따로 살 필요가 없어요", body: "이 기기는 회원 계정으로 로그인한 적이 있어요. 로그인하면 회원 혜택으로 바로 쓸 수 있어요.", cta: "로그인" },
  fr: { title: "Vous êtes membre — pas besoin de pass", body: "Cet appareil s'est déjà connecté à un compte membre. Connectez-vous pour utiliser votre abonnement.", cta: "Se connecter" },
  de: { title: "Du bist Mitglied — kein Pass nötig", body: "Dieses Gerät war schon mit einem Mitgliedskonto angemeldet. Melde dich an und nutze deine Mitgliedschaft.", cta: "Anmelden" },
  es: { title: "Eres miembro: no necesitas un pase", body: "Este dispositivo ya inició sesión en una cuenta de miembro. Inicia sesión y usa tu membresía.", cta: "Iniciar sesión" },
  pt: { title: "Você é membro — não precisa de passe", body: "Este dispositivo já entrou numa conta de membro. Entre e use a sua assinatura.", cta: "Entrar" },
};

export default function TongkaPanel({ locale, currency, first, onPick, busy: busyProp = null, returnTo, compact = false, title, lead, member = true, memberHint = true }: {
  locale: string; currency: Currency; first: boolean;
  onPick?: (days: TongkaDays) => void; busy?: TongkaDays | null;
  returnTo?: string; compact?: boolean; title?: string | null; lead?: string | null;
  /** show the 會員 line under the passes */
  member?: boolean;
  /** 11-10: ask whether this signed-out browser is a member's (off on the admin's copy of a reader's page) */
  memberHint?: boolean;
}) {
  const t = tongkaT(locale);
  const l = asLocale(locale);
  const [busy, setBusy] = useState<TongkaDays | null>(null);
  const [err, setErr] = useState(false);
  const [knownMember, setKnownMember] = useState(false);
  useEffect(() => { if (!memberHint) return; let on = true; void askMemberHint().then((m) => { if (on) setKnownMember(m); }); return () => { on = false; }; }, [memberHint]);
  const going = busyProp ?? busy;
  const price = (d: TongkaDays) => formatMoney(currency, tongkaMinor(currency, d, first && d === 1), l);
  const regular1 = formatMoney(currency, tongkaMinor(currency, 1, false), l);
  const monthly = formatMoney(currency, priceMinor(currency, "month"), l);
  // 10-22 进度表 92: 「首月 {f}，之後 {p}」 — a new member's first month
  const firstMonth = formatMoney(currency, firstMonthMinor(currency), l);
  const buy = async (d: TongkaDays) => {
    if (onPick) { onPick(d); return; }
    setBusy(d); setErr(false);
    track("reading_click", { locale, tier: "deep", method: `tongka_${d}` });
    try {
      // 10-22 进度表 57: the one checkout entrance
      const r = await checkoutV2(`pass_${d}`, { locale, currency, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tzOffsetMinutes: -new Date().getTimezoneOffset(), returnTo: returnTo ?? window.location.pathname });
      const j = (await r.json()) as { url?: string; error?: string };
      if (j.url) { window.location.assign(j.url); return; }
      if (j.error === "already_member") { window.location.assign(`/${locale}/account#membership`); return; }
      setErr(true);
    } catch { setErr(true); }
    setBusy(null);
  };
  if (knownMember) {
    const h = MEMBER_HINT[l] ?? MEMBER_HINT.en!;
    const next = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : `/${l}`;
    return (
      <section data-heat="tongka-member-hint" className={`${compact ? "" : "mt-[var(--s-3)]"} border border-[var(--ink-16)] rounded-[2px] p-[var(--s-4)]`}>
        <p className="t-body !text-[15px]">{h.title}</p>
        <p className="t-small mt-1 !text-[var(--ink-66)]">{h.body}</p>
        <a href={`/${l}/login?next=${encodeURIComponent(next)}`} data-heat="tongka-member-login"
          className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.1em]">{h.cta}</a>
      </section>
    );
  }
  return (
    <section data-heat="tongka-panel" className={compact ? "" : "mt-[var(--s-3)]"}>
      {title !== null && <p className="t-body !text-[15px] mb-1">{title ?? t.title}</p>}
      {lead !== null && <p className="t-small !text-[var(--ink-66)] mb-[var(--s-3)]">{lead ?? t.lead}</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        {TONGKA_DAYS.map((d) => {
          const firstHere = first && d === 1;
          return (
            <button key={d} type="button" disabled={going !== null} onClick={() => void buy(d)} data-heat={`tongka-${d}`}
              className={`text-left rounded-[2px] p-[var(--s-3)] border transition-colors min-h-[var(--s-6)] disabled:opacity-50 ${d === 1 ? "border-[var(--ink)]" : "border-[var(--ink-16)] hover:border-[var(--ink-45)]"}`}>
              <p className="t-body !text-[15px]">{going === d ? t.going : fill(t.buy, { name: t.name[d], p: price(d) })}</p>
              {firstHere && <p className="t-small !text-[var(--gold-text)]">{fill(t.first, { p: price(1) })} · <span className="line-through !text-[var(--ink-45)]">{regular1}</span></p>}
              <p className="t-small mt-1 !text-[var(--ink-66)]">{t.line[d]}</p>
            </button>
          );
        })}
      </div>
      {member && (
        <a href={`/${locale}/account#membership`} data-heat="tongka-member" onClick={() => track("reading_click", { locale, tier: "deep", method: "tongka_member" })}
          className="mt-2 block rounded-[2px] border border-dashed border-[var(--ink-16)] hover:border-[var(--ink-45)] p-[var(--s-3)] transition-colors">
          <p className="t-body !text-[15px]">{fill(t.member, { p: monthly, f: firstMonth })}</p>
          <p className="t-small mt-1 !text-[var(--ink-66)]">{t.memberLine}</p>
        </a>
      )}
      {err && <p className="t-small mt-2 !text-[var(--cinnabar)]">{passT(locale, "error")}</p>}
      <p className="t-label mt-2 !normal-case !tracking-[0.04em] !text-[var(--ink-45)]">{t.fine}</p>
    </section>
  );
}
