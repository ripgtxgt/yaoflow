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
  ASTRO_TOKEN_RE, AS_BOOK_AREAS, AS_REPORT_UI, asBodyOf, asDeepChapters, asDeepGroupOf, asFactsOf, asQuarterMonths, astroReport,
  ensureAstroReport, fulfilAstroPayment, mailAstroOnce, type AstroBody, type AstroBook, type AstroFacts, type MonthA,
} from "@/lib/mingli/astro/report";
import type { ReactNode } from "react";
import { flowView, teaser, type FlowView } from "@/lib/mingli/flow-view";
import { monthSkyFor, monthSkyLines, monthSkyLinesIn } from "@/lib/mingli/astro/month-sky";
import { FlowLocked } from "@/components/mingli/FlowGate";
import { fmt, isForeign, type Foreign } from "@/lib/l10n/core";
import { astroReportText, planetName, signName, type AstroReportText } from "@/lib/mingli/astro/page-ui";
import { ASTRO_NAMES } from "@/lib/mingli/astro/names";
import { asBookWords } from "@/lib/mingli/astro/book-foreign";
import { monthsIn, spanIn } from "@/lib/l10n/dates";
import { nsForeignText } from "@/lib/mingli/nianshu/foreign-text";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ④: the tab's title in the page's language
  return { title: isForeign(locale) ? astroReportText(locale).metaTitle : locale === "zh" ? toHans("你的星盤報告") : "你的星盤報告", robots: { index: false, follow: false } };
}

/**
 * 10-20 星盤②③ a report's own page (token URL; no birth data on it — only the computed chart), as /ziwei/r/<token>:
 * deep: ten chapters (nine without a birth time); year: the 星盤年報 (BookView: nine chapters, every date 國曆).
 * Visible once paid (or made for a member / tester); an unpaid one follows the astro-paid switch; refunded → RefundedNote.
 */
