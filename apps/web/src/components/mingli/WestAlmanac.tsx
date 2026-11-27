import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import ProductPage from "@/components/product/ProductPage";
import CrossCards from "@/components/CrossCards";
import { DateJump, TermChips, type Chip } from "@/components/mingli/HuangliBits";
import { featureState } from "@/lib/features";
import { fmt, type Foreign } from "@/lib/l10n/core";
import { LOCALE_META } from "@/lib/locales";
import { BAZI_NAMES, bzName } from "@/lib/mingli/bazi/names";
import { huangliDay, HOUR_SPANS, parseYmd, type HuangliDay } from "@/lib/mingli/calendar/day";
import { shiftDay, shiftMonth, todayYmd } from "@/lib/mingli/calendar/page-bits";
import { almanacText, type AlmanacText } from "@/lib/mingli/calendar/almanac-west";
import { purposeDays, PURPOSES, type PurposeSlug } from "@/lib/mingli/calendar/zeri-purpose";
import { matterBySlug } from "@/lib/mingli/calendar/zeri";

/**
 * 10-30 进度表 128 ⑤ — the Chinese almanac (黃曆) and its date picker (擇日) in English, French, German, Spanish and
 * Portuguese: the same days the Chinese pages show (huangliDay, China time), in words from lib/mingli/calendar/almanac-west.ts.
 */
const link = "underline underline-offset-4";
const BR = "子丑寅卯辰巳午未申酉戌亥";
const ZODIAC_ZH = "鼠牛虎兔龙蛇马羊猴鸡狗猪";
const TERM_ZH = ["立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒"];
const DUTY_TW: Record<string, string> = { 建: "建", 除: "除", 满: "滿", 平: "平", 定: "定", 执: "執", 破: "破", 危: "危", 成: "成", 收: "收", 开: "開", 闭: "閉" };
const faqLd = (faq: { q: string; a: string }[]) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });

const lang = (l: Foreign) => LOCALE_META[l].htmlLang;
const utc = (ymd: string) => { const p = parseYmd(ymd)!; return new Date(Date.UTC(p.y, p.m - 1, p.d)); };
export const longDate = (l: Foreign, ymd: string) => new Intl.DateTimeFormat(lang(l), { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(utc(ymd));
const shortDate = (l: Foreign, ymd: string) => new Intl.DateTimeFormat(lang(l), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(utc(ymd));
export const monthName = (l: Foreign, ym: string) => new Intl.DateTimeFormat(lang(l), { year: "numeric", month: "long", timeZone: "UTC" }).format(utc(`${ym}-01`));
const weekdays = (l: Foreign) => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang(l), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 1 + i)))); // 2026-11-01 is a Sunday

const animal = (l: Foreign, zh: string) => BAZI_NAMES[l].animals[ZODIAC_ZH.indexOf(zh)] ?? zh;
const termName = (T: AlmanacText, zh: string) => T.terms[TERM_ZH.indexOf(zh)] ?? "";
const chips = (T: AlmanacText, keys: string[]): Chip[] => keys.filter((k) => T.yiji[k]).map((k) => ({ key: k, name: T.yiji[k]!.name, plain: T.yiji[k]!.plain, example: "", page: null }));
export const lunarIn = (T: AlmanacText, d: HuangliDay) => fmt(d.lunar.leap ? T.page.lunarLeap : T.page.lunarDate, { m: d.lunar.monthNum, d: d.lunar.dayNum });

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[8rem_1fr] gap-3 py-2 border-b border-[var(--ink-16)]"><dt className="t-small !text-[var(--ink-66)]">{k}</dt><dd className="t-body">{children}</dd></div>;
}

