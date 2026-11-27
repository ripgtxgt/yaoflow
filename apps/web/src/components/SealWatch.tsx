"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { track } from "@/lib/track";
import EmailField from "@/components/EmailField";
import { emailNeedsAttention, emailSyntaxOk, normalizeEmail } from "@/lib/email-check";

/**
 * 封卦 (09-21, A1): the only thing a stranger can leave here — an address,
 * for one letter, when this one prediction settles. Not a gate: the page is
 * fully readable without it.
 */
export default function SealWatch({ locale, id, watching }: { locale: Locale; id: number; watching: number }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [emailErr, setEmailErr] = useState<null | "bad" | "domain">(null); // 09-26 邮箱校对

  const submit = async () => {
    const e = normalizeEmail(email);
    if (!emailSyntaxOk(e) || state === "sending") return;
    if (emailNeedsAttention(e)) return; // the "did you mean" line is showing
    setState("sending");
    try {
      const r = await fetch("/api/seal/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, email: e, locale }),
      });
      if (r.status === 400) {
        const x = (await r.json().catch(() => ({}))) as { error?: string };
        if (x.error === "bad_email" || x.error === "email_domain") { setEmailErr(x.error === "bad_email" ? "bad" : "domain"); setState("idle"); return; }
      }
      if (!r.ok) throw new Error(String(r.status));
      track("seal_watch", { locale });
      setState("done");
    } catch {
      setState("idle");
    }
  };

  if (state === "done") {
    return <p className="t-small mt-[var(--s-5)] !text-[var(--gold-text)]">{t(locale, "sealWatchDone")}</p>;
  }

  return (
    <section className="mt-[var(--s-5)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
      <p className="t-body !text-[15px] mb-1">{t(locale, "sealWatch")}</p>
      <p className="t-small !text-[var(--ink-45)] mb-[var(--s-3)]">{t(locale, "sealWatchNote")}</p>
      {watching > 0 && <p className="t-small mb-[var(--s-3)]">{t(locale, "sealWatching", { n: watching })}</p>}
      <div className="flex flex-wrap gap-2 items-stretch">
        <EmailField locale={locale} variant="field" value={email} placeholder="you@example.com" onChange={(v) => { setEmail(v); setEmailErr(null); }} onEnter={() => void submit()} className="!min-w-0" />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!emailSyntaxOk(normalizeEmail(email)) || state === "sending"}
          className="min-h-[var(--s-6)] px-6 py-2.5 rounded-[2px] border border-[var(--ink)] text-[13px] tracking-[0.16em]
                     hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors disabled:opacity-40"
        >
          {t(locale, "sealWatch")}
        </button>
      </div>
      {emailErr && <p className="t-small mt-1 !text-[var(--cinnabar)]">{t(locale, emailErr === "domain" ? "emailNoDomain" : "emailBad")}</p>}
    </section>
  );
}
