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
import { ensurePortrait, hasPortrait } from "@/lib/mingli/bazi/portrait";
import { toHans, toHant } from "@/lib/hant";
import {
  BAZI_TOKEN_RE, BOOK_AREAS, DEEP_CHAPTERS, LOVE_SECTIONS, REPORT_UI, YEAR_AREAS, baziReport, basisChips, bodyOf, deepGroupOf, ensureBaziReport,
  factsOf, fixGanzhi, fulfilBaziPayment, mailBaziOnce, quarterMonths, yearsOf, type MonthPoint, type ReportBody, type YearBook,
} from "@/lib/mingli/bazi/report";
import type { ReactNode } from "react";
import { FLOW_CHAPTERS, flowView, teaser } from "@/lib/mingli/flow-view";
import { FlowDated, FlowLocked } from "@/components/mingli/FlowGate";
import { fmt, isForeign, type Foreign } from "@/lib/l10n/core";
import { baziReportText } from "@/lib/mingli/bazi/page-ui";
import { bzName, stemIndex, branchIndex } from "@/lib/mingli/bazi/names";
import { zyChipsIn } from "@/lib/mingli/bazi/zhengyuan-in";
import { zyKeys } from "@/lib/mingli/bazi/zhengyuan";
import { bzBookWords } from "@/lib/mingli/bazi/book-foreign";
import { nsForeignText } from "@/lib/mingli/nianshu/foreign-text";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ④: the tab's title in the page's language
  return { title: isForeign(locale) ? baziReportText(locale).metaTitle : locale === "zh" ? toHans("你的八字報告") : "你的八字報告", robots: { index: false, follow: false } };
}

/**
 * 10-18 八字②③④ a report's own page (token URL; no birth data anywhere on it — the facts are the computed chart).
 * deep: eleven chapters · love: the portrait, each part with its chart reasons as chips · year: per year the overview,
 * the twelve-month curve (fixed rules) with each month's line, four areas and three things to do — the format before
 * 10-19; a report with facts.book is a 年書 for one year (BookView below: eight chapters).
 * Written chapters show as soon as they are stored; the page refreshes itself while the rest is being written.
 * Visible once paid (or made for a member); an unpaid one follows the bazi-paid switch.
 */
