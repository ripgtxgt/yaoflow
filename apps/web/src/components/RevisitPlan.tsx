"use client";

import { useState } from "react";
import { freeRevisitWords } from "@/lib/dict/free-revisit";

/**
 * 10-22 进度表 89 (设计稿 R7): on a paid reading whose window is still ahead — 「到 11/5，我們回來問你」 and one line the
 * reader keeps for themselves, 「你打算怎麼做？」; the letter on the day and 「我的」 show it back. Chinese pages only.
 */
/**
 * 10-29 (Neil, the board: React #418 on /reading, ~40 a day): the date used to be read from the runtime's own clock here —
 * the server (UTC) and the reader's phone (UTC+8) named different days whenever the ask falls between 00:00 and 08:00
 * Taipei, and React threw the page's HTML away. The page now passes the day already in the reader's own clock ("YYYY-MM-DD").
 */
/** 11-05 进度表 134: `suggest` is the reading's own one thing to do — put in the box for the reader to keep, change or clear */
export default function RevisitPlan({ sid, locale, dueDay, plan: plan0, suggest }: { sid: string; locale: string; dueDay: string; plan: string | null; suggest?: string | null }) {
  const t = freeRevisitWords(locale);
  const [plan, setPlan] = useState(plan0 ?? (suggest ? suggest.slice(0, 80) : ""));
  const [state, setState] = useState<"idle" | "going" | "saved" | "error">(plan0 ? "saved" : "idle");
  if (!t) return null;
  const [, mm, dd] = dueDay.split("-").map(Number);
  const save = async () => {
    setState("going");
    const r = await fetch("/api/revisit/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, plan }) }).catch(() => null);
    setState(r?.ok ? "saved" : "error");
  };
  return (
    <section id="revisit" className="mt-[var(--s-6)] scroll-mt-20 border-t border-[var(--ink-16)] pt-[var(--s-5)]" data-heat="revisit-plan">
      <h2 className="t-sect">{t.willAsk.replace("{date}", `${mm}/${dd}`)}</h2>
      <label className="t-label block mt-[var(--s-3)]" htmlFor="revisit-plan">{t.plan}</label>
      <input id="revisit-plan" value={plan} onChange={(e) => { setPlan(e.target.value.slice(0, 80)); if (state !== "going") setState("idle"); }} placeholder={t.planPh} maxLength={80}
        className="mt-2 w-full rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[16px] focus:outline-none focus:border-[var(--ink-45)]" />
      <div className="mt-[var(--s-3)] flex items-center gap-4">
        <button type="button" onClick={() => void save()} disabled={state === "going" || state === "saved"}
          className="min-h-[var(--s-6)] px-6 py-2 rounded-[2px] border border-[var(--ink)] text-[var(--ink)] tracking-[0.12em] text-[13px] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition disabled:opacity-40">{t.planGo}</button>
        {state === "saved" && <p className="t-small !text-[var(--gold-text)]">{t.planSaved}</p>}
        {state === "error" && <p className="t-small !text-[var(--cinnabar)]">{t.error}</p>}
      </div>
    </section>
  );
}
