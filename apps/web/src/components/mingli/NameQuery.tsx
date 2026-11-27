"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import BirthForm, { type Picked } from "./BirthForm";
import type { BirthUi } from "@/lib/mingli/birth/ui";
import { track } from "@/lib/track";

/**
 * 10-29 进度表 122 姓名學 free query: a name in, each character (筆劃・讀音・五行・字義) and the 五格 numbers out; with a
 * birth (optional), the chart's 喜用 beside the name. POST /api/name/read — nothing is stored, no birth in the URL.
 * 10-29 (Neil: 「加出生时间点击没用」): picking a birth now answers at once — the 日主 and 喜用 show under the name boxes
 * even before a name is typed (no 「姓和名都要填」 for that), the panel says what it is for (用誰的生辰對照), and the
 * link reads 「收起」 while it is open.
 */
type Ch = { c: string; role: string; k?: number; kn?: string | null; py?: string; zy?: string | null; jp?: string; wx?: string; by?: string; d?: string; w?: string[]; p?: string; x?: string; ch?: string };
type ChartInfo = { dayMaster: string; dmEl: string; favour: string[]; avoid: string[] };
type Res = { surname: string; given: string; missing: string[]; grid: Record<string, number> | null; gridEl: Record<string, string> | null; sancai: string | null; elements: Record<string, number>; favour: { favour: string[]; avoid: string[]; carry: string[] } | null; chart?: ChartInfo | null; chars: Ch[] };
type Ui = Record<string, string>;

const GRID: [string, string][] = [["tian", "天格"], ["ren", "人格"], ["di", "地格"], ["wai", "外格"], ["zong", "總格"]];

