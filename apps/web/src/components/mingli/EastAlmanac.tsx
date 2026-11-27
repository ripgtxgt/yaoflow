import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import ProductPage from "@/components/product/ProductPage";
import CrossCards from "@/components/CrossCards";
import { DateJump } from "@/components/mingli/HuangliBits";
import { featureState } from "@/lib/features";
import { shiftDay, shiftMonth } from "@/lib/mingli/calendar/page-bits";
import { eastDay, jaCandidates, jaDay, koDay, koSonDays, monthDays, TERMS_JA, TERMS_KO, type JaDay, type JaPurpose, type KoDay } from "@/lib/mingli/calendar/koyomi";
import { GOOD_MARKS, JA, JA_WEEK, JA_ZERI, KO, KO_WEEK, KO_ZERI, ROKUYO_NOTE, SENJITSU_NOTE } from "@/lib/mingli/calendar/koyomi-text";

/**
 * 10-30 进度表 128 ⑤ — the 黃曆 and 擇日 pages for Japanese readers (今日の暦・吉日カレンダー: 六曜、選日、旧暦、二十四節気)
 * and Korean readers (오늘의 음력·일진, 손 없는 날). Facts from lib/mingli/calendar/koyomi.ts, words from koyomi-text.ts.
 */
const link = "underline underline-offset-4";
const faqLd = (faq: { q: string; a: string }[]) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
const jaDate = (j: { y: number; m: number; d: number; weekday: number }) => `${j.y}年${j.m}月${j.d}日（${JA_WEEK[j.weekday]}）`;
const koDate = (k: { y: number; m: number; d: number; weekday: number }) => `${k.y}년 ${k.m}월 ${k.d}일 (${KO_WEEK[k.weekday]})`;
const ymdParts = (s: string) => s.split("-").map(Number) as [number, number, number];
const weekendCls = (w: number) => (w === 0 ? "!text-[var(--cinnabar)]" : w === 6 ? "!text-[var(--gold-text)]" : "");

/* ================================================================== 日本 */

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[7rem_1fr] gap-3 py-2 border-b border-[var(--ink-16)]"><dt className="t-small !text-[var(--ink-66)]">{k}</dt><dd className="t-body">{children}</dd></div>;
}

function JaDayCard({ j }: { j: JaDay }) {
  const good = j.marks.filter((x) => GOOD_MARKS.includes(x));
  const bad = j.marks.filter((x) => !GOOD_MARKS.includes(x));
  return (
    <div>
      <section className="border border-[var(--ink-16)] rounded-[2px] p-[var(--s-4)]">
        <p className="t-small !text-[var(--ink-66)]">{JA.rokuyo}</p>
        <p className="t-d1 mt-1">{j.rokuyo}</p>
        <p className="t-body mt-[var(--s-2)] leading-relaxed text-[var(--ink-86)]">{ROKUYO_NOTE[j.rokuyo]}</p>
      </section>
      <section className="mt-[var(--s-4)]">
        <h2 className="t-sect">{JA.marks}</h2>
        {j.marks.length === 0 && <p className="t-body mt-[var(--s-2)] !text-[var(--ink-66)]">{JA.none}</p>}
        <ul className="mt-[var(--s-2)] grid gap-3">
          {[...good, ...bad].map((x) => (
            <li key={x} className={`pl-[var(--s-3)] border-l-2 ${GOOD_MARKS.includes(x) ? "border-[var(--gold)]" : "border-[var(--cinnabar)]"}`}>
              <b className={`font-medium ${GOOD_MARKS.includes(x) ? "" : "text-[var(--cinnabar)]"}`}>{x}</b>
              <p className="t-small mt-0.5 !text-[var(--ink-86)]">{SENJITSU_NOTE[x]}</p>
            </li>
          ))}
        </ul>
      </section>
      <dl className="mt-[var(--s-5)]">
        <Row k={JA.lunar}>{JA.lunarDate(j.lunar.month, j.lunar.day, j.lunar.leap)}</Row>
        <Row k={JA.gz}>{j.gz}</Row>
        <Row k={JA.choku}>{j.choku}</Row>
        <Row k={JA.term}>{j.term ? JA.termToday(TERMS_JA[j.term.idx]!, j.term.at) : JA.termNow(TERMS_JA[j.termNow]!)}</Row>
      </dl>
    </div>
  );
}