export default async function BaziReportPage({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { locale, token } = await params;
  if (!BAZI_TOKEN_RE.test(token)) notFound();
  let r = baziReport(token);
  if (!r || r.locale !== locale) notFound();
  /** 10-21: a year report that is one 篇 of a 三合一年書 links back to it and leaves the question to the 年書 */
  const book = r.kind === "year" ? nianshuOfChild("bazi", token) : null;
  // 10-26: an unpaid 正緣畫像 belongs to the zhengyuan product page's switch
  if (!r.paid_at && !(await canSee(r.kind === "love" ? "zhengyuan" : "bazi-paid"))) notFound();
  const hans = locale === "zh";
  const solar = solarOf(locale);
  /** our fixed copy is Traditional: Simplified pages convert it */
  const w = (s: string) => (hans ? toHans(s) : s);
  /** the chart's own words (zhengyuan basis, tags) come Simplified: Traditional pages convert them */
  const c = (s: string) => (hans ? s : fixGanzhi(toHant(s)));
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

  const { paid } = await searchParams;
  // 10-22 进度表 80: whose report, for the 「到期回來問你」 block — the account's address, else the one it was bought with
  let viewerEmail: string | null = null;
  try { viewerEmail = (await currentCustomer())?.email ?? null; } catch { /* no database */ }
  if (!r.paid_at && paid && /^cs_[A-Za-z0-9_]{10,200}$/.test(paid)) {
    try {
      const s = await getCheckoutSession(paid);
      if (s.metadata?.bazi === token) fulfilBaziPayment(s as CheckoutSession);
    } catch { /* the sweep will catch it */ }
    r = baziReport(token) ?? r;
  }
  if (r.paid_at && sessionRefunded(r.paid_session)) return <RefundedNote hans={hans} locale={locale} home={`/${locale}`} />;
  if (r.paid_at && r.status !== "done" && r.status !== "incomplete") {
    // never hold the page for the writing: wait a moment, then show what is stored so far and refresh
    await Promise.race([ensureBaziReport(token).catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 2500))]);
    r = baziReport(token) ?? r;
  }
  const body: ReportBody = bodyOf(r);
  const finished = r.status === "done" || r.status === "incomplete";
  if (finished) void mailBaziOnce(token, site).catch(() => null);

  const f = factsOf(r);
  const years = yearsOf(r);
  // 10-30 进度表 128 ④: a report written for a page in another language has its own words (the deep report and the
  // 正緣畫像; the 年書 opens in the other languages with its own sub-batch)
  if (isForeign(locale)) {
    // 10-30 进度表 128 ④-5: the 年書's 八字篇 (a year report made before the 年書 has no book: not shown outside Chinese)
    if (r.kind === "year") return f.book ? <ForeignYear locale={locale} r={r} f={f} b={f.book} body={body} finished={finished} book={book} /> : notFound();
    return <ForeignReport locale={locale} token={token} r={r} f={f} body={body} finished={finished} viewerEmail={viewerEmail ?? r.email} />;
  }
  // 10-22 进度表 92／93: the 運勢 chapters (一生大運, 現在這步大運與今年) — open, dated (a membership that ended) or
  // locked (made under a 通卡: title, two lines, the way in) — lib/mingli/flow-view.ts
  const flow = r.kind === "deep" ? flowView(r) : null;
  const isFlow = (key: string) => (FLOW_CHAPTERS.bazi as readonly string[]).includes(key);
  const part = (g: string) => body.parts[g] as Record<string, unknown> | undefined;
  const pending = () => (
    <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{w(finished ? REPORT_UI.failedChapter : REPORT_UI.writingChapter)}</p>
  );
  const title = r.kind === "year"
    ? years.map((y) => `${y} ${f.years.find((x) => x.year === y)?.gz ?? ""}`).join(" · ")
    : `${f.dayMaster}${f.dmEl}${w("日主")}${f.geju ? ` · ${c(f.geju)}` : ""}`;

  // 10-22 进度表 87 (设计稿第 5 節): the report on the result template — head, the pillars as the answer, the chapters,
  // the revisit, the next step (进度表 86 承接地圖); on a phone the bottom button goes to the revisit once paid (R10)
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<>
      {book ? <span><Link href={`/${locale}/nianshu/r/${book}`} className="hover:text-[var(--ink)] transition-colors">← {w(NS_UI.backToBook)}</Link></span> : (
        <span><Link href={`/${locale}/bazi/chart`} className="hover:text-[var(--ink)] transition-colors">← {w(REPORT_UI.back)}</Link></span>
      )}
      </>}
      head={{ label: w(REPORT_UI.kindLabel[r.kind]), question: title, meta: w(r.kind === "year" && f.book ? REPORT_UI.kindSubBook : REPORT_UI.kindSub[r.kind]) }}
      answer={
        // 10-22 (Neil: 八字那里还有点问题): the eight characters are the answer of this page — they were set in the 10.5px
        // section-label style, smaller and fainter than the 十神 under them; now each pillar is a card, 干 over 支 in the
        // chart page's element colours, the label and 十神 small around them
        <div className="mt-[var(--s-4)] grid grid-cols-4 gap-2 max-w-[24rem]" aria-label={w(REPORT_UI.pillarsHead)}>
          {f.pillars.map((p) => (
            <div key={p.label} className="text-center rounded-[6px] border border-[var(--ink-16)] px-1 py-[var(--s-3)]">
              <p className="t-small !text-[var(--ink-45)]">{w(c(p.label))}</p>
              <p className="mt-1 text-[28px] leading-[1.2] font-medium" style={{ color: elColor(p.gz[0]) }}>{p.gz[0]}</p>
              <p className="text-[28px] leading-[1.2] font-medium" style={{ color: elColor(p.gz[1]) }}>{p.gz[1]}</p>
              <p className="t-small mt-1 !text-[var(--ink-66)]">{c(p.ten)}</p>
            </div>
          ))}
        </div>
      }
      pay={!r.paid_at ? (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
          <h2 className="t-sect mb-[var(--s-2)]">{w(REPORT_UI.unpaidHead)}</h2>
          <p className="t-body">{w(REPORT_UI.unpaidBody)}</p>
        </section>
      ) : undefined}
      free={<>
      {r.paid_at && !finished && (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-4)]">
          <p className="t-body">{w(REPORT_UI.writing)}</p>
          <AutoRefresh every={6000} max={40} />
        </section>
      )}

      {r.paid_at && r.kind === "deep" && DEEP_CHAPTERS.map((ch, i) => {
        const p = part(deepGroupOf(ch.key));
        const v = p?.[ch.key];
        const gate = isFlow(ch.key) ? flow?.mode ?? "open" : "open";
        return (
          <section key={ch.key} id={ch.key} className="mt-[var(--s-6)] scroll-mt-20">
            <p className="t-label !text-[var(--ink-45)]">{String(i + 1).padStart(2, "0")}</p>
            <h2 className="t-sect mt-1">{w(ch.title)}</h2>
            {gate === "dated" && flow?.month && <FlowDated locale={locale} month={flow.month} />}
            {gate === "locked" ? (
              <FlowLocked locale={locale} text={!p ? null : teaser(ch.key === "dayun" ? ((v as { text: string }[] | undefined)?.[0]?.text ?? "") : String(v ?? ""))} />
            )
            : !p ? pending()
              : ch.key === "dayun" ? (
                <div className="mt-[var(--s-3)]">
                  {(v as { gz: string; text: string }[]).map((d) => {
                    const dec = f.decades.find((x) => x.gz === d.gz);
                    return (
                      <div key={d.gz} className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-[var(--ink-16)]">
                        <h3 className="t-body font-medium">{d.gz}{dec ? ` · ${c(dec.ten)} · ${dec.startAge}–${dec.endAge}${w("歲")} · ${dec.startYear}–${dec.startYear + 9}` : ""}</h3>
                        <p className="t-body mt-1 leading-relaxed">{d.text}</p>
                      </div>
                    );
                  })}
                </div>
              )
              : ch.key === "xingdong" ? (
                <ol className="mt-[var(--s-3)] list-decimal pl-5 space-y-[var(--s-2)]">
                  {(v as string[]).map((x, k) => <li key={k} className="t-body leading-relaxed">{x}</li>)}
                </ol>
              )
              : <p className="t-body mt-[var(--s-3)] leading-relaxed whitespace-pre-line">{String(v ?? "")}</p>}
          </section>
        );
      })}

      {r.paid_at && r.kind === "love" && f.zhengyuan && (() => {
        const a = part("A") as { intro?: string; traits?: Record<string, string> } | undefined;
        const b = part("B") as { tips?: string[]; self?: string } | undefined;
        // 10-19 配圖: the picture of this type (ink and wash, no face); drawn once, a placeholder until then
        const drawn = hasPortrait(token);
        if (!drawn) void ensurePortrait(token).catch(() => false);
        return (
          <>
            <figure className="mt-[var(--s-6)]">
              {drawn
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/bazi/portrait/${token}?v=3`} alt={w("正緣畫像")} className="w-full max-w-[26rem] mx-auto rounded-[4px] border border-[var(--ink-16)]" />
                : <div className="w-full max-w-[26rem] mx-auto aspect-[3/4] rounded-[4px] border border-dashed border-[var(--ink-16)] grid place-items-center t-small !text-[var(--ink-45)]">{w("畫像正在畫，稍等一下就會出現")}{finished && <AutoRefresh every={8000} max={12} />}</div>}
              <figcaption className="t-small mt-2 text-center !text-[var(--ink-45)]">{w("依你命盤裡的配偶星與夫妻宮畫出的氣質類型，不是某一個真實的人。")}</figcaption>
            </figure>
            <section className="mt-[var(--s-6)]">
              <h2 className="t-sect">{w(REPORT_UI.loveIntro)}</h2>
              {a?.intro ? <p className="t-body mt-[var(--s-3)] leading-relaxed">{a.intro}</p> : pending()}
            </section>
            {LOVE_SECTIONS.map((sct) => {
              const trait = f.zhengyuan!.traits.find((t) => t.key === sct.key);
              if (!trait) return null;
              return (
                <section key={sct.key} className="mt-[var(--s-5)] pt-[var(--s-4)] border-t border-[var(--ink-16)]">
                  <h3 className="t-sect">{w(sct.title)}</h3>
                  <p className="mt-[var(--s-2)] flex flex-wrap gap-2" aria-label={w(REPORT_UI.loveBasis)}>
                    {basisChips(trait.basis).map((chip) => (
                      <span key={chip} className="t-small rounded-[2px] border border-[var(--gold)] px-2 py-[1px] !text-[var(--gold-text)]">{c(chip)}</span>
                    ))}
                  </p>
                  {a?.traits?.[sct.key] ? <p className="t-body mt-[var(--s-3)] leading-relaxed">{a.traits[sct.key]}</p> : pending()}
                </section>
              );
            })}
            <section className="mt-[var(--s-6)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-4)]">
              <h2 className="t-sect !text-[var(--gold-text)]">{w(REPORT_UI.loveTips)}</h2>
              {b?.tips ? <ul className="mt-[var(--s-3)] list-disc pl-5 space-y-[var(--s-2)]">{b.tips.map((t, k) => <li key={k} className="t-body leading-relaxed">{t}</li>)}</ul> : pending()}
              {b?.self && (<><h3 className="t-sect mt-[var(--s-4)]">{w(REPORT_UI.loveSelf)}</h3><p className="t-body mt-[var(--s-2)] leading-relaxed">{b.self}</p></>)}
            </section>
            <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{w(REPORT_UI.loveNote)}</p>
          </>
        );
      })()}

      {r.paid_at && r.kind === "year" && f.book && (
        <BookView b={f.book} months={f.months?.[String(f.book.year)] ?? []} parts={body.parts} w={w} c={c} pending={pending} locale={locale} question={r.question ?? null} token={token} book={book} />
      )}

      {r.paid_at && r.kind === "year" && !f.book && years.map((y) => {
        const p = part(`y${y}`) as { overview?: string; months?: string[]; areas?: Record<string, string>; three?: string[] } | undefined;
        const yf = f.years.find((x) => x.year === y);
        const months: MonthPoint[] = f.months?.[String(y)] ?? [];
        return (
          <section key={y} id={`y${y}`} className="mt-[var(--s-7,3rem)] scroll-mt-20">
            <h2 className="t-d3">{y} {yf?.gz}{yf ? ` · ${c(yf.stemTen)}` : ""}</h2>
            <h3 className="t-sect mt-[var(--s-4)]">{w(REPORT_UI.yearOverview)}</h3>
            {p?.overview ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{p.overview}</p> : pending()}

            <h3 className="t-sect mt-[var(--s-5)]">{w(REPORT_UI.yearCurve)}</h3>
            <MonthBars months={months} label={(m) => `${solar}${m.start}${w(REPORT_UI.monthFrom)} ${m.gz} · ${w(REPORT_UI.levelWord[m.level]!)}`} />

            <h3 className="t-sect mt-[var(--s-5)]">{w(REPORT_UI.yearMonths)}</h3>
            <ol className="mt-[var(--s-2)]">
              {months.map((m, k) => (
                <li key={m.i} className="mt-[var(--s-3)] pt-[var(--s-3)] border-t border-[var(--ink-16)]">
                  <p className="t-body font-medium">{solar}{m.start}{w(REPORT_UI.monthFrom)} · {m.gz} · <span className="!text-[var(--gold-text)]">{"●".repeat(m.level)}{"○".repeat(5 - m.level)}</span> {w(REPORT_UI.levelWord[m.level]!)}</p>
                  <p className="t-small mt-1 !text-[var(--ink-66)]">{m.tags.map(c).join(" · ")}</p>
                  {p?.months?.[k] && <p className="t-body mt-1 leading-relaxed">{p.months[k]}</p>}
                </li>
              ))}
            </ol>

            {p?.areas && YEAR_AREAS.map((a) => (
              <div key={a.key} className="mt-[var(--s-5)]">
                <h3 className="t-sect">{w(a.title)}</h3>
                <p className="t-body mt-[var(--s-2)] leading-relaxed">{p.areas![a.key]}</p>
              </div>
            ))}
            {p?.three && (
              <div className="mt-[var(--s-5)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-4)]">
                <h3 className="t-sect !text-[var(--gold-text)]">{w(REPORT_UI.yearThree)}</h3>
                <ol className="mt-[var(--s-2)] list-decimal pl-5 space-y-[var(--s-2)]">{p.three.map((t, k) => <li key={k} className="t-body leading-relaxed">{t}</li>)}</ol>
              </div>
            )}
          </section>
        );
      })}
      </>}
      revisit={r.paid_at && r.kind === "deep" ? (
        <SelfRevisitSet kind="bazi" token={token} locale={locale as Locale} hasEmail={!!(viewerEmail ?? r.email)} options={selfChoices("bazi", locale)} ui={selfRevisitUi(locale)} />
      ) : undefined}
      cross={<CrossCards source={book ? "nianshu" : "bazi"} locale={locale as Locale} exclude={[book ? "nianshu" : "bazi"]} />}
      sticky={r.paid_at && r.kind === "deep" ? (
        <a href="#revisit" data-heat="bazi-sticky-revisit" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.14em]">{w("設定回訪")}</a>
      ) : undefined}
    />
  );
}

/** a 干 or 支 in the colour of its element — the same five colours as the chart page (components/mingli/BaziPro) */
const EL_OF: Record<string, string> = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水",
  寅: "木", 卯: "木", 巳: "火", 午: "火", 辰: "土", 戌: "土", 丑: "土", 未: "土", 申: "金", 酉: "金", 亥: "水", 子: "水",
};
const EL_HEX: Record<string, string> = { 木: "#4f7d43", 火: "#b5452f", 土: "#9a7240", 金: "#a3832b", 水: "#3a6ea5" };
const elColor = (ch: string | undefined) => (ch && EL_OF[ch] ? EL_HEX[EL_OF[ch]!] : undefined);

type Part = Record<string, unknown> | undefined;
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

/**
 * 10-19 年書: one year in eight chapters. The fixed-rule facts (book) are shown as they are — chips, dots, the curve —
 * and each chapter's text appears as soon as its writing call is stored (ov · m1 · m2 · ar · gx · qa).
 */
/** 10-19 (Neil: 日期是農曆的話一定要標注清楚): every date in a report is 國曆 (公历) — said on each label */
const solarOf = (locale: string) => (locale === "zh" ? "公历 " : "國曆 ");

function BookView({ b, months, parts, w, c, pending, locale, question, token, book }: {
  b: YearBook; months: MonthPoint[]; parts: ReportBody["parts"]; w: (s: string) => string; c: (s: string) => string;
  pending: () => ReactNode; locale: string; question: string | null; token: string; book: string | null;
}) {
  const solar = solarOf(locale);
  const ov = parts.ov as Part as { keyword?: string; verdict?: string; keyMonths?: Record<string, string> } | undefined;
  type MonthsPart = { months?: { read: string; focus?: Record<string, string>; yi: string[]; ji: string[] }[] } | undefined;
  const mp = (g: string) => parts[g] as Part as MonthsPart;
  // 10-19 v2 writes months three at a time (m1–m4); the first 年書 wrote six at a time (m1–m2)
  const six = (mp("m1")?.months?.length ?? 0) > 3 || (mp("m2")?.months?.length ?? 0) > 3;
  const ar = (parts.ar || parts.ar2 ? { ...(parts.ar as object), ...(parts.ar2 as object) } : undefined) as { love?: { single?: string; paired?: string } } & Record<string, unknown> | undefined;
  const gx = parts.gx as Part as { allies?: string; guards?: string[]; quarters?: Record<string, string[]> } | undefined;
  const qa = parts.qa as Part as { answer?: string } | undefined;
  const prevAsked = ((parts.qaPrev as Part as { list?: { question: string; answer: string }[] } | undefined)?.list ?? []);
  const monthText = (i: number) => (six ? mp(i < 6 ? "m1" : "m2")?.months?.[i % 6] : mp(`m${Math.floor(i / 3) + 1}`)?.months?.[i % 3]);
  const keyOf: Record<number, string> = { [b.key.smooth]: REPORT_UI.keySmooth, [b.key.slow]: REPORT_UI.keySlow, [b.key.pivot]: REPORT_UI.keyPivot };
  const mLabel = (i: number) => (months[i] ? `${solar}${months[i]!.start}${w(REPORT_UI.monthFrom)}` : "");
  const row = (label: string, body: ReactNode) => (
    <div className="flex gap-3 py-[var(--s-2)] border-t border-[var(--ink-16)] first:border-t-0">
      <dt className="t-small shrink-0 w-[5.5rem] !text-[var(--ink-45)]">{w(label)}</dt>
      <dd className="flex flex-wrap gap-2 min-w-0">{body}</dd>
    </div>
  );
  const natalRels = b.natal.filter((p) => p.rels.length);
  return (
    <>
      <h2 className="t-d3 mt-[var(--s-6)]">{b.year} {b.gz} · {c(b.stemTen)}</h2>

      <Chapter n={1} id="verdict" title={w(REPORT_UI.bookVerdict)}>
        {ov?.keyword && (
          <p className="mt-[var(--s-3)]"><span className="t-label !text-[var(--gold-text)]">{w(REPORT_UI.bookKeyword)}</span> <span className="t-d3 ml-2">{ov.keyword}</span></p>
        )}
        <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
          {row(REPORT_UI.bookTenLine, <span className="t-small">{b.gz[0]} {c(b.stemTen)} · {b.gz[1]} {c(b.branchTen)}</span>)}
          {row(REPORT_UI.bookRole, <>
            <Chip tone={b.roles.stem === "喜用" ? "gold" : "ink"}>{b.gz[0]}{b.stemEl} · {c(b.roles.stem)}</Chip>
            <Chip tone={b.roles.branch === "喜用" ? "gold" : "ink"}>{b.gz[1]}{b.branchEl} · {c(b.roles.branch)}</Chip>
          </>)}
          {b.decade && row(REPORT_UI.bookDecade, <>
            <span className="t-small">{b.decade.gz} · {c(b.decade.ten)}</span>
            {b.decade.rels.length ? b.decade.rels.map((x) => <Chip key={x}>{c(x)}</Chip>) : <span className="t-small !text-[var(--ink-45)]">{w(REPORT_UI.bookNoRel)}</span>}
          </>)}
          {row(REPORT_UI.bookNatal, natalRels.length
            ? natalRels.flatMap((p) => p.rels.map((x) => <Chip key={p.label + x}>{c(p.label)} {p.gz} · {c(x)}</Chip>))
            : <span className="t-small !text-[var(--ink-45)]">{w(REPORT_UI.bookNoRel)}</span>)}
          {b.taisui.length > 0 && row(REPORT_UI.bookTaisui, b.taisui.map((x) => <Chip key={x}>{c(x)}</Chip>))}
        </dl>
        {ov?.verdict ? <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{ov.verdict}</p> : pending()}

        <h3 className="t-sect mt-[var(--s-5)]">{w(REPORT_UI.yearCurve)}</h3>
        <MonthBars months={months} mark={[b.key.smooth, b.key.slow, b.key.pivot]} label={(m) => `${solar}${m.start}${w(REPORT_UI.monthFrom)} ${m.gz} · ${w(REPORT_UI.levelWord[m.level]!)}`} />
      </Chapter>

      <Chapter n={2} id="key" title={w(REPORT_UI.bookKeyMonths)}>
        <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-3">
          {([["smooth", REPORT_UI.keySmooth], ["slow", REPORT_UI.keySlow], ["pivot", REPORT_UI.keyPivot]] as const).map(([k, label]) => {
            const i = b.key[k], m = months[i];
            return (
              <div key={k} className={`rounded-[6px] border p-4 ${k === "pivot" ? "border-[var(--gold)] bg-[var(--gold)]/[0.07]" : "border-[var(--ink-16)]"}`}>
                <p className="t-label !text-[var(--gold-text)]">{w(label)}</p>
                {m && <p className="t-body mt-1 font-medium">{solar}{m.start}{w(REPORT_UI.monthFrom)} · {m.gz}</p>}
                {m && <p className="t-small mt-1">{dots(m.level)} <span className="!text-[var(--ink-66)]">{w(REPORT_UI.levelWord[m.level]!)}</span></p>}
                {ov?.keyMonths?.[k] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{ov.keyMonths[k]}</p> : pending()}
              </div>
            );
          })}
        </div>
      </Chapter>

      <Chapter n={3} id="months" title={w(REPORT_UI.bookMonths)}>
        <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{locale === "zh" ? "八字的月份按节气划分，以下日期都是公历（阳历），不是农历月份。" : "八字的月份按節氣劃分，以下日期都是國曆（陽曆），不是農曆月份。"}</p>
        <ol className="mt-[var(--s-3)] space-y-3">
          {months.map((m, i) => {
            const t = monthText(i), key = keyOf[i];
            return (
              <li key={m.i} id={`m${i + 1}`} className={`rounded-[6px] border p-4 ${key ? "border-[var(--gold)]" : "border-[var(--ink-16)]"}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="t-body font-medium">{solar}{m.start}{w(REPORT_UI.monthFrom)} · {c(m.term)} · {m.gz}</p>
                  <p className="t-small">{dots(m.level)} <span className="!text-[var(--ink-66)]">{w(REPORT_UI.levelWord[m.level]!)}</span></p>
                  {key && <Chip tone="gold">{w(key)}</Chip>}
                </div>
                {(b.flags[i]?.length ?? 0) > 0 && <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">{b.flags[i]!.map((x) => <Chip key={x}>{c(x)}</Chip>)}</p>}
                <p className="t-small mt-1 !text-[var(--ink-45)]">{m.tags.map(c).join(" · ")}</p>
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
                      <div>
                        <p className="t-label !text-[var(--gold-text)]">{w(REPORT_UI.monthYi)}</p>
                        <ul className="mt-1 space-y-1">{t.yi.map((x, k) => <li key={k} className="t-small">· {x}</li>)}</ul>
                      </div>
                      <div>
                        <p className="t-label !text-[var(--ink-66)]">{w(REPORT_UI.monthJi)}</p>
                        <ul className="mt-1 space-y-1">{t.ji.map((x, k) => <li key={k} className="t-small !text-[var(--ink-66)]">· {x}</li>)}</ul>
                      </div>
                    </div>
                  </>
                ) : pending()}
              </li>
            );
          })}
        </ol>
      </Chapter>

      <Chapter n={4} id="areas" title={w(REPORT_UI.bookAreas)}>
        {!ar ? pending() : BOOK_AREAS.map((a) => (
          <div key={a.key} className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-[var(--ink-16)] first:border-t-0">
            <h3 className="t-body font-medium">{w(a.title)}</h3>
            {a.key === "love" ? (
              <>
                <p className="t-label mt-[var(--s-2)] !text-[var(--gold-text)]">{w(REPORT_UI.areaSingle)}</p>
                <p className="t-body mt-1 leading-relaxed">{ar.love?.single}</p>
                <p className="t-label mt-[var(--s-3)] !text-[var(--gold-text)]">{w(REPORT_UI.areaPaired)}</p>
                <p className="t-body mt-1 leading-relaxed">{ar.love?.paired}</p>
              </>
            ) : <p className="t-body mt-[var(--s-2)] leading-relaxed">{String(ar[a.key] ?? "")}</p>}
          </div>
        ))}
      </Chapter>

      <Chapter n={5} id="allies" title={w(REPORT_UI.bookAllies)}>
        <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
          {row(REPORT_UI.alliesNoble, b.noble.branches.map((x, k) => <Chip key={x} tone="gold">{x} {c(b.noble.zodiac[k]!)}</Chip>))}
          {row(REPORT_UI.alliesEasy, [...b.allies.liuhe, ...b.allies.sanhe].map((x) => <Chip key={x}>{c(x)}</Chip>))}
          {b.daily.length > 0 && row(REPORT_UI.alliesColour, b.daily.flatMap((d) => d.colours).map((x) => <Chip key={x}>{c(x)}</Chip>))}
          {b.daily.length > 0 && row(REPORT_UI.alliesDirection, b.daily.map((d) => <Chip key={d.el}>{c(d.direction)}</Chip>))}
          {b.daily.length > 0 && row(REPORT_UI.alliesNumber, b.daily.flatMap((d) => d.numbers).map((x) => <Chip key={x}>{x}</Chip>))}
        </dl>
        {gx?.allies ? <p className="t-body mt-[var(--s-4)] leading-relaxed">{gx.allies}</p> : pending()}
        {b.daily.length > 0 && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{w(REPORT_UI.alliesNote)}</p>}
      </Chapter>

      <Chapter n={6} id="guards" title={w(REPORT_UI.bookGuards)}>
        <ul className="mt-[var(--s-3)] space-y-3">
          {b.guards.map((g, k) => (
            <li key={k} className="rounded-[2px] border-l-2 border-[var(--ink-45)] pl-[var(--s-4)] py-1">
              <p className="t-body font-medium">{Array.from({ length: g.to - g.from + 1 }, (_, n) => mLabel(g.from + n)).join("、")}</p>
              {g.why.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5">{g.why.map((x) => <Chip key={x}>{c(x)}</Chip>)}</p>}
              {gx?.guards?.[k] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{gx.guards[k]}</p> : pending()}
            </li>
          ))}
        </ul>
      </Chapter>

      <Chapter n={7} id="quarters" title={w(REPORT_UI.bookQuarters)}>
        <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((q) => {
            const ms = quarterMonths(q);
            const list = gx?.quarters?.[`q${q + 1}`];
            return (
              <div key={q} className="rounded-[6px] border border-[var(--ink-16)] p-4">
                <p className="t-body font-medium">{w(REPORT_UI.quarter[q + 1]!)} <span className="t-small !text-[var(--ink-45)]">{mLabel(ms[0]!)}</span></p>
                <p className="t-small mt-1">{ms.map((i) => <span key={i} className="mr-2">{months[i]?.gz} {months[i] ? dots(months[i]!.level) : null}</span>)}</p>
                {list ? (
                  <ul className="mt-[var(--s-2)] space-y-2">
                    {list.map((x, k) => (
                      <li key={k} className="t-body flex gap-2 leading-relaxed"><span aria-hidden className="mt-[0.35em] h-[0.9em] w-[0.9em] shrink-0 rounded-[2px] border border-[var(--ink-45)]" />{x}</li>
                    ))}
                  </ul>
                ) : pending()}
              </div>
            );
          })}
        </div>
      </Chapter>

      {!book && (
        <Chapter n={8} id="question" title={w(REPORT_UI.bookQuestion)}>
          {question && <blockquote className="mt-[var(--s-3)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-3)]">
            <p className="t-small !text-[var(--gold-text)]">{w(REPORT_UI.questionYou)}</p>
            <p className="t-body mt-1">{question}</p>
          </blockquote>}
          {!question ? null : qa?.answer ? (
            <>
              <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{qa.answer}</p>
              <Link href={`/${locale}/cast?q=${encodeURIComponent([...question].slice(0, 100).join(""))}&c=bazi`} className="inline-block mt-[var(--s-4)] t-body border border-[var(--ink)] rounded-full px-5 py-2.5 hover:bg-[var(--ink)] hover:!text-[var(--paper)] transition-colors">{w(REPORT_UI.questionCast)}</Link>
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
          <ReaskForm token={token} hans={locale === "zh"} />
        </Chapter>
      )}
    </>
  );
}

