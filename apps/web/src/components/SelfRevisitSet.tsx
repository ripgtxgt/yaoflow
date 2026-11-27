"use client";

import { useEffect, useState } from "react";
import EmailField from "@/components/EmailField";
import { emailTypoPending } from "@/lib/email-check";
import type { Locale } from "@/lib/i18n";
import { track } from "@/lib/track";

/**
 * 10-22 进度表 80 看自己的回訪 — the block under a paid 八字／紫微／星盤 report (需求 71／72／74 結果頁第 7 區塊): what would
 * count as a result, when to come back and ask, one button. Set, it shows the day; "改" opens it again; the letter
 * goes through 77's one-letter-per-address run and the answer lands on the account page. 10-30 进度表 128 ④: every
 * language a report page opens in.
 */
export type SelfRevisitUi = { head: string; sub: string; outcome: string; outcomePh: string; when: string; go: string; saved: string; change: string; cancel: string; email: string; error: string; mine: string; answered: string; plan: string; planPh: string; planShow: string; listHead: string; listNote: string; willAsk: string; askedWaiting: string; said: string; open: string; daysLeft: string; aHappened: string; aStirred: string; aNothing: string; aOpen: string; freeHead: string; freeSub: string; d14: string; d30: string; d90: string; freeSaved: string };

export default function SelfRevisitSet({ kind, token, locale, hasEmail, options, ui: t }: {
  kind: "bazi" | "ziwei" | "astro"; token: string; locale: Locale; hasEmail: boolean; options: { id: string; label: string }[]; ui: SelfRevisitUi;
}) {
  const [current, setCurrent] = useState<{ dueAt: number; hint: string | null; plan?: string | null; status: string; answered: boolean } | null | undefined>(undefined);
  const [option, setOption] = useState<string>(options[0]?.id ?? "3m");
  const [hint, setHint] = useState("");
  const [plan, setPlan] = useState("");
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<"idle" | "going" | "error">("idle");
  useEffect(() => {
    void fetch(`/api/revisit/self?kind=${kind}&ref=${encodeURIComponent(token)}&l=${locale}`, { cache: "no-store" }).then((r) => r.json())
      .then((j: { current: { dueAt: number; hint: string | null; plan?: string | null; status: string; answered: boolean } | null }) => { setCurrent(j.current); if (j.current?.hint) setHint(j.current.hint); if (j.current?.plan) setPlan(j.current.plan); })
      .catch(() => setCurrent(null));
  }, [kind, token, locale]);
  // 10-22: a date is marked 國曆 (公历 on the 简体 page), with the year when it is not this year — 「1月22日」 left both out
  const fmt = (ms: number) => {
    const d = new Date(ms + 8 * 3_600_000), y = d.getUTCFullYear(), thisYear = new Date(Date.now() + 8 * 3_600_000).getUTCFullYear();
    // 10-30 进度表 128 ④: outside Chinese the date is written the reader's way
    if (locale !== "zh" && locale !== "zh-hant") {
      try { return new Intl.DateTimeFormat(locale, { ...(y !== thisYear ? { year: "numeric" as const } : {}), month: "long", day: "numeric", timeZone: "UTC" }).format(d); } catch { /* below */ }
    }
    return `${locale === "zh" ? "公历" : "國曆"} ${y !== thisYear ? `${y} 年 ` : ""}${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
  };
  const save = async () => {
    if (!hasEmail && emailTypoPending(email)) return; // 10-23: the 「是不是 …？」 line under the box is asking
    setState("going");
    try {
      const r = await fetch("/api/revisit/self", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ref: token, option, hint, plan, email: hasEmail ? undefined : email, locale }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; dueAt?: number };
      if (r.ok && j.dueAt) { setCurrent({ dueAt: j.dueAt, hint: hint || null, plan: plan || null, status: "pending", answered: false }); setEditing(false); setState("idle"); track(kind === "astro" ? "astro" : kind, { locale, method: `revisit_set:${option}` }); return; }
      setState("error");
    } catch { setState("error"); }
  };
  const cancel = async () => {
    await fetch("/api/revisit/self", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ref: token, cancel: true, locale }) }).catch(() => null);
    setCurrent(null); setEditing(false);
  };
  if (current === undefined) return null;
  return (
    <section id="revisit" className="mt-[var(--s-6)] border-t border-[var(--ink-16)] pt-[var(--s-5)] scroll-mt-20" data-heat={`self-revisit-${kind}`}>
      <h2 className="t-sect">{t.head}</h2>
      {current && current.status !== "pending" ? (
        <p className="t-small mt-1 !text-[var(--ink-66)]">{current.answered ? t.answered : t.saved.replace("{date}", fmt(current.dueAt))}</p>
      ) : current && !editing ? (
        <div className="mt-[var(--s-2)]">
          <p className="t-body">{t.saved.replace("{date}", fmt(current.dueAt))}
            <button type="button" className="t-small underline underline-offset-4 ml-3" onClick={() => setEditing(true)}>{t.change}</button>
            <button type="button" className="t-small underline underline-offset-4 ml-3 !text-[var(--ink-45)]" onClick={() => void cancel()}>{t.cancel}</button>
          </p>
          {current.plan && <p className="t-small mt-1 !text-[var(--ink-66)]">{t.planShow.replace("{p}", current.plan)}</p>}
        </div>
      ) : (
        <div className="mt-[var(--s-2)]">
          <p className="t-small !text-[var(--ink-66)]">{t.sub}</p>
          <label className="t-label block mt-[var(--s-4)]" htmlFor={`self-hint-${kind}`}>{t.outcome}</label>
          <input id={`self-hint-${kind}`} value={hint} onChange={(e) => setHint(e.target.value.slice(0, 80))} placeholder={t.outcomePh} maxLength={80}
            className="mt-2 w-full rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[16px] focus:outline-none focus:border-[var(--ink-45)]" />
          {/* 10-22 进度表 89 (设计稿 R7): one line only the reader sees again */}
          <label className="t-label block mt-[var(--s-4)]" htmlFor={`self-plan-${kind}`}>{t.plan}</label>
          <input id={`self-plan-${kind}`} value={plan} onChange={(e) => setPlan(e.target.value.slice(0, 80))} placeholder={t.planPh} maxLength={80}
            className="mt-2 w-full rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[16px] focus:outline-none focus:border-[var(--ink-45)]" />
          <p className="t-label mt-[var(--s-4)]">{t.when}</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
            {options.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={option === o.id} onClick={() => setOption(o.id)}
                className={`px-4 py-2 rounded-[2px] border t-small transition ${option === o.id ? "border-[var(--ink)] text-[var(--ink)]" : "border-[var(--ink-16)] text-[var(--ink-66)]"}`}>{o.label}</button>
            ))}
          </div>
          {!hasEmail && (
            <div className="mt-[var(--s-4)]">
              <EmailField locale={locale} variant="field" value={email} onChange={setEmail} label={t.email} note={t.mine} onEnter={() => void save()} />
            </div>
          )}
          <button type="button" onClick={() => void save()} disabled={state === "going" || (!hasEmail && !/@/.test(email))}
            className="mt-[var(--s-4)] min-h-[var(--s-6)] px-6 py-2.5 rounded-[2px] border border-[var(--ink)] text-[var(--ink)] tracking-[0.12em] text-[13px] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition disabled:opacity-40">{t.go}</button>
          {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{t.error}</p>}
        </div>
      )}
    </section>
  );
}