function JaNav({ ymd }: { ymd: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 t-small">
      <Link href={`/ja/huangli/${shiftDay(ymd, -1)}`} className={link}>← {JA.prevDay}</Link>
      <Link href={`/ja/huangli/${shiftDay(ymd, 1)}`} className={link}>{JA.nextDay} →</Link>
      <Link href={`/ja/huangli/${ymd.slice(0, 7)}`} className={link}>{JA.thisMonth}</Link>
      <DateJump locale="ja" value={ymd} label={JA.jump} go={JA.go} />
    </nav>
  );
}

function JaTail() {
  return (
    <section className="mt-[var(--s-6)] grid gap-2 t-small">
      <Link href="/ja/zeri?c=huangli" className={link}>{JA.toZeri}</Link>
      <Link href="/ja/taisui?c=huangli" className={`${link} !text-[var(--ink-66)]`}>{JA.toTaisui}</Link>
      <Link href="/ja/cast?c=huangli" className={`${link} !text-[var(--ink-66)]`}>{JA.cast}</Link>
    </section>
  );
}

export function JaKoyomiToday() {
  const ymd = eastDay();
  const [y, m, d] = ymdParts(ymd);
  const j = jaDay(y, m, d);
  return (
    <ProductPage
      locale="ja" preview={featureState("huangli") === "preview"}
      title={JA.title} lead={JA.lead(jaDate(j))}
      input={<JaNav ymd={ymd} />}
      fit={{ yes: JA.fitYes, no: JA.fitNo }} how={JA.how} free={JA.free} boundary={JA.boundary} faq={JA.faq}
      promo={<CrossCards source="daily" locale="ja" exclude={["huangli"]} />}
    >
      <JsonLd data={faqLd(JA.faq)} />
      <TrackOnce event="huangli" locale="ja" method="view:today" />
      <div className="mt-[var(--s-5)]"><JaDayCard j={j} /></div>
      <JaMonthLists y={y} m={m} />
      <JaTail />
      {JA.sections.map((s) => (
        <section key={s.h} className="mt-[var(--s-6)]"><h2 className="t-sect">{s.h}</h2><p className="t-body mt-[var(--s-2)] leading-relaxed text-[var(--ink-86)]">{s.p}</p></section>
      ))}
    </ProductPage>
  );
}

export function JaKoyomiDay({ ymd }: { ymd: string }) {
  const [y, m, d] = ymdParts(ymd);
  const j = jaDay(y, m, d);
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="huangli" locale="ja" method="view:day" />
      <nav className="t-label"><Link href="/ja/huangli" className="hover:text-[var(--ink)]">← {JA.back}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{JA.dayTitle(y, m, d)}</h1>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{jaDate(j)}</p>
      <div className="mt-[var(--s-3)]"><JaNav ymd={ymd} /></div>
      <div className="mt-[var(--s-5)]"><JaDayCard j={j} /></div>
      <JaTail />
    </div>
  );
}

