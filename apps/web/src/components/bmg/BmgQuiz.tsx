"use client";

import { useState } from "react";
import { track } from "@/lib/track";

/**
 * 11-05 进度表 136 本命卦小測: two doors — the four letters plus two questions, or all twelve (one per screen). No sign-in,
 * no birth data. The server scores and keeps it (api/bmg), then the result page draws the figure line by line.
 */
interface Q { n: number; line: number; text: string; A: string; B: string }
const PAIRS: [string, string, string][] = [["E", "I", "外向／內向"], ["S", "N", "實感／直覺"], ["T", "F", "思考／情感"], ["J", "P", "判斷／感知"]];

export default function BmgQuiz({ locale, questions, quick, copy, inv, c }: {
  locale: string; questions: Q[]; quick: number[];
  copy: { quickAsk: string; quickFallback: string; quickNote: string; full: string; quickBtn: string; next: string; back: string; done: string; error: string; of: string };
  inv?: string | null; c?: string | null;
}) {
  const [mode, setMode] = useState<"pick" | "quick" | "full">("pick");
  const [letters, setLetters] = useState<string[]>(["", "", "", ""]);
  const [ans, setAns] = useState<Record<number, "A" | "B">>({});
  const [i, setI] = useState(0);
  const [state, setState] = useState<"idle" | "going" | "error">("idle");

  const send = async (body: Record<string, unknown>) => {
    setState("going");
    const r = await fetch("/api/bmg", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...(inv ? { inv } : {}), ...(c ? { c } : {}) }) }).catch(() => null);
    const d = r?.ok ? ((await r.json().catch(() => null)) as { token?: string } | null) : null;
    if (!d?.token) { setState("error"); return; }
    window.location.href = `/${locale}/bmg/r/${d.token}?new=1`;
  };

  const btn = "min-h-[46px] px-5 rounded-[2px] border border-[var(--ink-16)] text-left t-body hover:border-[var(--ink)] transition-colors";
  const primary = "min-h-[46px] px-6 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em] disabled:opacity-40";

  if (mode === "pick") {
    return (
      <div className="grid gap-[var(--s-3)]">
        <button type="button" className={primary} onClick={() => { setMode("full"); track("bmg_view", { locale, method: "start:full" }); }}>{copy.full}</button>
        <button type="button" className={btn} onClick={() => { setMode("quick"); track("bmg_view", { locale, method: "start:quick" }); }}>{copy.quickBtn}</button>
      </div>
    );
  }

  if (mode === "quick") {
    const qs = quick.map((n) => questions.find((q) => q.n === n)!);
    const ready = letters.every(Boolean) && qs.every((q) => ans[q.n]);
    return (
      <div>
        <p className="t-sect">{copy.quickAsk}</p>
        <p className="t-small mt-1 !text-[var(--ink-45)]">{copy.quickNote}</p>
        <div className="mt-[var(--s-3)] grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PAIRS.map(([a, b, label], k) => (
            <div key={k} className="flex flex-col gap-1">
              <span className="t-label !text-[var(--ink-45)]">{label}</span>
              <div className="flex gap-1">
                {[a, b].map((x) => (
                  <button key={x} type="button" onClick={() => setLetters((l) => l.map((y, j) => (j === k ? x : y)))}
                    className={`flex-1 min-h-[44px] rounded-[2px] border text-[18px] tracking-[0.1em] ${letters[k] === x ? "bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]" : "border-[var(--ink-16)]"}`}>{x}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {qs.map((q) => (
          <fieldset key={q.n} className="mt-[var(--s-4)]">
            <legend className="t-body">{q.text}</legend>
            <div className="mt-2 grid gap-2">
              {(["A", "B"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setAns((s) => ({ ...s, [q.n]: k }))}
                  className={`${btn} ${ans[q.n] === k ? "!border-[var(--ink)] bg-[var(--ink)]/[0.04]" : ""}`}>{q[k]}</button>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="mt-[var(--s-4)] flex items-center gap-4">
          <button type="button" className={primary} disabled={!ready || state === "going"} onClick={() => void send({ mode: "quick", type4: letters.join(""), a5: ans[qs[0]!.n], a6: ans[qs[1]!.n] })}>{copy.done}</button>
          <button type="button" className="t-small underline underline-offset-4" onClick={() => setMode("full")}>{copy.quickFallback}</button>
        </div>
        {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{copy.error}</p>}
      </div>
    );
  }

  const q = questions[i]!;
  const pick = (k: "A" | "B") => {
    const next = { ...ans, [q.n]: k };
    setAns(next);
    if (i < questions.length - 1) setI(i + 1);
    else void send({ mode: "full", answers: questions.map((x) => next[x.n]).join("") });
  };
  return (
    <div>
      <div className="flex items-center justify-between t-label !text-[var(--ink-45)]">
        <span>{copy.of.replace("{n}", String(i + 1)).replace("{t}", String(questions.length))}</span>
        {i > 0 && <button type="button" className="underline underline-offset-4" onClick={() => setI(i - 1)}>{copy.back}</button>}
      </div>
      <div className="mt-1 h-[2px] bg-[var(--ink-16)]"><div className="h-full bg-[var(--gold)] transition-all" style={{ width: `${((i + (ans[q.n] ? 1 : 0)) / questions.length) * 100}%` }} /></div>
      <p className="t-d3 mt-[var(--s-4)] fade-in" key={q.n}>{q.text}</p>
      <div className="mt-[var(--s-3)] grid gap-2">
        {(["A", "B"] as const).map((k) => (
          <button key={k} type="button" disabled={state === "going"} onClick={() => pick(k)}
            className={`${btn} ${ans[q.n] === k ? "!border-[var(--ink)] bg-[var(--ink)]/[0.04]" : ""}`}>{q[k]}</button>
        ))}
      </div>
      {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{copy.error}</p>}
    </div>
  );
}
