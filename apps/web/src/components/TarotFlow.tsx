"use client";

import TongkaPanel, { TongkaSkeleton } from "@/components/TongkaPanel";
import PassReturn from "@/components/PassReturn";
import { useTongka } from "@/lib/use-tongka";

import { useState } from "react";
import { useCurrency } from "@/lib/use-currency";
import { formatMoney, priceMinor } from "@/lib/money";
import { track } from "@/lib/track";
import EmailField from "@/components/EmailField";
import { emailTypoPending } from "@/lib/email-check";
import type { Locale } from "@/lib/i18n";
import type { TarotUi } from "@/lib/tarot-ui";
import s from "./TarotFlow.module.css";
import { checkoutV2 } from "@/lib/checkout-client";

/**
 * 10-16 进度表 68 線上塔羅. The draw: one matter in words → shuffle → the reader taps n cards from a fan → they turn over.
 * The cards themselves were dealt on the server (POST /api/tarot/draw) the moment the shuffle started; the fan only
 * decides the order they are turned. Same matter within 24 hours → the first spread, not a new one.
 */
type Card = { id: string; rev: boolean; name: string; en: string; img: string; keywords: string[] };
const fill = (t: string, k: string, v: string | number) => t.replace(`{${k}}`, String(v));

export function CardImg({ img, rev, name, className = "" }: { img: string; rev: boolean; name: string; className?: string }) {
  return (
    <span className={`${s.card} ${s.flipped} ${className}`} style={{ display: "inline-block" }}>
      <span className={s.inner}>
        <span className={s.back} />
        <span className={`${s.face} ${rev ? s.rev : ""}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={img} alt={name} loading="lazy" /></span>
      </span>
    </span>
  );
}

// 10-17: the draw moved to its own table (components/TarotDraw.tsx)
export { TarotDraw } from "./TarotDraw";

/** The paid layer's door: the light-reading price in the page's currency, or a member's allowance. */
export function TarotBuy({ token, member, pass = false, ui, locale }: { token: string; member: boolean; /** 10-24: covered by a 通卡, not a membership */ pass?: boolean; ui: TarotUi; locale: string }) {
  const [currency] = useCurrency();
  const [state, setState] = useState<"idle" | "going" | "error">("idle");
  // 10-22 通卡: for a reader the switch shows it to, the passes stand where the single price stood (a pass holder is `member` here)
  const tk = useTongka();
  const price = formatMoney(currency, priceMinor(currency, "one"), locale as Locale);
  const go = async () => {
    if (state === "going") return;
    setState("going");
    track("tarot", { locale, method: member ? "buy:member" : `buy:${currency}`, path: "/tarot" });
    try {
      const r = await checkoutV2("tarot", { token, currency, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tzOffsetMinutes: -new Date().getTimezoneOffset() }); // 10-22 进度表 57
      const j = (await r.json().catch(() => ({}))) as { url?: string };
      if (r.ok && j.url) { window.location.assign(j.url); return; }
      setState("error");
    } catch { setState("error"); }
  };
  // 10-24 (Neil: 塔羅結果頁「沒有付費引導嗎？」): until /api/me answers, the passes' frame — never the retired single price first
  if (!member && !tk.loaded) return <TongkaSkeleton locale={locale} />;
  if (tk.tongka && !member && !tk.covered) {
    return (
      <div>
        <PassReturn locale={locale} />
        <TongkaPanel locale={locale} currency={currency} first={tk.first} compact title={null} lead={null} returnTo={typeof window === "undefined" ? undefined : window.location.pathname} />
        <ul className="mt-[var(--s-3)] space-y-1 t-small !text-[var(--ink-66)]">
          {[ui.buyList1, ui.buyList2, ui.buyList3, ui.buyList4, ui.buyList5].map((x) => <li key={x}>· {x}</li>)}
        </ul>
      </div>
    );
  }
  return (
    <div>
      {tk.tongka && <PassReturn locale={locale} />}
      <button type="button" onClick={() => void go()} disabled={state === "going"} data-heat="tarot-buy"
        className="min-h-[var(--s-6)] px-7 py-3 rounded-[2px] border border-[var(--ink)] text-[var(--ink)] tracking-[0.12em] text-[13px] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition disabled:opacity-45">
        {state === "going" ? (member ? ui.buyWriting : ui.buyGoing) : member ? (pass ? ui.buyPass : ui.buyMember) : fill(ui.buyPrice, "price", price)}
      </button>
      {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{ui.buyError}</p>}
      <ul className="mt-[var(--s-3)] space-y-1 t-small !text-[var(--ink-66)]">
        {[ui.buyList1, ui.buyList2, ui.buyList3, ui.buyList4, ui.buyList5].map((x) => <li key={x}>· {x}</li>)}
      </ul>
      <p className="t-small mt-2 !text-[var(--ink-45)]">{member ? (pass ? ui.buyPassNote : ui.buyMemberNote) : ui.buyNote}</p>
    </div>
  );
}

export function TarotFollowup({ token, castHref, ui, locale, done }: { token: string; castHref: string; ui: TarotUi; locale: string; done: { question: string; answer: string; cast: boolean } | null }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<"idle" | "going" | "error" | "short">("idle");
  const [got, setGot] = useState(done);
  const send = async () => {
    const text = q.trim();
    if ([...text].length < 4) { setState("short"); return; }
    if (state === "going") return;
    setState("going");
    try {
      const r = await fetch("/api/tarot/followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, question: text }) });
      const j = (await r.json().catch(() => ({}))) as { answer?: string; cast?: boolean; error?: string };
      if (r.ok && j.answer) { setGot({ question: text, answer: j.answer, cast: !!j.cast }); return; }
      if (j.error === "used") { window.location.reload(); return; }
      setState("error");
    } catch { setState("error"); }
  };
  if (got) {
    return (
      <div className="mt-[var(--s-5)] pt-[var(--s-4)] border-t border-[var(--ink-16)]">
        <p className="t-label !text-[var(--ink-45)]">{ui.fuYou}</p>
        <p className="t-small mt-1 !text-[var(--ink-66)]">{fill(ui.quote, "q", got.question)}</p>
        <p className="t-body leading-relaxed mt-[var(--s-3)]">{got.answer}</p>
        {got.cast && (
          <a href={castHref} onClick={() => track("tarot", { locale, method: "to_cast:followup", path: "/tarot" })}
            className="inline-block mt-[var(--s-4)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px] hover:opacity-90 transition">{ui.fuCast}</a>
        )}
      </div>
    );
  }
  return (
    <div className="mt-[var(--s-5)] pt-[var(--s-4)] border-t border-[var(--ink-16)]">
      <p className="t-label !text-[var(--gold-text)]">{ui.fuHead}</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{ui.fuSub}</p>
      <textarea value={q} onChange={(e) => { setQ(e.target.value.slice(0, 200)); if (state === "short") setState("idle"); }} rows={3} maxLength={200} placeholder={ui.fuPh}
        className="mt-[var(--s-3)] w-full rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[16px] focus:outline-none focus:border-[var(--ink-45)]" />
      <div className="mt-2 flex items-center gap-4">
        <button type="button" onClick={() => void send()} disabled={state === "going"}
          className="min-h-[var(--s-6)] px-6 py-2.5 rounded-[2px] border border-[var(--ink)] text-[var(--ink)] tracking-[0.12em] text-[13px] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition disabled:opacity-45">
          {state === "going" ? ui.fuGoing : ui.fuSend}
        </button>
        <span className="t-small !text-[var(--ink-45)] tabular-nums">{[...q].length}/200</span>
      </div>
      {state === "short" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{ui.fuShort}</p>}
      {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{ui.fuError}</p>}
    </div>
  );
}

// 10-30 进度表 128: the day as the reader's language writes it (the Chinese pages keep 11/30)
const fmtDay = (ms: number, locale: string) => {
  const d = new Date(ms);
  if (locale === "zh" || locale === "zh-hant") return `${d.getMonth() + 1}/${d.getDate()}`;
  try { return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(d); } catch { return `${d.getMonth() + 1}/${d.getDate()}`; }
};

/** 到期回訪: the reader's own day (2 weeks / a month / 3 months) and, optionally, what would count as an answer.
 *  10-22 进度表 89／90: plus 「你打算怎麼做」 (only for the reader); a free spread with no address on file asks for one here. */
export function TarotRevisit({ token, ui, locale, hasEmail, due: due0, outcome: outcome0, days: days0, plan: plan0, free }: { token: string; ui: TarotUi; locale: string; hasEmail: boolean; due: number | null; outcome: string | null; days: number | null; plan?: string | null; free?: boolean }) {
  const [days, setDays] = useState<number>(days0 ?? 30);
  const [outcome, setOutcome] = useState(outcome0 ?? "");
  const [plan, setPlan] = useState(plan0 ?? "");
  const [email, setEmail] = useState("");
  const [due, setDue] = useState<number | null>(due0);
  const [editing, setEditing] = useState(!due0);
  const [state, setState] = useState<"idle" | "going" | "error">("idle");
  if (!hasEmail && !free) return <p className="t-small !text-[var(--ink-66)]">{ui.rvNoMail}</p>;
  const save = async () => {
    if (!hasEmail && emailTypoPending(email)) return; // 10-23: the 「是不是 …？」 line under the box is asking
    setState("going");
    try {
      const r = await fetch("/api/tarot/revisit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, days, outcome, plan, email: hasEmail ? undefined : email }) });
      const j = (await r.json().catch(() => ({}))) as { due?: number };
      if (r.ok && j.due) { setDue(j.due); setEditing(false); setState("idle"); track("tarot", { locale, method: `revisit_set:${days}${free ? ":free" : ""}`, path: "/tarot" }); return; }
      setState("error");
    } catch { setState("error"); }
  };
  if (!editing && due) {
    return (
      <div>
        <p className="t-body">{fill(free ? ui.rvSavedFree : ui.rvSaved, "date", fmtDay(due, locale))} <button type="button" className="t-small underline underline-offset-4 ml-2" onClick={() => setEditing(true)}>{ui.rvChange}</button></p>
        {plan && <p className="t-small mt-1 !text-[var(--ink-66)]">{fill(ui.rvPlanShow, "p", plan)}</p>}
      </div>
    );
  }
  const field = "mt-2 w-full rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[16px] focus:outline-none focus:border-[var(--ink-45)]";
  return (
    <div>
      <label className="t-label block" htmlFor="tarot-outcome">{ui.rvOutcome}</label>
      <input id="tarot-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value.slice(0, 80))} placeholder={ui.rvOutcomePh} maxLength={80} className={field} />
      <label className="t-label block mt-[var(--s-4)]" htmlFor="tarot-plan">{ui.rvPlan}</label>
      <input id="tarot-plan" value={plan} onChange={(e) => setPlan(e.target.value.slice(0, 80))} placeholder={ui.rvPlanPh} maxLength={80} className={field} />
      <p className="t-label mt-[var(--s-4)]">{ui.rvWhen}</p>
      <div className="mt-2 flex gap-2" role="radiogroup">
        {([[14, ui.rv14], [30, ui.rv30], [90, ui.rv90]] as const).map(([n, label]) => (
          <button key={n} type="button" role="radio" aria-checked={days === n} onClick={() => setDays(n)}
            className={`px-4 py-2 rounded-[2px] border t-small transition ${days === n ? "border-[var(--ink)] text-[var(--ink)]" : "border-[var(--ink-16)] text-[var(--ink-66)]"}`}>{label}</button>
        ))}
      </div>
      {!hasEmail && (
        <div className="mt-[var(--s-4)]">
          <EmailField locale={locale as Locale} variant="field" value={email} onChange={setEmail} label={ui.rvEmail} note={ui.rvMine} onEnter={() => void save()} />
        </div>
      )}
      <button type="button" onClick={() => void save()} disabled={state === "going" || (!hasEmail && !/@/.test(email))}
        className="mt-[var(--s-4)] min-h-[var(--s-6)] px-6 py-2.5 rounded-[2px] border border-[var(--ink)] text-[var(--ink)] tracking-[0.12em] text-[13px] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition disabled:opacity-40">{ui.rvSave}</button>
      {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{ui.error}</p>}
    </div>
  );
}

/**
 * The four answers on the page itself (the letter's links land here too). 10-23 进度表 104 ②: the 「放進應驗紀錄」 tick is gone —
 * nothing ever listed a spread on /outcomes; the answer is counted in the site's figures only, and the page says so.
 */
export function TarotAnswer({ token, ui, labels, current }: { token: string; ui: TarotUi; labels: { id: string; label: string }[]; current: string | null }) {
  const [a, setA] = useState<string | null>(current);
  const [done, setDone] = useState(false);
  const save = async () => {
    if (!a) return;
    const r = await fetch("/api/tarot/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, answer: a }) }).catch(() => null);
    if (r?.ok) setDone(true);
  };
  if (done) return <p className="t-body">{fill(ui.ansDone, "a", labels.find((x) => x.id === a)?.label ?? "")}</p>;
  return (
    <div>
      <p className="t-sect">{ui.ansHead}</p>
      <div className="mt-[var(--s-3)] flex gap-2 flex-wrap">
        {labels.map((x) => (
          <button key={x.id} type="button" onClick={() => setA(x.id)} aria-pressed={a === x.id}
            className={`px-4 py-2 rounded-[2px] border t-small transition ${a === x.id ? "border-[var(--ink)] text-[var(--ink)]" : "border-[var(--ink-16)] text-[var(--ink-66)]"}`}>{x.label}</button>
        ))}
      </div>
      <p className="mt-[var(--s-3)] t-small !text-[var(--ink-45)]">{ui.ansCounted}</p>
      <button type="button" onClick={() => void save()} disabled={!a}
        className="mt-[var(--s-3)] min-h-[var(--s-6)] px-6 py-2.5 rounded-[2px] border border-[var(--ink)] text-[var(--ink)] tracking-[0.12em] text-[13px] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition disabled:opacity-45">{ui.ansSave}</button>
    </div>
  );
}

export function TarotCastLink({ href, ui, locale }: { href: string; ui: TarotUi; locale: string }) {
  return (
    <a href={href} data-heat="tarot-cast" onClick={() => track("tarot", { locale, method: "to_cast", path: "/tarot" })}
      className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors">
      {ui.castBtn}
    </a>
  );
}
