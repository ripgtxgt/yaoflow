"use client";

import { useEffect, useState } from "react";
import { marketingBoxStartsTicked } from "@/lib/consent";
import { countryFromTimeZone } from "@/lib/money";
import { deviceTimeZone } from "@/lib/use-currency";
import { t } from "@/lib/i18n";
import EmailField from "@/components/EmailField";
import { checkEmail, emailNeedsAttention, normalizeEmail } from "@/lib/email-check";
import type { Locale } from "@/lib/locales";
import { lc } from "@/lib/dict/login-code";

/** Email in, magic link out. The whole account system has exactly one field. */
export default function LoginForm({ locale, next, invalid }: { locale: Locale; next: string | null; invalid: boolean }) {
  const [email, setEmail] = useState("");
  const [notify, setNotify] = useState(false); // launch-news opt-in, applied when the link is redeemed
  // 09-23: ticked by default, except where a pre-ticked box is not consent (lib/consent)
  useEffect(() => {
    // 09-25 合规: the device clock alone missed an EU reader on a US time zone; ask the edge for its country too
    const tz = countryFromTimeZone(deviceTimeZone());
    setNotify(marketingBoxStartsTicked(tz));
    fetch("/api/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d: { country?: string | null } | null) => {
      if (d?.country) setNotify(marketingBoxStartsTicked(tz, d.country));
    }).catch(() => undefined);
  }, []);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailErr, setEmailErr] = useState<null | "bad" | "domain">(null); // 09-26 邮箱校对
  // 10-02 登录码: the six digits from the letter, typed here — signs in THIS browser (Threads / Instagram's own)
  const [code, setCode] = useState("");
  const [codeState, setCodeState] = useState<null | "busy" | "bad" | "expired" | "too_many" | "error">(null);
  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6 || codeState === "busy") { if (digits.length !== 6) setCodeState("bad"); return; }
    setCodeState("busy");
    try {
      const res = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email), code: digits, locale }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; next?: string; error?: string };
      if (res.ok && d.ok) { window.location.href = d.next ?? `/${locale}/account`; return; }
      setCodeState(d.error === "too_many" ? "too_many" : d.error === "expired" ? "expired" : d.error === "bad" ? "bad" : "error");
    } catch {
      setCodeState("error");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    const v = checkEmail(email);
    if (!v.ok && v.kind === "syntax") { setEmailErr("bad"); return; }
    if (emailNeedsAttention(email)) return; // the "did you mean" line is showing
    setState("sending");
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email), locale, next, notify }),
      });
      if (res.status === 400) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        if (e.error === "bad_email" || e.error === "email_domain") { setEmailErr(e.error === "bad_email" ? "bad" : "domain"); setState("idle"); return; }
      }
      if (!res.ok) throw new Error(String(res.status));
      setState("sent");
    } catch {
      setState("error");
    }
  };

  if (state === "sent") {
    return (
      <div className="panel px-[var(--s-4)] py-[var(--s-5)]">
        <p className="t-d3">{t(locale, "loginSentTitle")}</p>
        <p className="t-body mt-3 text-[var(--ink-66)]">{t(locale, "loginSentBody", { email: email.trim() })}</p>
        {/* 10-02 登录码: in Threads / Instagram the letter's link opens another browser — the code signs in this one */}
        <form onSubmit={sendCode} className="mt-[var(--s-4)] flex flex-col gap-2">
          <label className="t-small !text-[var(--ink-66)]" htmlFor="login-code">{lc(locale, "formLabel")}</label>
          <div className="flex gap-2">
            <input
              id="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              value={code}
              onChange={(e) => { setCode(e.target.value); setCodeState(null); }}
              placeholder="000000"
              className="w-[10.5rem] rounded-[2px] border border-[var(--ink-16)] bg-transparent px-4 py-3 t-body tracking-[0.3em] tabular-nums focus:border-[var(--ink-45)] outline-none"
            />
            <button type="submit" disabled={codeState === "busy"} className="min-h-[var(--s-6)] px-5 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em] disabled:opacity-50">
              {lc(locale, "formGo")}
            </button>
          </div>
          {codeState && codeState !== "busy" ? (
            <p className="t-small !text-[var(--cinnabar)]">{lc(locale, codeState === "too_many" ? "formTooMany" : codeState === "expired" ? "formExpired" : "formBad")}</p>
          ) : (
            <p className="t-small !text-[var(--ink-45)]">{lc(locale, "formHint")}</p>
          )}
        </form>
        <button type="button" onClick={() => { setState("idle"); setCode(""); setCodeState(null); }} className="mt-[var(--s-4)] t-label hover:text-[var(--ink)] transition-colors">
          {t(locale, "loginResend")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {invalid && <p className="t-small !text-[var(--cinnabar)]">{t(locale, "loginInvalid")}</p>}
      {/* 10-22 收郵箱 8 合 1 */}
      <EmailField locale={locale} required value={email} placeholder={t(locale, "loginEmailPlaceholder")} onChange={(v) => { setEmail(v); setEmailErr(null); }}
        error={emailErr ? t(locale, emailErr === "domain" ? "emailNoDomain" : "emailBad") : null} />
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-[3px] accent-[var(--ink)]" />
        <span className="t-small !text-[var(--ink-66)]">{t(locale, "notifyOptIn")}</span>
      </label>
      <button
        type="submit"
        disabled={state === "sending"}
        className="min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em] disabled:opacity-50"
      >
        {t(locale, state === "sending" ? "loginSending" : "loginSend")}
      </button>
      {state === "error" && <p className="t-small !text-[var(--cinnabar)]">{t(locale, "loginError")}</p>}
    </form>
  );
}
