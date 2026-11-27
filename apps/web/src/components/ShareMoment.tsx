"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ssh } from "@/lib/dict/share-sheet";

/**
 * 10-13 进度表 41 ③: the one question at the moment a reader is most moved — after the date, after 「應了」, after
 * the lot's plain reading. Inline, never a popup; asked once per thing (`id`), and gone for good after 「不用了」 or a
 * share. The share sheet inside is the caller's.
 */
export default function ShareMoment({ id, locale, title, body, children, tone = "gold" }: {
  id: string; locale: string; title: string; body?: string; children: ReactNode; tone?: "gold" | "cinnabar";
}) {
  const key = `yf:sm:${id}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem(key) === "1"); } catch { setHidden(false); }
  }, [key]);
  if (hidden) return null;
  const close = () => { try { localStorage.setItem(key, "1"); } catch { /* private mode: closes for this view */ } setHidden(true); };
  const border = tone === "cinnabar" ? "border-[var(--cinnabar)]/55" : "border-[var(--gold)]";
  return (
    <section className={`mt-[var(--s-6)] relative border ${border} rounded-[2px] px-[var(--s-4)] py-[var(--s-4)] bg-[var(--gold)]/[0.04]`} data-heat={`moment-${id.split(":")[0]}`}>
      <button type="button" onClick={close} className="absolute right-3 top-3 t-small !text-[var(--ink-45)] hover:!text-[var(--ink)]" aria-label={ssh(locale, "later")}>
        {ssh(locale, "later")}
      </button>
      <p className="t-body !text-[17px] pr-16">{title}</p>
      {body && <p className="t-small mt-1 !text-[var(--ink-66)]">{body}</p>}
      <div onClickCapture={(e) => { if ((e.target as HTMLElement).closest("button,a")) setTimeout(() => { try { localStorage.setItem(key, "1"); } catch { /* */ } }, 0); }}>
        {children}
      </div>
    </section>
  );
}
