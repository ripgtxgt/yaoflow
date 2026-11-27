"use client";

import { useEffect, useState } from "react";
import { tt } from "@/lib/dict/thread";
import type { Locale } from "@/lib/locales";
import { LOCALE_META } from "@/lib/locales";

/** 首次付费保证 (09-26): shown only while the server says this order qualifies — the API checks again. */
export default function GuaranteePanel({ locale, sid, until, amount }: { locale: Locale; sid: string; until: number; amount: string }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  // 10-07: "inelig" = the server found an earlier order of the same person (lib/db guaranteeIdentity) — not a fault
  const [state, setState] = useState<"idle" | "busy" | "done" | "fail" | "inelig">("idle");
  const [time, setTime] = useState("");
  useEffect(() => {
    setTime(new Intl.DateTimeFormat(LOCALE_META[locale].htmlLang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(until));
  }, [locale, until]);
  if (Date.now() > until && state === "idle") return null;
  const go = async () => {
    setState("busy");
    try {
      const r = await fetch("/api/refund/guarantee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, locale, why }) });
      const err = r.ok ? null : ((await r.json().catch(() => ({}))) as { error?: string }).error ?? null;
      setState(r.ok ? "done" : err === "used" || err === "not_first" ? "inelig" : "fail");
      if (r.ok) setTimeout(() => location.reload(), 2500);
    } catch { setState("fail"); }
  };
  return (
    <section id="guarantee" className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)]">
      {state === "done" ? <p className="t-small !text-[var(--gold-text)]">{tt(locale, "guarDone")}</p> : (
        <>
          <button type="button" onClick={() => setOpen((x) => !x)} className="t-small underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">
            {tt(locale, "guarTitle")}
          </button>
          {open && (
            <div className="mt-[var(--s-3)] fade-in">
              <p className="t-small !text-[var(--ink-66)]">{tt(locale, "guarLead", { time })}</p>
              <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} maxLength={200} placeholder={tt(locale, "guarWhy")}
                className="mt-[var(--s-2)] w-full rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-small outline-none focus:border-[var(--ink-45)]" />
              <p className="t-small mt-1 !text-[var(--ink-45)]">{tt(locale, "guarNote")}</p>
              <button type="button" onClick={() => void go()} disabled={state === "busy"}
                className="mt-[var(--s-2)] min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] border border-[var(--cinnabar)] text-[var(--cinnabar)] text-[13px] tracking-[0.1em] hover:bg-[var(--cinnabar)] hover:text-white transition-colors disabled:opacity-50">
                {tt(locale, "guarGo", { amount })}
              </button>
              {state === "fail" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{tt(locale, "guarFail")}</p>}
              {state === "inelig" && <p className="t-small mt-2 !text-[var(--ink-66)]">{tt(locale, "guarNotEligible")}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
