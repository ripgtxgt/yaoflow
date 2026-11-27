"use client";

import { useEffect, useState } from "react";
import { tt } from "@/lib/dict/thread";
import { LOCALE_META, type Locale } from "@/lib/locales";

interface Note { at: number; note: string; reply: string }

/**
 * 记一笔进展 (09-23): the reader writes what has happened since; the reading
 * answers inside the same cast. See app/api/progress for the pacing.
 */
export default function ProgressLog(
  { locale, sid, initial, nextAt: nextAt0, full: full0, limit }: {
    locale: Locale; sid: string; initial: Note[]; nextAt: number | null; full: boolean; limit: number;
  },
) {
  const [notes, setNotes] = useState<Note[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [nextAt, setNextAt] = useState<number | null>(nextAt0);
  const [full, setFull] = useState(full0);
  // times are formatted in the reader's own clock, so only after mount (the server's clock is not theirs)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const waiting = nextAt !== null && (!mounted || nextAt > Date.now());
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString(LOCALE_META[locale].htmlLang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const day = (ms: number) => new Date(ms).toLocaleDateString(LOCALE_META[locale].htmlLang, { month: "short", day: "numeric" });

  const send = async () => {
    const note = text.trim();
    if (note.length < 2 || busy) return;
    setBusy(true);
    setErr(false);
    try {
      const res = await fetch("/api/progress", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, note }),
      });
      const data = (await res.json()) as { reply?: string; at?: number; nextAt?: number; left?: number; error?: string };
      if (res.status === 429 && data.error === "too_soon" && data.nextAt) { setNextAt(data.nextAt); return; }
      if (res.status === 429 && data.error === "limit_reached") { setFull(true); return; }
      if (!res.ok || !data.reply) throw new Error(String(res.status));
      setNotes((x) => [...x, { at: data.at ?? Date.now(), note, reply: data.reply! }]);
      setText("");
      setNextAt(data.nextAt ?? null);
      if ((data.left ?? 1) <= 0) setFull(true);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="progress" className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
      <p className="t-sect mb-2">{tt(locale, "noteTitle")}</p>
      <p className="t-small !text-[var(--ink-66)] mb-[var(--s-4)] max-w-[36rem]">{tt(locale, "noteLead")}</p>

      {notes.length > 0 && (
        <ol className="flex flex-col gap-[var(--s-4)] mb-[var(--s-5)]">
          {notes.map((n, i) => (
            <li key={i} className="flex flex-col gap-2">
              <p className="t-label !text-[var(--ink-45)]">{mounted ? `${day(n.at)} · ` : ""}{tt(locale, "noteYou")}</p>
              <p className="t-small pl-4 border-l-2 border-[var(--gold)]">{n.note}</p>
              <p className="t-body fade-in whitespace-pre-line">{n.reply}</p>
            </li>
          ))}
        </ol>
      )}

      {full ? (
        <p className="t-small !text-[var(--ink-45)]">{tt(locale, "noteLimit", { n: limit })}</p>
      ) : waiting ? (
        <p className="t-small !text-[var(--ink-45)]">{mounted ? tt(locale, "noteWait", { time: fmt(nextAt!) }) : "\u00a0"}</p>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={tt(locale, "notePlaceholder")}
            className="w-full t-body !text-[16px] md:!text-[15px] bg-transparent border border-[var(--ink-16)] rounded-[2px] p-3
                       outline-none focus:border-[var(--ink-45)] transition-colors placeholder:text-[var(--ink-45)]"
          />
          {/* 10-04 进度表 30: what to write down — events; a mood written here is not read as today's */}
          <p className="t-small !text-[var(--ink-45)] mt-2 max-w-[36rem]">{tt(locale, "noteHint")}</p>
          <div className="flex items-center gap-4 mt-[var(--s-3)]">
            <button
              type="button"
              onClick={send}
              disabled={busy || text.trim().length < 2}
              data-heat="note-send"
              className="min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em] disabled:opacity-40"
            >
              {tt(locale, "noteSend")}
            </button>
            {busy && (
              <span className="flex items-center gap-1.5" aria-label="…">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--ink-45)] think-dot" style={{ animationDelay: `${i * 180}ms` }} />
                ))}
              </span>
            )}
          </div>
          {err && <p className="t-small mt-[var(--s-2)] !text-[var(--cinnabar)]">{tt(locale, "noteError")}</p>}
        </>
      )}
    </section>
  );
}