function JaMonthLists({ y, m }: { y: number; m: number }) {
  const days = Array.from({ length: monthDays(y, m) }, (_, i) => jaDay(y, m, i + 1));
  const lists: { k: string; ds: JaDay[] }[] = [
    { k: "大安", ds: days.filter((x) => x.rokuyo === "大安") },
    { k: "一粒万倍日", ds: days.filter((x) => x.marks.includes("一粒万倍日")) },
    { k: "天赦日", ds: days.filter((x) => x.marks.includes("天赦日")) },
    { k: "寅の日", ds: days.filter((x) => x.marks.includes("寅の日")) },
    { k: "巳の日", ds: days.filter((x) => x.marks.includes("巳の日") || x.marks.includes("己巳の日")) },
    { k: JA.overlap, ds: days.filter((x) => x.rokuyo === "大安" && x.marks.includes("一粒万倍日")) },
    { k: "不成就日", ds: days.filter((x) => x.marks.includes("不成就日")) },
  ];
  return (
    <section className="mt-[var(--s-6)]">
      <h2 className="t-sect">{`${m}月の吉日`}</h2>
      <dl className="mt-[var(--s-2)]">
        {lists.map((l) => (
          <Row key={l.k} k={l.k}>
            {l.ds.length === 0 ? <span className="!text-[var(--ink-45)]">{JA.noDays}</span> : (
              <span className="flex flex-wrap gap-x-3 gap-y-1">{l.ds.map((x) => <Link key={x.ymd} href={`/ja/huangli/${x.ymd}`} className={`${link} ${weekendCls(x.weekday)}`}>{JA.dayN(x.d, JA_WEEK[x.weekday]!)}</Link>)}</span>
            )}
          </Row>
        ))}
      </dl>
    </section>
  );
}

export function JaKoyomiMonth({ ym }: { ym: string }) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const days = Array.from({ length: monthDays(y, m) }, (_, i) => jaDay(y, m, i + 1));
  const today = eastDay();
  return (
    <div className="mx-auto w-full max-w-[56rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="huangli" locale="ja" method="view:month" />
      <nav className="t-label"><Link href="/ja/huangli" className="hover:text-[var(--ink)]">← {JA.back}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{JA.monthTitle(y, m)}</h1>
      <nav className="mt-[var(--s-3)] flex gap-5 t-small">
        <Link href={`/ja/huangli/${shiftMonth(ym, -1)}`} className={link}>← {JA.prevMonth}</Link>
        <Link href={`/ja/huangli/${shiftMonth(ym, 1)}`} className={link}>{JA.nextMonth} →</Link>
      </nav>
      <div className="mt-[var(--s-5)] grid grid-cols-7 gap-px bg-[var(--ink-16)] border border-[var(--ink-16)] text-center">
        {JA_WEEK.map((x, i) => <div key={x} className={`bg-[var(--paper)] t-sect py-2 ${weekendCls(i)}`}>{x}</div>)}
        {Array.from({ length: days[0]!.weekday }, (_, i) => <div key={`e${i}`} className="bg-[var(--paper)]" />)}
        {days.map((c) => (
          <Link key={c.ymd} href={`/ja/huangli/${c.ymd}`} className={`bg-[var(--paper)] px-1 py-2 min-h-[5.5rem] hover:bg-[var(--gold)]/[0.08] ${c.ymd === today ? "outline outline-1 outline-[var(--ink)] -outline-offset-1" : ""}`}>
            <span className={`block t-body tabular-nums ${weekendCls(c.weekday)}`}>{c.d}</span>
            <span className={`block text-[12px] ${c.rokuyo === "大安" ? "!text-[var(--gold-text)] font-medium" : c.rokuyo === "仏滅" ? "!text-[var(--ink-45)]" : "!text-[var(--ink-66)]"}`}>{c.rokuyo}</span>
            {c.term && <span className="block text-[10px] !text-[var(--gold-text)]">{TERMS_JA[c.term.idx]}</span>}
            {c.marks.filter((x) => x === "天赦日" || x === "一粒万倍日" || x === "不成就日").map((x) => (
              <span key={x} className={`block text-[10px] leading-tight mt-0.5 ${x === "不成就日" ? "!text-[var(--cinnabar)]" : "!text-[var(--gold-text)]"}`}>{x === "一粒万倍日" ? "万倍" : x === "不成就日" ? "不成就" : x}</span>
            ))}
          </Link>
        ))}
      </div>
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{JA.monthNote}</p>
      <JaMonthLists y={y} m={m} />
      <JaTail />
    </div>
  );
}

/* ---------------------------------------------------------------- 吉日カレンダー */

