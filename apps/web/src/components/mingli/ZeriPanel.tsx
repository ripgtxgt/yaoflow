"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/track";
import EmailField from "@/components/EmailField";
import type { Locale } from "@/lib/locales";

/**
 * 10-17 进度表 70 擇日: the matter is chosen by link (?do=), the days come from the server; the reader's 生肖 and
 * 「避開農曆七月」 are applied here and kept on this device only — they never go into the URL or our records.
 * 10-22 进度表 92: a member also gets the whole year, and their own 八字 (with the partner's for 結婚 and its kin) — the
 * server sends only which days 沖／刑 that 日柱 (`chartCut.out`), never the chart; the list leaves them out by default.
 */
type Day = { ymd: string; weekday: number; lunar: string; lunarMonth: number; chong: string; why: string[]; weekend: boolean; gz?: string };
export type ZeriUi = {
  zodiac: string[]; week: string[]; zodiacKeys: string; zLabel: string; zSkip: string; ghost: string; span: string; head: string;
  none60: string; none90: string; why: string; remind: string; remindDone: string; remindSet: string; remindCancel: string; remindCancelled: string; remindGo: string; remindErr: string; emailPh: string;
  spanYear: string; mineOn: string; mineOff: string; mineNeed: string; mineNeedGo: string; memberTease: string; memberGo: string; you: string; both: string;
};
/** 10-22 进度表 92: what a member's list adds — null for everyone else */
export type ZeriMine = { out: Record<string, string>; pair: boolean } | { need: true } | null;
const ZKEY = "yf_zodiac";
const MAIL_KEY = "yf_remind_email";

