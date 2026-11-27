import Link from "next/link";
import { it } from "@/lib/dict/invite";

/**
 * 09-29 推荐入口: the one card that says what bringing a friend is worth, where
 * people will see it — right under the reading, on the account page, on a
 * matter. The two doors open the panels that already do the work (the gift
 * link, the share card with the reader's own ref).
 */
export default function InviteCard({ locale, giftHref, shareHref, stats, mineHref }: {
  locale: string;
  giftHref?: string | null;
  shareHref?: string | null;
  stats?: { brought: number; got: number } | null;
  mineHref?: string | null;
}) {
  return (
    <section id="invite" className="mt-[var(--s-6)] scroll-mt-20 border border-[var(--cinnabar)]/50 rounded-[2px] px-[var(--s-4)] py-[var(--s-4)]" data-heat="invite-card">
      <p className="t-body !text-[17px]">{it(locale, "title")}</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{it(locale, "body")}</p>
      {stats && stats.brought > 0 && <p className="t-small mt-2 !text-[var(--gold-text)]">{it(locale, "stats", { n: stats.brought, m: stats.got })}</p>}
      <div className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-5 gap-y-3">
        {giftHref && (
          <Link href={giftHref} data-heat="invite-gift" className="inline-block min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">{it(locale, "gift")}</Link>
        )}
        {shareHref && (
          <Link href={shareHref} data-heat="invite-share" className={giftHref ? "t-small underline underline-offset-4" : "inline-block min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]"}>{it(locale, "share")}{giftHref ? " →" : ""}</Link>
        )}
        {!giftHref && !shareHref && <p className="t-small !text-[var(--ink-45)]">{it(locale, "readFirst")}</p>}
        {mineHref && <Link href={mineHref} className="t-small underline underline-offset-4 !text-[var(--ink-45)]">{it(locale, "mine")} →</Link>}
      </div>
    </section>
  );
}