/** twelve bars, one per 流月, height by level (1–5); gold from level 4; `mark` puts a small ring over the key months */
function MonthBars({ months, label, mark = [] }: { months: MonthPoint[]; label: (m: MonthPoint) => string; mark?: number[] }) {
  if (!months.length) return null;
  const W = 30, H = 100;
  return (
    <svg viewBox={`0 ${mark.length ? -12 : 0} ${months.length * W} ${H + 22 + (mark.length ? 12 : 0)}`} className="mt-[var(--s-3)] w-full h-auto" role="img">
      {[1, 2, 3, 4, 5].map((l) => <line key={l} x1={0} x2={months.length * W} y1={H - l * 20} y2={H - l * 20} style={{ stroke: "var(--ink-16)" }} strokeWidth={0.5} />)}
      {months.map((m, i) => (
        <g key={m.i}>
          <title>{label(m)}</title>
          <rect x={i * W + 7} y={H - m.level * 20} width={W - 14} height={m.level * 20} rx={2} style={{ fill: m.level >= 4 ? "var(--gold)" : m.level === 3 ? "var(--ink-45)" : "var(--ink-16)" }} />
          {mark.includes(i) && <circle cx={i * W + W / 2} cy={H - m.level * 20 - 6} r={3} style={{ fill: "none", stroke: "var(--gold-text)" }} strokeWidth={1.2} />}
          <text x={i * W + W / 2} y={H + 15} textAnchor="middle" fontSize={9} style={{ fill: "var(--ink-66)" }}>{m.start.split("/")[0]}</text>
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ 10-30 进度表 128 ④: a page in another language */

/** the eight characters as the answer of a foreign report page: the chart's glyphs, their reading, the Ten God under them */
function PillarsIn({ f, locale, label }: { f: ReturnType<typeof factsOf>; locale: Foreign; label: string }) {
  const F = bzName(locale), N = F.N;
  const reading = (c: string) => (stemIndex(c) >= 0 ? N.stemKana?.[stemIndex(c)] ?? F.stem(c) : N.branchKana?.[branchIndex(c)] ?? F.branch(c));
  return (
    <div className="mt-[var(--s-4)] grid grid-cols-4 gap-2 max-w-[26rem]" aria-label={label}>
      {f.pillars.map((p, i) => (
        <div key={i} className="text-center rounded-[6px] border border-[var(--ink-16)] px-1 py-[var(--s-3)]">
          <p className="t-small !text-[var(--ink-45)] leading-tight">{N.pillars[i]}</p>
          <p className="mt-1 text-[28px] leading-[1.2] font-medium" lang="zh-Hant" style={{ color: elColor(p.gz[0]) }}>{p.gz[0]}</p>
          <p className="text-[28px] leading-[1.2] font-medium" lang="zh-Hant" style={{ color: elColor(p.gz[1]) }}>{p.gz[1]}</p>
          <p className="text-[11px] mt-1 !text-[var(--ink-66)]">{locale === "ja" ? `${reading(p.gz[0]!)}・${reading(p.gz[1]!)}` : F.gz(p.gz)}</p>
          <p className="t-small mt-1 !text-[var(--ink-66)] leading-tight">{F.ten(p.ten)}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * 10-30 进度表 128 ④-5: the 年書's 八字篇 on a page in another language — the Chinese BookView's chapters (the question
 * belongs to the 年書), every fact named in that language (lib/mingli/bazi/book-foreign.ts), every label from the report
 * page's words (page-ui.ts REPORT.book); the 太歲 row is a Chinese custom and is not shown.
 */
function ForeignYear({ locale, r, f, b, body, finished, book }: {
  locale: Foreign; r: NonNullable<ReturnType<typeof baziReport>>; f: ReturnType<typeof factsOf>; b: YearBook; body: ReportBody; finished: boolean; book: string | null;
}) {
  const W = bzBookWords(locale), F = W.F, N = F.N, t = W.t, rt = baziReportText(locale);
  const paid = !!r.paid_at;
  const months: MonthPoint[] = f.months?.[String(b.year)] ?? [];
  const parts = body.parts;
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{finished ? rt.failedChapter : rt.writingChapter}</p>;
  const ov = parts.ov as { keyword?: string; verdict?: string; keyMonths?: Record<string, string> } | undefined;
  type MonthText = { read: string; focus?: Record<string, string>; yi: string[]; ji: string[] };
  const monthText = (i: number) => (parts[`m${Math.floor(i / 3) + 1}`] as { months?: MonthText[] } | undefined)?.months?.[i % 3];
  const ar = (parts.ar || parts.ar2 ? { ...(parts.ar as object), ...(parts.ar2 as object) } : undefined) as ({ love?: { single?: string; paired?: string } } & Record<string, unknown>) | undefined;
  const gx = parts.gx as { allies?: string; guards?: string[]; quarters?: Record<string, string[]> } | undefined;
  const keyOf: Record<number, string> = { [b.key.smooth]: t.keySmooth, [b.key.slow]: t.keySlow, [b.key.pivot]: t.keyPivot };
  const from = (i: number) => (months[i] ? W.from(months[i]!, b.year) : "");
  const row = (label: string, el: ReactNode) => (
    <div className="flex gap-3 py-[var(--s-2)] border-t border-[var(--ink-16)] first:border-t-0">
      <dt className="t-small shrink-0 w-[6.5rem] !text-[var(--ink-45)]">{label}</dt>
      <dd className="flex flex-wrap gap-2 min-w-0">{el}</dd>
    </div>
  );
  const natalRels = b.natal.map((p, i) => ({ ...p, i })).filter((p) => p.rels.length);
  const ns = book ? nsForeignText(locale).ui : null;
  const focusKeys = ["work", "money", "love", "rest"] as const;
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<span><Link href={book ? `/${locale}/nianshu/r/${book}` : `/${locale}/bazi/chart`} className="hover:text-[var(--ink)] transition-colors">← {ns ? ns.backToBook : rt.back}</Link></span>}
      head={{ label: t.kindLabel, question: fmt(t.title, { y: b.year, gz: F.gz(b.gz), t: F.ten(b.stemTen) }), meta: t.kindSub }}
      answer={<PillarsIn f={f} locale={locale} label={rt.pillarsHead} />}
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
            <Chapter n={1} id="verdict" title={t.verdict}>
              {ov?.keyword && <p className="mt-[var(--s-3)]"><span className="t-label !text-[var(--gold-text)]">{t.keyword}</span> <span className="t-d3 ml-2">{ov.keyword}</span></p>}
              <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
                {row(t.tenLine, <span className="t-small">{F.stem(b.gz[0]!)} {F.ten(b.stemTen)} · {F.branch(b.gz[1]!)} {F.ten(b.branchTen)}</span>)}
                {row(t.role, <>
                  <Chip tone={b.roles.stem === "喜用" ? "gold" : "ink"}>{F.stem(b.gz[0]!)}{F.paren(F.elOf(b.stemEl))} · {W.role(b.roles.stem)}</Chip>
                  <Chip tone={b.roles.branch === "喜用" ? "gold" : "ink"}>{F.branch(b.gz[1]!)}{F.paren(F.elOf(b.branchEl))} · {W.role(b.roles.branch)}</Chip>
                </>)}
                {b.decade && row(t.decade, <>
                  <span className="t-small">{F.gz(b.decade.gz)} · {F.ten(b.decade.ten)}</span>
                  {b.decade.rels.length ? b.decade.rels.map((x) => <Chip key={x}>{W.rel(x, b.gz, b.decade!.gz)}</Chip>) : <span className="t-small !text-[var(--ink-45)]">{t.noRel}</span>}
                </>)}
                {row(t.natal, natalRels.length
                  ? natalRels.flatMap((p) => p.rels.map((x) => <Chip key={p.i + x}>{N.pillars[p.i]} {F.gz(p.gz)} · {W.rel(x, b.gz, p.gz)}</Chip>))
                  : <span className="t-small !text-[var(--ink-45)]">{t.noRel}</span>)}
              </dl>
              {ov?.verdict ? <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{ov.verdict}</p> : pending()}
              <h3 className="t-sect mt-[var(--s-5)]">{t.curve}</h3>
              <MonthBars months={months} mark={[b.key.smooth, b.key.slow, b.key.pivot]} label={(m) => `${W.from(m, b.year)} ${F.gz(m.gz)} · ${W.level(m.level)}`} />
            </Chapter>

            <Chapter n={2} id="key" title={t.keyMonths}>
              <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-3">
                {([["smooth", t.keySmooth], ["slow", t.keySlow], ["pivot", t.keyPivot]] as const).map(([k, label]) => {
                  const i = b.key[k], m = months[i];
                  return (
                    <div key={k} className={`rounded-[6px] border p-4 ${k === "pivot" ? "border-[var(--gold)] bg-[var(--gold)]/[0.07]" : "border-[var(--ink-16)]"}`}>
                      <p className="t-label !text-[var(--gold-text)]">{label}</p>
                      {m && <p className="t-body mt-1 font-medium">{from(i)} · {F.gz(m.gz)}</p>}
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
                    <li key={m.i} id={`m${i + 1}`} className={`rounded-[6px] border p-4 ${key ? "border-[var(--gold)]" : "border-[var(--ink-16)]"}`}>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="t-body font-medium">{from(i)} · {F.jie(m.term)} · {F.gz(m.gz)}</p>
                        <p className="t-small">{dots(m.level)} <span className="!text-[var(--ink-66)]">{W.level(m.level)}</span></p>
                        {key && <Chip tone="gold">{key}</Chip>}
                      </div>
                      {(b.flags[i]?.length ?? 0) > 0 && <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">{b.flags[i]!.map((y) => <Chip key={y}>{W.flag(y)}</Chip>)}</p>}
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
              {!ar ? pending() : BOOK_AREAS.map((a) => (
                <div key={a.key} className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-[var(--ink-16)] first:border-t-0">
                  <h3 className="t-body font-medium">{t.area[a.key]}</h3>
                  {a.key === "love" ? (
                    <>
                      <p className="t-label mt-[var(--s-2)] !text-[var(--gold-text)]">{t.single}</p>
                      <p className="t-body mt-1 leading-relaxed">{ar.love?.single}</p>
                      <p className="t-label mt-[var(--s-3)] !text-[var(--gold-text)]">{t.paired}</p>
                      <p className="t-body mt-1 leading-relaxed">{ar.love?.paired}</p>
                    </>
                  ) : ar[a.key] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{String(ar[a.key])}</p> : pending()}
                </div>
              ))}
            </Chapter>

            <Chapter n={5} id="allies" title={t.allies}>
              <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
                {row(t.noble, b.noble.branches.map((x, k) => <Chip key={x} tone="gold">{F.branch(x)} · {W.animal(b.noble.zodiac[k]!)}</Chip>))}
                {row(t.easy, [...b.allies.liuhe, ...b.allies.sanhe].map((x) => <Chip key={x}>{W.animal(x)}</Chip>))}
                {b.daily.length > 0 && row(t.colour, b.daily.flatMap((d) => d.colours).map((x) => <Chip key={x}>{W.colour(x)}</Chip>))}
                {b.daily.length > 0 && row(t.direction, b.daily.map((d) => <Chip key={d.el}>{W.dir(d.direction)}</Chip>))}
                {b.daily.length > 0 && row(t.number, b.daily.flatMap((d) => d.numbers).map((x) => <Chip key={x}>{x}</Chip>))}
              </dl>
              {gx?.allies ? <p className="t-body mt-[var(--s-4)] leading-relaxed">{gx.allies}</p> : pending()}
              {b.daily.length > 0 && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{t.alliesNote}</p>}
            </Chapter>

            <Chapter n={6} id="guards" title={t.guards}>
              <ul className="mt-[var(--s-3)] space-y-3">
                {b.guards.map((g, k) => (
                  <li key={k} className="rounded-[2px] border-l-2 border-[var(--ink-45)] pl-[var(--s-4)] py-1">
                    <p className="t-body font-medium">{Array.from({ length: g.to - g.from + 1 }, (_, n) => from(g.from + n)).join(F.list)}</p>
                    {g.why.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5">{g.why.map((y) => <Chip key={y}>{W.why(y)}</Chip>)}</p>}
                    {gx?.guards?.[k] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{gx.guards[k]}</p> : pending()}
                  </li>
                ))}
              </ul>
            </Chapter>

            <Chapter n={7} id="quarters" title={t.quarters}>
              <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((q) => {
                  const ms = quarterMonths(q);
                  const list = gx?.quarters?.[`q${q + 1}`];
                  return (
                    <div key={q} className="rounded-[6px] border border-[var(--ink-16)] p-4">
                      <p className="t-body font-medium">{(t.quarter as unknown as Record<string, string>)[String(q + 1)]} <span className="t-small !text-[var(--ink-45)]">{from(ms[0]!)}</span></p>
                      <p className="t-small mt-1">{ms.map((i) => <span key={i} className="mr-2">{months[i] ? F.gz(months[i]!.gz) : ""} {months[i] ? dots(months[i]!.level) : null}</span>)}</p>
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
      cross={<CrossCards source={book ? "nianshu" : "bazi"} locale={locale as Locale} exclude={[book ? "nianshu" : "bazi"]} />}
    />
  );
}

/** the first words of a locked chapter: Japanese and Korean as the Chinese teaser; Latin text cut at a word */
function teaseIn(text: string, l: Foreign): string {
  if (l === "ja" || l === "ko") return teaser(text);
  const x = text.replace(/\s+/g, " ").trim();
  if (x.length <= 120) return x;
  const cut = x.slice(0, 120), sp = cut.lastIndexOf(" ");
  return `${sp > 60 ? cut.slice(0, sp) : cut}…`;
}

/**
 * The deep report and the 正緣畫像 on a page in one of the seven other languages: the same template, chapters, facts and
 * gates as the Chinese page; every word from the report page's words (lib/mingli/bazi/page-ui.ts REPORT) and the names
 * (names.ts); the eight characters stay as the chart's glyphs with their reading under them; the chapters themselves were
 * written in that language (report-foreign.ts).
 */
function ForeignReport({ locale, token, r, f, body, finished, viewerEmail }: {
  locale: Foreign; token: string; r: NonNullable<ReturnType<typeof baziReport>>; f: ReturnType<typeof factsOf>; body: ReportBody; finished: boolean; viewerEmail: string | null;
}) {
  const t = baziReportText(locale), F = bzName(locale), N = F.N;
  const paid = !!r.paid_at;
  const kind = r.kind as "deep" | "love";
  const flow = kind === "deep" ? flowView(r) : null;
  const isFlow = (key: string) => (FLOW_CHAPTERS.bazi as readonly string[]).includes(key);
  const part = (g: string) => body.parts[g] as Record<string, unknown> | undefined;
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{finished ? t.failedChapter : t.writingChapter}</p>;
  const title = f.geju ? fmt(t.title, { dm: F.dm(f.dayMaster), g: F.geju(f.geju) }) : fmt(t.titleNoGeju, { dm: F.dm(f.dayMaster) });
  const reading = (c: string) => (stemIndex(c) >= 0 ? N.stemKana?.[stemIndex(c)] ?? F.stem(c) : N.branchKana?.[branchIndex(c)] ?? F.branch(c));
  const chapters = t.chapters as Record<string, string>;
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<span><Link href={`/${locale}/bazi/chart`} className="hover:text-[var(--ink)] transition-colors">← {t.back}</Link></span>}
      head={{ label: t.kindLabel[kind], question: title, meta: t.kindSub[kind] }}
      answer={
        <div className="mt-[var(--s-4)] grid grid-cols-4 gap-2 max-w-[26rem]" aria-label={t.pillarsHead}>
          {f.pillars.map((p, i) => (
            <div key={i} className="text-center rounded-[6px] border border-[var(--ink-16)] px-1 py-[var(--s-3)]">
              <p className="t-small !text-[var(--ink-45)] leading-tight">{N.pillars[i]}</p>
              <p className="mt-1 text-[28px] leading-[1.2] font-medium" lang="zh-Hant" style={{ color: elColor(p.gz[0]) }}>{p.gz[0]}</p>
              <p className="text-[28px] leading-[1.2] font-medium" lang="zh-Hant" style={{ color: elColor(p.gz[1]) }}>{p.gz[1]}</p>
              <p className="text-[11px] mt-1 !text-[var(--ink-66)]">{locale === "ja" ? `${reading(p.gz[0]!)}・${reading(p.gz[1]!)}` : F.gz(p.gz)}</p>
              <p className="t-small mt-1 !text-[var(--ink-66)] leading-tight">{F.ten(p.ten)}</p>
            </div>
          ))}
        </div>
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
        {paid && kind === "deep" && DEEP_CHAPTERS.map((ch, i) => {
          const p = part(deepGroupOf(ch.key));
          const v = p?.[ch.key];
          const gate = isFlow(ch.key) ? flow?.mode ?? "open" : "open";
          return (
            <section key={ch.key} id={ch.key} className="mt-[var(--s-6)] scroll-mt-20">
              <p className="t-label !text-[var(--ink-45)]">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="t-sect mt-1">{chapters[ch.key] ?? ch.title}</h2>
              {gate === "dated" && flow?.month && <FlowDated locale={locale} month={flow.month} />}
              {gate === "locked" ? (
                <FlowLocked locale={locale} text={!p ? null : teaseIn(ch.key === "dayun" ? ((v as { text: string }[] | undefined)?.[0]?.text ?? "") : String(v ?? ""), locale)} />
              )
              : !p ? pending()
                : ch.key === "dayun" ? (
                  <div className="mt-[var(--s-3)]">
                    {(v as { gz: string; text: string }[]).map((d) => {
                      const dec = f.decades.find((x) => x.gz === d.gz);
                      return (
                        <div key={d.gz} className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-[var(--ink-16)]">
                          <h3 className="t-body font-medium">{dec ? fmt(t.decadeHead, { gz: F.gz(d.gz), t: F.ten(dec.ten), a: dec.startAge, b: dec.endAge, y1: dec.startYear, y2: dec.startYear + 9 }) : F.gz(d.gz)}</h3>
                          <p className="t-body mt-1 leading-relaxed">{d.text}</p>
                        </div>
                      );
                    })}
                  </div>
                )
                : ch.key === "xingdong" ? (
                  <ol className="mt-[var(--s-3)] list-decimal pl-5 space-y-[var(--s-2)]">
                    {(v as string[]).map((x, k) => <li key={k} className="t-body leading-relaxed">{x}</li>)}
                  </ol>
                )
                : <p className="t-body mt-[var(--s-3)] leading-relaxed whitespace-pre-line">{String(v ?? "")}</p>}
            </section>
          );
        })}
        {paid && kind === "love" && f.zhengyuan && (() => {
          const a = part("A") as { intro?: string; traits?: Record<string, string> } | undefined;
          const b = part("B") as { tips?: string[]; self?: string } | undefined;
          const drawn = hasPortrait(token);
          if (!drawn) void ensurePortrait(token).catch(() => false);
          const chips = zyChipsIn(zyKeys({ pillars: f.pillars.map((p) => p.gz), gender: f.gender, partner: f.zhengyuan!.partner }), locale);
          const sections = t.love.sections as Record<string, string>;
          return (
            <>
              <figure className="mt-[var(--s-6)]">
                {drawn
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={`/api/bazi/portrait/${token}?v=3`} alt={t.love.alt} className="w-full max-w-[26rem] mx-auto rounded-[4px] border border-[var(--ink-16)]" />
                  : <div className="w-full max-w-[26rem] mx-auto aspect-[3/4] rounded-[4px] border border-dashed border-[var(--ink-16)] grid place-items-center t-small !text-[var(--ink-45)] text-center px-4">{t.love.drawing}{finished && <AutoRefresh every={8000} max={12} />}</div>}
                <figcaption className="t-small mt-2 text-center !text-[var(--ink-45)]">{t.love.caption}</figcaption>
              </figure>
              <section className="mt-[var(--s-6)]">
                <h2 className="t-sect">{t.love.intro}</h2>
                {a?.intro ? <p className="t-body mt-[var(--s-3)] leading-relaxed">{a.intro}</p> : pending()}
              </section>
              {LOVE_SECTIONS.map((sct) => {
                if (!f.zhengyuan!.traits.find((x) => x.key === sct.key)) return null;
                return (
                  <section key={sct.key} className="mt-[var(--s-5)] pt-[var(--s-4)] border-t border-[var(--ink-16)]">
                    <h3 className="t-sect">{sections[sct.key] ?? sct.title}</h3>
                    <p className="mt-[var(--s-2)] flex flex-wrap gap-2" aria-label={t.love.basis}>
                      {(chips[sct.key] ?? []).map((chip) => (
                        <span key={chip} className="t-small rounded-[2px] border border-[var(--gold)] px-2 py-[1px] !text-[var(--gold-text)]">{chip}</span>
                      ))}
                    </p>
                    {a?.traits?.[sct.key] ? <p className="t-body mt-[var(--s-3)] leading-relaxed">{a.traits[sct.key]}</p> : pending()}
                  </section>
                );
              })}
              <section className="mt-[var(--s-6)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-4)]">
                <h2 className="t-sect !text-[var(--gold-text)]">{t.love.tips}</h2>
                {b?.tips ? <ul className="mt-[var(--s-3)] list-disc pl-5 space-y-[var(--s-2)]">{b.tips.map((x, k) => <li key={k} className="t-body leading-relaxed">{x}</li>)}</ul> : pending()}
                {b?.self && (<><h3 className="t-sect mt-[var(--s-4)]">{t.love.self}</h3><p className="t-body mt-[var(--s-2)] leading-relaxed">{b.self}</p></>)}
              </section>
              <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{t.love.note}</p>
            </>
          );
        })()}
      </>}
      revisit={paid && kind === "deep" ? (
        <SelfRevisitSet kind="bazi" token={token} locale={locale as Locale} hasEmail={!!viewerEmail} options={selfChoices("bazi", locale)} ui={selfRevisitUi(locale)} />
      ) : undefined}
      cross={<CrossCards source="bazi" locale={locale as Locale} exclude={["bazi"]} />}
      sticky={paid && kind === "deep" ? (
        <a href="#revisit" data-heat="bazi-sticky-revisit" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.06em]">{t.revisitBtn}</a>
      ) : undefined}
    />
  );
}
