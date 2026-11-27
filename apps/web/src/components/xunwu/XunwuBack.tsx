"use client";

import { useEffect, useState } from "react";
import { dueXw, markXw, type XwRec } from "@/lib/xunwu-local";
import { track } from "@/lib/track";
import { ListBlock } from "./XunwuParts";

/**
 * 10-29 进度表 127 尋物 回訪: 1–7 days after a cast, on any page of the site, one small card — 「上次找的{名字或類別}，找到了沒？」
 * ［找到了］［還沒］. The answer is only counted (by band, on the admin side); 「還沒」 brings back the steps and the way into
 * 六爻. Nothing shows for a browser that never used the page. No accuracy is ever published.
 */
export default function XunwuBack({ locale, ui, cats }: { locale: string; ui: Record<string, string>; cats: Record<string, string> }) {
  const [rec, setRec] = useState<XwRec | null>(null);
  const [state, setState] = useState<"ask" | "found" | "not">("ask");
  const [help, setHelp] = useState<{ blocks: { h: string; items: string[] }[]; castHref: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const r = dueXw();
    if (!r) return;
    setRec(r);
    track("xunwu", { locale, method: "back_show" });
  }, [locale]);
  if (!rec) return null;

  const answer = async (found: boolean) => {
    if (busy) return;
    setBusy(true);
    markXw(rec.tk, found ? "found" : "not");
    track("xunwu", { locale, method: found ? "back:found" : "back:not" });
    try {
      const r = await fetch("/api/xunwu/mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tk: rec.tk, act: found ? "found" : "not", locale }) });
      const j = (await r.json().catch(() => ({}))) as { blocks?: { h: string; items: string[] }[]; castHref?: string };
      if (!found && j.blocks && j.castHref) setHelp({ blocks: j.blocks, castHref: j.castHref });
    } catch { /* the answer is kept here either way */ }
    setState(found ? "found" : "not");
    setBusy(false);
  };
  const close = () => { markXw(rec.tk, "skip"); track("xunwu", { locale, method: "back_close" }); setRec(null); };
  const what = rec.name || cats[rec.cat] || "";

  return (
    <aside className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 mt-[var(--s-3)]" data-heat="xunwu-back">
      <div className="relative rounded-[6px] border border-[var(--ink-16)] bg-[var(--gold)]/[0.06] px-4 py-3 pr-10">
        <button type="button" onClick={close} aria-label={ui.backClose} className="absolute right-2 top-2 w-7 h-7 t-body !text-[var(--ink-45)] hover:!text-[var(--ink)]">×</button>
        {state === "ask" && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="t-body">{ui.backAsk.replace("{x}", what)}</p>
            <span className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void answer(true)} data-heat="xunwu-back-found"
                className="px-4 py-1.5 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] t-small">{ui.backFound}</button>
              <button type="button" disabled={busy} onClick={() => void answer(false)} data-heat="xunwu-back-not"
                className="px-4 py-1.5 rounded-[2px] border border-[var(--ink)] t-small">{ui.backNot}</button>
            </span>
          </div>
        )}
        {state === "found" && <p className="t-body">{ui.backThanks}</p>}
        {state === "not" && (
          <div className="grid gap-3">
            <p className="t-body">{ui.backNotLead}</p>
            {help?.blocks.map((b) => <ListBlock key={b.h} h={b.h} items={b.items} />)}
            {help && (
              <p><a href={help.castHref} onClick={() => track("xunwu", { locale, method: "back_cast" })} data-heat="xunwu-back-cast"
                className="inline-block px-5 py-2.5 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.08em]">{ui.toCast}</a></p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