function JaCandList({ items }: { items: { day: JaDay; score: number }[] }) {
  if (!items.length) return <p className="t-body mt-[var(--s-2)] !text-[var(--ink-66)]">{JA_ZERI.none}</p>;
  return (
    <ul className="mt-[var(--s-2)] divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
      {items.map(({ day: x }) => (
        <li key={x.ymd} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link href={`/ja/huangli/${x.ymd}`} className={`${link} t-body tabular-nums ${weekendCls(x.weekday)}`}>{`${x.m}月${x.d}日（${JA_WEEK[x.weekday]}）`}</Link>
          <span className="t-small">{x.rokuyo}</span>
          {x.marks.filter((k) => GOOD_MARKS.includes(k)).map((k) => <span key={k} className="t-small px-1.5 border border-[var(--gold)] rounded-[2px] !text-[var(--gold-text)]">{k}</span>)}
          {(x.weekday === 0 || x.weekday === 6) && <span className="t-small !text-[var(--ink-45)]">{JA_ZERI.weekend}</span>}
        </li>
      ))}
    </ul>
  );
}

export function JaZeri({ purpose }: { purpose: JaPurpose | null }) {
  const from = eastDay();
  const ps = purpose ? [purpose] : (["wedding", "move", "opening"] as JaPurpose[]);
  const P = purpose ? JA_ZERI.purposes[purpose] : null;
  return (
    <ProductPage
      locale="ja" preview={featureState("zeri") === "preview"}
      title={P ? P.title : JA_ZERI.title} lead={P ? P.why : JA_ZERI.lead}
      input={<nav className="flex flex-wrap gap-x-5 gap-y-2 t-small">
        {(["wedding", "move", "opening"] as JaPurpose[]).map((k) => k === purpose
          ? <span key={k} className="font-medium">{JA_ZERI.purposes[k].name}</span>
          : <Link key={k} href={`/ja/zeri/${k}`} className={link}>{JA_ZERI.purposes[k].name}</Link>)}
        <Link href="/ja/huangli" className={`${link} !text-[var(--ink-66)]`}>{JA_ZERI.backToKoyomi}</Link>
      </nav>}
      fit={{ yes: JA_ZERI.fitYes, no: JA_ZERI.fitNo }} how={JA_ZERI.how} free={JA_ZERI.free} boundary={JA_ZERI.boundary} faq={JA_ZERI.faq}
      promo={<CrossCards source="daily" locale="ja" exclude={["zeri"]} />}
    >
      <JsonLd data={faqLd(JA_ZERI.faq)} />
      <TrackOnce event="zeri" locale="ja" method={purpose ? `view:${purpose}` : "view"} />
      {ps.map((p) => {
        const all = jaCandidates(p, from);
        const top = [...all].sort((a, b) => b.score - a.score || a.day.ymd.localeCompare(b.day.ymd)).slice(0, 8).sort((a, b) => a.day.ymd.localeCompare(b.day.ymd));
        return (
          <section key={p} className="mt-[var(--s-6)]">
            {!purpose && <h2 className="t-sect">{JA_ZERI.purposes[p].title}</h2>}
            {!purpose && <p className="t-small mt-1 !text-[var(--ink-66)]">{JA_ZERI.purposes[p].why}</p>}
            <h3 className="t-body font-medium mt-[var(--s-3)]">{JA_ZERI.top}</h3>
            <JaCandList items={top} />
            {purpose ? <>
              <h3 className="t-body font-medium mt-[var(--s-5)]">{JA_ZERI.all}</h3>
              <JaCandList items={all} />
            </> : <p className="t-small mt-[var(--s-2)]"><Link href={`/ja/zeri/${p}`} className={link}>{JA_ZERI.more}</Link></p>}
          </section>
        );
      })}
      <section className="mt-[var(--s-6)] t-small"><Link href="/ja/cast?c=zeri" className={`${link} !text-[var(--ink-66)]`}>{JA.cast}</Link></section>
    </ProductPage>
  );
}

/* ================================================================== 한국 */

