import RefundedNote from "@/components/RefundedNote";
import { sessionRefunded } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCheckoutSession, type CheckoutSession } from "@/lib/stripe";
import { canSee } from "@/lib/features";
import { currentCustomer } from "@/lib/auth";
import SelfRevisitSet from "@/components/SelfRevisitSet";
import ResultPage from "@/components/product/ResultPage";
import CrossCards from "@/components/CrossCards";
import { selfChoices, selfRevisitUi } from "@/lib/self-revisit";
import type { Locale } from "@/lib/locales";
import AutoRefresh from "@/components/AutoRefresh";
import ReaskForm from "@/components/mingli/BaziReask";
import { NS_UI, nianshuOfChild } from "@/lib/mingli/nianshu/report";
import { toHans } from "@/lib/hant";
import {
  ZIWEI_TOKEN_RE, ZW_BOOK_AREAS, ZW_DEEP_CHAPTERS, ZW_REPORT_UI, ensureZiweiReport, fulfilZiweiPayment, mailZiweiOnce, ziweiReport,
  zwBodyOf, zwDeepGroupOf, zwFactsOf, zwQuarterMonths, type MonthZ, type ZiweiBody, type ZiweiBook, type ZiweiFacts,
} from "@/lib/mingli/ziwei/report";
import type { ReactNode } from "react";
import { FLOW_CHAPTERS, flowView, teaser, type FlowView } from "@/lib/mingli/flow-view";
import { FlowDated, FlowLocked } from "@/components/mingli/FlowGate";
import { fmt, isForeign, type Foreign } from "@/lib/l10n/core";
import { ziweiReportText } from "@/lib/mingli/ziwei/page-ui";
import { zwName } from "@/lib/mingli/ziwei/names";
import { zwCrossIn, zwGejuIn, zwStarsIn } from "@/lib/mingli/ziwei/report-foreign";
import { bzName } from "@/lib/mingli/bazi/names";
import { zwBookWords } from "@/lib/mingli/ziwei/book-foreign";
import { nsForeignText } from "@/lib/mingli/nianshu/foreign-text";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ④: the tab's title in the page's language
  return { title: isForeign(locale) ? ziweiReportText(locale).metaTitle : locale === "zh" ? toHans("你的紫微報告") : "你的紫微報告", robots: { index: false, follow: false } };
}

/**
 * 10-20 紫微②③ a report's own page (token URL; no birth data on it — only the computed chart), as /bazi/r/<token>:
 * deep: twelve chapters; year: the 紫微年書 (BookView: eight chapters, every month labelled 農曆 + 國曆).
 * Visible once paid (or made for a member / tester); an unpaid one follows the ziwei-paid switch; refunded → RefundedNote.
 */
export default async function ZiweiReportPage({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { locale, token } = await params;
  if (!ZIWEI_TOKEN_RE.test(token)) notFound();
  let r = ziweiReport(token);
  if (!r || r.locale !== locale) notFound();
  /** 10-21: a year report that is one 篇 of a 三合一年書 links back to it and leaves the question to the 年書 */
  const book = r.kind === "year" ? nianshuOfChild("ziwei", token) : null;
  if (!r.paid_at && !(await canSee("ziwei-paid"))) notFound();
  const hans = locale === "zh";
  /** fixed copy and chart words are Traditional: Simplified pages convert them */
  const w = (s: string) => (hans ? toHans(s) : s);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

  const { paid } = await searchParams;
  // 10-22 进度表 80: whose report, for the 「到期回來問你」 block — the account's address, else the one it was bought with
  let viewerEmail: string | null = null;
  try { viewerEmail = (await currentCustomer())?.email ?? null; } catch { /* no database */ }
  if (!r.paid_at && paid && /^cs_[A-Za-z0-9_]{10,200}$/.test(paid)) {
    try {
      const s = await getCheckoutSession(paid);
      if (s.metadata?.ziwei === token) fulfilZiweiPayment(s as CheckoutSession);
    } catch { /* the sweep will catch it */ }
    r = ziweiReport(token) ?? r;
  }
  if (r.paid_at && sessionRefunded(r.paid_session)) return <RefundedNote hans={hans} locale={locale} home={`/${locale}`} />;
  if (r.paid_at && r.status !== "done" && r.status !== "incomplete") {
    await Promise.race([ensureZiweiReport(token).catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 2500))]);
    r = ziweiReport(token) ?? r;
  }
  const body: ZiweiBody = zwBodyOf(r);
  const finished = r.status === "done" || r.status === "incomplete";
  if (finished) void mailZiweiOnce(token, site).catch(() => null);

  const f = zwFactsOf(r);
  // 10-30 进度表 128 ④: a report written for a page in another language has its own words (the deep report; the 年書
  // opens in the other languages with its own sub-batch)
  if (isForeign(locale)) {
    // 10-30 进度表 128 ④-5: the 年書's 紫微篇
    if (r.kind === "year") return f.book ? <ForeignYear locale={locale} r={r} f={f} b={f.book} body={body} finished={finished} book={book} /> : notFound();
    return <ForeignReport locale={locale} token={token} r={r} f={f} body={body} finished={finished} viewerEmail={viewerEmail ?? r.email} />;
  }
  const soul = f.palaces.find((p) => p.isSoul)!;
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{w(finished ? ZW_REPORT_UI.failedChapter : ZW_REPORT_UI.writingChapter)}</p>;
  const title = r.kind === "year" && f.book ? `${f.book.year} ${f.book.gz}` : `${w(soul.major.map((s) => s.name).join("") || (soul.borrowed ?? []).join(""))} · ${w(f.fiveClass)}`;

  // 10-22 进度表 87 (设计稿第 5 節): the report on the result template — head, the key facts as the answer, the chapters,
  // the revisit, the next step (进度表 86 承接地圖); on a phone the bottom button goes to the revisit once paid (R10)
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<>
      {book ? <span><Link href={`/${locale}/nianshu/r/${book}`} className="hover:text-[var(--ink)] transition-colors">← {w(NS_UI.backToBook)}</Link></span> : (
        <span><Link href={`/${locale}/ziwei/chart`} className="hover:text-[var(--ink)] transition-colors">← {w(ZW_REPORT_UI.back)}</Link></span>
      )}
      </>}
      head={{ label: w(ZW_REPORT_UI.kindLabel[r.kind]), question: title, meta: w(ZW_REPORT_UI.kindSub[r.kind]) }}
      answer={<>
        <dl className="mt-[var(--s-4)] grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label={w(ZW_REPORT_UI.head)}>
          {[
            [ZW_REPORT_UI.headSoul, `${soul.branch} · ${soul.major.map((s) => `${s.name}${s.bright ?? ""}`).join(" ") || `（${(soul.borrowed ?? []).join(" ")}）`}`],
            [ZW_REPORT_UI.headBody, f.bodyPalace],
            [ZW_REPORT_UI.headFive, f.fiveClass],
            [ZW_REPORT_UI.headLords, `${f.soulStar}／${f.bodyStar}`],
          ].map(([k, v]) => (
            <div key={k}><dt className="t-small !text-[var(--ink-45)]">{w(k!)}</dt><dd className="t-body mt-0.5">{w(v!)}</dd></div>
          ))}
        </dl>
      </>}
      pay={!r.paid_at ? (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
          <h2 className="t-sect mb-[var(--s-2)]">{w(ZW_REPORT_UI.unpaidHead)}</h2>
          <p className="t-body">{w(ZW_REPORT_UI.unpaidBody)}</p>
        </section>
      ) : undefined}
      free={<>
      {r.paid_at && !finished && (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-4)]">
          <p className="t-body">{w(ZW_REPORT_UI.writing)}</p>
          <AutoRefresh every={6000} max={40} />
        </section>
      )}

      {r.paid_at && r.kind === "deep" && <DeepView f={f} parts={body.parts} w={w} pending={pending} locale={locale} flow={flowView(r)} />}
      {r.paid_at && r.kind === "year" && f.book && (
        <BookView b={f.book} parts={body.parts} w={w} pending={pending} locale={locale} question={r.question ?? null} token={token} book={book} />
      )}
      </>}
      revisit={r.paid_at && r.kind === "deep" ? (
        <SelfRevisitSet kind="ziwei" token={token} locale={locale as Locale} hasEmail={!!(viewerEmail ?? r.email)} options={selfChoices("ziwei", locale)} ui={selfRevisitUi(locale)} />
      ) : undefined}
      cross={<CrossCards source={book ? "nianshu" : "ziwei"} locale={locale as Locale} exclude={[book ? "nianshu" : "ziwei"]} />}
      sticky={r.paid_at && r.kind === "deep" ? (
        <a href="#revisit" data-heat="ziwei-sticky-revisit" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.14em]">{w("設定回訪")}</a>
      ) : undefined}
    />
  );
}

