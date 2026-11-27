"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/track";

/**
 * 10-26 the love-question card under a result (lib/bridge.ts, POST /api/bridge): nothing for any other topic; for a love
 * question one card to 正緣畫像 (or 合盤 for a reader who has one), with a sentence written for this question. Chinese
 * pages only. It appears when the answer comes back — the result itself never waits on it.
 */
type B = { show: boolean; name?: string; href?: string; line?: string; product?: string; look?: "quiet" | "strong" };

export default function LoveBridge({ locale, question, surface }: { locale: string; question: string; surface: "reading" | "tarot" | "jiaobei" | "jieqian" | "qa" }) {
  const [b, setB] = useState<B | null>(null);
  useEffect(() => {
    if ((locale !== "zh" && locale !== "zh-hant") || [...question.trim()].length < 2) return;
    let alive = true;
    fetch("/api/bridge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, surface, locale }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: B | null) => { if (alive && j?.show) { setB(j); track("bridge", { locale, method: `show:${surface}:${j.product}` }); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [locale, question, surface]);
  if (!b?.show || !b.href) return null;
  return (
    <a href={b.href} onClick={() => track("bridge", { locale, method: `click:${surface}:${b.product}` })} data-heat={`bridge-${surface}-${b.product}`}
      className={`mt-[var(--s-4)] block rounded-[2px] border border-[var(--gold)] px-[var(--s-4)] py-[var(--s-3)] no-underline fade-in ${b.look === "strong" ? "bg-[var(--gold)]/[0.12] hover:bg-[var(--gold)]/[0.18]" : "hover:bg-[var(--gold)]/[0.06]"}`}>
      {/* 10-28 进度表 119: `look` is the 運營動作 bridge_look switch — the same card, gold-backed and a size up */}
      <span className={`t-body block leading-relaxed ${b.look === "strong" ? "!text-[16px] font-medium" : "!text-[15px]"}`}>{b.line}</span>
      <span className="t-small block mt-1 !text-[var(--gold-text)]">{b.name} →</span>
    </a>
  );
}
