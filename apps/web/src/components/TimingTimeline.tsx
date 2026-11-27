"use client";

import { useEffect, useRef } from "react";
import type { Locale } from "@/lib/locales";
import { track } from "@/lib/track";
import { timelineGoogleUrl, timelineIcs, type TimelineData } from "@/lib/timeline-cal";

/**
 * 10-14 进度表 §四 44: the timing as a line — the cast day, the window(s), and the day we come back to ask — with
 * 「加入行事曆」 (a .ics file, or Google Calendar in one tap). The calendar events carry the kind of matter and a link,
 * never the question. `compact` is the matter page's short version (no calendar buttons).
 */
const W = {
  "zh-hant": { castDay: "起卦那天", today: "今天", window: "應期窗口", window2: "下一段", back: "我們回來問你", add: "加入行事曆", google: "Google 日曆", icsWin: "YaoFlow：這件事的應期窗口", icsBack: "YaoFlow：回訪日（我們會寫信問結果）", kind: "問題類型：", head: "這件事的時間" },
  zh: { castDay: "起卦那天", today: "今天", window: "应期窗口", window2: "下一段", back: "我们回来问你", add: "加入日历", google: "Google 日历", icsWin: "YaoFlow：这件事的应期窗口", icsBack: "YaoFlow：回访日（我们会写信问结果）", kind: "问题类型：", head: "这件事的时间" },
  en: { castDay: "Cast", today: "Today", window: "Timing window", window2: "Next window", back: "We come back to ask", add: "Add to calendar", google: "Google Calendar", icsWin: "YaoFlow: the timing window for this matter", icsBack: "YaoFlow: check-in day (we'll email to ask how it went)", kind: "Kind of matter: ", head: "When this plays out" },
} as const;
const words = (l: Locale) => (l === "zh-hant" || l === "zh" ? W[l] : W.en);

const DAY = 86_400_000;
const t0 = (s: string) => Date.parse(`${s}T00:00:00Z`);
const md = (s: string, l: Locale) => {
  const [, m, d] = s.split("-").map(Number);
  return l === "zh" || l === "zh-hant" ? `${m}/${d}` : new Date(t0(s)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

export default function TimingTimeline({ data, locale, kind, link, today, surface = "deep", compact = false }: {
  data: TimelineData; locale: Locale; kind: string; link: string; today: string; surface?: "deep" | "one" | "matter"; compact?: boolean;
}) {
  const w = words(locale);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { track("timeline_view", { locale, method: surface }); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [locale, surface]);

  const a = t0(data.start), z = t0(data.revisit) + DAY;
  const span = Math.max(DAY, z - a);
  const pos = (s: string) => Math.min(100, Math.max(0, ((t0(s) - a) / span) * 100));
  const startLabel = data.start === today ? w.today : `${md(data.start, locale)} ${w.castDay}`;

  const download = () => {
    track("timeline_cal", { locale, method: "ics" });
    const ics = timelineIcs(data, { window: w.icsWin, revisit: w.icsBack, kind: `${w.kind}${kind}`, link }, `${data.start}-${data.revisit}-${Math.random().toString(36).slice(2, 8)}`);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const el = document.createElement("a");
    el.href = url; el.download = "yaoflow-timing.ics"; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const google = timelineGoogleUrl(data, { window: w.icsWin, kind: `${w.kind}${kind}`, link });

  return (
    <section ref={ref} className={compact ? "mt-[var(--s-3)]" : "mt-[var(--s-5)] mb-[var(--s-5)]"} data-heat={`timeline-${surface}`}>
      {!compact && <p className="t-label mb-[var(--s-3)]">{w.head}</p>}
      <div className="relative h-8" aria-hidden>
        <div className="absolute left-0 right-0 top-1/2 h-px bg-[var(--ink-16)]" />
        {data.windows.map((x, k) => (
          <div key={k} className={`absolute top-1/2 -translate-y-1/2 h-2.5 rounded-[2px] ${k === 0 ? "bg-[var(--gold)]" : "bg-[var(--gold)]/45"}`}
            style={{ left: `${pos(x.start)}%`, width: `${Math.max(1.5, pos(x.end) + (100 * DAY) / span - pos(x.start))}%` }} />
        ))}
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[var(--ink)]" style={{ left: "0%" }} />
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-[var(--cinnabar)] bg-[var(--paper)]" style={{ left: `${pos(data.revisit)}%` }} />
      </div>
      <ol className="mt-1 grid gap-x-4 gap-y-1 t-small sm:flex sm:flex-wrap sm:justify-between">
        <li className="!text-[var(--ink-66)]">{startLabel}</li>
        {data.windows.map((x, k) => (
          <li key={k} className="!text-[var(--ink)]">
            <span className="!text-[var(--gold-text)]">{k === 0 ? w.window : w.window2}</span> {md(x.start, locale)}{x.end !== x.start ? `–${md(x.end, locale)}` : ""}
          </li>
        ))}
        <li className="!text-[var(--cinnabar)]">{md(data.revisit, locale)} {w.back}</li>
      </ol>
      {!compact && (
        <p className="mt-[var(--s-3)] flex flex-wrap gap-x-5 gap-y-2 t-small">
          <button type="button" onClick={download} data-heat="timeline-ics" className="underline underline-offset-4 hover:text-[var(--ink)]">{w.add}</button>
          <a href={google} target="_blank" rel="noopener noreferrer" onClick={() => track("timeline_cal", { locale, method: "google" })} data-heat="timeline-google" className="underline underline-offset-4 hover:text-[var(--ink)]">{w.google}</a>
        </p>
      )}
    </section>
  );
}
