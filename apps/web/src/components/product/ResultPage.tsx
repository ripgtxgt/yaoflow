import type { ReactNode } from "react";
import PageShell from "@/components/ui/PageShell";
import type { Locale } from "@/lib/locales";

/**
 * 10-22 进度表 76 B — the result page, one template (调研结论 §三: 10 fixed blocks):
 *   1 頭部 (the matter asked: head)   2 答案卡 (answer)   3 依據 (basis — the chart / lot / blocks / cards, folded)
 *   4 免費解讀 (free)   5 回到你的處境的一問 (ask)   6 付費區 (pay)   7 回訪設置 (revisit)   8 分享 (share)
 *   9 交叉卡 (cross — the PromoStrip)   10 手機吸底按鈕 (sticky)
 * Paid content opens in place (the page re-renders with `pay` gone and `free` grown); nothing here jumps away.
 */
export interface ResultPageProps {
  locale: Locale;
  /** 10-22 进度表 87: a way back above the head (a report's chart, the 年書 a part belongs to) */
  nav?: ReactNode;
  head: { label?: string; question: string; meta?: string };
  answer: ReactNode;
  basis?: { title: string; body: ReactNode; open?: boolean };
  free?: ReactNode;
  ask?: ReactNode;
  pay?: ReactNode;
  revisit?: ReactNode;
  share?: ReactNode;
  cross?: ReactNode;
  sticky?: ReactNode;
  foot?: ReactNode;
}

export default function ResultPage(p: ResultPageProps) {
  return (
    <PageShell width="narrow" className={p.sticky ? "pb-32 md:pb-24" : ""}>
      {p.nav && <nav className="t-label mb-[var(--s-4)]">{p.nav}</nav>}
      <header>
        {p.head.label && <p className="t-label !text-[var(--gold-text)]">{p.head.label}</p>}
        <h1 className="t-d2 mt-1">{p.head.question}</h1>
        {p.head.meta && <p className="t-small mt-2 !text-[var(--ink-66)]">{p.head.meta}</p>}
      </header>
      <section className="mt-[var(--s-5)]" data-heat="result-answer">{p.answer}</section>
      {p.basis && (
        <details className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-3)]" open={p.basis.open}>
          <summary className="t-sect cursor-pointer">{p.basis.title}</summary>
          <div className="mt-[var(--s-3)]">{p.basis.body}</div>
        </details>
      )}
      {p.free && <section className="mt-[var(--s-5)]" data-heat="result-free">{p.free}</section>}
      {p.ask && <section className="mt-[var(--s-5)]" data-heat="result-ask">{p.ask}</section>}
      {p.pay && <section className="mt-[var(--s-5)]" data-heat="result-pay">{p.pay}</section>}
      {p.revisit && <section className="mt-[var(--s-5)]" data-heat="result-revisit">{p.revisit}</section>}
      {p.share && <section className="mt-[var(--s-5)]" data-heat="result-share">{p.share}</section>}
      {p.cross}
      {p.foot}
      {p.sticky && <div className="md:hidden fixed inset-x-0 bottom-[calc(2.75rem+env(safe-area-inset-bottom))] z-20 px-[var(--s-4)] pb-3 pt-3 bg-[var(--paper)]/95 backdrop-blur border-t border-[var(--ink-16)]">{p.sticky}</div>}
    </PageShell>
  );
}
