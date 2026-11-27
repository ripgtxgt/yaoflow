"use client";

import { useEffect, useState } from "react";
import BirthForm, { type Picked } from "./BirthForm";
import { currentProfile, syncProfiles } from "@/lib/mingli/birth/profiles";
import type { BirthUi } from "@/lib/mingli/birth/ui";
import { yearCycle } from "@/lib/mingli/bazi/chart";
import { useCurrency } from "@/lib/use-currency";
import { formatMoney, memberDiscountMinor, nianshuMinor } from "@/lib/money";
import { useTongka } from "@/lib/use-tongka";
import { NIANSHU_EARLY_UNTIL, nianshuSale, type NianshuSale } from "@/lib/mingli/nianshu/sale";
import { track } from "@/lib/track";
import { checkoutV2 } from "@/lib/checkout-client";
import RemindTick from "@/components/RemindTick";
import { isLocale } from "@/lib/locales";

/**
 * 10-21 三合一年書 — the product page's buying part: whose birth (the current profile, or another one; a birth time is
 * needed), one optional question, and ONE card: the year on sale now (sale.ts — this year until 10/31, next year from
 * 11/1), at the early-bird price from 11/1 to 1/31 (the regular price struck through beside it). The server's answer
 * (GET /api/nianshu/checkout) decides the year and the price; the local clock only fills the first paint. Only the birth
 * input and gender are sent (never the name).
 */
const QUESTION_MAX = 200;
type Ui = Record<string, string>;

