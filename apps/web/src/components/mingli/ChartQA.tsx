"use client";

import { useEffect, useRef, useState } from "react";
import TongkaPanel from "@/components/TongkaPanel";
import PassReturn from "@/components/PassReturn";
import type { BirthInput, Gender } from "@/lib/mingli/birth/normalize";
import { useCurrency } from "@/lib/use-currency";
import { useTongka } from "@/lib/use-tongka";
import { track } from "@/lib/track";
import LoveBridge from "@/components/LoveBridge";
import { aiNotice } from "@/lib/ai-notice";

/**
 * 10-22 命盤問答 — 「問這張盤」 under the free 看懂這張盤 layer of the 八字 / 紫微 / 星盤 pages (lib/mingli/qa.ts). Opens with
 * the thread so far and three suggested questions; one question at a time; an answer that asks about an outcome or a
 * date carries a 「起一卦」 link; the deep report of this chart, when the account has one, is linked. 10-24 (Neil): only a
 * 通卡 or a membership may ask — anyone else sees what they could ask and the pass panel, right here (not signed in: a
 * sign-in link too, for a pass bought before). Only the birth input and gender are sent (never the name).
 */
type Row = { id: number; question: string; answer: string; cast: number; at: number };
type Open = { history: Row[]; suggested: string[]; covered: boolean; signedIn: boolean; reportUrl: string | null; ui: Record<string, string> };

