"use client";

import { useState } from "react";
import type { LineValue } from "@yaoflow/engine";
import { t, type Locale } from "@/lib/i18n";
import { attribution, track } from "@/lib/track";
import { dpT } from "@/lib/dict/daily-plus";
import { deviceTimeZone } from "@/lib/use-currency";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import EmailField from "@/components/EmailField";

interface PileInfo {
  pile: number;
  values: LineValue[];
  name: string;
  changedName: string | null;
}

/**
 * 大众一卦 (09-21, A2): the three figures are on the page from the first
 * paint — picking one is what asks for its words, so we pay for a pile only
 * when someone actually chooses it, and the reveal is the moment.
 */
type Stats = { visitors: number; pickers: number; hits: number; reactions: number };

export default function DailyPiles({ locale, day, piles, subStatus }: { locale: Locale; day: string; piles: PileInfo[]; subStatus?: "ok" | "bad" | "off" | null }) {
  const [picked, setPicked] = useState<number | null>(null);
  // 09-26 (Neil: 「1，2，3 都做吧」): what everyone did with this pile, the one-tap reaction, the question it brought up
  const [stats, setStats] = useState<Stats | null>(null);
  const [reacted, setReacted] = useState<Record<number, "hit" | "miss">>({});
  const [ask, setAsk] = useState("");
  const vote = async (pile: number, reaction: "hit" | "miss" | null) => {
    try {
      const r = await fetch("/api/daily/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pile, bs: attribution().bs, reaction, day }) });
      if (r.ok) setStats((await r.json()) as Stats);
    } catch { /* the reading stands without the numbers */ }
  };
  const [text, setText] = useState<{ note: string; watch: string } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");

  const pick = async (pile: number) => {
    if (state === "loading") return;
    setPicked(pile);
    setText(null);
    setState("loading");
    setStats(null);
    track("daily_pick", { locale, method: String(pile) });
    void vote(pile, null);
    try {
      const r = await fetch(`/api/daily?day=${encodeURIComponent(day)}&pile=${pile}&locale=${locale}`, { cache: "no-store" });
      const d = r.ok ? ((await r.json()) as { note?: string; watch?: string }) : null;
      if (!d?.note || !d?.watch) throw new Error("empty");
      setText({ note: d.note, watch: d.watch });
      setState("idle");
    } catch {
      setState("failed");
    }
  };

  return (
    <>
      <div className="mt-[var(--s-5)] grid grid-cols-3 gap-2 md:gap-4">
        {piles.map((p) => {
          const on = picked === p.pile;
          return (
            <button
              key={p.pile}
              type="button"
              onClick={() => void pick(p.pile)}
              aria-pressed={on}
              className={`rounded-[2px] border p-[var(--s-3)] md:p-[var(--s-4)] text-left transition-colors min-h-[var(--s-6)] ${
                on ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink-16)] hover:border-[var(--ink-45)]"
              }`}
            >
              <p className={`t-label ${on ? "!text-[var(--paper-45)]" : ""}`}>{t(locale, "dailyPileLabel", { n: p.pile })}</p>
              <div className="mt-3 flex items-end gap-2">
                <FigureMark yangs={primaryYangs(p.values)} width={40} />
                {p.changedName && (
                  <span className={`opacity-60 ${on ? "text-[var(--paper)]" : ""}`}>
                    <FigureMark yangs={changedYangs(p.values)} width={40} />
                  </span>
                )}
              </div>
              <p className={`t-body !text-[14px] mt-2 ${on ? "" : "text-[var(--ink-86)]"}`}>{p.name}</p>
              <p className={`t-small !text-[12px] ${on ? "!text-[var(--paper-45)]" : "!text-[var(--ink-45)]"}`}>
                {on ? "—" : t(locale, "dailyPick")}
              </p>
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <section className="mt-[var(--s-5)] fade-in">
          {state === "loading" && <p className="t-body text-[var(--ink-45)]">{t(locale, "dailyLoading")}</p>}
          {state === "failed" && <p className="t-body text-[var(--ink-66)]">{t(locale, "dailyFail")}</p>}
          {text && (
            <>
              <p className="t-body !text-[17px] leading-[1.9]">{text.note}</p>
              <div className="mt-[var(--s-4)] border-l-2 border-[var(--gold)] pl-[var(--s-3)]">
                <p className="t-label !text-[var(--gold-text)] mb-1">{t(locale, "dailyWatch")}</p>
                <p className="t-body !text-[15px]">{text.watch}</p>
              </div>
              {/* ② one tap, and what everyone else made of this pile today */}
              <div className="mt-[var(--s-5)] flex flex-wrap items-center gap-x-4 gap-y-2" data-heat="daily-react">
                {reacted[picked] ? (
                  <p className="t-small !text-[var(--gold-text)]">{dpT(locale, "thanks")}</p>
                ) : (
                  <>
                    <p className="t-small !text-[var(--ink)]">{dpT(locale, "reactQ")}</p>
                    {(["hit", "miss"] as const).map((r) => (
                      <button key={r} type="button" onClick={() => { setReacted((x) => ({ ...x, [picked]: r })); track("daily_react", { locale, method: r }); void vote(picked, r); }}
                        className="min-h-[var(--s-5)] px-4 py-1.5 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink-45)] t-small !text-[var(--ink)]">
                        {dpT(locale, r === "hit" ? "reactHit" : "reactMiss")}
                      </button>
                    ))}
                  </>
                )}
              </div>
              {stats && stats.pickers > 0 && (
                <p className="t-small mt-2 !text-[var(--ink-45)]">
                  {stats.visitors >= 10
                    ? dpT(locale, "statPick", { pct: Math.round((stats.pickers / stats.visitors) * 100) })
                    : dpT(locale, "statFew", { n: stats.pickers })}
                  {stats.reactions >= 5 && <> · {dpT(locale, "statHit", { pct: Math.round((stats.hits / stats.reactions) * 100) })}</>}
                </p>
              )}
              <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{t(locale, "dailyOther")}</p>

              {/* ① the exit: what the pile brought to mind becomes their own question */}
              <div className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
                <p className="t-body !text-[16px] text-[var(--ink)] max-w-[32rem]">{dpT(locale, "askLead")}</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const q = ask.trim();
                    track("daily_ask", { locale, method: q.length >= 2 ? "typed" : "empty" });
                    window.location.href = `/${locale}/cast?c=daily${q.length >= 2 ? `&q=${encodeURIComponent(q.slice(0, 200))}` : ""}`;
                  }}
                >
                  <textarea value={ask} onChange={(e) => setAsk(e.target.value)} rows={2} maxLength={200} placeholder={dpT(locale, "askPh")} data-heat="daily-ask-box"
                    className="mt-[var(--s-3)] w-full t-body !text-[16px] bg-transparent border border-[var(--ink-16)] rounded-[2px] px-3 py-2 outline-none focus:border-[var(--ink-45)] placeholder:opacity-40 resize-none" />
                  <button type="submit" data-heat="daily-ask"
                    className="mt-[var(--s-3)] w-full md:w-auto min-h-[var(--s-6)] px-9 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em] hover:bg-[var(--cinnabar)] transition-colors">
                    {ask.trim().length >= 2 ? dpT(locale, "askGo") : t(locale, "dailyOwnCta")}
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      )}

      <DailySub locale={locale} subStatus={subStatus ?? null} />
    </>
  );
}

/** ③ tomorrow's three, by email — double opt-in; the page only asks, the confirmation mail decides. */
function DailySub({ locale, subStatus }: { locale: Locale; subStatus: "ok" | "bad" | "off" | null }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "bad" | "error">("idle");
  const send = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      const r = await fetch("/api/daily/sub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, locale, tz: deviceTimeZone() }) });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; already?: boolean; error?: string };
      if (r.ok && d.ok) { setState("sent"); track("daily_sub", { locale, method: d.already ? "already" : "sent" }); }
      else setState(d.error === "bad_email" || d.error === "email_domain" ? "bad" : "error");
    } catch { setState("error"); }
  };
  return (
    <section className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]" data-heat="daily-sub">
      <p className="t-small !text-[var(--ink-45)]">{dpT(locale, "tomorrow")}</p>
      {subStatus === "ok" && <p className="t-small mt-2 !text-[var(--gold-text)]">{dpT(locale, "subOk")}</p>}
      {subStatus === "off" && <p className="t-small mt-2 !text-[var(--ink-66)]">{dpT(locale, "unsubOk")}</p>}
      {subStatus !== "ok" && (
        state === "sent" ? (
          <p className="t-small mt-[var(--s-3)] !text-[var(--gold-text)]">{dpT(locale, "subSent")}</p>
        ) : (
          <>
            <p className="t-body !text-[15px] mt-[var(--s-3)]">{dpT(locale, "subLead")}</p>
            <form className="mt-2 flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <EmailField locale={locale} variant="field" hint={false} required value={email} placeholder={dpT(locale, "subPh")} onChange={(v) => { setEmail(v); if (state !== "busy") setState("idle"); }} className="!text-[15px]" />
              <button type="submit" disabled={state === "busy"} className="min-h-[var(--s-6)] px-6 py-2 rounded-[2px] border border-[var(--ink)] text-[13px] tracking-[0.12em] disabled:opacity-50">
                {dpT(locale, "subGo")}
              </button>
            </form>
            {state === "bad" && <p className="t-small mt-1 !text-[var(--cinnabar)]">{dpT(locale, "subBad")}</p>}
            {state === "error" && <p className="t-small mt-1 !text-[var(--cinnabar)]">{dpT(locale, "subError")}</p>}
            <p className="t-small mt-2 !text-[var(--ink-45)]">{dpT(locale, "subNote")}</p>
          </>
        )
      )}
    </section>
  );
}
