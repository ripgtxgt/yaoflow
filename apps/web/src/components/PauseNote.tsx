import { mt } from "@/lib/dict/matter";
import type { Locale } from "@/lib/locales";

/**
 * 09-29 (用户数据与需求全面分析 §4.5): a reader on their fifth cast of one matter
 * in a day is usually circling, not learning. One kind sentence and the next
 * real date — no block, no counter, no scolding. The crisis gate stays where it is.
 */
export default function PauseNote({ locale, n, nextDate }: { locale: Locale; n: number; nextDate: string | null }) {
  return (
    <section className="mt-[var(--s-4)] border border-[var(--gold)]/60 bg-[var(--gold)]/[0.05] rounded-[2px] px-[var(--s-4)] py-[var(--s-3)]" data-heat="pause-note">
      <p className="t-label !text-[var(--gold-text)]">{mt(locale, "pauseTitle")}</p>
      <p className="t-small mt-1 !text-[var(--ink-86)]">
        {mt(locale, "pauseBody", { n, next: nextDate ? mt(locale, "pauseNext", { date: nextDate }) : mt(locale, "pauseNoNext") })}
      </p>
    </section>
  );
}