function DayCard({ l, T, d }: { l: Foreign; T: AlmanacText; d: HuangliDay }) {
  const P = T.page, F = bzName(l);
  const yi = chips(T, d.yi), ji = chips(T, d.ji);
  const duty = T.duty[DUTY_TW[d.duty] ?? d.duty];
  const good = d.hours.filter((h) => h.huangdao);
  return (
    <div className="grid gap-[var(--s-5)]">
      <section>
        <h2 className="t-sect">{P.yi}</h2>
        <p className="t-small mt-1 mb-[var(--s-2)] !text-[var(--ink-66)]">{P.yiHint}</p>
        {yi.length ? <TermChips items={yi} tone="yi" locale={l} more="" /> : <p className="t-body !text-[var(--ink-66)]">{P.noneYi}</p>}
        {d.onlyListed && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{P.onlyListed}</p>}
      </section>
      <section>
        <h2 className="t-sect">{P.ji}</h2>
        <p className="t-small mt-1 mb-[var(--s-2)] !text-[var(--ink-66)]">{P.jiHint}</p>
        {d.nothing && <p className="t-body mb-[var(--s-2)] text-[var(--cinnabar)]">{P.nothing}</p>}
        {ji.length ? <TermChips items={ji} tone="ji" locale={l} more="" /> : !d.nothing && <p className="t-body !text-[var(--ink-66)]">{P.noneJi}</p>}
      </section>
      <dl>
        <Row k={P.lunar}>{lunarIn(T, d)}</Row>
        <Row k={P.gz}>{fmt(P.gzLine, { gz: F.gz(d.gz.day) })}</Row>
        <Row k={P.term}>{d.term.today ? fmt(P.termToday, { t: termName(T, d.term.name) }) : fmt(P.termNow, { t: termName(T, d.term.name) })}</Row>
        <Row k={P.chong}>
          {fmt(P.chongLine, { z: animal(l, d.chong.zodiac), dir: (T.dirs as Record<string, string>)[d.sha] ?? d.sha })}
          <span className="block t-small mt-1 !text-[var(--ink-66)]">{P.chongNote}</span>
        </Row>
        {duty && <Row k={P.duty}>{duty.name}<span className="block t-small mt-1 !text-[var(--ink-66)]">{duty.note}</span></Row>}
        <Row k={P.hours}>
          <span className="flex flex-wrap gap-x-4 gap-y-1">{good.map((h) => <span key={h.branch} className="tabular-nums">{fmt(P.hourItem, { span: HOUR_SPANS[h.branch] ?? "", z: BAZI_NAMES[l].animals[BR.indexOf(h.branch)] ?? "" })}</span>)}</span>
          <span className="block t-small mt-1 !text-[var(--ink-66)]">{P.hoursNote}</span>
        </Row>
      </dl>
    </div>
  );
}

function Nav({ l, T, ymd }: { l: Foreign; T: AlmanacText; ymd: string }) {
  const P = T.page;
  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 t-small">
      <Link href={`/${l}/huangli/${shiftDay(ymd, -1)}`} className={link}>← {P.prevDay}</Link>
      <Link href={`/${l}/huangli/${shiftDay(ymd, 1)}`} className={link}>{P.nextDay} →</Link>
      <Link href={`/${l}/huangli/${ymd.slice(0, 7)}`} className={link}>{P.thisMonth}</Link>
      <DateJump locale={l} value={ymd} label={P.jump} go={P.go} />
    </nav>
  );
}
function Tail({ l, T }: { l: Foreign; T: AlmanacText }) {
  return (
    <section className="mt-[var(--s-6)] grid gap-2 t-small">
      <Link href={`/${l}/zeri?c=huangli`} className={link}>{T.page.toZeri}</Link>
      <Link href={`/${l}/cast?c=huangli`} className={`${link} !text-[var(--ink-66)]`}>{T.page.cast}</Link>
      <p className="!text-[var(--ink-45)]">{T.page.timeNote}</p>
    </section>
  );
}

export function WestAlmanacToday({ l }: { l: Foreign }) {
  const T = almanacText(l), P = T.page;
  const ymd = todayYmd();
  const p = parseYmd(ymd)!;
  const d = huangliDay(p.y, p.m, p.d);
  return (
    <ProductPage
      locale={l} preview={featureState("huangli") === "preview"}
      title={P.title} lead={fmt(P.lead, { date: longDate(l, ymd) })}
      input={<Nav l={l} T={T} ymd={ymd} />}
      fit={{ yes: P.fitYes, no: P.fitNo }} how={P.how} free={P.free} boundary={P.boundary} faq={P.faq}
      promo={<CrossCards source="daily" locale={l} exclude={["huangli"]} />}
    >
      <JsonLd data={faqLd(P.faq)} />
      <TrackOnce event="huangli" locale={l} method="view:today" />
      <div className="mt-[var(--s-5)]"><DayCard l={l} T={T} d={d} /></div>
      <Tail l={l} T={T} />
      <section className="mt-[var(--s-6)]"><h2 className="t-sect">{P.whatHead}</h2><p className="t-body mt-[var(--s-2)] leading-relaxed text-[var(--ink-86)]">{P.what}</p></section>
    </ProductPage>
  );
}

export function WestAlmanacDay({ l, ymd }: { l: Foreign; ymd: string }) {
  const T = almanacText(l), P = T.page;
  const p = parseYmd(ymd)!;
  const d = huangliDay(p.y, p.m, p.d);
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="huangli" locale={l} method="view:day" />
      <nav className="t-label"><Link href={`/${l}/huangli`} className="hover:text-[var(--ink)]">← {P.back}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{fmt(P.dayTitle, { date: longDate(l, ymd) })}</h1>
      <div className="mt-[var(--s-3)]"><Nav l={l} T={T} ymd={ymd} /></div>
      <div className="mt-[var(--s-5)]"><DayCard l={l} T={T} d={d} /></div>
      <Tail l={l} T={T} />
    </div>
  );
}

