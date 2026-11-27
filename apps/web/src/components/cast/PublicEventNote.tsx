"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/track";

/**
 * 11-05 进度表 140: under the question on the cast page — a public event already decided says so before the coins
 * (「這件事已經有結果」), one still ahead says which day it is settled. Chinese pages only for now; it never blocks.
 */
export default function PublicEventNote({ question, locale }: { question: string; locale: string }) {
  const [f, setF] = useState<{ status: string; date: string; result?: string } | null>(null);
  const zh = locale === "zh" || locale === "zh-hant";
  useEffect(() => {
    setF(null);
    const q = question.trim();
    if (!zh || q.length < 6) return;
    let alive = true;
    const timer = setTimeout(() => {
      fetch("/api/question-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, tz: -new Date().getTimezoneOffset() }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { status?: string; date?: string; result?: string } | null) => {
          if (!alive || !d?.status || !d.date) return;
          setF({ status: d.status, date: d.date, result: d.result });
          track("heat_click", { locale, method: `public-event:${d.status}` });
        })
        .catch(() => { /* never in the way */ });
    }, 1500);
    return () => { alive = false; clearTimeout(timer); };
  }, [question, zh, locale]);
  if (!f) return null;
  const [, m, d] = f.date.split("-").map(Number);
  const hans = locale === "zh";
  const text = f.status === "decided"
    ? (hans ? `这件事已经有结果了（${m}月${d}日）：${f.result ?? ""}。卦适合问还没定的事——要不要换一件问？` : `這件事已經有結果了（${m}月${d}日）：${f.result ?? ""}。卦適合問還沒定的事——要不要換一件問？`)
    : (hans ? `这件事在 ${m}月${d}日 揭晓，解读会以那一天为准。` : `這件事在 ${m}月${d}日 揭曉，解讀會以那一天為準。`);
  return <p className={`t-small mt-[var(--s-2)] ${f.status === "decided" ? "!text-[var(--cinnabar)]" : "!text-[var(--ink-66)]"}`} data-heat={`public-event-${f.status}`}>{text}</p>;
}