type W = (s: string) => string;
const dots = (level: number) => <span className="!text-[var(--gold-text)] tracking-[1px]" aria-hidden>{"●".repeat(level)}{"○".repeat(5 - level)}</span>;
function Chip({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "gold" }) {
  return <span className={`t-small inline-block rounded-[2px] border px-2 py-[1px] ${tone === "gold" ? "border-[var(--gold)] !text-[var(--gold-text)]" : "border-[var(--ink-16)] !text-[var(--ink-66)]"}`}>{children}</span>;
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

/** the twelve chapters; the chart facts each one rests on are shown above its text (格局 chips, 大限 rows, the cross table) */
/** 10-22 进度表 92／93: the two 大限 chapters follow the report's flow view — open, dated (「國曆 X 月版」) or locked (two lines) */
function DeepView({ f, parts, w, pending, locale, flow }: { f: ZiweiFacts; parts: ZiweiBody["parts"]; w: W; pending: () => ReactNode; locale: string; flow: FlowView }) {
  const statusTone = (s: string) => (s === "條件齊全" ? "gold" : "ink") as "gold" | "ink";
  return (
    <>
      {ZW_DEEP_CHAPTERS.map((ch, i) => {
        const p = parts[zwDeepGroupOf(ch.key)] as Record<string, unknown> | undefined;
        const v = p?.[ch.key];
        const gate = (FLOW_CHAPTERS.ziwei as readonly string[]).includes(ch.key) ? flow.mode : "open";
        if (gate === "locked") {
          const first = ch.key === "guoqu" ? (v as { intro?: string } | undefined)?.intro ?? "" : String(v ?? "");
          return (
            <Chapter key={ch.key} n={i + 1} id={ch.key} title={w(ch.title)}>
              <FlowLocked locale={locale} text={p ? teaser(first) : null} />
            </Chapter>
          );
        }
        return (
          <Chapter key={ch.key} n={i + 1} id={ch.key} title={w(ch.title)}>
            {gate === "dated" && flow.month && <FlowDated locale={locale} month={flow.month} />}
            {ch.key === "zonglan" && (f.geju.length ? (
              <ul className="mt-[var(--s-3)] grid gap-2">
                {f.geju.map((g) => (
                  <li key={g.name} className="rounded-[6px] border border-[var(--ink-16)] p-3">
                    <p className="flex flex-wrap items-baseline gap-2"><span className="t-body font-medium">{w(g.name)}</span><Chip tone={statusTone(g.status)}>{w(g.status)}</Chip>{g.source && <span className="t-small !text-[var(--ink-45)]">{w(g.source)}</span>}</p>
                    {g.breaks.length > 0 && <p className="t-small mt-1 !text-[var(--ink-66)]">{w(g.breaks.join("；"))}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{w(ZW_REPORT_UI.gejuNone)}</p>)}
            {ch.key === "sihua" && (
              <p className="mt-[var(--s-3)] flex flex-wrap gap-2">{f.natalMut.map((m) => <Chip key={m.m} tone="gold">{w(`${m.star}化${m.m} · ${m.palace}`)}</Chip>)}</p>
            )}
            {ch.key === "bazi" && f.cross.length > 0 && (
              <div className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
                <p className="t-small !text-[var(--ink-66)]">{w(ZW_REPORT_UI.crossHead)}{f.bazi ? ` · ${w(`日主${f.bazi.dayMaster}${f.bazi.dmEl} · ${f.bazi.strength}`)}` : ""}</p>
                {f.cross.map((c) => (
                  <div key={c.area} className="flex flex-wrap gap-2 py-[var(--s-2)] border-t border-[var(--ink-16)] first:border-t-0">
                    <span className="t-small w-[4.5rem] shrink-0 font-medium">{w(c.area)}</span>
                    <Chip tone={c.agree === "同" ? "gold" : "ink"}>{w(ZW_REPORT_UI.crossAgree[c.agree] ?? c.agree)}</Chip>
                    <span className="t-small !text-[var(--ink-66)]">{w(`紫微 ${c.ziweiWhy} · 八字 ${c.baziWhy}`)}</span>
                  </div>
                ))}
              </div>
            )}
            {ch.key === "bazi" && !f.cross.length && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{w(ZW_REPORT_UI.crossNone)}</p>}
            {!p ? pending()
              : ch.key === "guoqu" ? (() => {
                const g = v as { intro: string; list: { ages: string; text: string }[] };
                return (
                  <>
                    <Text v={g.intro} />
                    {g.list.map((x) => {
                      const d = f.decades.find((y) => `${y.startAge}–${y.endAge}` === x.ages);
                      return (
                        <div key={x.ages} className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-[var(--ink-16)]">
                          <h3 className="t-body font-medium">{x.ages}{w("歲")}{d ? ` · ${d.startYear}–${d.endYear} · ${w(d.palace)} · ${w(d.stars)}` : ""}</h3>
                          <p className="t-body mt-1 leading-relaxed">{x.text}</p>
                        </div>
                      );
                    })}
                  </>
                );
              })()
              : ch.key === "xianzai" ? (
                <>
                  <ul className="mt-[var(--s-3)] grid gap-1">
                    {f.decades.filter((d) => d.when === "now" || d.when === "next").map((d) => (
                      <li key={d.branch} className="t-small"><Chip tone={d.when === "now" ? "gold" : "ink"}>{w(d.when === "now" ? ZW_REPORT_UI.decadeNow : ZW_REPORT_UI.decadeNext)}</Chip> {d.startAge}–{d.endAge}{w("歲")} · {d.startYear}–{d.endYear} · {w(d.palace)} · {w(d.stars)}</li>
                    ))}
                  </ul>
                  <Text v={v} />
                </>
              )
              : <Text v={v} />}
          </Chapter>
        );
      })}
    </>
  );
}

/** 紫微年書: eight chapters; every month label carries 農曆 and its 國曆 dates (公历 on Simplified pages) */
function BookView({ b, parts, w, pending, locale, question, token, book }: {
  b: ZiweiBook; parts: ZiweiBody["parts"]; w: W; pending: () => ReactNode; locale: string; question: string | null; token: string; book: string | null;
}) {
  const months = b.months;
  const ov = parts.ov as { keyword?: string; verdict?: string; keyMonths?: Record<string, string> } | undefined;
  type MonthText = { read: string; focus?: Record<string, string>; yi: string[]; ji: string[] };
  const monthText = (i: number) => (parts[`m${Math.floor(i / 3) + 1}`] as { months?: MonthText[] } | undefined)?.months?.[i % 3];
  const ar = (parts.ar || parts.ar2 ? { ...(parts.ar as object), ...(parts.ar2 as object) } : undefined) as ({ love?: { single?: string; paired?: string } } & Record<string, unknown>) | undefined;
  const gx = parts.gx as { allies?: string; guards?: string[]; quarters?: Record<string, string[]> } | undefined;
  const qa = parts.qa as { answer?: string } | undefined;
  const prevAsked = ((parts.qaPrev as { list?: { question: string; answer: string }[] } | undefined)?.list ?? []);
  const keyOf: Record<number, string> = { [b.key.smooth]: ZW_REPORT_UI.keySmooth, [b.key.slow]: ZW_REPORT_UI.keySlow, [b.key.pivot]: ZW_REPORT_UI.keyPivot };
  const lab = (m: MonthZ) => w(m.label).replace(/国历/g, "公历");
  const row = (label: string, body: ReactNode) => (
    <div className="flex gap-3 py-[var(--s-2)] border-t border-[var(--ink-16)] first:border-t-0">
      <dt className="t-small shrink-0 w-[5.5rem] !text-[var(--ink-45)]">{w(label)}</dt>
      <dd className="flex flex-wrap gap-2 min-w-0">{body}</dd>
    </div>
  );
  return (
    <>
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-66)]">{w(`農曆正月初一（國曆 ${b.span.from}）起，到農曆十二月底（國曆 ${b.span.to}）止 · 虛歲 ${b.age}`).replace(/国历/g, "公历")}</p>

      <Chapter n={1} id="verdict" title={w(ZW_REPORT_UI.bookVerdict)}>
        {ov?.keyword && <p className="mt-[var(--s-3)]"><span className="t-label !text-[var(--gold-text)]">{w(ZW_REPORT_UI.bookKeyword)}</span> <span className="t-d3 ml-2">{ov.keyword}</span></p>}
        <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
          {row(ZW_REPORT_UI.bookYearPalace, <span className="t-small">{w(`${b.palace.name}（${b.palace.branch}）· ${b.palace.borrowed ? "借對宮 " : ""}${b.palace.stars}`)}</span>)}
          {row(ZW_REPORT_UI.bookYearMut, b.mut.map((m) => <Chip key={m.m} tone={m.m === "祿" ? "gold" : "ink"}>{w(`${m.star}化${m.m} → ${m.palace ?? "—"}`)}</Chip>))}
          {b.decade && row(ZW_REPORT_UI.bookDecade, <><span className="t-small">{w(`${b.decade.palace} ${b.decade.startAge}–${b.decade.endAge}歲 · ${b.decade.stars}`)}</span><Chip>{w(b.decade.rel)}</Chip></>)}
          {b.decade && b.decade.overlaps.length > 0 && row(ZW_REPORT_UI.bookOverlap, b.decade.overlaps.map((x) => <Chip key={x}>{w(x)}</Chip>))}
          {b.small && row(ZW_REPORT_UI.bookSmall, <span className="t-small">{w(b.small)}</span>)}
        </dl>
        {ov?.verdict ? <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{ov.verdict}</p> : pending()}
        <h3 className="t-sect mt-[var(--s-5)]">{w(ZW_REPORT_UI.bookCurve)}</h3>
        <MonthBars months={months} mark={[b.key.smooth, b.key.slow, b.key.pivot]} label={(m) => `${lab(m)} · ${w(ZW_REPORT_UI.levelWord[m.level]!)}`} short={(m) => w(m.lunar.replace("月", ""))} />
      </Chapter>

      <Chapter n={2} id="key" title={w(ZW_REPORT_UI.bookKeyMonths)}>
        <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-3">
          {([["smooth", ZW_REPORT_UI.keySmooth], ["slow", ZW_REPORT_UI.keySlow], ["pivot", ZW_REPORT_UI.keyPivot]] as const).map(([k, label]) => {
            const m = months[b.key[k]];
            return (
              <div key={k} className={`rounded-[6px] border p-4 ${k === "pivot" ? "border-[var(--gold)] bg-[var(--gold)]/[0.07]" : "border-[var(--ink-16)]"}`}>
                <p className="t-label !text-[var(--gold-text)]">{w(label)}</p>
                {m && <p className="t-body mt-1 font-medium">{lab(m)}</p>}
                {m && <p className="t-small mt-1">{dots(m.level)} <span className="!text-[var(--ink-66)]">{w(ZW_REPORT_UI.levelWord[m.level]!)}</span></p>}
                {ov?.keyMonths?.[k] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{ov.keyMonths[k]}</p> : pending()}
              </div>
            );
          })}
        </div>
      </Chapter>

      <Chapter n={3} id="months" title={w(ZW_REPORT_UI.bookMonths)}>
        <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{w(ZW_REPORT_UI.monthsNote).replace(/国历/g, "公历")}</p>
        <ol className="mt-[var(--s-3)] space-y-3">
          {months.map((m, i) => {
            const t = monthText(i), key = keyOf[i];
            return (
              <li key={m.n} id={`m${i + 1}`} className={`rounded-[6px] border p-4 ${key ? "border-[var(--gold)]" : "border-[var(--ink-16)]"}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="t-body font-medium">{lab(m)} · {m.gz}</p>
                  <p className="t-small">{dots(m.level)} <span className="!text-[var(--ink-66)]">{w(ZW_REPORT_UI.levelWord[m.level]!)}</span></p>
                  {key && <Chip tone="gold">{w(key)}</Chip>}
                </div>
                <p className="t-small mt-1 !text-[var(--ink-66)]">{w(`${ZW_REPORT_UI.monthPalace}${m.palace} · ${m.stars}`)}</p>
                {m.flags.length > 0 && <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">{m.flags.map((x) => <Chip key={x}>{w(x)}</Chip>)}</p>}
                <p className="t-small mt-1 !text-[var(--ink-45)]">{w(m.tags.join(" · "))}</p>
                {t ? (
                  <>
                    <p className="t-body mt-[var(--s-2)] leading-relaxed">{t.read}</p>
                    {t.focus && (
                      <dl className="mt-[var(--s-3)] grid gap-1.5">
                        {(["work", "money", "love", "rest"] as const).filter((k) => t.focus![k]).map((k) => (
                          <div key={k} className="flex gap-3"><dt className="t-small shrink-0 w-[2.6rem] !text-[var(--gold-text)]">{w(({ work: "事業", money: "財運", love: "感情", rest: "作息" } as const)[k])}</dt><dd className="t-small leading-relaxed">{t.focus![k]}</dd></div>
                        ))}
                      </dl>
                    )}
                    <div className="mt-[var(--s-3)] grid grid-cols-2 gap-3">
                      <div><p className="t-label !text-[var(--gold-text)]">{w(ZW_REPORT_UI.monthYi)}</p><ul className="mt-1 space-y-1">{t.yi.map((x, k) => <li key={k} className="t-small">· {x}</li>)}</ul></div>
                      <div><p className="t-label !text-[var(--ink-66)]">{w(ZW_REPORT_UI.monthJi)}</p><ul className="mt-1 space-y-1">{t.ji.map((x, k) => <li key={k} className="t-small !text-[var(--ink-66)]">· {x}</li>)}</ul></div>
                    </div>
                  </>
                ) : pending()}
              </li>
            );
          })}
        </ol>
      </Chapter>

      <Chapter n={4} id="areas" title={w(ZW_REPORT_UI.bookAreas)}>
        {!ar ? pending() : ZW_BOOK_AREAS.map((a) => (
          <div key={a.key} className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-[var(--ink-16)] first:border-t-0">
            <h3 className="t-body font-medium">{w(a.title)}</h3>
            {a.key === "love" ? (
              <>
                <p className="t-label mt-[var(--s-2)] !text-[var(--gold-text)]">{w(ZW_REPORT_UI.areaSingle)}</p>
                <p className="t-body mt-1 leading-relaxed">{ar.love?.single}</p>
                <p className="t-label mt-[var(--s-3)] !text-[var(--gold-text)]">{w(ZW_REPORT_UI.areaPaired)}</p>
                <p className="t-body mt-1 leading-relaxed">{ar.love?.paired}</p>
              </>
            ) : ar[a.key] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{String(ar[a.key])}</p> : pending()}
          </div>
        ))}
      </Chapter>

      <Chapter n={5} id="allies" title={w(ZW_REPORT_UI.bookAllies)}>
        <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
          {(b.allies.yearKui || b.allies.yearYue) && row(ZW_REPORT_UI.alliesYear, [b.allies.yearKui && `流魁 · ${b.allies.yearKui}`, b.allies.yearYue && `流鉞 · ${b.allies.yearYue}`].filter(Boolean).map((x) => <Chip key={x!} tone="gold">{w(x!)}</Chip>))}
          {(b.allies.kui || b.allies.yue) && row(ZW_REPORT_UI.alliesNatal, [b.allies.kui && `天魁 · ${b.allies.kui}`, b.allies.yue && `天鉞 · ${b.allies.yue}`].filter(Boolean).map((x) => <Chip key={x!}>{w(x!)}</Chip>))}
          {(b.allies.zuo || b.allies.you) && row(ZW_REPORT_UI.alliesHelpers, [b.allies.zuo && `左輔 · ${b.allies.zuo}`, b.allies.you && `右弼 · ${b.allies.you}`].filter(Boolean).map((x) => <Chip key={x!}>{w(x!)}</Chip>))}
          {row(ZW_REPORT_UI.alliesFriends, <span className="t-small">{w(b.allies.friends)}</span>)}
        </dl>
        {gx?.allies ? <p className="t-body mt-[var(--s-4)] leading-relaxed">{gx.allies}</p> : pending()}
      </Chapter>

      <Chapter n={6} id="guards" title={w(ZW_REPORT_UI.bookGuards)}>
        <ul className="mt-[var(--s-3)] space-y-3">
          {b.guards.map((g, k) => (
            <li key={k} className="rounded-[2px] border-l-2 border-[var(--ink-45)] pl-[var(--s-4)] py-1">
              <p className="t-body font-medium">{months.slice(g.from, g.to + 1).map(lab).join("、")}</p>
              {g.why.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5">{g.why.map((x) => <Chip key={x}>{w(x)}</Chip>)}</p>}
              {gx?.guards?.[k] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{gx.guards[k]}</p> : pending()}
            </li>
          ))}
        </ul>
      </Chapter>

      <Chapter n={7} id="quarters" title={w(ZW_REPORT_UI.bookQuarters)}>
        <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((q) => {
            const ms = zwQuarterMonths(q);
            const list = gx?.quarters?.[`q${q + 1}`];
            return (
              <div key={q} className="rounded-[6px] border border-[var(--ink-16)] p-4">
                <p className="t-body font-medium">{w(ZW_REPORT_UI.quarter[q + 1]!)}</p>
                <p className="t-small mt-1 !text-[var(--ink-45)]">{ms.map((i) => months[i]).filter(Boolean).map((m) => w(`農曆${m!.lunar}`)).join("・")}</p>
                {list ? (
                  <ul className="mt-[var(--s-2)] space-y-2">
                    {list.map((x, k) => <li key={k} className="t-body flex gap-2 leading-relaxed"><span aria-hidden className="mt-[0.35em] h-[0.9em] w-[0.9em] shrink-0 rounded-[2px] border border-[var(--ink-45)]" />{x}</li>)}
                  </ul>
                ) : pending()}
              </div>
            );
          })}
        </div>
      </Chapter>

      {!book && (
      <Chapter n={8} id="question" title={w(ZW_REPORT_UI.bookQuestion)}>
        {question && (
          <blockquote className="mt-[var(--s-3)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-3)]">
            <p className="t-small !text-[var(--gold-text)]">{w(ZW_REPORT_UI.questionYou)}</p>
            <p className="t-body mt-1">{question}</p>
          </blockquote>
        )}
        {!question ? null : qa?.answer ? (
          <>
            <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{qa.answer}</p>
            <Link href={`/${locale}/cast?q=${encodeURIComponent([...question].slice(0, 100).join(""))}&c=ziwei`} className="inline-block mt-[var(--s-4)] t-body border border-[var(--ink)] rounded-full px-5 py-2.5 hover:bg-[var(--ink)] hover:!text-[var(--paper)] transition-colors">{w(ZW_REPORT_UI.questionCast)}</Link>
          </>
        ) : pending()}
        {prevAsked.length > 0 && (
          <details className="mt-[var(--s-4)]">
            <summary className="cursor-pointer t-small !text-[var(--ink-66)]">{w("你之前問過的")}</summary>
            {prevAsked.map((x, k) => (
              <div key={k} className="mt-[var(--s-3)] border-t border-[var(--ink-16)] pt-[var(--s-3)]">
                <p className="t-small !text-[var(--gold-text)]">{x.question}</p>
                <p className="t-body mt-1 leading-relaxed whitespace-pre-line">{x.answer}</p>
              </div>
            ))}
          </details>
        )}
        <ReaskForm token={token} hans={locale === "zh"} endpoint="/api/ziwei/report/ask" />
      </Chapter>
      )}
    </>
  );
}

/** twelve bars, one per 流月 (農曆 month), height by level; gold from level 4; `mark` rings the key months */
function MonthBars({ months, label, short, mark = [] }: { months: MonthZ[]; label: (m: MonthZ) => string; short: (m: MonthZ) => string; mark?: number[] }) {
  if (!months.length) return null;
  const W = 30, H = 100;
  return (
    <svg viewBox={`0 -12 ${months.length * W} ${H + 34}`} className="mt-[var(--s-3)] w-full h-auto" role="img">
      {[1, 2, 3, 4, 5].map((l) => <line key={l} x1={0} x2={months.length * W} y1={H - l * 20} y2={H - l * 20} style={{ stroke: "var(--ink-16)" }} strokeWidth={0.5} />)}
      {months.map((m, i) => (
        <g key={m.n}>
          <title>{label(m)}</title>
          <rect x={i * W + 7} y={H - m.level * 20} width={W - 14} height={m.level * 20} rx={2} style={{ fill: m.level >= 4 ? "var(--gold)" : m.level === 3 ? "var(--ink-45)" : "var(--ink-16)" }} />
          {mark.includes(i) && <circle cx={i * W + W / 2} cy={H - m.level * 20 - 6} r={3} style={{ fill: "none", stroke: "var(--gold-text)" }} strokeWidth={1.2} />}
          <text x={i * W + W / 2} y={H + 15} textAnchor="middle" fontSize={9} style={{ fill: "var(--ink-66)" }}>{short(m)}</text>
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ 10-30 进度表 128 ④: a page in another language */

/** the first words of a locked chapter: Japanese and Korean as the Chinese teaser; Latin text cut at a word */
function teaseIn(text: string, l: Foreign): string {
  if (l === "ja" || l === "ko") return teaser(text);
  const x = text.replace(/\s+/g, " ").trim();
  if (x.length <= 120) return x;
  const cut = x.slice(0, 120), sp = cut.lastIndexOf(" ");
  return `${sp > 60 ? cut.slice(0, sp) : cut}…`;
}

/**
 * The deep report on a page in one of the seven other languages: the same template, chapters, facts and gates as the
 * Chinese page; every word from the report page's words (lib/mingli/ziwei/page-ui.ts REPORT), the names (names.ts) and
 * the fact lines rebuilt in that language (report-foreign.ts); the chapters themselves were written in that language.
 */
function ForeignReport({ locale, token, r, f, body, finished, viewerEmail }: {
  locale: Foreign; token: string; r: NonNullable<ReturnType<typeof ziweiReport>>; f: ZiweiFacts; body: ZiweiBody; finished: boolean; viewerEmail: string | null;
}) {
  const t = ziweiReportText(locale), Z = zwName(locale);
  const paid = !!r.paid_at;
  const flow = flowView(r);
  const isFlow = (key: string) => (FLOW_CHAPTERS.ziwei as readonly string[]).includes(key);
  const part = (g: string) => body.parts[g] as Record<string, unknown> | undefined;
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{finished ? t.failedChapter : t.writingChapter}</p>;
  const soul = f.palaces.find((p) => p.isSoul)!;
  const soulStars = soul.major.map((s) => Z.star(s.name)).join(Z.list) || (soul.borrowed ?? []).map(Z.star).join(Z.list);
  const title = `${soulStars} · ${Z.five(f.fiveClass)}`;
  const chapters = t.chapters as Record<string, string>;
  const geju = zwGejuIn(f, locale), cross = zwCrossIn(f, locale);
  const decadeLine = (d: ZiweiFacts["decades"][number]) => {
    const p = f.palaces.find((q) => q.name === d.palace);
    return `${fmt(t.ages, { a: d.startAge, b: d.endAge })} · ${d.startYear}–${d.endYear} · ${Z.palaceFull(d.palace)}${p ? ` · ${zwStarsIn(p, f, locale)}` : ""}`;
  };
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<span><Link href={`/${locale}/ziwei/chart`} className="hover:text-[var(--ink)] transition-colors">← {t.back}</Link></span>}
      head={{ label: t.kindLabel, question: title, meta: t.kindSub }}
      answer={
        <dl className="mt-[var(--s-4)] grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label={t.head}>
          {[
            [t.headSoul, `${Z.branch(soul.branch)} · ${soul.major.length ? Z.stars(soul.major) : Z.josa(t.borrowed.replace("{s}", (soul.borrowed ?? []).map(Z.star).join(Z.list)))}`],
            [t.headBody, Z.palaceFull(f.bodyPalace)],
            [t.headFive, Z.five(f.fiveClass)],
            [t.headLords, `${Z.star(f.soulStar)} / ${Z.star(f.bodyStar)}`],
          ].map(([k, v]) => (
            <div key={k}><dt className="t-small !text-[var(--ink-45)]">{k}</dt><dd className="t-body mt-0.5">{v}</dd></div>
          ))}
        </dl>
      }
      pay={!paid ? (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
          <h2 className="t-sect mb-[var(--s-2)]">{t.unpaidHead}</h2>
          <p className="t-body">{t.unpaidBody}</p>
        </section>
      ) : undefined}
      free={<>
        {paid && !finished && (
          <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-4)]">
            <p className="t-body">{t.writing}</p>
            <AutoRefresh every={6000} max={40} />
          </section>
        )}
        {paid && ZW_DEEP_CHAPTERS.map((ch, i) => {
          const p = part(zwDeepGroupOf(ch.key));
          const v = p?.[ch.key];
          const gate = isFlow(ch.key) ? flow.mode : "open";
          if (gate === "locked") {
            const first = ch.key === "guoqu" ? (v as { intro?: string } | undefined)?.intro ?? "" : String(v ?? "");
            return (
              <Chapter key={ch.key} n={i + 1} id={ch.key} title={chapters[ch.key] ?? ch.title}>
                <FlowLocked locale={locale} text={p ? teaseIn(first, locale) : null} />
              </Chapter>
            );
          }
          return (
            <Chapter key={ch.key} n={i + 1} id={ch.key} title={chapters[ch.key] ?? ch.title}>
              {gate === "dated" && flow.month && <FlowDated locale={locale} month={flow.month} />}
              {ch.key === "zonglan" && (geju.length ? (
                <ul className="mt-[var(--s-3)] grid gap-2">
                  {geju.map((g) => (
                    <li key={g.id} className="rounded-[6px] border border-[var(--ink-16)] p-3">
                      <p className="flex flex-wrap items-baseline gap-2"><span className="t-body font-medium">{g.name}</span><Chip tone={g.tone === "full" ? "gold" : "ink"}>{g.status}</Chip>{g.source && <span className="t-small !text-[var(--ink-45)]">{g.source}</span>}</p>
                      {g.breaks.length > 0 && <p className="t-small mt-1 !text-[var(--ink-66)]">{g.breaks.join(Z.l === "ja" ? "；" : "; ")}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{t.gejuNone}</p>)}
              {ch.key === "sihua" && (
                <p className="mt-[var(--s-3)] flex flex-wrap gap-2">{f.natalMut.map((m) => <Chip key={m.m} tone="gold">{`${Z.star(m.star)} ${Z.mutFull(m.m)} · ${Z.palaceFull(m.palace)}`}</Chip>)}</p>
              )}
              {ch.key === "bazi" && cross.length > 0 && (
                <div className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
                  <p className="t-small !text-[var(--ink-66)]">{t.crossHead}{f.bazi ? ` · ${fmt(t.dmLine, { dm: bzDm(locale, f.bazi.dayMaster), s: bzLevel(locale, f.bazi.strength) })}` : ""}</p>
                  {cross.map((c) => (
                    <div key={c.area} className="flex flex-wrap gap-2 py-[var(--s-2)] border-t border-[var(--ink-16)] first:border-t-0">
                      <span className="t-small w-[6.5rem] shrink-0 font-medium">{c.area}</span>
                      <Chip tone={c.agreeKey === "同" ? "gold" : "ink"}>{c.agree}</Chip>
                      <span className="t-small !text-[var(--ink-66)]">{fmt(t.crossLine, { z: c.ziwei, b: c.bazi })}</span>
                    </div>
                  ))}
                </div>
              )}
              {ch.key === "bazi" && !cross.length && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{t.crossNone}</p>}
              {!p ? pending()
                : ch.key === "guoqu" ? (() => {
                  const g = v as { intro: string; list: { ages: string; text: string }[] };
                  return (
                    <>
                      <Text v={g.intro} />
                      {g.list.map((x) => {
                        const d = f.decades.find((y) => `${y.startAge}–${y.endAge}` === x.ages);
                        return (
                          <div key={x.ages} className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-[var(--ink-16)]">
                            <h3 className="t-body font-medium">{d ? decadeLine(d) : x.ages}</h3>
                            <p className="t-body mt-1 leading-relaxed">{x.text}</p>
                          </div>
                        );
                      })}
                    </>
                  );
                })()
                : ch.key === "xianzai" ? (
                  <>
                    <ul className="mt-[var(--s-3)] grid gap-1">
                      {f.decades.filter((d) => d.when === "now" || d.when === "next").map((d) => (
                        <li key={d.branch} className="t-small"><Chip tone={d.when === "now" ? "gold" : "ink"}>{d.when === "now" ? t.decadeNow : t.decadeNext}</Chip> {decadeLine(d)}</li>
                      ))}
                    </ul>
                    <Text v={v} />
                  </>
                )
                : <Text v={v} />}
            </Chapter>
          );
        })}
      </>}
      revisit={paid ? (
        <SelfRevisitSet kind="ziwei" token={token} locale={locale as Locale} hasEmail={!!viewerEmail} options={selfChoices("ziwei", locale)} ui={selfRevisitUi(locale)} />
      ) : undefined}
      cross={<CrossCards source="ziwei" locale={locale as Locale} exclude={["ziwei"]} />}
      sticky={paid ? (
        <a href="#revisit" data-heat="ziwei-sticky-revisit" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.06em]">{t.revisitBtn}</a>
      ) : undefined}
    />
  );
}
/** the chart's key facts as the answer of a foreign report page (Life palace, Body palace, Five Element Bureau, lords) */
function ChartHeadIn({ f, locale }: { f: ZiweiFacts; locale: Foreign }) {
  const t = ziweiReportText(locale), Z = zwName(locale);
  const soul = f.palaces.find((p) => p.isSoul)!;
  return (
    <dl className="mt-[var(--s-4)] grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label={t.head}>
      {[
        [t.headSoul, `${Z.branch(soul.branch)} · ${soul.major.length ? Z.stars(soul.major) : Z.josa(t.borrowed.replace("{s}", (soul.borrowed ?? []).map(Z.star).join(Z.list)))}`],
        [t.headBody, Z.palaceFull(f.bodyPalace)],
        [t.headFive, Z.five(f.fiveClass)],
        [t.headLords, `${Z.star(f.soulStar)} / ${Z.star(f.bodyStar)}`],
      ].map(([k, v]) => (
        <div key={k}><dt className="t-small !text-[var(--ink-45)]">{k}</dt><dd className="t-body mt-0.5">{v}</dd></div>
      ))}
    </dl>
  );
}

/**
 * 10-30 进度表 128 ④-5: the 年書's 紫微篇 on a page in another language — the Chinese BookView's chapters (the question
 * belongs to the 年書), every fact named in that language (lib/mingli/ziwei/book-foreign.ts), every label from the report
 * page's words (page-ui.ts REPORT.book); each month a lunar month with its Gregorian dates.
 */
function ForeignYear({ locale, r, f, b, body, finished, book }: {
  locale: Foreign; r: NonNullable<ReturnType<typeof ziweiReport>>; f: ZiweiFacts; b: ZiweiBook; body: ZiweiBody; finished: boolean; book: string | null;
}) {
  const rt = ziweiReportText(locale), W = zwBookWords(locale, f, b.year), Z = W.Z, t = W.t;
  const paid = !!r.paid_at;
  const months = b.months;
  const startM = Number(months[0]?.from.split("/")[0] ?? 1);
  const parts = body.parts;
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{finished ? rt.failedChapter : rt.writingChapter}</p>;
  const ov = parts.ov as { keyword?: string; verdict?: string; keyMonths?: Record<string, string> } | undefined;
  type MonthText = { read: string; focus?: Record<string, string>; yi: string[]; ji: string[] };
  const monthText = (i: number) => (parts[`m${Math.floor(i / 3) + 1}`] as { months?: MonthText[] } | undefined)?.months?.[i % 3];
  const ar = (parts.ar || parts.ar2 ? { ...(parts.ar as object), ...(parts.ar2 as object) } : undefined) as ({ love?: { single?: string; paired?: string } } & Record<string, unknown>) | undefined;
  const gx = parts.gx as { allies?: string; guards?: string[]; quarters?: Record<string, string[]> } | undefined;
  const keyOf: Record<number, string> = { [b.key.smooth]: t.keySmooth, [b.key.slow]: t.keySlow, [b.key.pivot]: t.keyPivot };
  const lab = (m: MonthZ) => W.label(m, startM);
  const row = (label: string, el: ReactNode) => (
    <div className="flex gap-3 py-[var(--s-2)] border-t border-[var(--ink-16)] first:border-t-0">
      <dt className="t-small shrink-0 w-[6.5rem] !text-[var(--ink-45)]">{label}</dt>
      <dd className="flex flex-wrap gap-2 min-w-0">{el}</dd>
    </div>
  );
  const ns = book ? nsForeignText(locale).ui : null;
  const focusKeys = ["work", "money", "love", "rest"] as const;
  const a = b.allies;
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<span><Link href={book ? `/${locale}/nianshu/r/${book}` : `/${locale}/ziwei/chart`} className="hover:text-[var(--ink)] transition-colors">← {ns ? ns.backToBook : rt.back}</Link></span>}
      head={{ label: t.kindLabel, question: `${b.year} ${Z.gz(b.gz)}`, meta: t.kindSub }}
      answer={<ChartHeadIn f={f} locale={locale} />}
      pay={!paid ? (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
          <h2 className="t-sect mb-[var(--s-2)]">{rt.unpaidHead}</h2>
          <p className="t-body">{rt.unpaidBody}</p>
        </section>
      ) : undefined}
      free={<>
        {paid && !finished && (
          <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-4)]">
            <p className="t-body">{rt.writing}</p>
            <AutoRefresh every={6000} max={40} />
          </section>
        )}
        {paid && (
          <>
            <p className="t-small mt-[var(--s-5)] !text-[var(--ink-66)]">{fmt(t.span, { a: W.md(b.span.from, startM), b: W.md(b.span.to, startM), age: b.age })}</p>
            <p className="t-small mt-1 !text-[var(--ink-45)]">{t.ageNote}</p>

            <Chapter n={1} id="verdict" title={t.verdict}>
              {ov?.keyword && <p className="mt-[var(--s-3)]"><span className="t-label !text-[var(--gold-text)]">{t.keyword}</span> <span className="t-d3 ml-2">{ov.keyword}</span></p>}
              <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
                {row(t.yearPalace, <span className="t-small">{`${W.pal(b.palace.name)}${Z.paren(Z.branch(b.palace.branch))} · ${W.starsOf(b.palace.name)}`}</span>)}
                {row(t.yearMut, b.mut.map((m) => <Chip key={m.m} tone={m.m === "祿" ? "gold" : "ink"}>{W.mut(m)}</Chip>))}
                {b.decade && row(t.decade, <><span className="t-small">{fmt(t.decadeAges, { p: W.pal(b.decade.palace), a: b.decade.startAge, b: b.decade.endAge })} · {W.starsOf(b.decade.palace)}</span><Chip>{(t.rel as Record<string, string>)[b.decade.rel] ?? b.decade.rel}</Chip></>)}
                {b.decade && b.decade.overlaps.length > 0 && row(t.overlap, b.decade.overlaps.map((x) => <Chip key={x}>{W.overlap(x)}</Chip>))}
                {b.small && row(t.small, <span className="t-small">{W.pal(b.small)}</span>)}
              </dl>
              {ov?.verdict ? <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{ov.verdict}</p> : pending()}
              <h3 className="t-sect mt-[var(--s-5)]">{t.curve}</h3>
              <MonthBars months={months} mark={[b.key.smooth, b.key.slow, b.key.pivot]} label={(m) => `${lab(m)} · ${W.level(m.level)}`} short={(m) => String(m.n)} />
            </Chapter>

            <Chapter n={2} id="key" title={t.keyMonths}>
              <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-3">
                {([["smooth", t.keySmooth], ["slow", t.keySlow], ["pivot", t.keyPivot]] as const).map(([k, label]) => {
                  const m = months[b.key[k]];
                  return (
                    <div key={k} className={`rounded-[6px] border p-4 ${k === "pivot" ? "border-[var(--gold)] bg-[var(--gold)]/[0.07]" : "border-[var(--ink-16)]"}`}>
                      <p className="t-label !text-[var(--gold-text)]">{label}</p>
                      {m && <p className="t-body mt-1 font-medium">{lab(m)}</p>}
                      {m && <p className="t-small mt-1">{dots(m.level)} <span className="!text-[var(--ink-66)]">{W.level(m.level)}</span></p>}
                      {ov?.keyMonths?.[k] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{ov.keyMonths[k]}</p> : pending()}
                    </div>
                  );
                })}
              </div>
            </Chapter>

            <Chapter n={3} id="months" title={t.months}>
              <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{t.monthsNote}</p>
              <ol className="mt-[var(--s-3)] space-y-3">
                {months.map((m, i) => {
                  const x = monthText(i), key = keyOf[i];
                  return (
                    <li key={m.n} id={`m${i + 1}`} className={`rounded-[6px] border p-4 ${key ? "border-[var(--gold)]" : "border-[var(--ink-16)]"}`}>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="t-body font-medium">{lab(m)} · {Z.gz(m.gz)}</p>
                        <p className="t-small">{dots(m.level)} <span className="!text-[var(--ink-66)]">{W.level(m.level)}</span></p>
                        {key && <Chip tone="gold">{key}</Chip>}
                      </div>
                      <p className="t-small mt-1 !text-[var(--ink-66)]">{W.ko(fmt(t.monthPalace, { p: W.pal(m.palace), s: W.starsOf(m.palace) }))}</p>
                      {m.flags.length > 0 && <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">{m.flags.map((y) => <Chip key={y}>{W.flag(y)}</Chip>)}</p>}
                      <p className="t-small mt-1 !text-[var(--ink-45)]">{m.tags.map(W.tag).join(" · ")}</p>
                      {x ? (
                        <>
                          <p className="t-body mt-[var(--s-2)] leading-relaxed">{x.read}</p>
                          {x.focus && (
                            <dl className="mt-[var(--s-3)] grid gap-1.5">
                              {focusKeys.filter((k) => x.focus![k]).map((k) => (
                                <div key={k} className="flex gap-3"><dt className="t-small shrink-0 w-[4.5rem] !text-[var(--gold-text)]">{t.focus[k]}</dt><dd className="t-small leading-relaxed">{x.focus![k]}</dd></div>
                              ))}
                            </dl>
                          )}
                          <div className="mt-[var(--s-3)] grid grid-cols-2 gap-3">
                            <div><p className="t-label !text-[var(--gold-text)]">{t.yi}</p><ul className="mt-1 space-y-1">{x.yi.map((y, k) => <li key={k} className="t-small">· {y}</li>)}</ul></div>
                            <div><p className="t-label !text-[var(--ink-66)]">{t.ji}</p><ul className="mt-1 space-y-1">{x.ji.map((y, k) => <li key={k} className="t-small !text-[var(--ink-66)]">· {y}</li>)}</ul></div>
                          </div>
                        </>
                      ) : pending()}
                    </li>
                  );
                })}
              </ol>
            </Chapter>

            <Chapter n={4} id="areas" title={t.areas}>
              {!ar ? pending() : ZW_BOOK_AREAS.map((x) => (
                <div key={x.key} className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-[var(--ink-16)] first:border-t-0">
                  <h3 className="t-body font-medium">{t.area[x.key]}</h3>
                  {x.key === "love" ? (
                    <>
                      <p className="t-label mt-[var(--s-2)] !text-[var(--gold-text)]">{t.single}</p>
                      <p className="t-body mt-1 leading-relaxed">{ar.love?.single}</p>
                      <p className="t-label mt-[var(--s-3)] !text-[var(--gold-text)]">{t.paired}</p>
                      <p className="t-body mt-1 leading-relaxed">{ar.love?.paired}</p>
                    </>
                  ) : ar[x.key] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{String(ar[x.key])}</p> : pending()}
                </div>
              ))}
            </Chapter>

            <Chapter n={5} id="allies" title={t.allies}>
              <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
                {(a.yearKui || a.yearYue) && row(t.alliesYear, [a.yearKui && `${W.yearly("流魁")} · ${W.pal(a.yearKui)}`, a.yearYue && `${W.yearly("流鉞")} · ${W.pal(a.yearYue)}`].filter(Boolean).map((x) => <Chip key={x!} tone="gold">{x}</Chip>))}
                {(a.kui || a.yue) && row(t.alliesNatal, [a.kui && `${Z.star("天魁")} · ${W.pal(a.kui)}`, a.yue && `${Z.star("天鉞")} · ${W.pal(a.yue)}`].filter(Boolean).map((x) => <Chip key={x!}>{x}</Chip>))}
                {(a.zuo || a.you) && row(t.alliesHelpers, [a.zuo && `${Z.star("左輔")} · ${W.pal(a.zuo)}`, a.you && `${Z.star("右弼")} · ${W.pal(a.you)}`].filter(Boolean).map((x) => <Chip key={x!}>{x}</Chip>))}
                {row(t.alliesFriends, <span className="t-small">{W.starsOf("交友")}</span>)}
              </dl>
              {gx?.allies ? <p className="t-body mt-[var(--s-4)] leading-relaxed">{gx.allies}</p> : pending()}
            </Chapter>

            <Chapter n={6} id="guards" title={t.guards}>
              <ul className="mt-[var(--s-3)] space-y-3">
                {b.guards.map((g, k) => (
                  <li key={k} className="rounded-[2px] border-l-2 border-[var(--ink-45)] pl-[var(--s-4)] py-1">
                    <p className="t-body font-medium">{months.slice(g.from, g.to + 1).map(lab).join(Z.list)}</p>
                    {g.why.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5">{g.why.map((y) => <Chip key={y}>{W.why(y)}</Chip>)}</p>}
                    {gx?.guards?.[k] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{gx.guards[k]}</p> : pending()}
                  </li>
                ))}
              </ul>
            </Chapter>

            <Chapter n={7} id="quarters" title={t.quarters}>
              <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((q) => {
                  const ms = zwQuarterMonths(q);
                  const list = gx?.quarters?.[`q${q + 1}`];
                  return (
                    <div key={q} className="rounded-[6px] border border-[var(--ink-16)] p-4">
                      <p className="t-body font-medium">{(t.quarter as unknown as Record<string, string>)[String(q + 1)]}</p>
                      <p className="t-small mt-1 !text-[var(--ink-45)]">{ms.map((i) => months[i]).filter(Boolean).map((m) => W.short(m!)).join(Z.list)}</p>
                      {list ? (
                        <ul className="mt-[var(--s-2)] space-y-2">
                          {list.map((y, k) => <li key={k} className="t-body flex gap-2 leading-relaxed"><span aria-hidden className="mt-[0.35em] h-[0.9em] w-[0.9em] shrink-0 rounded-[2px] border border-[var(--ink-45)]" />{y}</li>)}
                        </ul>
                      ) : pending()}
                    </div>
                  );
                })}
              </div>
            </Chapter>
          </>
        )}
      </>}
      cross={<CrossCards source={book ? "nianshu" : "ziwei"} locale={locale as Locale} exclude={[book ? "nianshu" : "ziwei"]} />}
    />
  );
}

/** the 八字 side's Day Master and strength in the page's words */
const bzDm = (l: Foreign, stem: string) => bzName(l).dm(stem);
const bzLevel = (l: Foreign, level: string) => bzName(l).level(level);
