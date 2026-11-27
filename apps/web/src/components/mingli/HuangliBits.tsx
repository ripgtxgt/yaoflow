"use client";

import { useState } from "react";
import { track } from "@/lib/track";

/**
 * 10-17 进度表 69 黃曆: the small interactive pieces — 宜／忌 words that open their plain meaning, and a date picker.
 */
export type Chip = { key: string; name: string; plain: string; example: string; page: string | null };

export function TermChips({ items, tone, locale, more }: { items: Chip[]; tone: "yi" | "ji"; locale: string; more: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const cur = items.find((x) => x.key === open) ?? null;
  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {items.map((x) => (
          <li key={x.key}>
            <button type="button" onClick={() => { setOpen(open === x.key ? null : x.key); if (open !== x.key) track("huangli", { locale, method: `term:${x.key}` }); }}
              aria-expanded={open === x.key}
              className={`px-3 py-1.5 rounded-[2px] border t-body !text-[15px] transition-colors ${open === x.key ? (tone === "yi" ? "bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]" : "bg-[var(--cinnabar)] text-[var(--paper)] border-[var(--cinnabar)]") : tone === "yi" ? "border-[var(--ink-16)] hover:border-[var(--ink)]" : "border-[var(--cinnabar)]/40 text-[var(--cinnabar)] hover:border-[var(--cinnabar)]"}`}>
              {x.name}
            </button>
          </li>
        ))}
      </ul>
      {cur && (cur.plain || cur.example) && (
        <div className="mt-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.06]">
          <p className="t-body"><b className="font-medium">{cur.name}</b>：{cur.plain}</p>
          {cur.example && <p className="t-small mt-1 !text-[var(--ink-66)]">{cur.example}</p>}
          {cur.page && <p className="t-small mt-2"><a href={`/${locale}/huangli/terms/${encodeURIComponent(cur.page)}`} className="underline underline-offset-4">{more.replace("{t}", cur.name)}</a></p>}
        </div>
      )}
    </div>
  );
}

export function DateJump({ locale, value, label, go: goText }: { locale: string; value: string; label: string; go?: string }) {
  // 10-18: iPhone's date wheel fires a change on every turn (year, then month…), so the page waits for 「看這天」
  const [v, setV] = useState(value);
  const go = () => { if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v !== value) window.location.assign(`/${locale}/huangli/${v}`); };
  return (
    <span className="t-small inline-flex items-center gap-2 !text-[var(--ink-66)]">
      <label className="inline-flex items-center gap-2">{label}
        <input type="date" value={v} min="1901-02-19" max="2099-12-31" onChange={(e) => setV(e.target.value)}
          className="border border-[var(--ink-16)] rounded-[2px] px-2 py-1 bg-transparent t-small" />
      </label>
      {v !== value && /^\d{4}-\d{2}-\d{2}$/.test(v) && <button type="button" onClick={go} className="underline underline-offset-4 !text-[var(--ink)]">{goText ?? (locale === "zh" ? "看这天 →" : "看這天 →")}</button>}
    </span>
  );
}
