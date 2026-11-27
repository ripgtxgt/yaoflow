import Link from "next/link";
import { hexagramByNumber } from "@yaoflow/engine";
import { tt } from "@/lib/dict/thread";
import { eventOf } from "@/lib/revisit-judge";
import { mt } from "@/lib/dict/matter";
import { hexName } from "@/lib/names";
import { localDay } from "@/lib/clock";
import type { ThreadCast } from "@/lib/db";
import type { Locale } from "@/lib/locales";

/**
 * 这件事的来龙去脉 (09-23): every cast the reader has made on this matter, in
 * order, with what became of each — follow-ups, notes, the window and its
 * answer. Server-rendered; the reading page passes the matter's casts.
 */

export function threadStatus(c: Pick<ThreadCast, "outcome" | "revisit_id" | "due_at"> & { timing_quote?: string | null; event?: string | null }, locale: Locale, fmt: (ms: number) => string, now = Date.now()): string | null {
  // 10-07: hit / miss score the reading against its own lean; an answer that cannot score it shows the fact the reader gave
  if (c.outcome === "hit") return tt(locale, "threadHit");
  if (c.outcome === "partial") return tt(locale, "threadPartial");
  if (c.outcome === "miss") return tt(locale, "threadMiss");
  if (c.outcome === "open") return tt(locale, "threadOpen");
  if (c.outcome === "unclear") {
    const ev = eventOf(c);
    return tt(locale, ev === "happened" || ev === "offwindow" ? "ansHit" : ev === "stirred" ? "ansPartial" : ev === "nothing" ? "ansMiss" : "threadOpen");
  }
  if (c.revisit_id && c.due_at) {
    if (c.due_at <= now) return tt(locale, "threadAwait");
    // 09-30 (进度表 25 ①, #838: the list said 「應期 10月8日」 while the reading said 10月3–7日): due_at is the day we
    // write back — the latest date in the reading + 1, or a 14-day default for a light reading with no date. The
    // list now shows the reading's own timing line when there is one, and otherwise says plainly when we will ask.
    const q = c.timing_quote?.trim();
    if (q) return tt(locale, "threadWindow", { quote: q.length > 36 ? `${q.slice(0, 35)}…` : q });
    return tt(locale, "threadRevisit", { date: fmt(c.due_at) });
  }
  return null;
}

const SHOWN = 8;

export default function ThreadPanel(
  { locale, pageLocale, casts, currentCastId, matterHref = null }: { locale: Locale; pageLocale: Locale; casts: ThreadCast[]; currentCastId: number | null; matterHref?: string | null },
) {
  if (casts.length < 2) return null;
  const all = [...casts].sort((a, b) => a.created_at - b.created_at);
  // a heavy reader's matter can hold twenty casts: the latest SHOWN stay open, the earlier ones fold (always keeping this one visible)
  const cut = Math.max(0, all.length - SHOWN);
  const hereIdx = all.findIndex((c) => c.id === currentCastId);
  const early = all.slice(0, cut).filter((_, i) => i !== hereIdx);
  const ordered = [...(hereIdx >= 0 && hereIdx < cut ? [all[hereIdx]!] : []), ...all.slice(cut)];
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(locale === "zh" ? "zh-CN" : locale === "zh-hant" ? "zh-TW" : locale, { month: "short", day: "numeric" });
  return (
    <section id="thread" className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
      <p className="t-sect mb-2">{tt(locale, "threadTitle")}</p>
      <p className="t-small !text-[var(--ink-66)] mb-[var(--s-4)]">{tt(locale, "threadLead")}</p>
      {early.length > 0 && (
        <details className="mb-2">
          <summary className="t-label cursor-pointer !text-[var(--ink-45)] hover:text-[var(--ink)]">+ {early.length}</summary>
          <ol className="flex flex-col mt-2">{early.map((c) => row(c))}</ol>
        </details>
      )}
      <ol className="flex flex-col">
        {ordered.map((c) => row(c))}
      </ol>
      {/* 09-29 「一件事」: the whole matter on its own page */}
      {matterHref && <p className="mt-[var(--s-3)]"><Link href={matterHref} data-heat="thread-matter" className="t-small underline underline-offset-4">{mt(locale, "open")} →</Link></p>}
    </section>
  );

  function row(c: ThreadCast) {
          const p = hexagramByNumber(c.primary_num);
          const ch = c.changed_num ? hexagramByNumber(c.changed_num) : null;
          const here = c.id === currentCastId;
          const status = threadStatus(c, locale, fmt);
          const meta = [
            c.followups > 0 ? tt(locale, "threadAsks", { n: c.followups }) : null,
            c.notes > 0 ? tt(locale, "threadNotes", { n: c.notes }) : null,
            status,
          ].filter(Boolean).join(" · ");
          const inner = (
            <>
              <p className="t-label !text-[var(--ink-45)]">
                {localDay(c.created_at, c.tz_offset)}
                <span className="mx-2">·</span>
                {p ? hexName(p, locale) : ""}{ch ? ` → ${hexName(ch, locale)}` : ""}
                {here && <span className="ml-2 !text-[var(--cinnabar)]">{tt(locale, "threadThis")}</span>}
              </p>
              <p className={`t-body mt-1 ${here ? "" : "group-hover:text-[var(--cinnabar)] transition-colors"}`}>{c.question}</p>
              {meta && <p className="t-small mt-1 !text-[var(--ink-45)]">{meta}</p>}
            </>
          );
          return (
            <li key={c.id} className={`py-[var(--s-3)] pl-4 border-l ${here ? "border-[var(--cinnabar)]" : "border-[var(--ink-16)]"}`}>
              {here || !c.session_id ? inner : (
                <Link href={`/${pageLocale}/reading?sid=${encodeURIComponent(c.session_id)}`} className="group block">{inner}</Link>
              )}
            </li>
          );
  }
}

/** 第二个活跃天 (09-23): the day a reader comes back is when membership is worth mentioning — not the first cast. */
export function SubReturnPanel({ locale, pageLocale, days, deep, pass = false }: { locale: Locale; pageLocale: Locale; days: number; deep: number; pass?: boolean }) {
  return (
    <section className="mt-[var(--s-6)] border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-5)]">
      <p className="t-label mb-2">{tt(locale, "subReturnTitle", { n: days })}</p>
      <p className="t-body !text-[15px] text-[var(--ink-86)]">{tt(locale, pass ? "subReturnBodyPass" : "subReturnBody", { deep })}</p>
      <Link href={`/${pageLocale}/account#membership`} data-heat="sub-return" className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]">
        {tt(locale, "subReturnCta")} →
      </Link>
    </section>
  );
}