export default async function AstroReportPage({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { locale, token } = await params;
  if (!ASTRO_TOKEN_RE.test(token)) notFound();
  let r = astroReport(token);
  if (!r || r.locale !== locale) notFound();
  /** 10-21: a year report that is one 篇 of a 三合一年書 links back to it and leaves the question to the 年書 */
  const book = r.kind === "year" ? nianshuOfChild("astro", token) : null;
  if (!r.paid_at && !(await canSee("astro-paid"))) notFound();
  const hans = locale === "zh";
  /** fixed copy and chart words are Traditional: Simplified pages convert them (國曆 → 公历) */
  const w = (s: string) => (hans ? toHans(s).replace(/国历/g, "公历") : s);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

  const { paid } = await searchParams;
  // 10-22 进度表 80: whose report, for the 「到期回來問你」 block — the account's address, else the one it was bought with
  let viewerEmail: string | null = null;
  try { viewerEmail = (await currentCustomer())?.email ?? null; } catch { /* no database */ }
  if (!r.paid_at && paid && /^cs_[A-Za-z0-9_]{10,200}$/.test(paid)) {
    try {
      const s = await getCheckoutSession(paid);
      if (s.metadata?.astro === token) fulfilAstroPayment(s as CheckoutSession);
    } catch { /* the sweep will catch it */ }
    r = astroReport(token) ?? r;
  }
  if (r.paid_at && sessionRefunded(r.paid_session)) return <RefundedNote hans={hans} locale={locale} home={`/${locale}`} />;
  if (r.paid_at && r.status !== "done" && r.status !== "incomplete") {
    await Promise.race([ensureAstroReport(token).catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 2500))]);
    r = astroReport(token) ?? r;
  }
  const body: AstroBody = asBodyOf(r);
  const finished = r.status === "done" || r.status === "incomplete";
  if (finished) void mailAstroOnce(token, site).catch(() => null);

  const f = asFactsOf(r);
  // 10-30 进度表 128 ④: a report written for a page in another language has its own words (the deep report only:
  // the 年報 is sold inside the 年書, which opens in the other languages with its own sub-batch)
  if (isForeign(locale)) {
    // 10-30 进度表 128 ④-5: the 年書's 星盤篇
    if (r.kind === "year") return f.book ? <ForeignYear locale={locale} f={f} b={f.book} body={body} finished={finished} paid={!!r.paid_at} book={book} /> : notFound();
    return <ForeignReport locale={locale} token={token} f={f} body={body} finished={finished} paid={!!r.paid_at} viewerEmail={viewerEmail ?? r.email} flow={flowView(r)} />;
  }
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{w(finished ? AS_REPORT_UI.failedChapter : AS_REPORT_UI.writingChapter)}</p>;
  const sun = f.planets[0]!, moon = f.planets[1]!;
  const moonText = f.moonSplit ? `${f.moonSplit[0]}座${AS_REPORT_UI.moonOr}${f.moonSplit[1]}座` : `${moon.sign}座`;
  const title = r.kind === "year" && f.book ? `${f.book.year}` : `${w(`太陽${sun.sign}・月亮${f.moonSplit ? f.moonSplit.join("／") : moon.sign}${f.asc ? `・上升${f.asc.sign}` : ""}`)}`;

  // 10-22 进度表 87 (设计稿第 5 節): the report on the result template — head, the key facts as the answer, the chapters,
  // the revisit, the next step (进度表 86 承接地圖); on a phone the bottom button goes to the revisit once paid (R10)
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<>
      {book ? <span><Link href={`/${locale}/nianshu/r/${book}`} className="hover:text-[var(--ink)] transition-colors">← {w(NS_UI.backToBook)}</Link></span> : (
        <span><Link href={`/${locale}/xingpan/chart`} className="hover:text-[var(--ink)] transition-colors">← {w(AS_REPORT_UI.back)}</Link></span>
      )}
      </>}
      head={{ label: w(AS_REPORT_UI.kindLabel[r.kind]), question: title, meta: w(AS_REPORT_UI.kindSub[r.kind]) }}
      answer={<>
        <dl className="mt-[var(--s-4)] grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label={w(AS_REPORT_UI.head)}>
          {[
            [AS_REPORT_UI.headSun, `${sun.sign}座 ${sun.deg}°${sun.house ? ` · ${AS_REPORT_UI.houseN.replace("{n}", String(sun.house))}` : ""}`],
            [AS_REPORT_UI.headMoon, moonText],
            [AS_REPORT_UI.headAsc, f.asc ? `${f.asc.sign}座 ${f.asc.deg}°` : "—"],
            [AS_REPORT_UI.headDom, f.dominant[0]?.planet ?? "—"],
          ].map(([k, v]) => (
            <div key={k}><dt className="t-small !text-[var(--ink-45)]">{w(k!)}</dt><dd className="t-body mt-0.5">{w(v!)}</dd></div>
          ))}
        </dl>
        {!f.timeKnown && <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{w(AS_REPORT_UI.noTime)}</p>}
      </>}
      pay={!r.paid_at ? (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
          <h2 className="t-sect mb-[var(--s-2)]">{w(AS_REPORT_UI.unpaidHead)}</h2>
          <p className="t-body">{w(AS_REPORT_UI.unpaidBody)}</p>
        </section>
      ) : undefined}
      free={<>
      {r.paid_at && !finished && (
        <section className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-4)]">
          <p className="t-body">{w(AS_REPORT_UI.writing)}</p>
          <AutoRefresh every={6000} max={40} />
        </section>
      )}

      {r.paid_at && r.kind === "deep" && <DeepView f={f} parts={body.parts} w={w} pending={pending} locale={locale} flow={flowView(r)} />}
      {r.paid_at && r.kind === "year" && f.book && (
        <BookView f={f} b={f.book} parts={body.parts} w={w} pending={pending} locale={locale} question={r.question ?? null} token={token} book={book} />
      )}
      </>}
      revisit={r.paid_at && r.kind === "deep" ? (
        <SelfRevisitSet kind="astro" token={token} locale={locale as Locale} hasEmail={!!(viewerEmail ?? r.email)} options={selfChoices("astro", locale)} ui={selfRevisitUi(locale)} />
      ) : undefined}
      cross={<CrossCards source={book ? "nianshu" : "astro"} locale={locale as Locale} exclude={[book ? "nianshu" : "xingpan"]} />}
      sticky={r.paid_at && r.kind === "deep" ? (
        <a href="#revisit" data-heat="astro-sticky-revisit" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.14em]">{w("設定回訪")}</a>
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
const houseN = (n: number | null | undefined) => (n ? AS_REPORT_UI.houseN.replace("{n}", String(n)) : "");

/**
 * the ten chapters (nine without a birth time); the facts each one rests on are shown above its text.
 * 10-22 进度表 92: then 「這個月的行運」 — the current month's sky against this chart (lib/mingli/astro/month-sky.ts), for a
 * report whose owner is a member now; anyone else sees its first line and the way in.
 */
function DeepView({ f, parts, w, pending, locale, flow }: { f: AstroFacts; parts: AstroBody["parts"]; w: W; pending: () => ReactNode; locale: string; flow: FlowView }) {
  const planet = (name: string) => f.planets.find((p) => p.name === name)!;
  const pLine = (name: string) => { const p = planet(name); return `${p.name} ${p.sign}座 ${p.deg}°${p.house ? ` · ${houseN(p.house)}` : ""}${p.dignity ? ` · ${p.dignity}` : ""}${p.retro ? " · 逆行" : ""}`; };
  const chips: Record<string, string[]> = {
    zhongxin: [
      ...f.balance.strongEl.map((e) => `${e}象偏多`), ...f.balance.weakEl.map((e) => `${e}象偏少`),
      ...f.balance.strongMode.map((m) => `${m}偏多`), ...f.dominant.slice(0, 1).map((d) => `主導 ${d.planet}`),
      ...(f.ruler ? [`命主星 ${f.ruler.planet}`] : []), ...f.patterns.map((p) => `${p.kind}（${p.planets.join("、")}）`),
    ],
    taiyang: [pLine("太陽")], yueliang: [pLine("月亮")],
    shangsheng: f.asc ? [`上升 ${f.asc.sign}座 ${f.asc.deg}°`, ...(f.ruler ? [`命主星 ${f.ruler.planet} ${f.ruler.sign}座${f.ruler.house ? ` · ${houseN(f.ruler.house)}` : ""}`] : [])] : [],
    shuixing: [pLine("水星")], ganqing: [pLine("金星"), pLine("火星")],
    shiye: f.mc ? [`天頂 ${f.mc.sign}座`, pLine("土星")] : [pLine("土星")],
    jinqian: [pLine("金星"), pLine("木星")],
    gongke: [pLine("土星"), `北交點 ${f.nodes.north.sign}座${f.nodes.north.house ? ` · ${houseN(f.nodes.north.house)}` : ""}`, `南交點 ${f.nodes.south.sign}座${f.nodes.south.house ? ` · ${houseN(f.nodes.south.house)}` : ""}`],
  };
  return (
    <>
      {asDeepChapters(f.timeKnown).map((ch, i) => {
        const p = parts[asDeepGroupOf(ch.key)] as Record<string, unknown> | undefined;
        const v = p?.[ch.key];
        return (
          <Chapter key={ch.key} n={i + 1} id={ch.key} title={w(ch.title)}>
            {(chips[ch.key] ?? []).length > 0 && <p className="mt-[var(--s-3)] flex flex-wrap gap-2">{chips[ch.key]!.map((x, k) => <Chip key={k} tone={k === 0 ? "gold" : "ink"}>{w(x)}</Chip>)}</p>}
            {ch.key === "xiangwei" && (
              <div className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
                {(["合相", "和諧", "張力"] as const).map((g) => {
                  const list = f.aspects.filter((a) => a.group === g);
                  return list.length ? (
                    <div key={g} className="flex flex-wrap gap-2 py-[var(--s-2)] border-t border-[var(--ink-16)] first:border-t-0">
                      <span className="t-small w-full font-medium">{w(AS_REPORT_UI.aspectGroups[g]!)}</span>
                      {list.map((a) => <Chip key={`${a.a}${a.b}`} tone={a.orb <= 2 ? "gold" : "ink"}>{w(`${a.a}${a.name}${a.b} ${a.orb}°${a.gen ? ` · ${AS_REPORT_UI.genNote}` : ""}`)}</Chip>)}
                    </div>
                  ) : null;
                })}
              </div>
            )}
            {!p ? pending() : <Text v={v} />}
          </Chapter>
        );
      })}
      {(() => {
        let lines: string[] = [], label = "";
        try { const sky = monthSkyFor(f); lines = monthSkyLines(sky); label = `國曆 ${sky.year} 年 ${sky.month} 月 · 每月按當下天象更新`; } catch { return null; }
        return (
          <Chapter n={asDeepChapters(f.timeKnown).length + 1} id="xingyun" title={w("這個月的行運")}>
            <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{w(label)}</p>
            {flow.live ? (
              <ul className="mt-[var(--s-3)] space-y-[var(--s-3)]">
                {lines.map((x, k) => <li key={k} className="t-body leading-relaxed">{w(x)}</li>)}
              </ul>
            ) : <FlowLocked locale={locale} text={w(teaser(lines[0] ?? ""))} sky resume={flow.mode === "dated"} />}
          </Chapter>
        );
      })()}
    </>
  );
}

/** 星盤年報: nine chapters; every month is a 國曆 month and every date 國曆 (公历 on Simplified pages) */
function BookView({ f, b, parts, w, pending, locale, question, token, book }: {
  f: AstroFacts; b: AstroBook; parts: AstroBody["parts"]; w: W; pending: () => ReactNode; locale: string; question: string | null; token: string; book: string | null;
}) {
  const months = b.months;
  const ov = parts.ov as { keyword?: string; verdict?: string; keyMonths?: Record<string, string> } | undefined;
  type MonthText = { read: string; focus?: Record<string, string>; yi: string[]; ji: string[] };
  const monthText = (i: number) => (parts[`m${Math.floor(i / 3) + 1}`] as { months?: MonthText[] } | undefined)?.months?.[i % 3];
  const js = parts.js as { jupsat?: string; outer?: string } | undefined;
  const ecl = parts.ecl as { eclipses?: string; retro?: string; quarters?: Record<string, string[]> } | undefined;
  const ar = (parts.ar || parts.ar2 ? { ...(parts.ar as object), ...(parts.ar2 as object) } : undefined) as ({ love?: { single?: string; paired?: string } } & Record<string, unknown>) | undefined;
  const qa = parts.qa as { answer?: string } | undefined;
  const prevAsked = ((parts.qaPrev as { list?: { question: string; answer: string }[] } | undefined)?.list ?? []);
  const keyOf: Record<number, string> = { [b.key.smooth]: AS_REPORT_UI.keySmooth, [b.key.slow]: AS_REPORT_UI.keySlow, [b.key.pivot]: AS_REPORT_UI.keyPivot };
  const d = (x: string) => `國曆 ${x}`;
  const row = (label: string, body: ReactNode) => (
    <div className="flex gap-3 py-[var(--s-2)] border-t border-[var(--ink-16)] first:border-t-0">
      <dt className="t-small shrink-0 w-[5.5rem] !text-[var(--ink-45)]">{w(label)}</dt>
      <dd className="flex flex-wrap gap-2 min-w-0">{body}</dd>
    </div>
  );
  const outer = b.slow.filter((s) => ["天王星", "海王星", "冥王星"].includes(s.planet));
  const outerHits = b.hits.filter((h) => ["天王星", "海王星", "冥王星"].includes(h.planet));
  const hitText = (h: AstroBook["hits"][number]) => `${h.planet}${h.aspect}本命${h.point} · ${h.exact.length ? h.exact.map(d).join("、") : `${d(h.from)}–${h.to}`}`;
  const slowRow = (s: AstroBook["slow"][number]) => (
    <div key={s.planet} className="mt-[var(--s-3)] rounded-[6px] border border-[var(--ink-16)] p-3">
      <p className="t-body font-medium">{w(s.planet)}</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{w(`${AS_REPORT_UI.jsFrom} ${s.start.sign}座${s.start.house ? ` ${houseN(s.start.house)}` : ""} → ${AS_REPORT_UI.jsTo} ${s.end.sign}座${s.end.house ? ` ${houseN(s.end.house)}` : ""}`)}</p>
      {(s.ingresses.length > 0 || s.retro.length > 0) && (
        <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">
          {s.ingresses.map((g, k) => <Chip key={k}>{w(`${d(g.date)} ${g.back ? "退回" : "進入"}${g.kind === "sign" ? `${g.to}座` : houseN(Number(g.to))}`)}</Chip>)}
          {s.retro.map((x, k) => <Chip key={`r${k}`}>{w(`${AS_REPORT_UI.jsRetro} ${d(x.from)}–${x.to}`)}</Chip>)}
        </p>
      )}
      {b.hits.filter((h) => h.planet === s.planet).length > 0 && <p className="mt-1.5 flex flex-wrap gap-1.5">{b.hits.filter((h) => h.planet === s.planet).map((h, k) => <Chip key={k} tone="gold">{w(hitText(h))}</Chip>)}</p>}
    </div>
  );
  return (
    <>
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-66)]">{w(AS_REPORT_UI.datesNote)}</p>

      <Chapter n={1} id="verdict" title={w(AS_REPORT_UI.bookVerdict)}>
        {ov?.keyword && <p className="mt-[var(--s-3)]"><span className="t-label !text-[var(--gold-text)]">{w(AS_REPORT_UI.bookKeyword)}</span> <span className="t-d3 ml-2">{ov.keyword}</span></p>}
        <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
          {b.sr ? (
            <>
              {row(AS_REPORT_UI.srAsc, <span className="t-small">{w(`${b.sr.asc}座${b.sr.ascNatalHouse ? ` · ${AS_REPORT_UI.srAscIn.replace("{n}", String(b.sr.ascNatalHouse))}` : ""}`)}</span>)}
              {row(AS_REPORT_UI.srSun, <span className="t-small">{w(houseN(b.sr.sunHouse) || "—")}</span>)}
              {row(AS_REPORT_UI.srMoon, <span className="t-small">{w(`${b.sr.moon.sign}座${b.sr.moon.house ? ` · ${houseN(b.sr.moon.house)}` : ""}`)}</span>)}
              {b.sr.angular.length > 0 && row(AS_REPORT_UI.srAngular, b.sr.angular.map((x) => <Chip key={x.planet} tone="gold">{w(`${x.planet} · ${houseN(x.house)}`)}</Chip>))}
            </>
          ) : row(AS_REPORT_UI.srHead, <span className="t-small !text-[var(--ink-66)]">{w(AS_REPORT_UI.srNone)}</span>)}
        </dl>
        {ov?.verdict ? <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{ov.verdict}</p> : pending()}
        <h3 className="t-sect mt-[var(--s-5)]">{w(AS_REPORT_UI.bookCurve)}</h3>
        <MonthBars months={months} mark={[b.key.smooth, b.key.slow, b.key.pivot]} label={(m) => w(`${m.label} · ${AS_REPORT_UI.levelWord[m.level]}`)} />
      </Chapter>

      <Chapter n={2} id="key" title={w(AS_REPORT_UI.bookKeyMonths)}>
        <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-3">
          {([["smooth", AS_REPORT_UI.keySmooth], ["slow", AS_REPORT_UI.keySlow], ["pivot", AS_REPORT_UI.keyPivot]] as const).map(([k, label]) => {
            const m = months[b.key[k]];
            return (
              <div key={k} className={`rounded-[6px] border p-4 ${k === "pivot" ? "border-[var(--gold)] bg-[var(--gold)]/[0.07]" : "border-[var(--ink-16)]"}`}>
                <p className="t-label !text-[var(--gold-text)]">{w(label)}</p>
                {m && <p className="t-body mt-1 font-medium">{w(m.label)}</p>}
                {m && <p className="t-small mt-1">{dots(m.level)} <span className="!text-[var(--ink-66)]">{w(AS_REPORT_UI.levelWord[m.level]!)}</span></p>}
                {ov?.keyMonths?.[k] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{ov.keyMonths[k]}</p> : pending()}
              </div>
            );
          })}
        </div>
      </Chapter>

      <Chapter n={3} id="months" title={w(AS_REPORT_UI.bookMonths)}>
        <ol className="mt-[var(--s-3)] space-y-3">
          {months.map((m, i) => {
            const t = monthText(i), key = keyOf[i];
            return (
              <li key={m.n} id={`m${i + 1}`} className={`rounded-[6px] border p-4 ${key ? "border-[var(--gold)]" : "border-[var(--ink-16)]"}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="t-body font-medium">{w(m.label)}</p>
                  <p className="t-small">{dots(m.level)} <span className="!text-[var(--ink-66)]">{w(AS_REPORT_UI.levelWord[m.level]!)}</span></p>
                  {key && <Chip tone="gold">{w(key)}</Chip>}
                </div>
                {m.flags.length > 0 && <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">{m.flags.map((x) => <Chip key={x}>{w(x)}</Chip>)}</p>}
                {m.sky.length > 0 && <ul className="mt-[var(--s-2)] space-y-0.5">{m.sky.map((x) => <li key={x} className="t-small !text-[var(--ink-66)]">· {w(x)}</li>)}</ul>}
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
                      <div><p className="t-label !text-[var(--gold-text)]">{w(AS_REPORT_UI.monthYi)}</p><ul className="mt-1 space-y-1">{t.yi.map((x, k) => <li key={k} className="t-small">· {x}</li>)}</ul></div>
                      <div><p className="t-label !text-[var(--ink-66)]">{w(AS_REPORT_UI.monthJi)}</p><ul className="mt-1 space-y-1">{t.ji.map((x, k) => <li key={k} className="t-small !text-[var(--ink-66)]">· {x}</li>)}</ul></div>
                    </div>
                  </>
                ) : pending()}
              </li>
            );
          })}
        </ol>
      </Chapter>

      <Chapter n={4} id="jupsat" title={w(AS_REPORT_UI.bookJs)}>
        {b.slow.filter((s) => s.planet === "木星" || s.planet === "土星").map(slowRow)}
        {js?.jupsat ? <Text v={js.jupsat} /> : pending()}
      </Chapter>

      <Chapter n={5} id="outer" title={w(AS_REPORT_UI.bookOuter)}>
        {outer.map(slowRow)}
        {!outerHits.length && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{w(AS_REPORT_UI.outerNone)}</p>}
        {js?.outer ? <Text v={js.outer} /> : pending()}
      </Chapter>

      <Chapter n={6} id="eclipses" title={w(AS_REPORT_UI.bookEcl)}>
        <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
          {row(AS_REPORT_UI.eclHead, b.eclipses.map((e) => <Chip key={e.date} tone={e.touches.length ? "gold" : "ink"}>{w(`${d(e.date)} ${e.kind} · ${e.sign}座${e.deg}°${e.house ? ` · ${houseN(e.house)}` : ""}${e.touches.length ? ` · ${e.touches.join("、")}` : ""}`)}</Chip>))}
          {row(AS_REPORT_UI.retroHead, b.retro.map((x) => <Chip key={`${x.planet}${x.from}`}>{w(`${x.planet} ${d(x.from)}–${x.to} · ${x.signs.join("／")}座${x.houses.length ? ` · ${x.houses.map(houseN).join("／")}` : ""}`)}</Chip>))}
        </dl>
        {ecl?.eclipses ? <Text v={ecl.eclipses} /> : pending()}
        {ecl?.retro ? <Text v={ecl.retro} /> : null}
      </Chapter>

      <Chapter n={7} id="areas" title={w(AS_REPORT_UI.bookAreas)}>
        {!ar ? pending() : AS_BOOK_AREAS.map((a) => (
          <div key={a.key} className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-[var(--ink-16)] first:border-t-0">
            <h3 className="t-body font-medium">{w(a.title)}</h3>
            {a.key === "love" ? (
              <>
                <p className="t-label mt-[var(--s-2)] !text-[var(--gold-text)]">{w(AS_REPORT_UI.areaSingle)}</p>
                <p className="t-body mt-1 leading-relaxed">{ar.love?.single}</p>
                <p className="t-label mt-[var(--s-3)] !text-[var(--gold-text)]">{w(AS_REPORT_UI.areaPaired)}</p>
                <p className="t-body mt-1 leading-relaxed">{ar.love?.paired}</p>
              </>
            ) : ar[a.key] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{String(ar[a.key])}</p> : pending()}
          </div>
        ))}
      </Chapter>

      <Chapter n={8} id="quarters" title={w(AS_REPORT_UI.bookQuarters)}>
        <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((q) => {
            const ms = asQuarterMonths(q);
            const list = ecl?.quarters?.[`q${q + 1}`];
            return (
              <div key={q} className="rounded-[6px] border border-[var(--ink-16)] p-4">
                <p className="t-body font-medium">{w(AS_REPORT_UI.quarter[q + 1]!)}</p>
                <p className="t-small mt-1 !text-[var(--ink-45)]">{w(`國曆 ${ms[0]! + 1}–${ms[2]! + 1} 月`)}</p>
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
      <Chapter n={9} id="question" title={w(AS_REPORT_UI.bookQuestion)}>
        {question && (
          <blockquote className="mt-[var(--s-3)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-3)]">
            <p className="t-small !text-[var(--gold-text)]">{w(AS_REPORT_UI.questionYou)}</p>
            <p className="t-body mt-1">{question}</p>
          </blockquote>
        )}
        {!question ? null : qa?.answer ? (
          <>
            <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{qa.answer}</p>
            <Link href={`/${locale}/cast?q=${encodeURIComponent([...question].slice(0, 100).join(""))}&c=astro`} className="inline-block mt-[var(--s-4)] t-body border border-[var(--ink)] rounded-full px-5 py-2.5 hover:bg-[var(--ink)] hover:!text-[var(--paper)] transition-colors">{w(AS_REPORT_UI.questionCast)}</Link>
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
        <ReaskForm token={token} hans={locale === "zh"} endpoint="/api/astro/report/ask" />
      </Chapter>
      )}
      {!f.timeKnown && <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{w(AS_REPORT_UI.noTime)}</p>}
    </>
  );
}

/** twelve bars, one per 國曆 month, height by level; gold from level 4; `mark` rings the key months */
function MonthBars({ months, label, mark = [] }: { months: MonthA[]; label: (m: MonthA) => string; mark?: number[] }) {
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
          <text x={i * W + W / 2} y={H + 15} textAnchor="middle" fontSize={9} style={{ fill: "var(--ink-66)" }}>{m.n}</text>
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ 10-30 进度表 128 ④: a page in another language */

/**
 * The deep report on a page in one of the seven other languages: the same template, chapters and facts as the Chinese
 * page, every word from the report page's words (lib/mingli/astro/page-ui.ts REPORT), the names from names.ts; the
 * chapters themselves were written in that language (lib/mingli/astro/report.ts asForeignRules).
 */
function ForeignReport({ locale, token, f, body, finished, paid, viewerEmail, flow }: {
  locale: Foreign; token: string; f: AstroFacts; body: AstroBody; finished: boolean; paid: boolean; viewerEmail: string | null; flow: FlowView;
}) {
  const t = astroReportText(locale);
  const sn = (s: string) => signName(s, locale), pn = (p: string) => planetName(p, locale);
  const house = (n: number | null | undefined) => (n ? fmt(t.chip.house, { n }) : "");
  const sun = f.planets[0]!, moon = f.planets[1]!;
  const moonText = f.moonSplit ? fmt(t.chip.moonOr, { a: sn(f.moonSplit[0]), b: sn(f.moonSplit[1]) }) : sn(moon.sign);
  const title = fmt(f.asc ? t.titleAsc : t.title, { s: sn(sun.sign), m: f.moonSplit ? f.moonSplit.map(sn).join(" / ") : sn(moon.sign), a: f.asc ? sn(f.asc.sign) : "" });
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{finished ? t.failedChapter : t.writingChapter}</p>;
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<span><Link href={`/${locale}/xingpan/chart`} className="hover:text-[var(--ink)] transition-colors">← {t.back}</Link></span>}
      head={{ label: t.kindLabel, question: title, meta: t.kindSub }}
      answer={<>
        <dl className="mt-[var(--s-4)] grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label={t.head}>
          {[
            [t.headSun, `${sn(sun.sign)} ${sun.deg}°${sun.house ? ` · ${house(sun.house)}` : ""}`],
            [t.headMoon, moonText],
            [t.headAsc, f.asc ? `${sn(f.asc.sign)} ${f.asc.deg}°` : "—"],
            [t.headDom, f.dominant[0] ? pn(f.dominant[0].planet) : "—"],
          ].map(([k, v]) => (
            <div key={k}><dt className="t-small !text-[var(--ink-45)]">{k}</dt><dd className="t-body mt-0.5">{v}</dd></div>
          ))}
        </dl>
        {!f.timeKnown && <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{t.noTime}</p>}
      </>}
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
        {paid && <ForeignDeep f={f} parts={body.parts} t={t} locale={locale} pending={pending} flow={flow} />}
      </>}
      revisit={paid ? (
        <SelfRevisitSet kind="astro" token={token} locale={locale as Locale} hasEmail={!!viewerEmail} options={selfChoices("astro", locale)} ui={selfRevisitUi(locale)} />
      ) : undefined}
      cross={<CrossCards source="astro" locale={locale as Locale} exclude={["xingpan"]} />}
      sticky={paid ? (
        <a href="#revisit" data-heat="astro-sticky-revisit" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.06em]">{t.revisitBtn}</a>
      ) : undefined}
    />
  );
}

function ForeignDeep({ f, parts, t, locale, pending, flow }: { f: AstroFacts; parts: AstroBody["parts"]; t: AstroReportText; locale: Foreign; pending: () => ReactNode; flow: FlowView }) {
  const sn = (s: string) => signName(s, locale), pn = (p: string) => planetName(p, locale);
  const asp = (a: string) => ASTRO_NAMES[locale].aspects[(["合", "六合", "刑", "拱", "沖"] as string[]).indexOf(a)] ?? a;
  const house = (n: number | null | undefined) => (n ? fmt(t.chip.house, { n }) : "");
  const planet = (name: string) => f.planets.find((p) => p.name === name)!;
  const pLine = (name: string) => {
    const p = planet(name);
    return [fmt(t.chip.planet, { p: pn(p.name), s: sn(p.sign), d: p.deg }), p.house ? house(p.house) : "", p.dignity ? (t.dignity as Record<string, string>)[p.dignity] ?? "" : "", p.retro ? t.chip.retro : ""].filter(Boolean).join(" · ");
  };
  const el = t.el as Record<string, string>, md = t.md as Record<string, string>, pat = t.patterns as Record<string, string>;
  const chips: Record<string, string[]> = {
    zhongxin: [
      ...f.balance.strongEl.map((e) => fmt(t.chip.elMore, { e: el[e] ?? e })), ...f.balance.weakEl.map((e) => fmt(t.chip.elLess, { e: el[e] ?? e })),
      ...f.balance.strongMode.map((m) => fmt(t.chip.mdMore, { m: md[m] ?? m })), ...f.dominant.slice(0, 1).map((d) => fmt(t.chip.dom, { p: pn(d.planet) })),
      ...(f.ruler ? [fmt(t.chip.ruler, { p: pn(f.ruler.planet) })] : []), ...f.patterns.map((p) => fmt(t.chip.pattern, { k: pat[p.kind] ?? p.kind, ps: p.planets.map(pn).join(t.chip.sep) })),
    ],
    taiyang: [pLine("太陽")], yueliang: [pLine("月亮")],
    shangsheng: f.asc ? [fmt(t.chip.asc, { s: sn(f.asc.sign), d: f.asc.deg }), ...(f.ruler ? [[fmt(t.chip.rulerAt, { p: pn(f.ruler.planet), s: sn(f.ruler.sign) }), house(f.ruler.house)].filter(Boolean).join(" · ")] : [])] : [],
    shuixing: [pLine("水星")], ganqing: [pLine("金星"), pLine("火星")],
    shiye: f.mc ? [fmt(t.chip.mc, { s: sn(f.mc.sign) }), pLine("土星")] : [pLine("土星")],
    jinqian: [pLine("金星"), pLine("木星")],
    gongke: [pLine("土星"), [fmt(t.chip.north, { s: sn(f.nodes.north.sign) }), house(f.nodes.north.house)].filter(Boolean).join(" · "), [fmt(t.chip.south, { s: sn(f.nodes.south.sign) }), house(f.nodes.south.house)].filter(Boolean).join(" · ")],
  };
  const chapters = t.chapters as Record<string, string>;
  const chapterTitle = (key: string) => (!f.timeKnown && chapters[`${key}NoTime`]) || chapters[key] || key;
  const groups = t.aspectGroups as Record<string, string>;
  return (
    <>
      {asDeepChapters(f.timeKnown).map((ch, i) => {
        const p = parts[asDeepGroupOf(ch.key)] as Record<string, unknown> | undefined;
        const v = p?.[ch.key];
        return (
          <Chapter key={ch.key} n={i + 1} id={ch.key} title={chapterTitle(ch.key)}>
            {(chips[ch.key] ?? []).length > 0 && <p className="mt-[var(--s-3)] flex flex-wrap gap-2">{chips[ch.key]!.map((x, k) => <Chip key={k} tone={k === 0 ? "gold" : "ink"}>{x}</Chip>)}</p>}
            {ch.key === "xiangwei" && (
              <div className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
                {(["合相", "和諧", "張力"] as const).map((g) => {
                  const list = f.aspects.filter((a) => a.group === g);
                  return list.length ? (
                    <div key={g} className="flex flex-wrap gap-2 py-[var(--s-2)] border-t border-[var(--ink-16)] first:border-t-0">
                      <span className="t-small w-full font-medium">{groups[g] ?? g}</span>
                      {list.map((a) => <Chip key={`${a.a}${a.b}`} tone={a.orb <= 2 ? "gold" : "ink"}>{`${fmt(t.chip.aspect, { a: pn(a.a), n: asp(a.name), b: pn(a.b), o: a.orb })}${a.gen ? ` · ${t.genNote}` : ""}`}</Chip>)}
                    </div>
                  ) : null;
                })}
              </div>
            )}
            {!p ? pending() : <Text v={v} />}
          </Chapter>
        );
      })}
      {(() => {
        let sky: { label: string; lines: string[] };
        try { sky = monthSkyLinesIn(monthSkyFor(f), locale); } catch { return null; }
        return (
          <Chapter n={asDeepChapters(f.timeKnown).length + 1} id="xingyun" title={t.sky.title}>
            <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{sky.label}</p>
            {flow.live ? (
              <ul className="mt-[var(--s-3)] space-y-[var(--s-3)]">
                {sky.lines.map((x, k) => <li key={k} className="t-body leading-relaxed">{x}</li>)}
              </ul>
            ) : <FlowLocked locale={locale} text={teaseIn(sky.lines[0] ?? "", locale)} sky resume={flow.mode === "dated"} />}
          </Chapter>
        );
      })()}
    </>
  );
}

/** the chart's Sun, Moon, rising sign and dominant planet as the answer of a foreign report page */
function ChartHeadIn({ f, locale }: { f: AstroFacts; locale: Foreign }) {
  const t = astroReportText(locale);
  const sn = (s: string) => signName(s, locale), pn = (p: string) => planetName(p, locale);
  const house = (n: number | null | undefined) => (n ? fmt(t.chip.house, { n }) : "");
  const sun = f.planets[0]!, moon = f.planets[1]!;
  const moonText = f.moonSplit ? fmt(t.chip.moonOr, { a: sn(f.moonSplit[0]), b: sn(f.moonSplit[1]) }) : sn(moon.sign);
  return (
    <>
      <dl className="mt-[var(--s-4)] grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label={t.head}>
        {[
          [t.headSun, `${sn(sun.sign)} ${sun.deg}°${sun.house ? ` · ${house(sun.house)}` : ""}`],
          [t.headMoon, moonText],
          [t.headAsc, f.asc ? `${sn(f.asc.sign)} ${f.asc.deg}°` : "—"],
          [t.headDom, f.dominant[0] ? pn(f.dominant[0].planet) : "—"],
        ].map(([k, v]) => (
          <div key={k}><dt className="t-small !text-[var(--ink-45)]">{k}</dt><dd className="t-body mt-0.5">{v}</dd></div>
        ))}
      </dl>
      {!f.timeKnown && <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{t.noTime}</p>}
    </>
  );
}

/**
 * 10-30 进度表 128 ④-5: the 年書's 星盤篇 on a page in another language — the Chinese BookView's chapters (the question
 * belongs to the 年書), every fact named in that language (lib/mingli/astro/book-foreign.ts: the month's dated events
 * rebuilt from the facts), every label from the report page's words (page-ui.ts REPORT.book).
 */
function ForeignYear({ locale, f, b, body, finished, paid, book }: {
  locale: Foreign; f: AstroFacts; b: AstroBook; body: AstroBody; finished: boolean; paid: boolean; book: string | null;
}) {
  const W = asBookWords(locale, b.year), rt = W.R, t = W.t;
  const months = b.months;
  const parts = body.parts;
  const pending = () => <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{finished ? rt.failedChapter : rt.writingChapter}</p>;
  const ov = parts.ov as { keyword?: string; verdict?: string; keyMonths?: Record<string, string> } | undefined;
  type MonthText = { read: string; focus?: Record<string, string>; yi: string[]; ji: string[] };
  const monthText = (i: number) => (parts[`m${Math.floor(i / 3) + 1}`] as { months?: MonthText[] } | undefined)?.months?.[i % 3];
  const js = parts.js as { jupsat?: string; outer?: string } | undefined;
  const ecl = parts.ecl as { eclipses?: string; retro?: string; quarters?: Record<string, string[]> } | undefined;
  const ar = (parts.ar || parts.ar2 ? { ...(parts.ar as object), ...(parts.ar2 as object) } : undefined) as ({ love?: { single?: string; paired?: string } } & Record<string, unknown>) | undefined;
  const keyOf: Record<number, string> = { [b.key.smooth]: t.keySmooth, [b.key.slow]: t.keySlow, [b.key.pivot]: t.keyPivot };
  const row = (label: string, el: ReactNode) => (
    <div className="flex gap-3 py-[var(--s-2)] border-t border-[var(--ink-16)] first:border-t-0">
      <dt className="t-small shrink-0 w-[6.5rem] !text-[var(--ink-45)]">{label}</dt>
      <dd className="flex flex-wrap gap-2 min-w-0">{el}</dd>
    </div>
  );
  const OUTER = ["天王星", "海王星", "冥王星"];
  const outer = b.slow.filter((s) => OUTER.includes(s.planet));
  const outerHits = b.hits.filter((h) => OUTER.includes(h.planet));
  const slowRow = (s: AstroBook["slow"][number]) => (
    <div key={s.planet} className="mt-[var(--s-3)] rounded-[6px] border border-[var(--ink-16)] p-3">
      <p className="t-body font-medium">{W.pn(s.planet)}</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{t.jsFrom} {W.sn(s.start.sign)}{s.start.house ? ` ${W.house(s.start.house)}` : ""} → {t.jsTo} {W.sn(s.end.sign)}{s.end.house ? ` ${W.house(s.end.house)}` : ""}</p>
      {(s.ingresses.length > 0 || s.retro.length > 0) && (
        <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">
          {s.ingresses.map((g, k) => <Chip key={k}>{fmt(g.back ? t.back : t.enter, { d: W.date(g.date), x: g.kind === "sign" ? W.sn(g.to) : W.house(Number(g.to)) })}</Chip>)}
          {s.retro.map((x, k) => <Chip key={`r${k}`}>{fmt(t.jsRetro, { a: W.date(x.from), b: W.date(x.to) })}</Chip>)}
        </p>
      )}
      {b.hits.filter((h) => h.planet === s.planet).length > 0 && <p className="mt-1.5 flex flex-wrap gap-1.5">{b.hits.filter((h) => h.planet === s.planet).map((h, k) => <Chip key={k} tone="gold">{`${W.hit(h)} · ${W.hitWhen(h)}`}</Chip>)}</p>}
    </div>
  );
  const ns = book ? nsForeignText(locale).ui : null;
  const focusKeys = ["work", "money", "love", "rest"] as const;
  return (
    <ResultPage
      locale={locale as Locale}
      nav={<span><Link href={book ? `/${locale}/nianshu/r/${book}` : `/${locale}/xingpan/chart`} className="hover:text-[var(--ink)] transition-colors">← {ns ? ns.backToBook : rt.back}</Link></span>}
      head={{ label: t.kindLabel, question: String(b.year), meta: t.kindSub }}
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
            <p className="t-small mt-[var(--s-5)] !text-[var(--ink-66)]">{t.datesNote}</p>

            <Chapter n={1} id="verdict" title={t.verdict}>
              {ov?.keyword && <p className="mt-[var(--s-3)]"><span className="t-label !text-[var(--gold-text)]">{t.keyword}</span> <span className="t-d3 ml-2">{ov.keyword}</span></p>}
              <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
                {b.sr ? (
                  <>
                    {row(t.srAsc, <span className="t-small">{W.sn(b.sr.asc)}{b.sr.ascNatalHouse ? ` · ${fmt(t.srAscIn, { n: b.sr.ascNatalHouse })}` : ""}</span>)}
                    {row(t.srSun, <span className="t-small">{W.house(b.sr.sunHouse) || "—"}</span>)}
                    {row(t.srMoon, <span className="t-small">{W.sn(b.sr.moon.sign)}{b.sr.moon.house ? ` · ${W.house(b.sr.moon.house)}` : ""}</span>)}
                    {b.sr.angular.length > 0 && row(t.srAngular, b.sr.angular.map((x) => <Chip key={x.planet} tone="gold">{`${W.pn(x.planet)} · ${W.house(x.house)}`}</Chip>))}
                  </>
                ) : row(t.srHead, <span className="t-small !text-[var(--ink-66)]">{t.srNone}</span>)}
              </dl>
              {ov?.verdict ? <p className="t-body mt-[var(--s-4)] leading-relaxed whitespace-pre-line">{ov.verdict}</p> : pending()}
              <h3 className="t-sect mt-[var(--s-5)]">{t.curve}</h3>
              <MonthBars months={months} mark={[b.key.smooth, b.key.slow, b.key.pivot]} label={(m) => `${W.month(m.n)} · ${W.level(m.level)}`} />
            </Chapter>

            <Chapter n={2} id="key" title={t.keyMonths}>
              <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-3">
                {([["smooth", t.keySmooth], ["slow", t.keySlow], ["pivot", t.keyPivot]] as const).map(([k, label]) => {
                  const m = months[b.key[k]];
                  return (
                    <div key={k} className={`rounded-[6px] border p-4 ${k === "pivot" ? "border-[var(--gold)] bg-[var(--gold)]/[0.07]" : "border-[var(--ink-16)]"}`}>
                      <p className="t-label !text-[var(--gold-text)]">{label}</p>
                      {m && <p className="t-body mt-1 font-medium">{W.month(m.n)}</p>}
                      {m && <p className="t-small mt-1">{dots(m.level)} <span className="!text-[var(--ink-66)]">{W.level(m.level)}</span></p>}
                      {ov?.keyMonths?.[k] ? <p className="t-body mt-[var(--s-2)] leading-relaxed">{ov.keyMonths[k]}</p> : pending()}
                    </div>
                  );
                })}
              </div>
            </Chapter>

            <Chapter n={3} id="months" title={t.months}>
              <ol className="mt-[var(--s-3)] space-y-3">
                {months.map((m, i) => {
                  const x = monthText(i), key = keyOf[i], sky = W.sky(b, m.n);
                  return (
                    <li key={m.n} id={`m${i + 1}`} className={`rounded-[6px] border p-4 ${key ? "border-[var(--gold)]" : "border-[var(--ink-16)]"}`}>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="t-body font-medium">{W.month(m.n)}</p>
                        <p className="t-small">{dots(m.level)} <span className="!text-[var(--ink-66)]">{W.level(m.level)}</span></p>
                        {key && <Chip tone="gold">{key}</Chip>}
                      </div>
                      {m.flags.length > 0 && <p className="mt-[var(--s-2)] flex flex-wrap gap-1.5">{m.flags.map((y) => <Chip key={y}>{W.flag(y)}</Chip>)}</p>}
                      {sky.length > 0 && <ul className="mt-[var(--s-2)] space-y-0.5">{sky.map((y) => <li key={y} className="t-small !text-[var(--ink-66)]">· {y}</li>)}</ul>}
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

            <Chapter n={4} id="jupsat" title={t.js}>
              {b.slow.filter((s) => s.planet === "木星" || s.planet === "土星").map(slowRow)}
              {js?.jupsat ? <Text v={js.jupsat} /> : pending()}
            </Chapter>

            <Chapter n={5} id="outer" title={t.outer}>
              {outer.map(slowRow)}
              {!outerHits.length && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{t.outerNone}</p>}
              {js?.outer ? <Text v={js.outer} /> : pending()}
            </Chapter>

            <Chapter n={6} id="eclipses" title={t.ecl}>
              <dl className="mt-[var(--s-3)] panel px-[var(--s-4)] py-[var(--s-2)]">
                {row(t.eclHead, b.eclipses.map((e) => <Chip key={e.date} tone={e.touches.length ? "gold" : "ink"}>{W.eclipseLine(e)}</Chip>))}
                {row(t.retroHead, b.retro.map((x) => <Chip key={`${x.planet}${x.from}`}>{`${W.pn(x.planet)} ${spanIn(locale, W.date(x.from), W.date(x.to))} · ${x.signs.map(W.sn).join(" / ")}${x.houses.length ? ` · ${x.houses.map(W.house).join(" / ")}` : ""}`}</Chip>))}
              </dl>
              {ecl?.eclipses ? <Text v={ecl.eclipses} /> : pending()}
              {ecl?.retro ? <Text v={ecl.retro} /> : null}
            </Chapter>

            <Chapter n={7} id="areas" title={t.areas}>
              {!ar ? pending() : AS_BOOK_AREAS.map((a) => (
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

            <Chapter n={8} id="quarters" title={t.quarters}>
              <div className="mt-[var(--s-3)] grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((q) => {
                  const ms = asQuarterMonths(q);
                  const list = ecl?.quarters?.[`q${q + 1}`];
                  return (
                    <div key={q} className="rounded-[6px] border border-[var(--ink-16)] p-4">
                      <p className="t-body font-medium">{(t.quarter as unknown as Record<string, string>)[String(q + 1)]}</p>
                      <p className="t-small mt-1 !text-[var(--ink-45)]">{monthsIn(locale, ms[0]! + 1, ms[2]! + 1)}</p>
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
            {!f.timeKnown && <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{rt.noTime}</p>}
          </>
        )}
      </>}
      cross={<CrossCards source={book ? "nianshu" : "astro"} locale={locale as Locale} exclude={[book ? "nianshu" : "xingpan"]} />}
    />
  );
}
/** the first words of a locked line: Japanese and Korean as the Chinese teaser; Latin text cut at a word */
function teaseIn(text: string, l: Foreign): string {
  if (l === "ja" || l === "ko") return teaser(text);
  const x = text.replace(/\s+/g, " ").trim();
  if (x.length <= 120) return x;
  const cut = x.slice(0, 120), sp = cut.lastIndexOf(" ");
  return `${sp > 60 ? cut.slice(0, sp) : cut}…`;
}