/** `years` (a page in another language): the year's stem-branch pair and animal in that language, for the year on sale and the next */
export default function NianshuBuy({ locale, ui, birthUi, years }: { locale: string; ui: Ui; birthUi: BirthUi; years?: Record<number, { gz: string; animal: string }> }) {
  const [p, setP] = useState<Picked | null>(null);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  const [tester, setTester] = useState(false);
  const [sale, setSale] = useState<NianshuSale>(() => nianshuSale());
  const [busy, setBusy] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [remind, setRemind] = useState(false); // 10-23 进度表 111 ③
  const [currency] = useCurrency();

  useEffect(() => {
    const cur = currentProfile();
    if (cur?.gender) setP({ id: cur.id, name: cur.name, gender: cur.gender, input: cur.input, who: cur.who });
    else { setEditing(true); void syncProfiles().then((m) => { const c = m && currentProfile(); if (c?.gender) { setP({ id: c.id, name: c.name, gender: c.gender, input: c.input, who: c.who }); setEditing(false); } }); } // 10-22 生辰檔案
    void fetch("/api/nianshu/checkout").then((r) => r.json()).then((j: { tester?: boolean; year?: number; early?: boolean }) => { setTester(!!j.tester); if (j.year) setSale({ year: j.year, early: !!j.early }); }).catch(() => {});
  }, []);

  const noTime = !!p && p.input.timeMode === "unknown";
  const pick = (x: Picked) => {
    setErr("");
    if (!x.gender) { setErr(ui.needGender ?? ""); return; }
    setP(x);
    setEditing(false);
  };
  const buy = async (year: number) => {
    if (!p?.gender || noTime) return;
    setBusy(year); setErr("");
    track("nianshu", { locale, method: tester ? "buy:tester" : `buy:${year}` });
    try {
      const r = await checkoutV2("nianshu", {
          input: p.input, gender: p.gender, year, currency, locale,
          question: [...question.trim()].slice(0, QUESTION_MAX).join("") || undefined,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tzOffsetMinutes: -new Date().getTimezoneOffset(),
          ...(remind && !tester ? { remind: true } : {}),
        }); // 10-22 进度表 57
      const j = (await r.json()) as { url?: string; field?: string };
      if (j.url) { window.location.assign(j.url); return; }
      setErr(j.field === "time" ? ui.needTime ?? "" : ui.buyErr ?? "");
    } catch { setErr(ui.buyErr ?? ""); }
    setBusy(null);
  };
  const fmt = (minor: number) => formatMoney(currency, minor, isLocale(locale) ? locale : "zh-hant");
  // 10-22 會員 8 折 (Neil: 只給會員): the page shows what the checkout will charge — the lower of the early-bird and the member price
  const tk = useTongka();
  const memberMinor = memberDiscountMinor(currency, nianshuMinor(currency));
  const payMinor = tk.member ? Math.min(nianshuMinor(currency, sale.early), memberMinor) : nianshuMinor(currency, sale.early);
  const price = fmt(payMinor), regular = fmt(nianshuMinor(currency));
  const memberOff = tk.member && payMinor < nianshuMinor(currency, sale.early);
  const now = new Date().getFullYear();
  const y = sale.year;

  return (
    <div>
      <div className={`rounded-[10px] border p-4 flex items-center gap-3 ${editing ? "border-[var(--ink)]" : "border-[var(--ink-16)]"}`}>
        <span className="t-label shrink-0 w-8 !text-[var(--gold-text)]">{ui.me}</span>
        <span className="t-body flex-1 truncate">{p ? p.name : "—"}</span>
        <button type="button" onClick={() => { setErr(""); setEditing(!editing); }} className="t-small underline underline-offset-4 shrink-0">{p ? ui.change : ui.pickMe}</button>
      </div>
      {editing && (
        <div className="mt-[var(--s-4)]">
          <BirthForm locale={locale} ui={birthUi} chartHref={`/${locale}/nianshu`} event="nianshu" initialWho="self" goLabel={ui.pickMe} onPick={pick} />
        </div>
      )}
      {noTime && !editing && <p className="t-small mt-2 !text-[var(--cinnabar)]">{ui.needTime}</p>}

      {!editing && (
        <>
          <label className="mt-[var(--s-5)] block">
            <span className="t-small !text-[var(--ink-66)]">{ui.ask}</span>
            <textarea value={question} onChange={(e) => setQuestion([...e.target.value].slice(0, QUESTION_MAX).join(""))} maxLength={QUESTION_MAX} rows={2} placeholder={ui.askHint}
              className="mt-1 w-full rounded-[6px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body text-[16px] leading-relaxed resize-y focus:outline-none focus:border-[var(--ink-45)]" />
            <span className="t-small block text-right !text-[var(--ink-45)]">{[...question].length}/{QUESTION_MAX}</span>
          </label>
          <div className="mt-[var(--s-2)] rounded-[6px] border border-[var(--gold)] p-4 flex flex-col">
            <p className="t-sect">{y === now ? ui.thisYear : ui.nextYear}</p>
            <p className="t-d3 mt-1">{(ui.year ?? "").replace("{y}", String(y)).replace("{gz}", years?.[y]?.gz ?? yearCycle(y).getName()).replace("{a}", years?.[y]?.animal ?? "")}</p>
            {memberOff && !tester && <p className="t-small mt-2 !text-[var(--gold-text)]">{ui.memberOff}<span className="ml-2 !text-[var(--ink-45)] line-through">{regular}</span></p>}
            {sale.early && !tester && !memberOff && (
              <p className="t-small mt-2">
                <span className="!text-[var(--gold-text)]">{ui.early}</span>
                <span className="ml-2 !text-[var(--ink-45)] line-through">{(ui.regular ?? "").replace("{p}", regular)}</span>
                <span className="ml-2 block sm:inline !text-[var(--ink-66)]">{(ui.earlyUntil ?? "").replace("{d}", NIANSHU_EARLY_UNTIL)}</span>
              </p>
            )}
            <button type="button" disabled={busy !== null || !p?.gender || noTime} onClick={() => void buy(y)}
              className="mt-3 self-start px-5 py-2.5 rounded-full bg-[var(--ink)] !text-[var(--paper)] text-[14px] disabled:opacity-45">
              {busy === y ? (tester ? ui.writing : ui.going) : tester ? ui.test : (ui.buy ?? "").replace("{p}", price)}
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