function KoDayCard({ k }: { k: KoDay }) {
  const next = koSonDays(k.ymd, 31).filter((x) => x.ymd !== k.ymd).slice(0, 4);
  return (
    <div>
      <section className={`border rounded-[2px] p-[var(--s-4)] ${k.sonEomneun ? "border-[var(--gold)]" : "border-[var(--ink-16)]"}`}>
        <p className="t-small !text-[var(--ink-66)]">{KO.lunar}</p>
        <p className="t-d1 mt-1">{KO.lunarDate(k.lunar.month, k.lunar.day, k.lunar.leap)}</p>
        <p className="t-body mt-[var(--s-2)]"><b className="font-medium">{KO.son}</b> · {k.sonEomneun ? KO.sonYes : KO.sonNo(k.sonDir)}</p>
      </section>
      <dl className="mt-[var(--s-5)]">
        <Row k={KO.gz}>{KO.gzLine(k.gzKo, k.gz)}</Row>
        <Row k={KO.term}>{k.term ? KO.termToday(TERMS_KO[k.term.idx]!, k.term.at) : KO.termNow(TERMS_KO[k.termNow]!)}</Row>
        <Row k={KO.chong}>{KO.chongLine(k.chongAnimal)}</Row>
        <Row k="띠">{KO.year(k.yearAnimal)}</Row>
      </dl>
      <section className="mt-[var(--s-5)]">
        <h2 className="t-sect">{KO.nextSon}</h2>
        <p className="mt-[var(--s-2)] flex flex-wrap gap-x-4 gap-y-1 t-body">
          {next.map((x) => <Link key={x.ymd} href={`/ko/huangli/${x.ymd}`} className={`${link} ${weekendCls(x.weekday)}`}>{KO.dayN(x.m, x.d, KO_WEEK[x.weekday]!)}</Link>)}
        </p>
      </section>
    </div>
  );
}

function KoNav({ ymd }: { ymd: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 t-small">
      <Link href={`/ko/huangli/${shiftDay(ymd, -1)}`} className={link}>← {KO.prevDay}</Link>
      <Link href={`/ko/huangli/${shiftDay(ymd, 1)}`} className={link}>{KO.nextDay} →</Link>
      <Link href={`/ko/huangli/${ymd.slice(0, 7)}`} className={link}>{KO.thisMonth}</Link>
      <DateJump locale="ko" value={ymd} label={KO.jump} go={KO.go} />
    </nav>
  );
}
function KoTail() {
  return (
    <section className="mt-[var(--s-6)] grid gap-2 t-small">
      <Link href="/ko/zeri?c=huangli" className={link}>{KO.toZeri}</Link>
      <Link href="/ko/taisui?c=huangli" className={`${link} !text-[var(--ink-66)]`}>{KO.toTaisui}</Link>
      <Link href="/ko/yunshi?c=huangli" className={`${link} !text-[var(--ink-66)]`}>{KO.toYunshi}</Link>
      <Link href="/ko/cast?c=huangli" className={`${link} !text-[var(--ink-66)]`}>{KO.cast}</Link>
    </section>
  );
}

export function KoAlmanacToday() {
  const ymd = eastDay();
  const [y, m, d] = ymdParts(ymd);
  const k = koDay(y, m, d);
  return (
    <ProductPage
      locale="ko" preview={featureState("huangli") === "preview"}
      title={KO.title} lead={KO.lead(koDate(k))}
      input={<KoNav ymd={ymd} />}
      fit={{ yes: KO.fitYes, no: KO.fitNo }} how={KO.how} free={KO.free} boundary={KO.boundary} faq={KO.faq}
      promo={<CrossCards source="daily" locale="ko" exclude={["huangli"]} />}
    >
      <JsonLd data={faqLd(KO.faq)} />
      <TrackOnce event="huangli" locale="ko" method="view:today" />
      <div className="mt-[var(--s-5)]"><KoDayCard k={k} /></div>
      <KoTail />
    </ProductPage>
  );
}

export function KoAlmanacDay({ ymd }: { ymd: string }) {
  const [y, m, d] = ymdParts(ymd);
  const k = koDay(y, m, d);
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="huangli" locale="ko" method="view:day" />
      <nav className="t-label"><Link href="/ko/huangli" className="hover:text-[var(--ink)]">← {KO.back}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{KO.dayTitle(y, m, d)}</h1>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{koDate(k)}</p>
      <div className="mt-[var(--s-3)]"><KoNav ymd={ymd} /></div>
      <div className="mt-[var(--s-5)]"><KoDayCard k={k} /></div>
      <KoTail />
    </div>
  );
}

