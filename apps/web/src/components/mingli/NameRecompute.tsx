"use client";

import { useState } from "react";
import BirthForm from "./BirthForm";
import type { BirthUi } from "@/lib/mingli/birth/ui";

/** 10-29 进度表 122: a 寶寶取名參考 bought on a 預產期 — the real birth time in, the report written again (once, free) */
export default function NameRecompute({ locale, token, ui, birthUi }: { locale: string; token: string; ui: Record<string, string>; birthUi: BirthUi }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"" | "busy" | "err">("");
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-2 t-small underline underline-offset-4">{ui.rRecompute}</button>;
  return (
    <div className="mt-[var(--s-3)]">
      <BirthForm locale={locale} ui={birthUi} chartHref={`/${locale}/name`} event="name" initialWho="family" goLabel={state === "busy" ? ui.rRecomputing : ui.rRecompute} onPick={(p) => {
        setState("busy");
        void fetch("/api/name/recompute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, input: p.input, gender: p.gender }) })
          .then((r) => { if (r.ok) window.location.reload(); else setState("err"); }).catch(() => setState("err"));
      }} />
      {state === "err" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{ui.rRecomputeErr}</p>}
    </div>
  );
}
