import RefundedNote from "@/components/RefundedNote";
import { sessionRefunded } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { KIND_WORDS, taisuiOf, zodiacByBranch } from "@/lib/mingli/taisui";
import { notFound } from "next/navigation";
import { getCheckoutSession, type CheckoutSession } from "@/lib/stripe";
import { canSee } from "@/lib/features";
import AutoRefresh from "@/components/AutoRefresh";
import ResultPage from "@/components/product/ResultPage";
import CrossCards from "@/components/CrossCards";
import { selfRevisitOf } from "@/lib/db";
import type { Locale } from "@/lib/locales";
import ReaskForm from "@/components/mingli/BaziReask";
import { toHans } from "@/lib/hant";
import {
  NIANSHU_TOKEN_RE, NS_UI, childrenOf, ensureNianshu, fulfilNianshuPayment, mailNianshuOnce, mailNianshuReceivedOnce, nianshuReport, nsBodyOf, nsFactsOf, type Sys,
} from "@/lib/mingli/nianshu/report";
import type { ReactNode } from "react";
import { fmt, isForeign, type Foreign } from "@/lib/l10n/core";
import { dayIn, monthsIn } from "@/lib/l10n/dates";
import { nsForeignText } from "@/lib/mingli/nianshu/foreign-text";
import { localCustom } from "@/lib/mingli/nianshu/local-custom";
import { BAZI_NAMES, branchIndex, bzName } from "@/lib/mingli/bazi/names";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ④-5: the tab's title in the page's language
  return { title: isForeign(locale) ? nsForeignText(locale).ui.metaReport : locale === "zh" ? toHans("你的年書") : "你的年書", robots: { index: false, follow: false } };
}

/**
 * 10-21 三合一年書 — the 年書's own page (token URL; no birth data on it): the chapters that put the three systems side by
 * side, then the three 篇 (each its own year report page, linked), then the reader's question. Visible once paid (or
 * made for a tester); an unpaid one follows the nianshu switch; refunded → RefundedNote.
 */
const PATH: Record<Sys, string> = { bazi: "bazi", ziwei: "ziwei", astro: "xingpan" };

