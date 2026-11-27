"use client";

import { useEffect, useState } from "react";
import TongkaPanel from "@/components/TongkaPanel";
import PassReturn from "@/components/PassReturn";
import LoginGate from "@/components/LoginGate";
import { useCurrency } from "@/lib/use-currency";
import { useTongka } from "@/lib/use-tongka";

/**
 * 10-30 进度表 128 ⑤: one lot's reading in another language — fetched for a reader whose Pass or membership covers it
 * (/api/qian/lot); everyone else gets the pass panel (signed out: the sign-in first). The page itself stays the same for all.
 */
type Reading = { plain: string; overall: string; love: string; work: string; ask_next: string; yi: string; ji: string };
export interface QianReadingUi { readHead: string; plainH: string; overallH: string; loveH: string; workH: string; yiH: string; jiH: string; lockLead: string; lockLink: string; loading: string; castBtn: string }

export default function QianForeignReading({ locale, n, ui, castHref }: { locale: string; n: number; ui: QianReadingUi; castHref: string }) {
  const [state, setState] = useState<"loading" | "signin" | "locked" | "ok" | "err">("loading");
  const [r, setR] = useState<Reading | null>(null);
  const [currency] = useCurrency();
  const tk = useTongka();
  useEffect(() => {
    let alive = true;
    fetch(`/api/qian/lot?l=${encodeURIComponent(locale)}&n=${n}`, { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 401) return setState("signin");
        if (res.status === 402) return setState("locked");
        if (!res.ok) return setState("err");
        const j = (await res.json()) as { reading: Reading };
        setR(j.reading); setState("ok");
      })
      .catch(() => alive && setState("err"));
    return () => { alive = false; };
  }, [locale, n]);

  if (state === "ok" && r) {
    const sec = (h: string, p: string) => p ? <section className="mt-[var(--s-4)]"><h3 className="t-body font-medium">{h}</h3><p className="t-body mt-1 leading-relaxed text-[var(--ink-86)]">{p}</p></section> : null;
    return (
      <section className="mt-[var(--s-6)]" data-heat="qian-foreign-reading">
        <h2 className="t-sect">{ui.readHead}</h2>
        {sec(ui.plainH, r.plain)}
        {sec(ui.overallH, r.overall)}
        {sec(ui.loveH, r.love)}
        {sec(ui.workH, r.work)}
        <dl className="mt-[var(--s-4)] grid gap-1 t-body">
          {r.yi && <div><dt className="inline font-medium">{ui.yiH}{locale === "ja" ? "：" : ": "}</dt><dd className="inline">{r.yi}</dd></div>}
          {r.ji && <div><dt className="inline font-medium">{ui.jiH}{locale === "ja" ? "：" : ": "}</dt><dd className="inline">{r.ji}</dd></div>}
        </dl>
        {r.ask_next && <p className="t-body mt-[var(--s-5)]">{r.ask_next}</p>}
        <a href={castHref} className="inline-block mt-[var(--s-2)] t-small underline underline-offset-4">{ui.castBtn}</a>
      </section>
    );
  }
  if (state === "loading") return <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{ui.loading}</p>;
  return (
    <section data-heat="qian-foreign-lock" className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
      <h2 className="t-sect">{ui.readHead}</h2>
      <p className="t-small mt-1 mb-[var(--s-3)] !text-[var(--ink-66)]">{ui.lockLead}</p>
      {state === "signin" ? <LoginGate locale={locale} next={typeof window === "undefined" ? `/${locale}` : window.location.pathname} /> : <>
        <PassReturn locale={locale} />
        {tk.tongka || !tk.loaded
          ? <TongkaPanel locale={locale} currency={currency} first={tk.first} compact title={null} lead={null} returnTo={typeof window === "undefined" ? undefined : window.location.pathname} />
          : <a href={`/${locale}/account#membership`} className="t-small underline underline-offset-4">{ui.lockLink}</a>}
      </>}
    </section>
  );
}