export function KoAlmanacMonth({ ym }: { ym: string }) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const days = Array.from({ length: monthDays(y, m) }, (_, i) => koDay(y, m, i + 1));
  const today = eastDay();
  const son = days.filter((x) => x.sonEomneun);
  return (
    <div className="mx-auto w-full max-w-[56rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="huangli" locale="ko" method="view:month" />
      <nav className="t-label"><Link href="/ko/huangli" className="hover:text-[var(--ink)]">← {KO.back}</Link></nav>
      <h1 className="t-d1 mt-[var(--s-3)]">{KO.monthTitle(y, m)}</h1>
      <nav className="mt-[var(--s-3)] flex gap-5 t-small">
        <Link href={`/ko/huangli/${shiftMonth(ym, -1)}`} className={link}>← {KO.prevMonth}</Link>
        <Link href={`/ko/huangli/${shiftMonth(ym, 1)}`} className={link}>{KO.nextMonth} →</Link>
      </nav>
      <section className="mt-[var(--s-4)]">
        <h2 className="t-sect">{KO.monthList}</h2>
        <p className="mt-[var(--s-2)] flex flex-wrap gap-x-4 gap-y-1 t-body">
          {son.map((x) => <Link key={x.ymd} href={`/ko/huangli/${x.ymd}`} className={`${link} ${weekendCls(x.weekday)}`}>{KO.dayN(x.m, x.d, KO_WEEK[x.weekday]!)}</Link>)}
        </p>
      </section>
      <div className="mt-[var(--s-5)] grid grid-cols-7 gap-px bg-[var(--ink-16)] border border-[var(--ink-16)] text-center">
        {KO_WEEK.map((x, i) => <div key={x} className={`bg-[var(--paper)] t-sect py-2 ${weekendCls(i)}`}>{x}</div>)}
        {Array.from({ length: days[0]!.weekday }, (_, i) => <div key={`e${i}`} className="bg-[var(--paper)]" />)}
        {days.map((c) => (
          <Link key={c.ymd} href={`/ko/huangli/${c.ymd}`} className={`px-1 py-2 min-h-[5rem] hover:bg-[var(--gold)]/[0.08] ${c.sonEomneun ? "bg-[var(--gold)]/[0.10]" : "bg-[var(--paper)]"} ${c.ymd === today ? "outline outline-1 outline-[var(--ink)] -outline-offset-1" : ""}`}>
            <span className={`block t-body tabular-nums ${weekendCls(c.weekday)}`}>{c.d}</span>
            <span className="block text-[11px] !text-[var(--ink-45)]">{c.lunar.day === 1 ? `${c.lunar.leap ? "윤" : ""}${c.lunar.month}.1` : c.lunar.day}</span>
            {c.term && <span className="block text-[10px] !text-[var(--gold-text)]">{TERMS_KO[c.term.idx]}</span>}
            {c.sonEomneun && <span className="block text-[10px] leading-tight mt-0.5 !text-[var(--gold-text)] font-medium">{KO.son}</span>}
          </Link>
        ))}
      </div>
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{KO.monthNote}</p>
      <KoTail />
    </div>
  );
}

