"use client";

import { useEffect, useState } from "react";
import BirthForm, { type Picked } from "./BirthForm";
import type { BirthUi } from "@/lib/mingli/birth/ui";
import { useCurrency } from "@/lib/use-currency";
import { formatMoney, memberDiscountMinor, nameMinor } from "@/lib/money";
import { useTongka } from "@/lib/use-tongka";
import { track } from "@/lib/track";

/**
 * 10-29 进度表 122 姓名學 — the buying part of /name: 寶寶取名 or 改名, the surname (and the current name), the feel
 * (男／女／中性), characters to leave out, whose birth (the baby's, or a 預產期; your own for a rename) and ONE button
 * (會員 8 折). POST /api/name/checkout; only the birth input and gender go to the server, which keeps the 喜用 only.
 */
type Ui = Record<string, string>;
const chip = (on: boolean) => `px-3 py-1 rounded-full border text-[13px] ${on ? "border-[var(--ink)] bg-[var(--ink)] !text-[var(--paper)]" : "border-[var(--ink-16)]"}`;
const field = "rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[17px]";

export default function NameBuy({ locale, ui, birthUi }: { locale: string; ui: Ui; birthUi: BirthUi }) {
  const [kind, setKind] = useState<"baby" | "rename">("baby");
  const [surname, setSurname] = useState("");
  const [current, setCurrent] = useState("");
  const [style, setStyle] = useState<"m" | "f" | "n">("m");
  const [avoid, setAvoid] = useState("");
  const [due, setDue] = useState(false);
  const [p, setP] = useState<Picked | null>(null);
  // 10-29: the birth picker opens on a tap (it used to open at once and put a second 「之前排過的」 list on the page)
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tester, setTester] = useState(false);
  const [currency] = useCurrency();
  const tk = useTongka();
  useEffect(() => { void fetch("/api/name/checkout").then((r) => r.json()).then((j: { tester?: boolean }) => setTester(!!j.tester)).catch(() => {}); }, []);

  const buy = async () => {
    setErr("");
    if (!surname.trim() || !p?.gender || (kind === "rename" && !current.trim())) { setErr(ui.needAll ?? ""); return; }
    setBusy(true);
    track("name", { locale, method: tester ? "buy:tester" : `buy:${kind}` });
    try {
      const r = await fetch("/api/name/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, surname, current: kind === "rename" ? current : undefined, style, avoid, due: kind === "baby" && due, input: p.input, gender: p.gender, currency, locale, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tzOffsetMinutes: -new Date().getTimezoneOffset() }),
      });
      const j = (await r.json()) as { url?: string; error?: string };
      if (j.url) { window.location.assign(j.url); return; }
      setErr(j.error === "surname" || j.error === "current" ? ui.badName ?? "" : ui.buyErr ?? "");
    } catch { setErr(ui.buyErr ?? ""); }
    setBusy(false);
  };
  const fmt = (minor: number) => formatMoney(currency, minor, locale === "zh" ? "zh" : "zh-hant");
  const regular = nameMinor(currency);
  const pay = tk.member ? memberDiscountMinor(currency, regular) : regular;

  return (
    <div>
      <div className="flex gap-2" role="radiogroup">
        {(["baby", "rename"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={chip(kind === k)} onClick={() => { setKind(k); setP(null); setEditing(false); }}>{k === "baby" ? ui.kindBaby : ui.kindRename}</button>)}
      </div>
      <div className="mt-[var(--s-3)] flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1"><span className="t-label">{ui.surname}</span><input value={surname} maxLength={2} onChange={(e) => setSurname(e.target.value.slice(0, 2))} className={`w-24 ${field}`} /></label>
        {kind === "rename" && <label className="flex flex-col gap-1"><span className="t-label">{ui.current}</span><input value={current} maxLength={3} onChange={(e) => setCurrent(e.target.value.slice(0, 3))} className={`w-32 ${field}`} /></label>}
      </div>
      <div className="mt-[var(--s-3)] flex items-center gap-2 flex-wrap">
        <span className="t-small !text-[var(--ink-66)]">{ui.style}</span>
        {(["m", "f", "n"] as const).map((k) => <button key={k} type="button" className={chip(style === k)} onClick={() => setStyle(k)}>{k === "m" ? ui.styleM : k === "f" ? ui.styleF : ui.styleN}</button>)}
      </div>
      <label className="mt-[var(--s-3)] flex flex-col gap-1"><span className="t-label">{ui.avoid}</span><input value={avoid} maxLength={30} onChange={(e) => setAvoid(e.target.value.slice(0, 30))} className={`max-w-[20rem] ${field}`} /></label>
      {kind === "baby" && <label className="mt-[var(--s-3)] flex items-center gap-2 t-small"><input type="checkbox" checked={due} onChange={(e) => setDue(e.target.checked)} />{ui.due}</label>}

      <div className={`mt-[var(--s-4)] rounded-[10px] border p-4 flex items-center gap-3 ${editing ? "border-[var(--ink)]" : "border-[var(--ink-16)]"}`}>
        <span className="t-label shrink-0 !text-[var(--gold-text)]">{kind === "baby" ? ui.birthBaby : ui.birthMe}</span>
        <span className="t-body flex-1 truncate">{p ? p.name : "—"}</span>
        <button type="button" onClick={() => setEditing(!editing)} className="t-small underline underline-offset-4 shrink-0">{editing ? ui.collapse : p ? ui.change : ui.pickBirthBtn}</button>
      </div>
      {editing && (
        <div className="mt-[var(--s-3)]">
          <BirthForm key={kind} locale={locale} ui={birthUi} chartHref={`/${locale}/name`} event="name" initialWho={kind === "baby" ? "family" : "self"} goLabel={ui.pick} onPick={(x) => { setP(x); setEditing(false); setErr(""); }} />
        </div>
      )}

      <div className="mt-[var(--s-4)] rounded-[6px] border border-[var(--gold)] p-4 flex flex-col">
        <p className="t-sect">{kind === "baby" ? ui.babyHead : ui.renameHead}</p>
        <p className="t-small mt-1 !text-[var(--ink-66)]">{kind === "baby" ? ui.babyLine : ui.renameLine}</p>
        <ul className="mt-2 flex flex-col gap-1">{(ui.inside ?? "").split("|").filter((x) => kind === "rename" || !x.startsWith(ui.kindRename ?? "改名")).map((x) => <li key={x} className="t-small !text-[var(--ink-66)]">· {x}</li>)}</ul>
        {tk.member && !tester && <p className="t-small mt-3 !text-[var(--gold-text)]">{ui.memberOff}<span className="ml-2 !text-[var(--ink-45)] line-through">{fmt(regular)}</span></p>}
        <button type="button" disabled={busy} onClick={() => void buy()} className="mt-3 self-start px-5 py-2.5 rounded-full bg-[var(--ink)] !text-[var(--paper)] text-[14px] disabled:opacity-45">
          {busy ? (tester ? ui.writing : ui.goingPay) : tester ? ui.test : (ui.buy ?? "").replace("{p}", fmt(pay))}
        </button>
        {err && <p className="t-small mt-2 !text-[var(--cinnabar)]">{err}</p>}
      </div>
    </div>
  );
}
