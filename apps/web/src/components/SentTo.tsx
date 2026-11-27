"use client";

import { useState } from "react";
import type { Locale } from "@/lib/locales";
import { tt } from "@/lib/dict/thread";
import { track } from "@/lib/track";
import EmailField from "@/components/EmailField";

/** 09-26: where a wallet-paid reading was sent, and a way to send it somewhere they actually read. */
export default function SentTo({ locale, sid, masked }: { locale: Locale; sid: string; masked: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "bad" | "error">("idle");
  const [done, setDone] = useState<string | null>(null);
  const go = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      const r = await fetch("/api/reading/sendto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, email }) });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; email?: string; error?: string; signedOut?: boolean };
      if (r.ok && d.ok && d.email) {
        setDone(d.email); setState("idle"); track("share_click", { locale, method: "sendto" });
        if (d.signedOut) window.dispatchEvent(new Event("yf:auth")); // 10-02: the payment-made sign-in ended with the move
      }
      else setState(d.error === "bad_email" || d.error === "email_domain" ? "bad" : "error");
    } catch { setState("error"); }
  };
  return (
    <div className="mt-[var(--s-3)] t-small !text-[var(--ink-66)]" data-heat="sent-to">
      {done ? (
        <p className="!text-[var(--gold-text)]">{tt(locale, "sentDone", { email: done })}</p>
      ) : (
        <>
          <p>{tt(locale, "sentTo", { email: masked })}</p>
          <form className="mt-1 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void go(); }}>
            <span>{tt(locale, "sentChange")}</span>
            <EmailField locale={locale} variant="line" required value={email} onChange={(v) => { setEmail(v); setState("idle"); }} placeholder="" />
            <button type="submit" disabled={state === "busy"} className="underline underline-offset-4 disabled:opacity-50">{tt(locale, "sentGo")}</button>
          </form>
          {state === "bad" && <p className="mt-1 !text-[var(--cinnabar)]">{tt(locale, "sentBad")}</p>}
          {state === "error" && <p className="mt-1 !text-[var(--cinnabar)]">{tt(locale, "sentFail")}</p>}
        </>
      )}
    </div>
  );
}
