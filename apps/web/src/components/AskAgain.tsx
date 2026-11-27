"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import { goToCast } from "@/lib/cast-nav";

/**
 * The account page's one call to action: ask the next thing. It sits on the
 * paper, not in an ink block — a black slab at the top of a paper page read
 * as heavy (Neil, 09-07), and the ink button alone is enough to draw the eye.
 * The empty ruler from the landing masthead sits beside the question: six
 * slots, the first waiting in gold, no hexagram yet.
 *
 * The button is never greyed out: with a question it carries it to the cast
 * page, without one it simply opens the cast page, which asks for the
 * question before any reading anyway.
 */
export default function AskAgain({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [going, setGoing] = useState(false);

  useEffect(() => {
    router.prefetch(`/${locale}/cast`);
  }, [router, locale]);

  const submit = () => {
    if (going) return;
    setGoing(true);
    goToCast(router, locale, q.trim().length >= 2 ? q : undefined);
  };

  return (
    <section className="pt-[var(--s-5)] pb-[var(--s-2)]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-[var(--s-5)]"
      >
        <div className="flex flex-col-reverse gap-[5px] w-[32px] shrink-0 select-none" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`block h-[5px] rounded-[1px] border ${
                i === 0 ? "border-[var(--gold-text)] border-solid" : "border-[var(--ink-16)] border-dashed"
              }`}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="ask-again" className="t-label block">{t(locale, "askAgainLabel")}</label>
          <div className="mt-1 flex flex-col sm:flex-row sm:items-end gap-x-[var(--s-5)] gap-y-[var(--s-3)]">
            <input
              id="ask-again"
              type="text"
              maxLength={450}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t(locale, "askAgainPlaceholder")}
              autoComplete="off"
              className="t-d3 !font-normal min-w-0 flex-1 bg-transparent border-0 border-b border-[var(--ink-16)] rounded-none
                         py-1.5 text-[var(--ink)] placeholder:text-[var(--ink-45)]
                         outline-none transition-colors focus:border-[var(--ink-45)]"
            />
            <button
              type="submit"
              disabled={going}
              className="shrink-0 min-h-[var(--s-6)] px-8 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)]
                         text-[13px] tracking-[0.16em] hover:bg-[var(--cinnabar)]
                         active:scale-[0.99] transition disabled:opacity-60"
            >
              {going ? t(locale, "beginOpening") : t(locale, "begin")}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
