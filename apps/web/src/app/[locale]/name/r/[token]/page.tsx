import type { Metadata } from "next";
import Link from "next/link";
import CrossCards from "@/components/CrossCards";
import type { Locale } from "@/lib/locales";
import { notFound } from "next/navigation";
import RefundedNote from "@/components/RefundedNote";
import AutoRefresh from "@/components/AutoRefresh";
import NameRecompute from "@/components/mingli/NameRecompute";
import { sessionRefunded } from "@/lib/db";
import { getCheckoutSession, type CheckoutSession } from "@/lib/stripe";
import { canSee } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { birthUi } from "@/lib/mingli/birth/ui";
import { NAME_UI } from "@/lib/mingli/name/ui";
import { charInfo, charText } from "@/lib/mingli/name/chars";
import { readName } from "@/lib/mingli/name/analyze";
import { NAME_TOKEN_RE, ensureNameReport, fulfilNamePayment, mailNameOnce, nameReport, nmBodyOf, nmFactsOf } from "@/lib/mingli/name/report";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "取名參考", robots: { index: false, follow: false } };

const GRID: [string, string][] = [["tian", "天格"], ["ren", "人格"], ["di", "地格"], ["wai", "外格"], ["zong", "總格"]];

/**
 * 10-29 进度表 122 寶寶取名參考／改名參考 — the report's page (token URL; the facts only, never the birth). Every 筆劃、讀音、
 * 五格 here comes from the character data; the words (why a character, what a name means, how it sounds) are written.
 */