export function KoZeri() {
  const from = eastDay();
  const all = koSonDays(from);
  const wk = all.filter((x) => x.weekday === 0 || x.weekday === 6);
  const List = ({ ds }: { ds: KoDay[] }) => ds.length === 0 ? <p className="t-body mt-[var(--s-2)] !text-[var(--ink-66)]">{KO_ZERI.none}</p> : (
    <ul className="mt-[var(--s-2)] divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
      {ds.map((x) => (
        <li key={x.ymd} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link href={`/ko/huangli/${x.ymd}`} className={`${link} t-body tabular-nums ${weekendCls(x.weekday)}`}>{KO.dayN(x.m, x.d, KO_WEEK[x.weekday]!)}</Link>
          <span className="t-small !text-[var(--ink-66)]">{`${KO.lunar} ${KO.lunarDate(x.lunar.month, x.lunar.day, x.lunar.leap)} · ${x.gzKo}일`}</span>
          <span className="t-small !text-[var(--ink-45)]">{KO_ZERI.chong(x.chongAnimal)}</span>
          {(x.weekday === 0 || x.weekday === 6) && <span className="t-small px-1.5 border border-[var(--gold)] rounded-[2px] !text-[var(--gold-text)]">{KO_ZERI.weekend}</span>}
        </li>
      ))}
    </ul>
  );
  return (
    <ProductPage
      locale="ko" preview={featureState("zeri") === "preview"}
      title={KO_ZERI.title} lead={KO_ZERI.lead}
      input={<nav className="t-small"><Link href="/ko/huangli" className={link}>{KO_ZERI.backToAlmanac}</Link></nav>}
      fit={{ yes: KO_ZERI.fitYes, no: KO_ZERI.fitNo }} how={KO_ZERI.how} free={KO_ZERI.free} boundary={KO_ZERI.boundary} faq={KO_ZERI.faq}
      promo={<CrossCards source="daily" locale="ko" exclude={["zeri"]} />}
    >
      <JsonLd data={faqLd(KO_ZERI.faq)} />
      <TrackOnce event="zeri" locale="ko" method="view" />
      <section className="mt-[var(--s-6)]"><h2 className="t-sect">{KO_ZERI.weekendHead}</h2><List ds={wk} /></section>
      <section className="mt-[var(--s-6)]"><h2 className="t-sect">{KO_ZERI.allHead}</h2><List ds={all} /></section>
      <section className="mt-[var(--s-6)] grid gap-2 t-small">
        <Link href="/ko/taisui?c=zeri" className={`${link} !text-[var(--ink-66)]`}>{KO.toTaisui}</Link>
        <Link href="/ko/cast?c=zeri" className={`${link} !text-[var(--ink-66)]`}>{KO.cast}</Link>
      </section>
    </ProductPage>
  );
}

/* ================================================================== metadata */

export function eastMeta(l: "ja" | "ko", s: string | null): { title: string; description: string } | null {
  if (s === null) return l === "ja" ? { title: JA.metaTitle, description: JA.metaDesc } : { title: KO.metaTitle, description: KO.metaDesc };
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-").map(Number) as [number, number];
    return l === "ja" ? { title: JA.monthMeta(y, m), description: JA.monthDesc(y, m) } : { title: KO.monthMeta(y, m), description: KO.monthDesc(y, m) };
  }
  const [y, m, d] = ymdParts(s);
  if (l === "ja") {
    const j = jaDay(y, m, d);
    const marks = j.marks.filter((x) => GOOD_MARKS.includes(x)).join("・");
    return { title: JA.dayMeta(y, m, d, JA_WEEK[j.weekday]!, j.rokuyo, marks), description: JA.dayDesc(y, m, d, JA_WEEK[j.weekday]!, j.rokuyo, marks, JA.lunarDate(j.lunar.month, j.lunar.day, j.lunar.leap)) };
  }
  const k = koDay(y, m, d);
  return { title: KO.dayMeta(y, m, d, KO_WEEK[k.weekday]!, KO.lunarDate(k.lunar.month, k.lunar.day, k.lunar.leap), k.sonEomneun), description: KO.dayDesc(y, m, d, KO.lunarDate(k.lunar.month, k.lunar.day, k.lunar.leap), k.gzKo, k.sonEomneun) };
}
export function zeriMeta(l: "ja" | "ko", p: JaPurpose | null): { title: string; description: string } {
  if (l === "ko") return { title: KO_ZERI.metaTitle, description: KO_ZERI.metaDesc };
  return p ? { title: JA_ZERI.purposes[p].metaTitle, description: JA_ZERI.purposes[p].metaDesc } : { title: JA_ZERI.metaTitle, description: JA_ZERI.metaDesc };
}