export default function ZeriPanel({ locale, slug, matter, from, days, excluded, ui, account = null, member = false, chartCut = null }: {
  locale: string; slug: string; matter: string; from: string; days: Day[]; excluded: { ji: number; po: number; nothing: number }; ui: ZeriUi;
  /** 10-18: the signed-in reader's address, shown masked; with it a tap sets the reminder, no form */
  account?: string | null;
  /** 10-22 进度表 92: a member — the whole year, and their own 八字 */
  member?: boolean; chartCut?: ZeriMine;
}) {
  const [zodiac, setZodiac] = useState<number | null>(null);
  const [ghost, setGhost] = useState(false);
  const [span, setSpan] = useState<60 | 90 | 365>(60);
  const [mineOn, setMineOn] = useState(true);
  const personal = chartCut && "out" in chartCut ? chartCut : null;
  const [remind, setRemind] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "going" | "done" | "error">("idle");
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { try { const z = localStorage.getItem(ZKEY); if (z && /^\d{1,2}$/.test(z)) setZodiac(+z); const e = localStorage.getItem(MAIL_KEY); if (e) setEmail(e); } catch { /* */ } }, []);
  // a signed-in reader sees the days they already asked for
  useEffect(() => {
    if (!account) return;
    void fetch(`/api/zeri/remind?mine=${encodeURIComponent(slug)}`).then((r) => r.json()).then((j: { days?: string[] }) => setMine(new Set(j.days ?? []))).catch(() => {});
  }, [account, slug]);
  const quick = async (ymd: string, cancel: boolean) => {
    if (busy) return;
    setBusy(ymd);
    try {
      const r = await fetch("/api/zeri/remind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cancel ? { cancel: true, ymd, slug } : { ymd, slug, locale }) });
      if (r.ok) { const n = new Set(mine); if (cancel) n.delete(ymd); else n.add(ymd); setMine(n); if (cancel) track("zeri", { locale, method: "remind_cancel" }); }
    } catch { /* */ } finally { setBusy(null); }
  };
  const pickZodiac = (i: number | null) => { setZodiac(i); try { if (i === null) localStorage.removeItem(ZKEY); else localStorage.setItem(ZKEY, String(i)); } catch { /* */ } };

  const limit = useMemo(() => { const t = Date.parse(`${from}T00:00:00Z`) + span * 86_400_000; return new Date(t).toISOString().slice(0, 10); }, [from, span]);
  const inSpan = days.filter((d) => d.ymd < limit);
  const zName = zodiac === null ? null : ui.zodiacKeys.split(",")[zodiac]!;
  const byZodiac = inSpan.filter((d) => !zName || d.chong !== zName);
  const byGhost = byZodiac.filter((d) => !ghost || d.lunarMonth !== 7);
  const mineCut = personal ? byGhost.filter((d) => personal.out[d.ymd]).length : 0;
  const shown = byGhost.filter((d) => !personal || !mineOn || !personal.out[d.ymd]);
  const who = personal?.pair ? ui.both : ui.you;
  useEffect(() => { track("zeri", { locale, method: `query:${slug}:${zodiac === null ? "0" : "1"}:${shown.length}${personal ? `:m${mineOn ? 1 : 0}` : ""}` }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, zodiac, ghost, span, mineOn]);

  const send = async () => {
    if (!remind || state === "going") return;
    setState("going");
    try {
      const r = await fetch("/api/zeri/remind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ymd: remind, slug, locale }) });
      setState(r.ok ? "done" : "error");
      if (r.ok) { try { localStorage.setItem(MAIL_KEY, email.trim()); } catch { /* */ } }
    } catch { setState("error"); }
  };

  return (
    <div>
      <div className="mt-[var(--s-4)]">
        <p className="t-sect mb-2">{ui.zLabel}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => pickZodiac(null)} className={`px-3 py-1.5 rounded-[2px] border t-small ${zodiac === null ? "border-[var(--ink)] bg-[var(--ink)] !text-[var(--paper)]" : "border-[var(--ink-16)]"}`}>{ui.zSkip}</button>
          {ui.zodiac.map((z, i) => (
            <button key={z} type="button" onClick={() => pickZodiac(i)} className={`w-10 py-1.5 rounded-[2px] border t-body !text-[15px] ${zodiac === i ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink-16)] hover:border-[var(--ink)]"}`}>{z}</button>
          ))}
        </div>
        <div className="mt-[var(--s-3)] flex flex-wrap gap-x-5 gap-y-2 t-small">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} />{ui.ghost}</label>
          <span className="inline-flex gap-2">
            {([60, 90, ...(member ? [365] as const : [])] as const).map((n) => <button key={n} type="button" onClick={() => setSpan(n)} className={`underline-offset-4 ${span === n ? "underline font-medium" : "!text-[var(--ink-45)]"}`}>{n === 365 ? ui.spanYear : ui.span.replace("{n}", String(n))}</button>)}
          </span>
        </div>
        {personal && (
          <label className="mt-[var(--s-3)] flex items-start gap-2 t-small">
            <input type="checkbox" className="mt-[3px]" checked={mineOn} onChange={(e) => setMineOn(e.target.checked)} />
            <span>{ui.mineOn.replaceAll("{who}", who).replace("{n}", String(mineCut))}</span>
          </label>
        )}
        {chartCut && "need" in chartCut && (
          <p className="mt-[var(--s-3)] t-small !text-[var(--ink-66)]">{ui.mineNeed} <a href={`/${locale}/bazi?c=zeri`} className="underline underline-offset-4">{ui.mineNeedGo} →</a></p>
        )}
        {!member && (
          <p className="mt-[var(--s-3)] t-small !text-[var(--ink-66)]">{ui.memberTease} <a href={`/${locale}/account#membership`} data-heat="zeri-member" className="underline underline-offset-4">{ui.memberGo} →</a></p>
        )}
      </div>

      <h2 className="t-sect mt-[var(--s-5)]">{ui.head.replace("{m}", matter).replace("{n}", String(shown.length))}</h2>
      {shown.length === 0 ? (
        <p className="t-body mt-2 !text-[var(--ink-66)]">{span === 60 ? ui.none60 : ui.none90}</p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
          {shown.map((d) => (
            <li key={d.ymd} className="py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <a href={`/${locale}/huangli/${d.ymd}`} className="t-body tabular-nums underline-offset-4 hover:underline">{+d.ymd.slice(5, 7)}/{+d.ymd.slice(8)}</a>
              <span className={`t-small ${d.weekend ? "!text-[var(--gold-text)]" : "!text-[var(--ink-66)]"}`}>{ui.week[d.weekday]}</span>
              <span className="t-small !text-[var(--ink-66)]">{d.lunar}</span>
              <span className="t-small flex-1 min-w-[10rem]">{ui.why.replace("{w}", d.why.join("、")).replace("{c}", ui.zodiac[ui.zodiacKeys.split(",").indexOf(d.chong)] ?? d.chong)}
                {personal && !mineOn && personal.out[d.ymd] && <span className="ml-2 rounded-[2px] border border-[var(--ink-16)] px-1.5 !text-[var(--cinnabar)]">{ui.mineOff.replaceAll("{who}", personal.out[d.ymd]!)}</span>}
              </span>
              {account ? (
                mine.has(d.ymd) ? (
                  <span className="t-small !text-[var(--gold-text)]">✓ {ui.remindSet.replace("{e}", account)}
                    <button type="button" disabled={busy === d.ymd} onClick={() => void quick(d.ymd, true)} className="ml-2 underline underline-offset-4 !text-[var(--ink-45)]">{ui.remindCancel}</button>
                  </span>
                ) : (
                  <button type="button" disabled={busy === d.ymd} onClick={() => void quick(d.ymd, false)} className="t-small underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)] disabled:opacity-50">{ui.remind}</button>
                )
              ) : (
                <button type="button" onClick={() => { setRemind(d.ymd); setState("idle"); }} className="t-small underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">{ui.remind}</button>
              )}
              {!account && remind === d.ymd && (
                <div className="w-full mt-2 flex flex-wrap items-center gap-2">
                  {state === "done" ? <p className="t-small !text-[var(--gold-text)]">{ui.remindDone}</p> : (
                    <>
                      <EmailField locale={locale as Locale} variant="field" hint={false} value={email} onChange={setEmail} placeholder={ui.emailPh} className="!text-[16px]" />
                      <button type="button" onClick={() => void send()} disabled={state === "going"} className="px-5 py-2 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] t-small">{ui.remindGo}</button>
                      {state === "error" && <span className="t-small !text-[var(--cinnabar)]">{ui.remindErr}</span>}
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