export default async function NameReportPage({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { locale, token } = await params;
  if (!NAME_TOKEN_RE.test(token)) notFound();
  let r = nameReport(token);
  if (!r || r.locale !== locale) notFound();
  if (!r.paid_at && !(await canSee("name-paid"))) notFound();
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const ui = Object.fromEntries(Object.entries(NAME_UI).map(([k, v]) => [k, w(v)])) as Record<string, string>;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const { paid } = await searchParams;
  if (!r.paid_at && paid && /^cs_[A-Za-z0-9_]{10,200}$/.test(paid)) {
    try { const s = await getCheckoutSession(paid); if (s.metadata?.name === token) fulfilNamePayment(s as CheckoutSession); } catch { /* the sweep */ }
    r = nameReport(token) ?? r;
  }
  if (r.paid_at && sessionRefunded(r.paid_session)) return <RefundedNote hans={l === "zh"} home={`/${l}`} />;
  if (r.paid_at && r.status !== "done" && r.status !== "incomplete") {
    await Promise.race([ensureNameReport(token).catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 2500))]);
    r = nameReport(token) ?? r;
  }
  const f = nmFactsOf(r);
  const body = nmBodyOf(r);
  const finished = r.status === "done" || r.status === "incomplete";
  if (r.status === "done") void mailNameOnce(token, site).catch(() => null);
  const title = r.kind === "baby" ? ui.babyHead : ui.renameHead;
  const ch = (c: string) => { const i = charInfo(c); return i ? (l === "zh" ? i.s : i.h) : c; };
  const cur = f.kind === "rename" && f.current ? readName(f.surname, f.current, { favour: f.favour, avoid: f.avoid }) : null;

  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <p className="t-small"><Link href={`/${l}/name`} className="underline underline-offset-4">← {ui.back}</Link></p>
      <h1 className="t-d1 mt-[var(--s-3)]">{ch(f.surname)}{w("・")}{title}</h1>
      <p className="t-small mt-2 !text-[var(--ink-66)]">{ui.rFacts.replace("{d}", w(f.dayMaster)).replace("{e}", w(f.dmEl)).replace("{f}", f.favour.join("、"))}{" · "}{f.style === "m" ? ui.styleM : f.style === "f" ? ui.styleF : ui.styleN}</p>
      {!r.paid_at && <section className="mt-[var(--s-5)] panel p-4"><h2 className="t-sect">{ui.unpaidHead}</h2><p className="t-body mt-1">{ui.unpaidBody}</p></section>}
      {r.paid_at && !finished && <section className="mt-[var(--s-5)] panel p-4"><p className="t-body">{ui.writingAll}</p><AutoRefresh every={6000} max={40} /></section>}
      {r.paid_at && finished && !body && <p className="t-body mt-[var(--s-5)]">{ui.failed}</p>}
      {r.paid_at && f.due && !r.recomputed && finished && (
        <section className="mt-[var(--s-5)] rounded-[6px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] p-4">
          <p className="t-body">{ui.rDue}</p>
          <NameRecompute locale={l} token={token} ui={ui} birthUi={birthUi(l)} />
        </section>
      )}
      {r.recomputed ? <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{ui.rRecomputed}</p> : null}
      {body && (
        <>
          <p className="t-body mt-[var(--s-5)] leading-relaxed">{body.intro}</p>
          {cur && body.current && (
            <section className="mt-[var(--s-6)]">
              <h2 className="t-d3">{ui.rCurrent}：{ch(f.surname)}{[...f.current!].map(ch).join("")}</h2>
              <p className="t-small mt-2 !text-[var(--ink-66)]">{cur.chars.map((x) => x.info ? `${ch(x.c)} ${w(`${x.info.k}劃・${x.info.wx}`)}` : ch(x.c)).join("　")}{cur.grid && `　${GRID.map(([k, n]) => `${w(n)} ${cur.grid![k as keyof typeof cur.grid]}`).join(" ")}`}</p>
              <p className="t-body mt-2"><b>{ui.rMeaning}</b>　{body.current.meaning}</p>
              <p className="t-body mt-1"><b>{ui.rSound}</b>　{body.current.sound}</p>
              <p className="t-body mt-1"><b>{ui.rFit}</b>　{body.current.fit}</p>
            </section>
          )}
          <section className="mt-[var(--s-6)]">
            <h2 className="t-d3">{ui.rNames}</h2>
            <div className="mt-[var(--s-3)] grid gap-3">
              {body.names.map((n) => {
                const rd = readName(f.surname, n.given, { favour: f.favour, avoid: f.avoid });
                return (
                  <div key={n.given} className="rounded-[6px] border border-[var(--ink-16)] p-4">
                    <p className="flex items-baseline gap-3 flex-wrap"><span className="t-d2 !font-normal">{ch(f.surname)}{[...n.given].map(ch).join("")}</span>
                      <span className="t-small !text-[var(--ink-66)]">{rd.chars.filter((x) => x.role === "名").map((x) => x.info ? `${x.info.zy ?? x.info.py}（${x.info.jp}）` : "").join(" ")}</span></p>
                    <p className="t-small mt-1 !text-[var(--ink-45)]">{rd.chars.map((x) => x.info ? w(`${ch(x.c)} ${x.info.k}劃・${x.info.wx}`) : ch(x.c)).join("　")}{rd.grid && `　｜　${GRID.map(([k, nm]) => `${w(nm)} ${rd.grid![k as keyof typeof rd.grid]}`).join(" ")}`}</p>
                    <p className="t-body mt-2 leading-relaxed">{n.meaning}</p>
                    <p className="t-small mt-1"><b>{ui.rSound}</b>　{n.sound}</p>
                    <p className="t-small mt-1 !text-[var(--ink-66)]"><b>{ui.rWhy}</b>　{n.why}</p>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="mt-[var(--s-6)]">
            <h2 className="t-d3">{ui.rCandidates}</h2>
            <ul className="mt-[var(--s-3)] grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {body.chars.map((c) => { const i = charInfo(c.c); const t = i ? charText(i, l) : null; return (
                <li key={c.c} className="t-small leading-relaxed"><Link href={`/${l}/name/zi/${encodeURIComponent(ch(c.c))}`} className="t-body !text-[18px] mr-2 hover:text-[var(--cinnabar)]">{ch(c.c)}</Link>
                  {i && <span className="!text-[var(--ink-45)] mr-2">{w(`${i.k}劃・${i.wx}`)}</span>}{c.why}{t?.x ? <span className="!text-[var(--cinnabar)]">　{t.x}</span> : null}</li>
              ); })}
            </ul>
          </section>
          <p className="t-body mt-[var(--s-6)] leading-relaxed">{r.kind === "rename" ? ui.endRename : ui.endBaby}</p>
        </>
      )}
      {/* 10-29 (Neil: 产品之间的互相引导): lib/cross-map.ts */}
      <CrossCards source="name_report" locale={l as Locale} exclude={["name"]} />
    </article>
  );
}
