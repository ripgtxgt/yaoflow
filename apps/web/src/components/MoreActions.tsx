"use client";

import { useEffect } from "react";

/**
 * 09-26 (Neil: 「解读页面太乱了」): the reading's foot carried five full panels
 * stacked one after another — gift, seal, share, publish, invite. They are
 * now one list of folded rows; each opens in place. A link to one of them
 * (#gift from the follow-up box, a shared #seal) opens its row.
 */
export function MoreItem({ id, title, hint, children, open }: { id: string; title: string; hint?: string | null; children: React.ReactNode; open?: boolean }) {
  return (
    <details id={`more-${id}`} open={open} className="group border-t border-[var(--ink-16)] scroll-mt-20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-[var(--s-4)] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="t-body !text-[16px] block">{title}</span>
          {hint ? <span className="t-small block mt-0.5 !text-[var(--gold-text)]">{hint}</span> : null}
        </span>
        <span className="t-label shrink-0 transition-transform group-open:rotate-90" aria-hidden>›</span>
      </summary>
      {/* the panels bring their own frame and title; inside a row they drop both */}
      <div className="pb-[var(--s-5)] [&>section]:!mt-0 [&>section]:!border-0 [&>section]:!p-0 [&>section]:!pt-0 [&>section>*:first-child]:hidden">
        {children}
      </div>
    </details>
  );
}

export default function MoreActions({ title, children }: { title: string; children: React.ReactNode }) {
  useEffect(() => {
    const openFromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      const d = el?.closest("details") ?? (document.getElementById(`more-${id}`) as HTMLDetailsElement | null);
      if (d && !d.open) { d.open = true; setTimeout(() => el?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);
  return (
    <section id="more" className="mt-[var(--s-6)] scroll-mt-20">
      <p className="t-sect mb-[var(--s-2)]">{title}</p>
      {children}
      <div className="border-t border-[var(--ink-16)]" />
    </section>
  );
}