export default function ChartQA({ system, locale, input, gender, castHref }: { system: "bazi" | "ziwei" | "astro"; locale: string; input: BirthInput; gender?: Gender; castHref: string }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needPass, setNeedPass] = useState(false);
  const [currency] = useCurrency();
  const tk = useTongka();
  const endRef = useRef<HTMLDivElement>(null);
  const body = (extra: Record<string, unknown>) => JSON.stringify({ system, input, gender: gender ?? "male", locale, ...extra });

  useEffect(() => {
    let alive = true;
    fetch("/api/mingli/qa", { method: "POST", headers: { "Content-Type": "application/json" }, body: body({ mode: "open" }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Open | null) => { if (alive && j) { setOpen(j); setRows(j.history); setNeedPass(!j.covered); } })
      .catch(() => {});
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system, JSON.stringify(input), gender, locale]);

  if (!open) return null;
  const ui = open.ui;
  const ask = async (text: string) => {
    const question = text.trim();
    if ([...question].length < 4) { setErr(ui.tooShort); return; }
    if (busy) return;
    setBusy(true); setErr(null);
    track(system, { locale, method: "qa_ask" });
    try {
      const r = await fetch("/api/mingli/qa", { method: "POST", headers: { "Content-Type": "application/json" }, body: body({ question }) });
      const j = (await r.json().catch(() => ({}))) as Partial<Row> & { error?: string; covered?: boolean; signedIn?: boolean; reportUrl?: string | null };
      if (r.status === 402) { setNeedPass(true); setOpen((o) => (o ? { ...o, covered: false, signedIn: j.signedIn ?? o.signedIn } : o)); setBusy(false); return; }
      if (r.status === 429) { setErr(ui.capHit); setBusy(false); return; }
      if (!r.ok || !j.answer) { setErr(ui.err); setBusy(false); return; }
      setRows((xs) => [...xs, { id: j.id ?? Date.now(), question, answer: j.answer!, cast: j.cast ? 1 : 0, at: j.at ?? Date.now() }]);
      setOpen((o) => (o ? { ...o, covered: true, reportUrl: j.reportUrl ?? o.reportUrl } : o));
      setQ("");
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    } catch { setErr(ui.err); }
    setBusy(false);
  };

  return (
    <section id="qa" className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)] scroll-mt-20" data-heat="chart-qa">
      <h2 className="t-d3">{ui.head}</h2>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{ui.lead}</p>
      {rows.length > 0 && (
        <div className="mt-[var(--s-3)] grid gap-3">
          {rows.map((r, i) => (
            <div key={r.id} className="rounded-[6px] border border-[var(--ink-16)] p-4">
              <p className="t-small !text-[var(--gold-text)]">{r.question}</p>
              <p className="t-body mt-2 leading-relaxed whitespace-pre-line">{r.answer}</p>
              {r.cast === 1 && (
                <a href={`${castHref}?${new URLSearchParams({ q: [...r.question].slice(0, 100).join(""), c: system })}`} onClick={() => track(system, { locale, method: "qa_cast" })}
                  className="inline-block mt-3 t-small underline underline-offset-4">{ui.cast}</a>
              )}
              {/* 10-26: a love question (e.g. 第七宮怎麼看伴侶) → 正緣畫像 or 合盤, under the latest answer only */}
              {i === rows.length - 1 && <LoveBridge locale={locale} question={r.question} surface="qa" />}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
      {open.reportUrl && <a href={open.reportUrl} className="inline-block mt-[var(--s-3)] t-small underline underline-offset-4 !text-[var(--gold-text)]">{ui.report}</a>}
      {needPass ? (
        <div className="mt-[var(--s-3)]" data-heat="chart-qa-locked">
          {rows.length === 0 && open.suggested.length > 0 && (
            <p className="t-small !text-[var(--ink-45)] mb-2">{ui.suggest}：{open.suggested.join("／")}</p>
          )}
          {tk.tongka ? (
            <>
              <p className="t-small !text-[var(--ink-66)] mb-2">{ui.locked}</p>
              <PassReturn locale={locale} />
              <TongkaPanel locale={locale} currency={currency} first={tk.first} compact title={null} lead={null} returnTo={typeof window === "undefined" ? undefined : `${window.location.pathname}#qa`} />
            </>
          ) : (
            <p className="t-small !text-[var(--ink-66)]">{ui.locked.replace("：", "。")} <a href={`/${locale}/account#membership`} className="underline underline-offset-4">→</a></p>
          )}
          {!open.signedIn && (
            <a href={`/${locale}/login?next=${encodeURIComponent(typeof window === "undefined" ? `/${locale}` : window.location.pathname)}`}
              className="inline-block mt-[var(--s-2)] t-small underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">{ui.signIn}</a>
          )}
        </div>
      ) : (
        <>
          <div className="mt-[var(--s-3)] flex flex-wrap gap-2">
            {open.suggested.map((s) => (
              <button key={s} type="button" disabled={busy} onClick={() => void ask(s)} className="px-3.5 py-2 rounded-full border border-[var(--ink-16)] hover:border-[var(--ink)] text-[14px] text-left disabled:opacity-45">{s}</button>
            ))}
          </div>
          <form className="mt-[var(--s-3)] flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
            <input value={q} onChange={(e) => setQ([...e.target.value].slice(0, 200).join(""))} maxLength={200} placeholder={ui.ph} disabled={busy}
              className="flex-1 min-w-0 rounded-[6px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body text-[16px] focus:outline-none focus:border-[var(--ink-45)]" />
            <button type="submit" disabled={busy || [...q.trim()].length < 4} className="px-5 py-2.5 rounded-full bg-[var(--ink)] !text-[var(--paper)] text-[14px] disabled:opacity-45 shrink-0">{busy ? ui.asking : ui.ask}</button>
          </form>
          {open.covered && <p className="t-small mt-2 !text-[var(--ink-45)]">{ui.covered}</p>}
          {/* 10-29 进度表 128: the EU AI Act's notice, the four EU languages only (lib/ai-notice.ts) */}
          {aiNotice(locale, "chart") && <p className="t-small mt-2 !text-[var(--ink-45)]">{aiNotice(locale, "chart")}</p>}
        </>
      )}
      {err && <p className="t-small mt-2 !text-[var(--cinnabar)]">{err}</p>}
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{ui.disclaimer}</p>
    </section>
  );
}
