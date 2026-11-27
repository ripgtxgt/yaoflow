"use client";

import { useEffect, useState } from "react";
import type { BirthInput, Gender } from "@/lib/mingli/birth/normalize";
import { myReportsT } from "@/lib/dict/my-reports";
import type { ChartReportLink, MySys } from "@/lib/my-reports";

/**
 * 10-23 进度表 114 ② (#838: 「深入紫微每次要再點」): at the top of a chart page, the report this chart already has —
 * 「你這張盤的深度報告 → 打開」 (八字 also its 正緣畫像) — instead of scrolling down and pressing the button again.
 * Asks /api/mingli/chart-reports (read-only; signed-in readers only); nothing shows when the chart has no report.
 * The birth goes to the server only to draw the chart again, as the report buttons already send it.
 */
export default function ChartReportLinks({ sys, locale, input, gender }: { sys: MySys; locale: string; input: BirthInput; gender?: Gender }) {
  const [links, setLinks] = useState<ChartReportLink[]>([]);
  const body = JSON.stringify({ sys, input, gender });
  useEffect(() => {
    let live = true;
    void fetch("/api/mingli/chart-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then((r) => (r.ok ? r.json() : { links: [] }))
      .then((j: { links?: ChartReportLink[] }) => { if (live) setLinks(j.links ?? []); })
      .catch(() => {});
    return () => { live = false; };
  }, [body]);
  if (!links.length) return null;
  const t = myReportsT(locale);
  return (
    <div className="mt-[var(--s-3)] border border-[var(--gold)] bg-[var(--gold)]/[0.06] rounded-[2px] px-[var(--s-4)] py-[var(--s-3)] grid gap-1" data-heat={`chart-report-${sys}`}>
      {links.map((x) => (
        <a key={x.kind} href={x.href} className="t-body underline underline-offset-4" data-heat={`chart-report-open-${sys}-${x.kind}`}>
          {x.kind === "love" ? t.chartLove : t.chartDeep}
          {x.state === "writing" || x.state === "mending" ? `（${t.states[x.state]}）` : ""} → {t.open}
        </a>
      ))}
    </div>
  );
}
