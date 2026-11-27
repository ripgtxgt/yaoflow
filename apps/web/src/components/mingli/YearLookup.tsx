"use client";

import { useState } from "react";
import { track } from "@/lib/track";

/**
 * 10-30 进度表 128 ⑤: the 厄年 / 삼재 page's lookup — pick a birth year (and a gender where the custom needs one) and
 * read the line computed on the server for it. Nothing leaves the browser.
 */
export default function YearLookup({ locale, head, yearLabel, genderLabel, genders, lines, note, initial }: {
  locale: string; head: string; yearLabel: string; genderLabel?: string;
  /** [key, label] pairs; none = the line does not depend on gender */
  genders?: [string, string][];
  /** birth year → line, or birth year → gender key → line */
  lines: Record<number, string | Record<string, string>>;
  note: string; initial: number;
}) {
  const years = Object.keys(lines).map(Number).sort((a, b) => b - a);
  const [y, setY] = useState(initial);
  const [g, setG] = useState(genders?.[0]?.[0] ?? "");
  const v = lines[y];
  const line = typeof v === "string" ? v : v ? v[g] ?? "" : "";
  return (
    <section className="rounded-[2px] border border-[var(--ink-16)] px-[var(--s-4)] py-[var(--s-4)]">
      <h2 className="t-sect">{head}</h2>
      <div className="mt-[var(--s-3)] flex flex-wrap items-end gap-4">
        <label className="grid gap-1 t-small">
          <span className="!text-[var(--ink-66)]">{yearLabel}</span>
          <select value={y} onChange={(e) => { setY(Number(e.target.value)); track("taisui", { locale, method: "lookup" }); }}
            className="border border-[var(--ink-16)] rounded-[2px] px-2 py-1.5 bg-[var(--paper)] t-body !text-[15px]">
            {years.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        {genders && genderLabel && (
          <fieldset className="grid gap-1 t-small">
            <legend className="!text-[var(--ink-66)]">{genderLabel}</legend>
            <div className="flex gap-2">
              {genders.map(([k, label]) => (
                <button key={k} type="button" onClick={() => setG(k)}
                  className={`px-3 py-1.5 rounded-[2px] border t-body !text-[15px] ${g === k ? "border-[var(--ink)] bg-[var(--ink)] !text-[var(--paper)]" : "border-[var(--ink-16)]"}`}>{label}</button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      <p className="t-body mt-[var(--s-4)]" aria-live="polite">{line}</p>
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{note}</p>
    </section>
  );
}