export default function NameQuery({ locale, ui, birthUi }: { locale: string; ui: Ui; birthUi: BirthUi }) {
  const [surname, setSurname] = useState("");
  const [given, setGiven] = useState("");
  const [birth, setBirth] = useState<Picked | null>(null);
  const [chart, setChart] = useState<ChartInfo | null>(null);
  const [askBirth, setAskBirth] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const surnameRef = useRef<HTMLInputElement>(null);
  const t = (k: string) => ui[k] ?? k;

  const go = async (b: Picked | null = birth) => {
    setErr("");
    if (!surname.trim() || !given.trim()) { setErr(t("needName")); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/name/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ surname, given, locale, ...(b ? { input: b.input, gender: b.gender } : {}) }) });
      if (!r.ok) { setErr(t("badName")); setBusy(false); return; }
      const j = (await r.json()) as Res;
      setRes(j);
      if (b) setChart(j.chart ?? null);
      track("name", { locale, method: b ? "read:birth" : "read" });
    } catch { setErr(t("badName")); }
    setBusy(false);
  };

  /** a birth was picked: with a name typed, read it again with the birth; without one, show the 喜用 now and ask for the name */
  const pick = async (p: Picked) => {
    setBirth(p); setAskBirth(false); setErr("");
    track("name", { locale, method: "birth" });
    if (surname.trim() && given.trim()) { void go(p); return; }
    setChart(null);
    try {
      const r = await fetch("/api/name/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale, input: p.input, gender: p.gender }) });
      const j = (await r.json()) as { chart?: ChartInfo; error?: string };
      if (j.chart) setChart(j.chart); else setErr(t("badBirth"));
    } catch { setErr(t("badBirth")); }
    surnameRef.current?.focus();
  };
  const dropBirth = () => { setBirth(null); setChart(null); setAskBirth(false); if (res) setRes({ ...res, favour: null }); };

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1"><span className="t-label">{t("surname")}</span>
          <input ref={surnameRef} value={surname} onChange={(e) => setSurname(e.target.value.slice(0, 2))} maxLength={2} className="w-24 rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[18px]" /></label>
        <label className="flex flex-col gap-1"><span className="t-label">{t("given")}</span>
          <input value={given} onChange={(e) => setGiven(e.target.value.slice(0, 3))} maxLength={3} className="w-32 rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[18px]" /></label>
        <button type="button" onClick={() => void go()} disabled={busy} className="px-6 py-2.5 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] tracking-[0.12em] text-[13px] disabled:opacity-45">{busy ? t("going") : t("go")}</button>
      </div>
      {err && <p className="t-small mt-2 !text-[var(--cinnabar)]">{err}</p>}

      {/* the birth: none yet (the link), picking one (the panel), or picked (who, the 喜用, change / drop) */}
      {birth ? (
        <div className="mt-[var(--s-3)] rounded-[6px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-4 py-3" data-heat="name-birth-picked">
          <p className="t-small">
            <span>{t("withBirth").replace("{n}", birth.name)}</span>
            {chart && <span className="!text-[var(--ink-66)]">{"　"}{t("chartLine").replace("{d}", chart.dayMaster).replace("{e}", chart.dmEl).replace("{f}", chart.favour.join("、") || t("balanced"))}</span>}
          </p>
          {!res && <p className="t-small mt-1 !text-[var(--ink-66)]">{t("birthHint")}</p>}
          <p className="t-small mt-1 flex gap-4">
            <button type="button" className="underline underline-offset-4 !text-[var(--ink-66)]" onClick={() => setAskBirth(true)}>{t("change")}</button>
            <button type="button" className="underline underline-offset-4 !text-[var(--ink-66)]" onClick={dropBirth}>{t("noBirth")}</button>
          </p>
        </div>
      ) : (
        <p className="t-small mt-[var(--s-3)]">
          <button type="button" className="underline underline-offset-4 !text-[var(--ink-66)]" aria-expanded={askBirth} onClick={() => setAskBirth(!askBirth)}>{askBirth ? t("collapse") : t("addBirth")}</button>
        </p>
      )}
      {askBirth && (
        <div className="mt-[var(--s-3)] rounded-[6px] border border-[var(--ink-16)] p-4" data-heat="name-birth-panel">
          <p className="t-sect">{t("pickWho")}</p>
          <p className="t-small mt-1 mb-[var(--s-3)] !text-[var(--ink-66)]">{t("pickWhoLine")}</p>
          <BirthForm locale={locale} ui={birthUi} chartHref={`/${locale}/name`} event="name" initialWho="self" goLabel={t("useBirth")} onPick={(p) => void pick(p)} />
        </div>
      )}

      {res && (
        <div className="mt-[var(--s-5)]">
          {res.missing.length > 0 && <p className="t-small !text-[var(--cinnabar)]">{t("missing").replace("{c}", res.missing.join("、"))}</p>}
          <div className="grid gap-3">
            {res.chars.map((x, i) => (
              <div key={i} className="rounded-[6px] border border-[var(--ink-16)] p-4">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <Link href={`/${locale}/name/zi/${encodeURIComponent(x.ch ?? x.c)}`} className="t-d2 !font-normal hover:text-[var(--cinnabar)]">{x.ch ?? x.c}</Link>
                  <span className="t-label !text-[var(--ink-45)]">{x.role}</span>
                  {x.k !== undefined && <span className="t-small tabular-nums">{t("strokes").replace("{n}", String(x.k))}</span>}
                  {x.zy && <span className="t-small">{x.zy}</span>}{x.py && <span className="t-small !text-[var(--ink-66)]">{x.py}</span>}{x.jp && <span className="t-small !text-[var(--ink-45)]">{t("jp")} {x.jp}</span>}
                  {x.wx && <span className="t-small !text-[var(--gold-text)]">{t("element").replace("{e}", x.wx)}{x.by === "讀音" ? t("bySound") : ""}</span>}
                </div>
                {x.d && <p className="t-body mt-2 leading-relaxed">{x.d}</p>}
                {x.p && <p className="t-small mt-1 !text-[var(--ink-66)]">{x.p}</p>}
                {x.x && <p className="t-small mt-1 !text-[var(--cinnabar)]">{t("warn")}{x.x}</p>}
              </div>
            ))}
          </div>
          {res.grid && res.gridEl && (
            <section className="mt-[var(--s-5)]">
              <h3 className="t-sect">{t("grids")}</h3>
              <div className="mt-2 grid grid-cols-5 gap-2 text-center">
                {GRID.map(([k, label]) => (
                  <div key={k} className="rounded-[6px] border border-[var(--ink-16)] py-3">
                    <p className="t-label !text-[var(--ink-45)]">{t(label)}</p>
                    <p className="t-d3 tabular-nums">{res.grid![k]}</p>
                    <p className="t-small !text-[var(--gold-text)]">{res.gridEl![k]}</p>
                  </div>
                ))}
              </div>
              <p className="t-small mt-2 !text-[var(--ink-66)]">{t("sancai").replace("{s}", res.sancai ?? "")}</p>
            </section>
          )}
          {res.favour && (
            <section className="mt-[var(--s-5)] rounded-[6px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] p-4" data-heat="name-favour">
              <h3 className="t-sect">{t("favHead")}</h3>
              <p className="t-body mt-1">{t("favLine").replace("{f}", res.favour.favour.join("、") || "—")}</p>
              <p className="t-body mt-1">{res.favour.carry.length ? t("carry").replace("{c}", res.favour.carry.join("、")) : t("carryNone")}</p>
            </section>
          )}
          <p className="t-small mt-[var(--s-4)] !text-[var(--ink-45)]">{t("note")}</p>
        </div>
      )}
    </div>
  );
}
