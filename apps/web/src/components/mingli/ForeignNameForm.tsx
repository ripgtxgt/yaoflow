"use client";

import { useState } from "react";
import { relation } from "@/lib/mingli/name/rel";
import type { JaReading, KoReading } from "@/lib/mingli/name/foreign";
import type { JA_NAME, KO_NAME } from "@/lib/mingli/name/foreign-text";
import { track } from "@/lib/track";

/**
 * 10-30 进度表 128 ⑥: the name form and its result (姓名判断 / 성명학). The name goes to /api/name/foreign in a POST body,
 * never into the page's URL; nothing is kept.
 */
const input = "mt-1 w-full border border-[var(--ink-16)] rounded-[2px] px-3 py-2.5 bg-transparent t-body";
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
function Th({ children }: { children: React.ReactNode }) { return <th className="text-left t-small font-normal !text-[var(--ink-66)] py-2 pr-4">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="t-body py-2 pr-4 align-top">{children}</td>; }
const btn = "col-span-2 min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[14px] tracking-[0.1em] disabled:opacity-50";

async function ask(body: Record<string, string>) {
  const r = await fetch("/api/name/foreign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.ok ? r.json() : null;
}

export function JaNameForm({ T, EL }: { T: typeof JA_NAME; EL: Record<string, string> }) {
  const [sur, setSur] = useState(""), [giv, setGiv] = useState("");
  const [r, setR] = useState<JaReading | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); const j = await ask({ l: "ja", s: sur, g: giv }).catch(() => null); setR(j?.ja ?? null); setBusy(false); track("name", { locale: "ja", method: "query" }); };
  const els = r?.el;
  return (<>
    <form onSubmit={go} className="grid grid-cols-2 gap-3 items-end">
      <label className="t-small text-[var(--ink-66)]">{T.sur}<input value={sur} onChange={(e) => setSur(e.target.value)} placeholder={T.phSur} maxLength={4} required className={input} /></label>
      <label className="t-small text-[var(--ink-66)]">{T.giv}<input value={giv} onChange={(e) => setGiv(e.target.value)} placeholder={T.phGiv} maxLength={6} required className={input} /></label>
      <button type="submit" disabled={busy} className={btn}>{T.go}</button>
    </form>
      {r && <>
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect">{T.charsHead}</h2>
          <table className="mt-[var(--s-2)] w-full"><thead><tr><Th>{T.colChar}</Th><Th>{T.colKyu}</Th><Th>{T.colStrokes}</Th></tr></thead>
            <tbody>{[...r.sur, ...r.giv].map((x, i) => <tr key={i} className="border-t border-[var(--ink-16)]"><Td>{x.c}</Td><Td>{x.kana ? T.kana : x.kyu ?? x.c}</Td><Td>{x.strokes ?? "—"}</Td></tr>)}</tbody>
          </table>
          {r.missing.map((c) => <p key={c} className="t-small mt-2 text-[var(--cinnabar)]">{fill(T.missing, { c })}</p>)}
        </section>
        {r.grid && els && <>
          <section className="mt-[var(--s-6)]">
            <h2 className="t-sect">{T.gridHead}</h2>
            <dl className="mt-[var(--s-2)]">
              {(["tian", "ren", "di", "wai", "zong"] as const).map((k) => (
                <div key={k} className="py-3 border-t border-[var(--ink-16)]">
                  <dt className="t-body"><b className="font-medium">{T.grids[k]!.name}</b> <span className="t-d3 tabular-nums ml-2">{r.grid![k]}</span> <span className="t-small ml-2 !text-[var(--gold-text)]">{EL[els[k]]}</span></dt>
                  <dd className="t-small mt-1 !text-[var(--ink-66)]">{T.grids[k]!.how} · {T.grids[k]!.what}</dd>
                </div>
              ))}
            </dl>
            <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{T.elNote}</p>
          </section>
          <section className="mt-[var(--s-6)]">
            <h2 className="t-sect">{T.sancaiHead}</h2>
            <p className="t-d3 mt-[var(--s-2)]">{els.tian} → {els.ren} → {els.di}</p>
            <ul className="mt-[var(--s-2)] t-body grid gap-1">
              <li>{fill(T.rel[relation(els.tian, els.ren)]!, { a: `天格（${els.tian}）`, b: `人格（${els.ren}）` })}</li>
              <li>{fill(T.rel[relation(els.ren, els.di)]!, { a: `人格（${els.ren}）`, b: `地格（${els.di}）` })}</li>
            </ul>
            <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{T.sancaiNote}</p>
          </section>
        </>}
        <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{T.noTable}</p>
      </>}
  </>);
}

