import Link from "next/link";
import { cookies } from "next/headers";
import FigureMark from "@/components/FigureMark";
import { featureOn } from "@/lib/features";
import { serviceOpenIn } from "@/lib/services";
import { BID_COOKIE } from "@/lib/browsers";
import { hexByKw } from "@/lib/bmg";
import { bmgHistory } from "@/lib/bmg-store";
import type { Locale } from "@/lib/locales";

/** 11-05 进度表 136: 「我的」 shows the reader's 本命卦 (newest first, every take kept) and a way to take it again */
export default async function BmgMine({ locale, customerId }: { locale: Locale; customerId: number }) {
  if (!featureOn("bmg") || !serviceOpenIn("bmg", locale)) return null;
  const bid = (await cookies()).get(BID_COOKIE)?.value ?? null;
  const rows = bmgHistory({ customerId, bid }, 10);
  return (
    <section className="mt-[var(--s-6)]" data-heat="acct-bmg">
      <h2 className="t-sect">本命卦</h2>
      {rows.length === 0 ? (
        <p className="t-body mt-2">還沒做過。12 題，約 2 分鐘，不用生辰：<Link href={`/${locale}/bmg?c=account`} className="underline underline-offset-4">看看你是哪一卦 →</Link></p>
      ) : (
        <>
          <ul className="mt-[var(--s-3)] grid gap-3">
            {rows.map((r, i) => {
              const h = hexByKw(r.kw)!;
              return (
                <li key={r.id} className={`flex items-center gap-[var(--s-3)] ${i ? "opacity-60" : ""}`}>
                  <FigureMark yangs={h.lines.map(Boolean)} width={28} />
                  <Link href={`/${locale}/bmg/r/${r.token}`} className="t-body underline underline-offset-4">{h.name}（{h.title}）</Link>
                  <span className="t-small !text-[var(--ink-45)]">{new Date(r.created_at + 8 * 3_600_000).toISOString().slice(0, 10)}</span>
                </li>
              );
            })}
          </ul>
          <p className="t-small mt-[var(--s-3)]"><Link href={`/${locale}/bmg?c=account-retake`} className="underline underline-offset-4">重新做一次 →</Link>（每次結果都會留著；問事解讀會用最新的一次）</p>
        </>
      )}
    </section>
  );
}
