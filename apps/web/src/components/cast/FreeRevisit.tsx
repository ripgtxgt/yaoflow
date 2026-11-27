"use client";

import { useState } from "react";
import EmailField from "@/components/EmailField";
import { emailTypoPending } from "@/lib/email-check";
import type { Locale } from "@/lib/i18n";
import { freeRevisitWords } from "@/lib/dict/free-revisit";

/**
 * 10-22 进度表 90 免費讀者也給回訪 (设计稿 R7「付不付費都給回訪」): under a free reading — what would count, what you mean to
 * do (only for you), when to be asked; signed in, the account's address, else one typed here. One letter on the day
 * (77's run), one tap to answer. Chinese pages only.
 */
export default function FreeRevisit({ locale, question, values, signedIn, prefillEmail }: {
  locale: Locale; question: string; values: readonly number[]; signedIn: boolean; prefillEmail?: string | null;
}) {
  const t = freeRevisitWords(locale);
  const [days, setDays] = useState<14 | 30 | 90>(30);
  const [hint, setHint] = useState("");
  const [plan, setPlan] = useState("");
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [state, setState] = useState<"idle" | "going" | "error" | "undone">("idle");
  const [saved, setSaved] = useState<{ ref: string; dueAt: number } | null>(null);
  if (!t) return null;
  // 10-22: a date is marked 國曆 (公历 on the 简体 page), with the year when it is not this year — 「1月22日」 left both out
  const fmt = (ms: number) => {
    const d = new Date(ms + 8 * 3_600_000), y = d.getUTCFullYear(), thisYear = new Date(Date.now() + 8 * 3_600_000).getUTCFullYear();
    return `${locale === "zh" ? "公历" : "國曆"} ${y !== thisYear ? `${y} 年 ` : ""}${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
  };
  const save = async () => {
    if (!signedIn && emailTypoPending(email)) return; // 10-23: the 「是不是 …？」 line under the box is asking
    setState("going");
    try {
      const r = await fetch("/api/revisit/free", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, values, days, hint, plan, email: signedIn ? undefined : email, locale }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; ref?: string; dueAt?: number };
      if (r.ok && j.ref && j.dueAt) { setSaved({ ref: j.ref, dueAt: j.dueAt }); setState("idle"); return; } // the server records the event (revisit_set, tier cast)
      setState("error");
    } catch { setState("error"); }
  };
  const undo = async () => {
    if (!saved) return;
    await fetch("/api/revisit/free", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cancel: true, ref: saved.ref }) }).catch(() => null);
    setSaved(null); setState("undone");
  };
  return (
    <section id="free-revisit" className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)] scroll-mt-20 fade-in" data-heat="free-revisit">
      <h3 className="t-sect">{t.head}</h3>
      {saved ? (
        <p className="t-body mt-[var(--s-2)]">{t.saved.replace("{date}", fmt(saved.dueAt))}
          <button type="button" className="t-small underline underline-offset-4 ml-3 !text-[var(--ink-45)]" onClick={() => void undo()}>{t.undo}</button>
        </p>
      ) : state === "undone" ? (
        <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{t.undone}</p>
      ) : (
        <div className="mt-[var(--s-2)]">
          <p className="t-small !text-[var(--ink-66)]">{t.sub}</p>
          <label className="t-label block mt-[var(--s-4)]" htmlFor="free-rv-hint">{t.outcome}</label>
          <input id="free-rv-hint" value={hint} onChange={(e) => setHint(e.target.value.slice(0, 80))} placeholder={t.outcomePh} maxLength={80}
            className="mt-2 w-full rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[16px] focus:outline-none focus:border-[var(--ink-45)]" />
          <label className="t-label block mt-[var(--s-4)]" htmlFor="free-rv-plan">{t.plan}</label>
          <input id="free-rv-plan" value={plan} onChange={(e) => setPlan(e.target.value.slice(0, 80))} placeholder={t.planPh} maxLength={80}
            className="mt-2 w-full rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[16px] focus:outline-none focus:border-[var(--ink-45)]" />
          <p className="t-label mt-[var(--s-4)]">{t.when}</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
            {([[14, t.d14], [30, t.d30], [90, t.d90]] as const).map(([n, label]) => (
              <button key={n} type="button" role="radio" aria-checked={days === n} onClick={() => setDays(n)}
                className={`px-4 py-2 rounded-[2px] border t-small transition ${days === n ? "border-[var(--ink)] text-[var(--ink)]" : "border-[var(--ink-16)] text-[var(--ink-66)]"}`}>{label}</button>
            ))}
          </div>
          {!signedIn && (
            <div className="mt-[var(--s-4)]">
              <EmailField locale={locale} variant="field" value={email} onChange={setEmail} label={t.email} note={t.mine} onEnter={() => void save()} />
            </div>
          )}
          <button type="button" onClick={() => void save()} disabled={state === "going" || (!signedIn && !/@/.test(email))} data-heat="free-revisit-go"
            className="mt-[var(--s-4)] min-h-[var(--s-6)] px-6 py-2.5 rounded-[2px] border border-[var(--ink)] text-[var(--ink)] tracking-[0.12em] text-[13px] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition disabled:opacity-40">{t.go}</button>
          {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{t.error}</p>}
        </div>
      )}
    </section>
  );
}