export function KoNameForm({ T, EL }: { T: typeof KO_NAME; EL: Record<string, string> }) {
  const [sur, setSur] = useState(""), [giv, setGiv] = useState(""), [surH, setSurH] = useState(""), [givH, setGivH] = useState("");
  const [r, setR] = useState<KoReading | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); const j = await ask({ l: "ko", s: sur, g: giv, sh: surH, gh: givH }).catch(() => null); setR(j?.ko ?? null); setBusy(false); track("name", { locale: "ko", method: "query" }); };
  return (<>
    <form onSubmit={go} className="grid grid-cols-2 gap-3 items-end">
      <label className="t-small text-[var(--ink-66)]">{T.sur}<input value={sur} onChange={(e) => setSur(e.target.value)} placeholder={T.phSur} maxLength={2} required className={input} /></label>
      <label className="t-small text-[var(--ink-66)]">{T.giv}<input value={giv} onChange={(e) => setGiv(e.target.value)} placeholder={T.phGiv} maxLength={4} required className={input} /></label>
      <label className="t-small text-[var(--ink-66)]">{T.surH}<input value={surH} onChange={(e) => setSurH(e.target.value)} placeholder={T.phSurH} maxLength={2} className={input} /></label>
      <label className="t-small text-[var(--ink-66)]">{T.givH}<input value={givH} onChange={(e) => setGivH(e.target.value)} placeholder={T.phGivH} maxLength={4} className={input} /></label>
      <button type="submit" disabled={busy} className={btn}>{T.go}</button>
    </form>
      {r && <>
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect">{T.soundHead}</h2>
          <p className="mt-[var(--s-2)] flex flex-wrap gap-4">
            {r.hangul.map((x, i) => <span key={i} className="text-center"><span className="t-d3 block">{x.syl}</span><span className="t-small !text-[var(--gold-text)]">{x.cho ?? ""} {x.el ? EL[x.el] : "—"}</span></span>)}
          </p>
          <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{T.soundNote}</p>
          {r.hangul.length > 1 && r.hangul.every((x) => x.el) && <>
            <h3 className="t-body font-medium mt-[var(--s-4)]">{T.flowHead}</h3>
            <ul className="mt-1 t-body grid gap-1">
              {r.hangul.slice(1).map((x, i) => <li key={i}>{fill(T.rel[relation(r.hangul[i]!.el!, x.el!)]!, { a: `${r.hangul[i]!.syl} ${EL[r.hangul[i]!.el!]}`, b: `${x.syl} ${EL[x.el!]}` })}</li>)}
            </ul>
            <p className="t-small mt-1 !text-[var(--ink-66)]">{T.flowNote}</p>
          </>}
        </section>
        {!r.hanja && <p className="t-small mt-[var(--s-5)] !text-[var(--ink-66)]">{T.noHanja}</p>}
        {r.hanja && <section className="mt-[var(--s-6)]">
          <h2 className="t-sect">{T.hanjaHead}</h2>
          <table className="mt-[var(--s-2)] w-full"><thead><tr><Th>{T.colChar}</Th><Th>{T.colStrokes}</Th><Th>{T.colYy}</Th></tr></thead>
            <tbody>{r.hanja.map((x, i) => <tr key={i} className="border-t border-[var(--ink-16)]"><Td>{x.c}</Td><Td>{x.strokes ?? "—"}</Td><Td>{r.yinyang?.[i] ?? "—"}</Td></tr>)}</tbody>
          </table>
          {r.missing.map((c) => <p key={c} className="t-small mt-2 text-[var(--cinnabar)]">{fill(T.missing, { c })}</p>)}
          {r.yinyang && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{T.yyNote}</p>}
        </section>}
        {r.grid && r.gridEl && <section className="mt-[var(--s-6)]">
          <h2 className="t-sect">{T.gridHead}</h2>
          <dl className="mt-[var(--s-2)]">
            {(["won", "hyeong", "i", "jeong"] as const).map((k) => (
              <div key={k} className="py-3 border-t border-[var(--ink-16)]">
                <dt className="t-body"><b className="font-medium">{T.grids[k]!.name}</b> <span className="t-d3 tabular-nums ml-2">{r.grid![k]}</span> <span className="t-small ml-2 !text-[var(--gold-text)]">{EL[r.gridEl![k]]}</span></dt>
                <dd className="t-small mt-1 !text-[var(--ink-66)]">{T.grids[k]!.how} · {T.grids[k]!.what}</dd>
              </div>
            ))}
          </dl>
          <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{T.elNote}</p>
        </section>}
        <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{T.noTable}</p>
      </>}
  </>);
}
