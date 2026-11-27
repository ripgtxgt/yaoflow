import Link from "next/link";
import type { MyReport } from "@/lib/my-reports";
import { myReportsT, type MyReportFilter } from "@/lib/dict/my-reports";

/**
 * 10-23 进度表 114「我的報告」on 「我的」: every report and personal reading the account has — what it is, for whom,
 * when, written yet — each row opens it. The full list sits at the top of 記錄 (with a product filter, plain links so it
 * works without script); the newest three sit near the top of 回訪. Rendered on the server from lib/my-reports.ts.
 */
const TAG: Record<string, string> = { zh: "zh-CN", "zh-hant": "zh-TW" };
function when(ms: number, locale: string): string {
  const d = new Date(ms);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString(TAG[locale] ?? locale, sameYear ? { month: "short", day: "numeric", timeZone: "Asia/Taipei" } : { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Taipei" });
}

function Row({ r, locale }: { r: MyReport; locale: string }) {
  const t = myReportsT(locale);
  const pending = r.state === "writing" || r.state === "mending";
  const sub = r.who ?? r.question;
  return (
    <li>
      <a href={r.href} data-heat={`my-report-${r.filter}`} className="flex items-baseline justify-between gap-3 py-3">
        <span className="min-w-0">
          <span className="t-body">{r.name}</span>
          {sub && <span className="t-small !text-[var(--ink-66)] ml-2 break-words">{sub}</span>}
        </span>
        <span className={`t-small whitespace-nowrap ${pending ? "!text-[var(--gold-text)]" : "!text-[var(--ink-45)]"}`}>
          {when(r.at, locale)} · {t.states[r.state]} →
        </span>
      </a>
    </li>
  );
}

export function MyReportsFull({ locale, reports, filter, href }: { locale: string; reports: MyReport[]; filter: MyReportFilter | null; href: (f: MyReportFilter | null) => string }) {
  if (!reports.length) return null;
  const t = myReportsT(locale);
  const present = [...new Set(reports.map((r) => r.filter))] as MyReportFilter[];
  const list = filter ? reports.filter((r) => r.filter === filter) : reports;
  const chip = (on: boolean) => `px-3 py-1 rounded-full border text-[13px] ${on ? "border-[var(--ink)] bg-[var(--ink)] !text-[var(--paper)]" : "border-[var(--ink-16)]"}`;
  return (
    <section id="reports" className="mt-[var(--s-6)] scroll-mt-20" data-heat="my-reports">
      <h2 className="t-sect">{t.title}</h2>
      <p className="t-small mt-1 !text-[var(--ink-45)]">{t.lead}</p>
      {present.length > 1 && (
        <nav aria-label={t.title} className="mt-[var(--s-3)] flex flex-wrap gap-2">
          <Link href={href(null)} scroll={false} className={chip(!filter)} aria-current={!filter ? "page" : undefined}>{t.filterAll}</Link>
          {present.map((f) => <Link key={f} href={href(f)} scroll={false} className={chip(filter === f)} aria-current={filter === f ? "page" : undefined}>{t.filters[f]}</Link>)}
        </nav>
      )}
      <ul className="mt-[var(--s-3)] border-y border-[var(--ink-16)] divide-y divide-[var(--ink-16)]">
        {list.map((r) => <Row key={r.key} r={r} locale={locale} />)}
      </ul>
    </section>
  );
}

export function MyReportsRecent({ locale, reports, allHref }: { locale: string; reports: MyReport[]; allHref: string }) {
  if (!reports.length) return null;
  const t = myReportsT(locale);
  return (
    <section id="my-reports-recent" className="mt-[var(--s-5)]" data-heat="my-reports-recent">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="t-sect">{t.recent}</h2>
        <Link href={allHref} className="t-small underline underline-offset-4 !text-[var(--ink-66)]">{t.seeAll}{reports.length > 3 ? ` (${reports.length})` : ""} →</Link>
      </div>
      <ul className="mt-[var(--s-2)] border-y border-[var(--ink-16)] divide-y divide-[var(--ink-16)]">
        {reports.slice(0, 3).map((r) => <Row key={r.key} r={r} locale={locale} />)}
      </ul>
    </section>
  );
}
