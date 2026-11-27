"use client";

import { useEffect, useState } from "react";
import BirthForm, { type Picked } from "./BirthForm";
import { currentProfile, syncProfiles } from "@/lib/mingli/birth/profiles";
import type { BirthUi } from "@/lib/mingli/birth/ui";
import { useCurrency } from "@/lib/use-currency";
import { formatMoney, memberDiscountMinor, zhengyuanMinor } from "@/lib/money";
import { useTongka } from "@/lib/use-tongka";
import { track } from "@/lib/track";
import RemindTick from "@/components/RemindTick";
import { isLocale } from "@/lib/locales";

/**
 * 10-26 正緣畫像 sold on its own (Neil: 「跟合盤和年書一樣的模式」) — the product page's buying part: whose birth (the current
 * profile, or another one), which kind of TA (異性／同性), the free taste (氣韻意象, POST /api/zhengyuan/preview — rules
 * only), what the full portrait holds, and ONE buy button (會員 8 折). Only the birth input and gender are sent.
 */
type Ui = Record<string, string>;

export default function ZhengyuanBuy({ locale, ui, birthUi, initialTa }: { locale: string; ui: Ui; birthUi: BirthUi; initialTa: "other" | "same" }) {
  const [p, setP] = useState<Picked | null>(null);
  const [editing, setEditing] = useState(false);
  const [ta, setTa] = useState<"other" | "same">(initialTa);
  const [err, setErr] = useState("");
  const [tester, setTester] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remind, setRemind] = useState(false);
  const [taste, setTaste] = useState<{ text: string } | "loading" | "error" | null>(null);
  const [currency] = useCurrency();
  const tk = useTongka();

  useEffect(() => {
    const cur = currentProfile();
    if (cur?.gender) setP({ id: cur.id, name: cur.name, gender: cur.gender, input: cur.input, who: cur.who });
    else { setEditing(true); void syncProfiles().then((m) => { const c = m && currentProfile(); if (c?.gender) { setP({ id: c.id, name: c.name, gender: c.gender, input: c.input, who: c.who }); setEditing(false); } }); }
    void fetch("/api/zhengyuan/checkout").then((r) => r.json()).then((j: { tester?: boolean }) => setTester(!!j.tester)).catch(() => {});
  }, []);

  // the free taste follows the birth and the kind of TA
  useEffect(() => {
    if (!p?.gender || editing) return;
    let alive = true;
    setTaste("loading");
    fetch("/api/zhengyuan/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: p.input, gender: p.gender, partner: ta === "same" ? "same" : undefined, locale }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { text?: string } | null) => { if (alive) setTaste(j?.text ? { text: j.text } : "error"); })
      .catch(() => { if (alive) setTaste("error"); });
    return () => { alive = false; };
  }, [p, ta, editing, locale]);

  const pick = (x: Picked) => {
    setErr("");
    if (!x.gender) { setErr(ui.needGender ?? ""); return; }
    setP(x);
    setEditing(false);
    track("zhengyuan", { locale, method: "pick" });
  };
  const buy = async () => {
    if (!p?.gender) return;
    setBusy(true); setErr("");
    track("zhengyuan", { locale, method: tester ? "buy:tester" : `buy:${ta}` });
    try {
      const r = await fetch("/api/zhengyuan/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: p.input, gender: p.gender, partner: ta === "same" ? "same" : undefined, currency, locale, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tzOffsetMinutes: -new Date().getTimezoneOffset(), ...(remind && !tester ? { remind: true } : {}) }),
      });
      const j = (await r.json()) as { url?: string };
      if (j.url) { window.location.assign(j.url); return; }
      setErr(ui.buyErr ?? "");
    } catch { setErr(ui.buyErr ?? ""); }
    setBusy(false);
  };
  // 10-30 进度表 128 ④: the price in the page's language
  const fmt = (minor: number) => formatMoney(currency, minor, isLocale(locale) ? locale : "zh-hant");
  const regular = zhengyuanMinor(currency);
  const pay = tk.member ? memberDiscountMinor(currency, regular) : regular;

  return (
    <div>
      <div className={`rounded-[10px] border p-4 flex items-center gap-3 ${editing ? "border-[var(--ink)]" : "border-[var(--ink-16)]"}`}>
        <span className="t-label shrink-0 w-8 !text-[var(--gold-text)]">{ui.me}</span>
        <span className="t-body flex-1 truncate">{p ? p.name : "—"}</span>
        <button type="button" onClick={() => { setErr(""); setEditing(!editing); }} className="t-small underline underline-offset-4 shrink-0">{p ? ui.change : ui.pickMe}</button>
      </div>
      {editing && (
        <div className="mt-[var(--s-4)]">
          <BirthForm locale={locale} ui={birthUi} chartHref={`/${locale}/zhengyuan`} event="zhengyuan" initialWho="self" goLabel={ui.pickMe} onPick={pick} />
        </div>
      )}

      {!editing && (
        <>
          <div className="mt-[var(--s-4)] flex items-center gap-2 text-[13px]" role="radiogroup" aria-label={ui.ta}>
            <span className="!text-[var(--ink-66)]">{ui.ta}</span>
            {(["other", "same"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={ta === k} onClick={() => setTa(k)}
                className={`px-3 py-1 rounded-full border ${ta === k ? "border-[var(--ink)] bg-[var(--ink)] !text-[var(--paper)]" : "border-[var(--ink-16)]"}`}>
                {k === "other" ? ui.taOther : ui.taSame}
              </button>
            ))}
          </div>

          {p?.gender && (
            <div className="mt-[var(--s-4)] rounded-[6px] border border-[var(--ink-16)] p-4" data-heat="zhengyuan-taste">
              <p className="t-sect">{ui.freeHead}</p>
              <p className="t-body mt-2 leading-relaxed">
                {taste === "loading" || taste === null ? <span className="!text-[var(--ink-45)]">{ui.freeLoading}</span>
                  : taste === "error" ? <span className="!text-[var(--cinnabar)]">{ui.freeErr}</span> : taste.text}
              </p>
            </div>
          )}

          <div className="mt-[var(--s-3)] rounded-[6px] border border-[var(--gold)] p-4 flex flex-col">
            <p className="t-sect">{ui.lockedHead}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {(ui.inside ?? "").split("|").map((x) => <li key={x} className="t-small !text-[var(--ink-66)]">· {x}</li>)}
            </ul>
            {tk.member && !tester && <p className="t-small mt-3 !text-[var(--gold-text)]">{ui.memberOff}<span className="ml-2 !text-[var(--ink-45)] line-through">{fmt(regular)}</span></p>}
            <button type="button" disabled={busy || !p?.gender} onClick={() => void buy()} data-heat="zhengyuan-buy"
              className="mt-3 self-start px-5 py-2.5 rounded-full bg-[var(--ink)] !text-[var(--paper)] text-[14px] disabled:opacity-45">
              {busy ? (tester ? ui.writing : ui.going) : tester ? ui.test : (ui.buy ?? "").replace("{p}", fmt(pay))}
            </button>
          </div>
          {err && <p className="t-small mt-2 !text-[var(--cinnabar)]">{err}</p>}
          {!tester && <RemindTick locale={locale} checked={remind} onChange={setRemind} />}
          <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{ui.buyNote}</p>
        </>
      )}
    </div>
  );
}