export function WestAlmanacMonth({ l, ym }: { l: Foreign; ym: string }) {
  const T = almanacText(l), P = T.page;
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: n }, (_, i) => huangliDay(y, m, i + 1));
  const today = todayYmd();
  return (
    <div className="mx-auto w-full max-w-[56rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="huangli" locale={l} method="view:month" />
      <nav className="t-label"><Link href={`/${l}/huangli`} className="hover:text-[var(--ink)]">← {P.back}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{fmt(P.monthTitle, { month: monthName(l, ym) })}</h1>
      <nav className="mt-[var(--s-3)] flex gap-5 t-small">
        <Link href={`/${l}/huangli/${shiftMonth(ym, -1)}`} className={link}>← {P.prevMonth}</Link>
        <Link href={`/${l}/huangli/${shiftMonth(ym, 1)}`} className={link}>{P.nextMonth} →</Link>
      </nav>
      <div className="mt-[var(--s-5)] grid grid-cols-7 gap-px bg-[var(--ink-16)] border border-[var(--ink-16)] text-center">
        {weekdays(l).map((x) => <div key={x} className="bg-[var(--paper)] t-sect py-2">{x}</div>)}
        {Array.from({ length: cells[0]!.weekday }, (_, i) => <div key={`e${i}`} className="bg-[var(--paper)]" />)}
        {cells.map((c) => (
          <Link key={c.ymd} href={`/${l}/huangli/${c.ymd}`} className={`bg-[var(--paper)] px-1 py-2 min-h-[5.5rem] hover:bg-[var(--gold)]/[0.08] ${c.ymd === today ? "outline outline-1 outline-[var(--ink)] -outline-offset-1" : ""}`}>
            <span className="block t-body tabular-nums">{c.d}</span>
            <span className={`block text-[11px] ${c.term.today ? "!text-[var(--gold-text)]" : "!text-[var(--ink-45)]"}`}>{c.term.today ? termName(T, c.term.name) : lunarIn(T, c)}</span>
            <span className="hidden sm:block text-[11px] mt-1 !text-[var(--ink-66)] leading-tight">{c.nothing ? P.nothingShort : chips(T, c.yi).slice(0, 2).map((x) => x.name).join(" · ")}</span>
            <span className="block text-[10px] mt-0.5 !text-[var(--cinnabar)]">{fmt(P.clashShort, { z: animal(l, c.chong.zodiac) })}</span>
          </Link>
        ))}
      </div>
      <p className="t-small mt-[var(--s-4)] !text-[var(--ink-45)]">{P.monthNote} {P.timeNote}</p>
      <Tail l={l} T={T} />
    </div>
  );
}

/* ---------------------------------------------------------------- 擇日 */

const SLUGS: PurposeSlug[] = ["wedding", "move", "opening"];

