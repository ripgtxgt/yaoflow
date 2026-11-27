"use client";

import { useEffect, useState } from "react";
import { LunarDay } from "tyme4ts";
import type { BirthInput, Gender } from "@/lib/mingli/birth/normalize";
import { track } from "@/lib/track";
import TongkaPanel from "@/components/TongkaPanel";
import PassReturn from "@/components/PassReturn";
import { useTongka } from "@/lib/use-tongka";
import { useCurrency } from "@/lib/use-currency";

/**
 * 10-20 紫微②③ — the report doors under the free 紫微 layer, as BaziReports on the 八字 page:
 * 紫微深度報告 (members, or a signed-in admin browser as tester → POST /api/ziwei/report). 10-21 (Neil): the 紫微年書
 * cards are gone from this page — the year is sold only as the 三合一年書 (/nianshu).
 * Only the birth input and gender are sent (never the name); the server recomputes. Behind the ziwei-paid switch.
 */
type Ui = Record<string, string>;
type Me = { signedIn: boolean; entitlement?: { active?: boolean } };

/** the 紫微 year (turning at 正月初一) today, in the reader's own clock */
export function ziweiYearNow(d = new Date()): number {
  const y = d.getFullYear();
  const s = LunarDay.fromYmd(y, 1, 1).getSolarDay();
  const before = d.getMonth() + 1 < s.getMonth() || (d.getMonth() + 1 === s.getMonth() && d.getDate() < s.getDay());
  return before ? y - 1 : y;
}

export default function ZiweiReports({ locale, ui, input, gender }: { locale: string; ui: Ui; input: BirthInput; gender: Gender }) {
  const [show, setShow] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [tester, setTester] = useState(false);
  // 10-22 通卡: a pass covers the reports too; without one the passes are offered right here (not a trip to the account page)
  const tk = useTongka();
  const [currency] = useCurrency();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/features/visible?n=ziwei-paid").then((r) => r.json()).then((j: Record<string, boolean>) => setShow(!!j["ziwei-paid"])).catch(() => {});
    void fetch("/api/ziwei/report").then((r) => r.json()).then((j: { tester?: boolean }) => setTester(!!j.tester)).catch(() => {});
    void fetch("/api/me").then((r) => r.json()).then((j: Me) => setMe(j)).catch(() => setMe({ signedIn: false }));
  }, []);
  if (!show) return null;
  const member = !!me?.entitlement?.active;
  const here = typeof window === "undefined" ? `/${locale}/ziwei/chart` : window.location.pathname;
  const go = async (kind: "deep", rewrite = false) => {
    setErr(null);
    // 10-22 通卡: a visitor with no account buys a pass right here (the payment signs the browser in) instead of a trip to the login page
    if (!me?.signedIn && tk.tongka) { document.getElementById(`tongka-ziwei`)?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (!me?.signedIn) { window.location.assign(`/${locale}/login?next=${encodeURIComponent(here)}`); return; }
    setBusy(kind);
    track("ziwei", { locale, method: `report_${kind}${member ? ":member" : ""}` });
    try {
      const body = { kind, input, gender, locale, ...(rewrite ? { rewrite: true } : {}) };
      const r = await fetch("/api/ziwei/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json()) as { url?: string; error?: string; field?: string; rewritten?: boolean; nextAt?: number };
      // 10-22 報告月更: not yet 30 days since the last one — say when
      if (rewrite && j.url && j.rewritten === false && j.nextAt) { setErr((ui.repRewriteNext ?? "").replace("{d}", new Date(j.nextAt).toLocaleDateString(locale === "zh" ? "zh-CN" : locale === "zh-hant" ? "zh-TW" : locale, { month: "numeric", day: "numeric" }))); setBusy(null); return; }
      if (j.url) { window.location.assign(j.url); return; }
      if (r.status === 402) { if (tk.tongka) { document.getElementById(`tongka-${"ziwei"}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); setBusy(null); return; } window.location.assign(`/${locale}/account#membership`); return; }
      if (r.status === 401) { window.location.assign(`/${locale}/login?next=${encodeURIComponent(here)}`); return; }
      setErr(j.field === "time" ? ui.repNeedTime : ui.repError);
    } catch { setErr(ui.repError); }
    setBusy(null);
  };
  const card = "rounded-[6px] border border-[var(--ink-16)] p-4 flex flex-col";
  const btn = "mt-3 self-start px-5 py-2.5 rounded-full text-[14px] disabled:opacity-45";
  const memberCta = member ? ui.repOpen : tester ? ui.repTest : tk.tongka ? ui.repTongka : !me?.signedIn ? ui.repLogin : ui.repMember;
  return (
    <section className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)]">
      <h2 className="t-d3">{ui.repHead}</h2>
      <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-2">
        <div className={`${card} sm:col-span-2`}>
          <p className="t-sect">{ui.repDeepTag}</p>
          <p className="t-body mt-1 font-medium">{ui.repDeep}</p>
          <p className="t-small mt-1 !text-[var(--ink-66)] flex-1">{ui.repDeepLine}</p>
          <button type="button" disabled={!!busy || !me} onClick={() => void go("deep")} className={`${btn} bg-[var(--ink)] !text-[var(--paper)]`}>{busy === "deep" ? ui.repWriting : memberCta}</button>
          {member && tk.member && <button type="button" disabled={!!busy} onClick={() => void go("deep", true)} className="mt-2 self-start t-small underline underline-offset-4 !text-[var(--ink-66)] disabled:opacity-45">{ui.repRewrite}</button>}
        </div>
      </div>
      {tk.tongka && tk.loaded && !member && !tester && (
        <div id={`tongka-${"ziwei"}`} className="mt-[var(--s-3)] scroll-mt-24">
          <PassReturn locale={locale} />
          <TongkaPanel locale={locale} currency={currency} first={tk.first} compact title={null} lead={ui.repTongkaLead} returnTo={typeof window === "undefined" ? undefined : window.location.pathname} />
        </div>
      )}
      {err && <p className="t-small mt-2 !text-[var(--cinnabar)]">{err}</p>}
    </section>
  );
}
