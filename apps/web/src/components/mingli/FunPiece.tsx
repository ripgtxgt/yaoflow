"use client";

import { useState } from "react";
import Link from "next/link";
import BirthForm, { type Picked } from "./BirthForm";
import type { BirthUi } from "@/lib/mingli/birth/ui";
import { track } from "@/lib/track";

/**
 * 10-29 进度表 126: the client part of 前世今生 (one birth) and 渣男鑑定 (two). POST /api/fun/<kind>; the answer is
 * shown here and kept server-side by the chart's facts (asking again shows the same piece).
 */
type Ui = Record<string, string>;
type Text = Record<string, string>;

export default function FunPiece({ kind, locale, ui, birthUi }: { kind: "pastlife" | "together"; locale: string; ui: Ui; birthUi: BirthUi }) {
  const [a, setA] = useState<Picked | null>(null);
  const [b, setB] = useState<Picked | null>(null);
  const [step, setStep] = useState<"a" | "b" | "ready">("a");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [text, setText] = useState<Text | null>(null);

  const go = async (pa: Picked, pb: Picked | null) => {
    setBusy(true); setErr("");
    track("fun", { locale, method: kind });
    try {
      const r = await fetch(`/api/fun/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "pastlife" ? { input: pa.input, gender: pa.gender, locale } : { a: { input: pa.input, gender: pa.gender }, b: { input: pb!.input, gender: pb!.gender }, locale }) });
      const j = (await r.json()) as { text?: Text; error?: string };
      if (j.text) setText(j.text);
      else setErr(j.error === "login" ? "login" : j.error === "rights" ? "rights" : j.error === "cap" ? ui.cap! : ui.err!);
    } catch { setErr(ui.err!); }
    setBusy(false);
  };

  if (text) return kind === "pastlife" ? (
    <div className="mt-[var(--s-4)]">
      <p className="t-small !text-[var(--gold-text)]">{ui.plTop}</p>
      <h2 className="t-d2 mt-[var(--s-3)]">{text.title}</h2>
      {(text.story ?? "").split(/\n+/).map((p, i) => <p key={i} className="t-body mt-[var(--s-3)] leading-relaxed">{p}</p>)}
      <p className="t-body mt-[var(--s-4)] rounded-[6px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] p-4">{ui.plKeep}{text.keep}</p>
    </div>
  ) : (
    <div className="mt-[var(--s-4)]">
      <p className="t-d3">{text.line}</p>
      {([["tgFlow", "flow"], ["tgSnag", "snag"], ["tgDo", "doit"]] as const).map(([h, k]) => (
        <section key={k} className="mt-[var(--s-4)]"><h2 className="t-sect">{ui[h]}</h2><p className="t-body mt-2 leading-relaxed">{text[k]}</p></section>
      ))}
    </div>
  );

  return (
    <div className="mt-[var(--s-4)]">
      {kind === "together" && <p className="t-small !text-[var(--ink-66)]">{step === "a" ? ui.me : step === "b" ? ui.ta : `${ui.me}：${a?.name ?? ""} · ${ui.ta}：${b?.name ?? ""}`}</p>}
      {step !== "ready" && (
        <BirthForm key={step} locale={locale} ui={birthUi} chartHref={`/${locale}/fun`} event="fun" initialWho={step === "a" ? "self" : "partner"} goLabel={ui.pick}
          onPick={(p) => { if (step === "a") { setA(p); if (kind === "pastlife") { setStep("ready"); void go(p, null); } else setStep("b"); } else { setB(p); setStep("ready"); void go(a!, p); } }} />
      )}
      {busy && <p className="t-body mt-[var(--s-3)] !text-[var(--ink-66)]">{ui.going}</p>}
      {err === "login" ? <p className="t-small mt-2">{ui.needLogin} <Link href={`/${locale}/account`} className="underline underline-offset-4">{ui.login}</Link></p>
        : err === "rights" ? <p className="t-small mt-2">{ui.needRights} <Link href={`/${locale}/services`} className="underline underline-offset-4">{ui.plans}</Link></p>
        : err ? <p className="t-small mt-2 !text-[var(--cinnabar)]">{err}</p> : null}
      {step === "ready" && !busy && err && <button type="button" className="mt-2 t-small underline underline-offset-4" onClick={() => { setStep("a"); setErr(""); }}>{ui.change}</button>}
    </div>
  );
}
