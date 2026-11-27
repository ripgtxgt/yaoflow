"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import { goToCast } from "@/lib/cast-nav";

/**
 * The homepage question box. This was a native GET form, which meant every
 * "begin" click was a full document reload — several seconds without a CDN.
 * Client-side navigation with the cast route prefetched makes it immediate,
 * and the button acknowledges the tap the instant it happens.
 */
export default function QuestionForm({ locale, chips, chipsOpen = false, placeholder, beginLabel }: {
  locale: Locale; chips?: { lead: string; items: readonly string[] };
  /** 10-22 进度表 88 (设计稿 H1; the A/B is over): the example questions shown to everyone, right under the box */
  chipsOpen?: boolean;
  /** 10-22 进度表 88: a real question as the box's example (设计稿: 「他斷聯三週了，這個月會先傳訊息嗎？」) */
  placeholder?: string;
  beginLabel?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [going, setGoing] = useState(false);

  useEffect(() => {
    router.prefetch(`/${locale}/cast`);
  }, [router, locale]);

  const go = () => {
    const question = q.trim();
    if (question.length < 2 || going) return;
    setGoing(true);
    goToCast(router, locale, question); // shake devices get a real navigation, see lib/cast-nav
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      {/* 09-30 对照测试 h1: one tap on an example starts the cast with it (shown only in that arm — globals.css .abh-b) */}
      {chips && !chipsOpen && (
        <div className="abh-b mb-[var(--s-4)]">
          <p className="t-small !text-[var(--ink-66)] mb-[var(--s-2)]">{chips.lead}</p>
          <div className="flex flex-wrap gap-2">
            {chips.items.map((c, i) => (
              <button
                key={c}
                type="button"
                data-heat={`home-chip-${i + 1}`}
                disabled={going}
                onClick={() => {
                  if (going) return;
                  setQ(c);
                  setGoing(true);
                  goToCast(router, locale, c);
                }}
                className="t-small px-3 py-2 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink-45)] hover:text-[var(--ink)] transition-colors text-left"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      <textarea
        name="q"
        rows={3}
        required
        minLength={2}
        maxLength={450}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder ?? t(locale, "questionPlaceholder")}
        className="t-body w-full bg-transparent border border-[var(--ink-16)] rounded-[2px] p-4
                   outline-none transition-colors focus:border-[var(--ink-45)]
                   placeholder:text-[var(--ink-45)] resize-none"
      />
      {chips && chipsOpen && (
        <div className="mt-[var(--s-3)] flex flex-wrap items-baseline gap-2" data-heat="home-chips">
          <span className="t-small !text-[var(--ink-66)]">{chips.lead}</span>
          {chips.items.map((c, i) => (
            <button key={c} type="button" data-heat={`home-chip-${i + 1}`} disabled={going}
              onClick={() => { if (going) return; setQ(c); setGoing(true); goToCast(router, locale, c); }}
              className="t-small px-3 py-1.5 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink-45)] hover:text-[var(--ink)] transition-colors text-left">
              {c}
            </button>
          ))}
        </div>
      )}
      <p className="t-small mt-[var(--s-2)] text-[var(--ink-45)]">{t(locale, "questionHint")}</p>
      <button
        type="submit"
        disabled={going || q.trim().length < 2}
        data-heat="home-begin"
        className="mt-5 w-full md:w-auto min-h-[var(--s-6)] px-9 py-3 rounded-[2px]
                   bg-[var(--ink)] text-[var(--paper)] tracking-[0.16em] text-[13px]
                   hover:bg-[var(--cinnabar)] active:scale-[0.99] transition
                   disabled:opacity-45 disabled:hover:bg-[var(--ink)]"
      >
        {going ? t(locale, "beginOpening") : beginLabel ?? t(locale, "begin")}
      </button>

      {/* the low-friction side door: cast now, articulate after — the
          reading gate on the figure page collects the question anyway */}
      <Link
        href={`/${locale}/cast`}
        onClick={(e) => {
          e.preventDefault();
          goToCast(router, locale); // same undo-stack rule as go()
        }}
        className="block mt-[var(--s-3)] t-label hover:text-[var(--ink)] transition-colors w-fit"
      >
        {t(locale, "castFirstLink")} →
      </Link>
    </form>
  );
}