export function WestZeri({ l, purpose }: { l: Foreign; purpose: PurposeSlug | null }) {
  const T = almanacText(l), Z = T.zeri;
  const from = todayYmd();
  const ps = purpose ? [purpose] : SLUGS;
  const Pp = purpose ? Z.purposes[purpose] : null;
  const faq = Pp ? Pp.faq : SLUGS.map((s) => Z.purposes[s].faq[0]!).filter(Boolean);
  return (
    <ProductPage
      locale={l} preview={featureState("zeri") === "preview"}
      title={Pp ? Pp.h1 : Z.title} lead={Pp ? Pp.desc : Z.lead}
      input={<nav className="flex flex-wrap gap-x-5 gap-y-2 t-small">
        <span className="!text-[var(--ink-66)]">{Z.pick}</span>
        {SLUGS.map((k) => k === purpose ? <span key={k} className="font-medium">{Z.names[k]}</span> : <Link key={k} href={`/${l}/zeri/${k}`} className={link}>{Z.names[k]}</Link>)}
      </nav>}
      fit={{ yes: Z.fitYes, no: Z.fitNo }} how={Z.how} free={Z.free} boundary={Z.boundary} faq={faq}
      promo={<CrossCards source="daily" locale={l} exclude={["zeri"]} />}
    >
      <JsonLd data={faqLd(faq)} />
      <TrackOnce event="zeri" locale={l} method={purpose ? `view:${purpose}` : "view"} />
      {Pp && <p className="t-body mt-[var(--s-5)] leading-relaxed text-[var(--ink-86)]">{Pp.intro}</p>}
      {ps.map((p) => {
        const months = purposeDays(PURPOSES[p], from, "zh-hant");
        const shown = purpose ? months : months.slice(0, 1);
        return (
          <section key={p} className="mt-[var(--s-6)]">
            {!purpose && <h2 className="t-sect">{Z.purposes[p].h1}</h2>}
            {shown.length === 0 && <p className="t-body mt-[var(--s-2)] !text-[var(--ink-66)]">{Z.none}</p>}
            {shown.map((mo) => (
              <div key={mo.ym} className="mt-[var(--s-3)]">
                <h3 className="t-body font-medium">{monthName(l, mo.ym)} <span className="t-small !text-[var(--ink-45)]">{fmt(Z.count, { n: mo.days.length })}</span></h3>
                <ul className="mt-[var(--s-2)] divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
                  {mo.days.map((x) => {
                    const hd = huangliDay(+x.ymd.slice(0, 4), +x.ymd.slice(5, 7), +x.ymd.slice(8, 10));
                    const mine = new Set(PURPOSES[p].matters.flatMap((s) => matterBySlug(s)?.yi ?? []));
                    const words = chips(T, hd.yi.filter((k) => mine.has(k))).map((c) => c.name);
                    return (
                      <li key={x.ymd} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <Link href={`/${l}/huangli/${x.ymd}`} className={`${link} t-body tabular-nums`}>{shortDate(l, x.ymd)}</Link>
                        {words.length > 0 && <span className="t-small !text-[var(--ink-66)]">{fmt(Z.matched, { w: words.join(", ") })}</span>}
                        <span className="t-small !text-[var(--cinnabar)]">{fmt(Z.clash, { z: animal(l, x.chong) })}</span>
                        {x.weekend && <span className="t-small px-1.5 border border-[var(--gold)] rounded-[2px] !text-[var(--gold-text)]">{Z.weekend}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {!purpose && <p className="t-small mt-[var(--s-2)]"><Link href={`/${l}/zeri/${p}`} className={link}>{Z.more}</Link></p>}
          </section>
        );
      })}
      {Pp && <ul className="mt-[var(--s-6)] grid gap-2 t-small list-disc pl-5 !text-[var(--ink-86)]">{Pp.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-66)]">{Z.howItWorks}</p>
      <section className="mt-[var(--s-4)] grid gap-2 t-small">
        <Link href={`/${l}/huangli?c=zeri`} className={link}>{T.page.title} →</Link>
        <Link href={`/${l}/cast?c=zeri`} className={`${link} !text-[var(--ink-66)]`}>{T.page.cast}</Link>
      </section>
    </ProductPage>
  );
}

export function westPurposeTitle(l: Foreign, p: PurposeSlug): string {
  const T = almanacText(l);
  const months = purposeDays(PURPOSES[p], todayYmd(), "zh-hant").slice(0, 3);
  const y0 = months[0]?.ym.slice(0, 4) ?? todayYmd().slice(0, 4), y1 = months[months.length - 1]?.ym.slice(0, 4) ?? y0;
  const fmtM = (ym: string) => new Intl.DateTimeFormat(lang(l), { month: "long", timeZone: "UTC" }).format(utc(`${ym}-01`));
  return fmt(T.zeri.purposes[p].title, { y: y1 !== y0 ? `${y0}–${y1}` : y0, months: months.map((m) => fmtM(m.ym)).join(", ") });
}

/* ---------------------------------------------------------------- metadata */

export function westHuangliMeta(l: Foreign, s: string | null): { title: string; description: string } | null {
  const T = almanacText(l), P = T.page;
  if (s === null) return { title: P.metaTitle, description: P.metaDesc };
  if (/^\d{4}-\d{2}$/.test(s)) return { title: fmt(P.monthMeta, { month: monthName(l, s) }), description: fmt(P.monthDesc, { month: monthName(l, s) }) };
  const p = parseYmd(s);
  if (!p) return null;
  const d = huangliDay(p.y, p.m, p.d);
  const date = longDate(l, s);
  return {
    title: fmt(P.dayMeta, { date }),
    description: fmt(P.dayDesc, { date, lunar: lunarIn(T, d), gz: bzName(l).gz(d.gz.day), yi: chips(T, d.yi).slice(0, 4).map((c) => c.name).join(", ") || "—", z: animal(l, d.chong.zodiac) }),
  };
}
export function westZeriMeta(l: Foreign, p: PurposeSlug | null): { title: string; description: string } {
  const Z = almanacText(l).zeri;
  return p ? { title: westPurposeTitle(l, p), description: Z.purposes[p].desc } : { title: Z.metaTitle, description: Z.metaDesc };
}