export default async function NianshuReportPage({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { locale, token } = await params;
  if (!NIANSHU_TOKEN_RE.test(token)) notFound();
  let r = nianshuReport(token);
  if (!r || r.locale !== locale) notFound();
  if (!r.paid_at && !(await canSee("nianshu"))) notFound();
  const hans = locale === "zh";
  const w = (s: string) => (hans ? toHans(s).replace(/国历/g, "公历") : s);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

  const { paid } = await searchParams;
  if (!r.paid_at && paid && /^cs_[A-Za-z0-9_]{10,200}$/.test(paid)) {
    try {
      const s = await getCheckoutSession(paid);
      if (s.metadata?.nianshu === token) fulfilNianshuPayment(s as CheckoutSession);
    } catch { /* the sweep will catch it */ }
    r = nianshuReport(token) ?? r;
    // 10-23 进度表 111 ③: 「收到了，寫好就寄給你」, with the receipt (once; the cron sends it if this does not)
    if (r.paid_at) void mailNianshuReceivedOnce(token, site).catch(() => null);
  }
  if (r.paid_at && sessionRefunded(r.paid_session)) return <RefundedNote hans={hans} home={`/${locale}`} />;
  if (r.paid_at && r.status !== "done" && r.status !== "incomplete") {
    await Promise.race([ensureNianshu(token).catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 2500))]);
    r = nianshuReport(token) ?? r;
  }
  const finished = r.status === "done" || r.status === "incomplete";
  if (finished) void mailNianshuOnce(token, site).catch(() => null);
  // 10-30 进度表 128 ④-5: a 年書 bought on a page in another language
  if (isForeign(locale)) return <ForeignNianshu locale={locale} r={r} token={token} finished={finished} />;
  const parts = nsBodyOf(r).parts;
  const f = nsFactsOf(r);
  const kids = childrenOf(r);
  const kidsDone = kids.every((k) => k.status === "done" || k.status === "incomplete");
  const gz = f.bazi.years[0]?.gz ?? "";
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{w(finished ? NS_UI.failedChapter : kidsDone ? NS_UI.writingChapter : NS_UI.waitingChapter)}</p>;
  const Z = parts.Z as { keyword?: string; zong?: string; tong?: string; yi?: string } | undefined;
  const J = parts.J as { seasons?: Record<string, string>; peak?: string; slow?: string } | undefined;
  const X = parts.X as { areas?: Record<string, string>; jianyi?: string[] } | undefined;
  const qa = parts.qa as { answer?: string } | undefined;
  const prevAsked = ((parts.qaPrev as { list?: { question: string; answer: string }[] } | undefined)?.list ?? []);
  let n = 0;
  const next = () => ++n;

  // 10-22 进度表 87 (设计稿第 5 節): the 年書 on the result template — the keyword as the answer, the chapters, the three key
  // months it will ask about (进度表 85: set at purchase), then the next step (进度表 86 承接地圖: 六爻, 擇日)
  const keyRows = (["pivot", "slow", "smooth"] as const).map((k) => selfRevisitOf("nianshu", `${token}:${k}`)).filter((x): x is NonNullable<typeof x> => !!x && x.status !== "skipped");
  const md = (ms: number) => { const d = new Date(ms + 8 * 3600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<Link href={`/${locale}/nianshu`} className="hover:text-[var(--ink)] transition-colors">← {w(NS_UI.back)}</Link>}
      head={{ label: w(NS_UI.kindLabel), question: `${r.year} ${gz}${w("年")}`, meta: w(NS_UI.kindSub) }}
      answer={<>
        {Z?.keyword && <p className="t-d3 !text-[var(--gold-text)]">{Z.keyword}</p>}
        <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{w(NS_UI.dateNote)}</p>
      </>}
      pay={!r.paid_at ? (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
          <h2 className="t-sect mb-[var(--s-2)]">{w(NS_UI.unpaidHead)}</h2>
          <p className="t-body">{w(NS_UI.unpaidBody)}</p>
        </section>
      ) : undefined}
      free={<>
        {r.paid_at && !finished && (
          <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-4)]">
            <p className="t-body">{w(NS_UI.writingAll)}</p>
            <AutoRefresh every={8000} max={90} />
          </section>
        )}
      {r.paid_at && (
        <>
          <Chapter n={next()} id="zong" title={w(NS_UI.chZong)}>{Z?.zong ? <Text v={Z.zong} /> : pending()}</Chapter>
          <Chapter n={next()} id="tong" title={w(NS_UI.chTong)}>{Z?.tong ? <Text v={Z.tong} /> : pending()}</Chapter>
          <Chapter n={next()} id="yi" title={w(NS_UI.chYi)}>{Z?.yi ? <Text v={Z.yi} /> : pending()}</Chapter>
          <Chapter n={next()} id="seasons" title={w(NS_UI.chSeasons)}>
            {J?.seasons ? (
              <>
                {(["q1", "q2", "q3", "q4"] as const).map((q) => (
                  <div key={q} className="mt-[var(--s-4)]">
                    <p className="t-small !text-[var(--gold-text)]">{w(NS_UI[q])}</p>
                    <p className="t-body mt-1 leading-relaxed whitespace-pre-line">{J.seasons?.[q]}</p>
                  </div>
                ))}
                <div className="mt-[var(--s-5)] grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[6px] border border-[var(--gold)] p-4"><p className="t-sect">{w(NS_UI.chPeak)}</p><p className="t-body mt-1 leading-relaxed">{J.peak}</p></div>
                  <div className="rounded-[6px] border border-[var(--ink-16)] p-4"><p className="t-sect">{w(NS_UI.chSlow)}</p><p className="t-body mt-1 leading-relaxed">{J.slow}</p></div>
                </div>
              </>
            ) : pending()}
          </Chapter>
          <Chapter n={next()} id="areas" title={w(NS_UI.chAreas)}>
            {X?.areas ? (["career", "money", "love", "rhythm", "people"] as const).map((k) => (
              <div key={k} className="mt-[var(--s-4)]">
                <p className="t-small !text-[var(--gold-text)]">{w(NS_UI[k])}</p>
                <p className="t-body mt-1 leading-relaxed whitespace-pre-line">{X.areas?.[k]}</p>
              </div>
            )) : pending()}
          </Chapter>
          <Chapter n={next()} id="jianyi" title={w(NS_UI.chJianyi)}>
            {X?.jianyi ? (
              <ol className="mt-[var(--s-3)] space-y-3">
                {X.jianyi.map((x, k) => <li key={k} className="flex gap-3"><span className="t-label !text-[var(--gold-text)] shrink-0 mt-[0.2em]">{k + 1}</span><p className="t-body leading-relaxed">{x}</p></li>)}
              </ol>
            ) : pending()}
          </Chapter>
          {/* 10-29 进度表 125: the year's 太歲 for this reader, as the almanac counts it — a custom, with the 安太歲 guide one tap away */}
          {(() => {
            const z = zodiacByBranch(f.bazi.pillars[0]?.gz?.[1] ?? "");
            if (!z) return null;
            const k = taisuiOf(z.branch, r.year);
            return (
              <Chapter n={next()} id="taisui" title={w("太歲")}>
                <p className="t-body mt-[var(--s-3)] leading-relaxed">{w(`你屬${z.animal}，${r.year} 年依民間通書${k.length ? `是${k.map((x) => KIND_WORDS[x].name).join("、")}。` : "不在犯太歲之列。"}`)}</p>
                {k.map((x) => <p key={x} className="t-body mt-[var(--s-2)] leading-relaxed">{w(KIND_WORDS[x].plain)}</p>)}
                <p className="t-small mt-[var(--s-3)]"><Link href={`/${locale}/taisui/${z.slug}`} className="underline underline-offset-4 !text-[var(--ink-66)]">{w("依習俗安太歲的時間、地點與做法 →")}</Link></p>
                <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{w("這是習俗與參考；這一年真正的節奏，看上面每一季的起伏更實在。")}</p>
              </Chapter>
            );
          })()}
          <Chapter n={next()} id="parts" title={w(NS_UI.chParts)}>
            <div className="mt-[var(--s-3)] grid gap-3">
              {kids.map((k) => {
                const kw = (k.parts.ov as { keyword?: string } | undefined)?.keyword;
                const done = k.status === "done" || k.status === "incomplete";
                const inner = (
                  <>
                    <div className="flex-1">
                      <p className="t-sect">{w(NS_UI[k.sys])}</p>
                      <p className="t-small mt-1 !text-[var(--ink-66)]">{w(NS_UI[`${k.sys}Sub` as const])}</p>
                      {kw && <p className="t-small mt-1">{w(NS_UI.partKeyword)}：<span className="!text-[var(--gold-text)]">{kw}</span></p>}
                    </div>
                    <span className="t-small shrink-0">{done ? w(NS_UI.partOpen) : w(NS_UI.partWriting)}</span>
                  </>
                );
                return k.token ? (
                  <Link key={k.sys} href={`/${locale}/${PATH[k.sys]}/r/${k.token}`} className="rounded-[6px] border border-[var(--ink-16)] hover:border-[var(--ink)] p-4 flex items-center gap-3 transition-colors">{inner}</Link>
                ) : <div key={k.sys} className="rounded-[6px] border border-[var(--ink-16)] p-4 flex items-center gap-3">{inner}</div>;
              })}
            </div>
          </Chapter>
          <Chapter n={next()} id="question" title={w(NS_UI.chQa)}>
            {r.question && (
              <blockquote className="mt-[var(--s-3)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-3)]">
                <p className="t-small !text-[var(--gold-text)]">{w(NS_UI.questionYou)}</p>
                <p className="t-body mt-1">{r.question}</p>
              </blockquote>
            )}
            {!r.question ? null : qa?.answer ? (
              <>
                <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{qa.answer}</p>
                <Link href={`/${locale}/cast?q=${encodeURIComponent([...r.question].slice(0, 100).join(""))}&c=nianshu`} className="inline-block mt-[var(--s-4)] t-body border border-[var(--ink)] rounded-full px-5 py-2.5 hover:bg-[var(--ink)] hover:!text-[var(--paper)] transition-colors">{w(NS_UI.questionCast)}</Link>
              </>
            ) : pending()}
            {prevAsked.length > 0 && (
              <details className="mt-[var(--s-4)]">
                <summary className="cursor-pointer t-small !text-[var(--ink-66)]">{w(NS_UI.prevAsked)}</summary>
                {prevAsked.map((x, k) => (
                  <div key={k} className="mt-[var(--s-3)] border-t border-[var(--ink-16)] pt-[var(--s-3)]">
                    <p className="t-small !text-[var(--gold-text)]">{x.question}</p>
                    <p className="t-body mt-1 leading-relaxed whitespace-pre-line">{x.answer}</p>
                  </div>
                ))}
              </details>
            )}
            <ReaskForm token={token} hans={hans} endpoint="/api/nianshu/ask" copy={{ head: w(NS_UI.reaskHead), ph: w(NS_UI.reaskPh) }} />
          </Chapter>
        </>
      )}
      </>}
      revisit={r.paid_at && keyRows.length > 0 ? (
        <section id="revisit" className="border-t border-[var(--ink-16)] pt-[var(--s-5)] scroll-mt-20">
          <h2 className="t-sect">{w("到期回來問你")}</h2>
          <p className="t-small mt-1 !text-[var(--ink-66)]">{w("年書標的關鍵月過完兩天，寫信問你一句：像書上說的那樣嗎？")}</p>
          <ul className="mt-[var(--s-3)] flex flex-col divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
            {keyRows.map((x) => (
              <li key={x.id} className="py-2 flex items-baseline justify-between gap-4">
                <span className="t-small truncate">{x.label}</span>
                <span className="t-label !text-[var(--ink-45)] shrink-0">{x.outcome ? w("已回答") : x.status === "sent" ? w("已寄信") : `${md(x.due_at)} ${w("問你")}`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : undefined}
      cross={<CrossCards source="nianshu" locale={locale as Locale} exclude={["nianshu"]} />}
    />
  );
}

function Chapter({ n, id, title, children }: { n: number; id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-[var(--s-7,3rem)] scroll-mt-20">
      <p className="t-label !text-[var(--ink-45)]">{String(n).padStart(2, "0")}</p>
      <h2 className="t-sect mt-1">{title}</h2>
      {children}
    </section>
  );
}
const Text = ({ v }: { v: unknown }) => <p className="t-body mt-[var(--s-3)] leading-relaxed whitespace-pre-line">{String(v ?? "")}</p>;

/* ------------------------------------------------------------------ 10-30 进度表 128 ④-5: a page in another language */

/**
 * The 年書 on a page in one of the seven other languages: the same template and chapters, every word from the 年書's own
 * words (lib/mingli/nianshu/foreign-text.ts), the seasons by month names; the 太歲 chapter is Chinese — a Japanese book
 * shows 厄年 and a Korean one 삼재 in its place (local-custom.ts), the others none.
 */
function ForeignNianshu({ locale, r, token, finished }: { locale: Foreign; r: NonNullable<ReturnType<typeof nianshuReport>>; token: string; finished: boolean }) {
  const T = nsForeignText(locale), t = T.ui, F = bzName(locale);
  const parts = nsBodyOf(r).parts;
  const f = nsFactsOf(r);
  const kids = childrenOf(r);
  const kidsDone = kids.every((k) => k.status === "done" || k.status === "incomplete");
  const gz = f.bazi.years[0]?.gz ?? "";
  const yb = gz[1] ?? "";
  const animal = BAZI_NAMES[locale].animals[branchIndex(yb)] ?? "";
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{finished ? t.failedChapter : kidsDone ? t.writingChapter : t.waitingChapter}</p>;
  const Z = parts.Z as { keyword?: string; zong?: string; tong?: string; yi?: string } | undefined;
  const J = parts.J as { seasons?: Record<string, string>; peak?: string; slow?: string } | undefined;
  const X = parts.X as { areas?: Record<string, string>; jianyi?: string[] } | undefined;
  const qa = parts.qa as { answer?: string } | undefined;
  const prevAsked = ((parts.qaPrev as { list?: { question: string; answer: string }[] } | undefined)?.list ?? []);
  const custom = localCustom(locale, { year: r.year, kazoe: f.kazoe ?? f.ziwei.book?.age ?? null, gender: f.bazi.gender, birthBranch: f.bazi.pillars[0]?.gz?.[1] ?? "", yearBranch: yb });
  let n = 0;
  const next = () => ++n;
  const Q: Record<string, [number, number]> = { q1: [1, 3], q2: [4, 6], q3: [7, 9], q4: [10, 12] };
  const keyRows = (["pivot", "slow", "smooth"] as const).map((k) => selfRevisitOf("nianshu", `${token}:${k}`)).filter((x): x is NonNullable<typeof x> => !!x && x.status !== "skipped");
  const md = (ms: number) => { const d = new Date(ms + 8 * 3600_000); return dayIn(locale, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
  const sub: Record<string, string> = { bazi: t.baziSub, ziwei: t.ziweiSub, astro: t.astroSub };
  const name: Record<string, string> = { bazi: t.bazi, ziwei: t.ziwei, astro: t.astro };
  const area: Record<string, string> = { career: t.career, money: t.money, love: t.love, rhythm: t.rhythm, people: t.people };
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<Link href={`/${locale}/nianshu`} className="hover:text-[var(--ink)] transition-colors">← {t.back}</Link>}
      head={{ label: t.kindLabel, question: fmt(t.year, { y: r.year, gz: F.gz(gz), a: animal }), meta: t.kindSub }}
      answer={<>
        {Z?.keyword && <p className="t-d3 !text-[var(--gold-text)]">{Z.keyword}</p>}
        <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{t.dateNote}</p>
      </>}
      pay={!r.paid_at ? (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
          <h2 className="t-sect mb-[var(--s-2)]">{t.unpaidHead}</h2>
          <p className="t-body">{t.unpaidBody}</p>
        </section>
      ) : undefined}
      free={<>
        {r.paid_at && !finished && (
          <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-4)]">
            <p className="t-body">{t.writingAll}</p>
            <AutoRefresh every={8000} max={90} />
          </section>
        )}
        {r.paid_at && (
          <>
            <Chapter n={next()} id="zong" title={t.chZong}>{Z?.zong ? <Text v={Z.zong} /> : pending()}</Chapter>
            <Chapter n={next()} id="tong" title={t.chTong}>{Z?.tong ? <Text v={Z.tong} /> : pending()}</Chapter>
            <Chapter n={next()} id="yi" title={t.chYi}>{Z?.yi ? <Text v={Z.yi} /> : pending()}</Chapter>
            <Chapter n={next()} id="seasons" title={t.chSeasons}>
              {J?.seasons ? (
                <>
                  {(["q1", "q2", "q3", "q4"] as const).map((q) => (
                    <div key={q} className="mt-[var(--s-4)]">
                      <p className="t-small !text-[var(--gold-text)]">{monthsIn(locale, Q[q]![0], Q[q]![1])}</p>
                      <p className="t-body mt-1 leading-relaxed whitespace-pre-line">{J.seasons?.[q]}</p>
                    </div>
                  ))}
                  <div className="mt-[var(--s-5)] grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[6px] border border-[var(--gold)] p-4"><p className="t-sect">{t.chPeak}</p><p className="t-body mt-1 leading-relaxed">{J.peak}</p></div>
                    <div className="rounded-[6px] border border-[var(--ink-16)] p-4"><p className="t-sect">{t.chSlow}</p><p className="t-body mt-1 leading-relaxed">{J.slow}</p></div>
                  </div>
                </>
              ) : pending()}
            </Chapter>
            <Chapter n={next()} id="areas" title={t.chAreas}>
              {X?.areas ? (["career", "money", "love", "rhythm", "people"] as const).map((k) => (
                <div key={k} className="mt-[var(--s-4)]">
                  <p className="t-small !text-[var(--gold-text)]">{area[k]}</p>
                  <p className="t-body mt-1 leading-relaxed whitespace-pre-line">{X.areas?.[k]}</p>
                </div>
              )) : pending()}
            </Chapter>
            <Chapter n={next()} id="jianyi" title={t.chJianyi}>
              {X?.jianyi ? (
                <ol className="mt-[var(--s-3)] space-y-3">
                  {X.jianyi.map((x, k) => <li key={k} className="flex gap-3"><span className="t-label !text-[var(--gold-text)] shrink-0 mt-[0.2em]">{k + 1}</span><p className="t-body leading-relaxed">{x}</p></li>)}
                </ol>
              ) : pending()}
            </Chapter>
            {custom && (
              <Chapter n={next()} id="custom" title={custom.title}>
                {custom.paras.map((x, k) => <p key={k} className="t-body mt-[var(--s-3)] leading-relaxed">{x}</p>)}
                <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{custom.note}</p>
              </Chapter>
            )}
            <Chapter n={next()} id="parts" title={t.chParts}>
              <div className="mt-[var(--s-3)] grid gap-3">
                {kids.map((k) => {
                  const kw = (k.parts.ov as { keyword?: string } | undefined)?.keyword;
                  const done = k.status === "done" || k.status === "incomplete";
                  const inner = (
                    <>
                      <div className="flex-1">
                        <p className="t-sect">{name[k.sys]}</p>
                        <p className="t-small mt-1 !text-[var(--ink-66)]">{sub[k.sys]}</p>
                        {kw && <p className="t-small mt-1">{t.partKeyword}{F.colon}<span className="!text-[var(--gold-text)]">{kw}</span></p>}
                      </div>
                      <span className="t-small shrink-0">{done ? t.partOpen : t.partWriting}</span>
                    </>
                  );
                  return k.token ? (
                    <Link key={k.sys} href={`/${locale}/${PATH[k.sys]}/r/${k.token}`} className="rounded-[6px] border border-[var(--ink-16)] hover:border-[var(--ink)] p-4 flex items-center gap-3 transition-colors">{inner}</Link>
                  ) : <div key={k.sys} className="rounded-[6px] border border-[var(--ink-16)] p-4 flex items-center gap-3">{inner}</div>;
                })}
              </div>
            </Chapter>
            <Chapter n={next()} id="question" title={t.chQa}>
              {r.question && (
                <blockquote className="mt-[var(--s-3)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-3)]">
                  <p className="t-small !text-[var(--gold-text)]">{t.questionYou}</p>
                  <p className="t-body mt-1">{r.question}</p>
                </blockquote>
              )}
              {!r.question ? null : qa?.answer ? (
                <>
                  <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{qa.answer}</p>
                  <Link href={`/${locale}/cast?q=${encodeURIComponent([...r.question].slice(0, 100).join(""))}&c=nianshu`} className="inline-block mt-[var(--s-4)] t-body border border-[var(--ink)] rounded-full px-5 py-2.5 hover:bg-[var(--ink)] hover:!text-[var(--paper)] transition-colors">{t.questionCast}</Link>
                </>
              ) : pending()}
              {prevAsked.length > 0 && (
                <details className="mt-[var(--s-4)]">
                  <summary className="cursor-pointer t-small !text-[var(--ink-66)]">{t.prevAsked}</summary>
                  {prevAsked.map((x, k) => (
                    <div key={k} className="mt-[var(--s-3)] border-t border-[var(--ink-16)] pt-[var(--s-3)]">
                      <p className="t-small !text-[var(--gold-text)]">{x.question}</p>
                      <p className="t-body mt-1 leading-relaxed whitespace-pre-line">{x.answer}</p>
                    </div>
                  ))}
                </details>
              )}
              <ReaskForm token={token} hans={false} endpoint="/api/nianshu/ask" copy={{ head: t.reaskHead, ph: t.reaskPh, go: t.reaskGo, going: t.reaskGoing, err: t.reaskErr, login: t.reaskLogin }} />
            </Chapter>
          </>
        )}
      </>}
      revisit={r.paid_at && keyRows.length > 0 ? (
        <section id="revisit" className="border-t border-[var(--ink-16)] pt-[var(--s-5)] scroll-mt-20">
          <h2 className="t-sect">{t.revisitHead}</h2>
          <p className="t-small mt-1 !text-[var(--ink-66)]">{t.revisitSub}</p>
          <ul className="mt-[var(--s-3)] flex flex-col divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
            {keyRows.map((x) => (
              <li key={x.id} className="py-2 flex items-baseline justify-between gap-4">
                <span className="t-small truncate">{x.label}</span>
                <span className="t-label !text-[var(--ink-45)] shrink-0">{x.outcome ? t.answered : x.status === "sent" ? t.sent : fmt(t.askOn, { d: md(x.due_at) })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : undefined}
      cross={<CrossCards source="nianshu" locale={locale as Locale} exclude={["nianshu"]} />}
    />
  );
}
