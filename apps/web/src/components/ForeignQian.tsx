import Link from "next/link";
import { redirect } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import ProductPage from "@/components/product/ProductPage";
import CrossCards from "@/components/CrossCards";
import AskFromPage from "@/components/AskFromPage";
import QianCard from "@/components/QianCard";
import QianForeignReading from "@/components/QianForeignReading";
import { Qiuqian } from "@/components/JiaobeiFlow";
import { featureState } from "@/lib/features";
import { fmt, type Foreign } from "@/lib/l10n/core";
import { LOCALE_META } from "@/lib/locales";
import { jiaobeiUiIn } from "@/lib/jiaobei-text";
import { cleanQuestion } from "@/lib/jiaobei";
import { foreignLot, lotPath, marketSet, qianUi, SET_NAME, setCount } from "@/lib/qian-foreign";

/**
 * 10-30 进度表 128 ⑤ — the lot products in the seven other languages (lib/qian-foreign.ts): one lot's page, the set's
 * index, drawing a lot online, today's lot, and entering a lot drawn at a temple. Japanese: the Sensō-ji おみくじ; the
 * others: the Guanyin oracle.
 */
const link = "underline underline-offset-4";
const isJa = (l: Foreign) => l === "ja";

export function foreignLotMeta(l: Foreign, n: number): { title: string; description: string } | null {
  const e = foreignLot(l, n);
  if (!e) return null;
  const U = qianUi(l).lot;
  return { title: fmt(U.metaTitle, { set: SET_NAME[l], n, t: e.title }), description: fmt(U.metaDesc, { set: SET_NAME[l], n, t: e.title }) };
}

export function ForeignQianLot({ l, n }: { l: Foreign; n: number }) {
  const e = foreignLot(l, n)!;
  const U = qianUi(l), L = U.lot;
  const c = setCount(l);
  const castHref = `/${l}/cast?c=qian&q=`;
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <TrackOnce event="qian_draw" locale={l} method={`view:${n}`} />
      <nav className="pt-8 t-label"><Link href={`/${l}/jieqian`} className="hover:text-[var(--ink)]">← {L.back}</Link></nav>
      <header className="mt-[var(--s-4)] pb-[var(--s-5)]">
        <p className="t-label !text-[var(--gold-text)]">{fmt(L.label, { set: SET_NAME[l], n })}</p>
        <h1 className="t-d1 mt-1">{fmt(L.h1, { n, t: e.title })}</h1>
      </header>
      <QianCard num={n} ganzhi="" poem={e.poem} setName={isJa(l) ? "淺草寺" : "觀音籤"} />
      <p className="t-small text-center mt-[var(--s-3)] !text-[var(--ink-45)]">{L.poemNote}</p>
      <QianForeignReading locale={l} n={n} castHref={castHref} ui={{ readHead: L.readHead, plainH: L.plainH, overallH: L.overallH, loveH: L.loveH, workH: L.workH, yiH: L.yiH, jiH: L.jiH, lockLead: L.lockLead, lockLink: L.lockLink, loading: L.loading, castBtn: L.castBtn }} />
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-66)]">{isJa(l) ? U.set.whereSensoji : U.set.whereGuanyin}</p>
      <p className="t-small mt-1 !text-[var(--ink-45)]">{L.boundary}</p>
      {/* 11-04 外语转化: the question box itself under the lot */}
      <AskFromPage locale={l} from="qian" />
      <nav className="mt-[var(--s-6)] flex justify-between t-small">
        {n > 1 ? <Link href={lotPath(l, n - 1)} className={link}>{fmt(L.prev, { n: n - 1 })}</Link> : <span />}
        <Link href={`/${l}/qian/${marketSet(l)}`} className={link}>{fmt(L.all, { c })}</Link>
        {n < c ? <Link href={lotPath(l, n + 1)} className={link}>{fmt(L.next, { n: n + 1 })}</Link> : <span />}
      </nav>
    </article>
  );
}

export function foreignIndexMeta(l: Foreign) {
  const U = qianUi(l).index, c = setCount(l);
  return { title: fmt(U.metaTitle, { set: SET_NAME[l], c }), description: fmt(U.metaDesc, { set: SET_NAME[l], c }) };
}
export function ForeignQianIndex({ l }: { l: Foreign }) {
  const U = qianUi(l), c = setCount(l);
  const lots = Array.from({ length: c }, (_, i) => foreignLot(l, i + 1)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <article className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pb-20">
      <nav className="pt-8 t-label"><Link href={`/${l}/jieqian`} className="hover:text-[var(--ink)]">← {U.lot.back}</Link></nav>
      <header className="mt-[var(--s-4)] pb-[var(--s-5)]">
        <h1 className="t-d1">{fmt(U.index.h1, { set: SET_NAME[l], c })}</h1>
        <p className="t-body mt-[var(--s-3)] leading-relaxed text-[var(--ink-66)]">{isJa(l) ? U.set.whereSensoji : U.set.whereGuanyin}</p>
        <p className="mt-[var(--s-4)] flex flex-wrap gap-x-5 gap-y-2 t-small">
          <Link href={`/${l}/qiuqian`} className={link}>{U.index.draw}</Link>
          <Link href={`/${l}/jieqian`} className={link}>{U.index.have}</Link>
        </p>
      </header>
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        {lots.map((e) => (
          <li key={e.num} className="py-2 border-t border-dotted border-[var(--ink-16)]">
            <Link href={lotPath(l, e.num)} className="group flex gap-3 items-baseline">
              <span className="t-label tabular-nums shrink-0 w-[2.5rem] !text-[var(--ink-45)]">{e.num}</span>
              <span className="t-small group-hover:text-[var(--cinnabar)] transition-colors">{e.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </article>
  );
}

/* ---------------------------------------------------------------- 線上求籤 */

export function foreignQiuqianMeta(l: Foreign) {
  const U = qianUi(l).qiuqian;
  return { title: fmt(U.metaTitle, { set: SET_NAME[l] }), description: fmt(U.metaDesc, { set: SET_NAME[l] }) };
}
export function ForeignQiuqian({ l, signedIn, q }: { l: Foreign; signedIn: boolean; q: string }) {
  const U = qianUi(l).qiuqian;
  const set = marketSet(l), c = setCount(l);
  const temples = isJa(l)
    ? [{ id: "sensoji", name: U.templeSensoji, set, setName: SET_NAME[l], count: c }]
    : [{ id: "longshan", name: U.templeGuanyin, set, setName: SET_NAME[l], count: c }];
  const qq = cleanQuestion(q);
  return (
    <ProductPage
      locale={l} preview={featureState("jiaobei") === "preview"}
      title={U.title} lead={U.lead}
      input={<>
        <Qiuqian locale={l} ui={jiaobeiUiIn(l)} temples={temples} initialQ={qq} />
        <p className="t-small mt-[var(--s-5)] text-center"><Link href={`/${l}/jiaobei`} className={link}>{U.toJiaobei}</Link></p>
      </>}
      fit={{ yes: U.fitYes, no: U.fitNo }} how={U.how} free={U.free} paid={U.paid} boundary={U.boundary}
      promo={<CrossCards source="daily" locale={l} exclude={["jieqian"]} />}
    />
  );
}

/* ---------------------------------------------------------------- 今日一籤 */

export function foreignTodayMeta(l: Foreign) {
  const U = qianUi(l).today;
  return { title: fmt(U.metaTitle, { set: SET_NAME[l] }), description: fmt(U.metaDesc, { set: SET_NAME[l] }) };
}
export function ForeignTodayQian({ l, day, num }: { l: Foreign; day: string; num: number }) {
  const U = qianUi(l), T = U.today, L = U.lot;
  const e = foreignLot(l, num)!;
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const date = new Intl.DateTimeFormat(LOCALE_META[l].htmlLang, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  return (
    <ProductPage
      locale={l} preview={featureState("today-qian") === "preview"}
      title={T.title} lead={fmt(T.lead, { date, set: SET_NAME[l] })}
      input={<>
        <TrackOnce event="today_qian" locale={l} method="view" />
        <p className="t-label !text-[var(--gold-text)] text-center">{T.yours} · {fmt(L.label, { set: SET_NAME[l], n: num })}</p>
        <h2 className="t-d3 text-center mt-1 mb-[var(--s-4)]">{e.title}</h2>
        <QianCard num={num} ganzhi="" poem={e.poem} setName={isJa(l) ? "淺草寺" : "觀音籤"} />
        <p className="t-small text-center mt-[var(--s-3)] !text-[var(--ink-45)]">{T.again}</p>
        <QianForeignReading locale={l} n={num} castHref={`/${l}/cast?c=today-qian`} ui={{ readHead: L.readHead, plainH: L.plainH, overallH: L.overallH, loveH: L.loveH, workH: L.workH, yiH: L.yiH, jiH: L.jiH, lockLead: L.lockLead, lockLink: L.lockLink, loading: L.loading, castBtn: L.castBtn }} />
        <p className="t-small mt-[var(--s-4)]"><Link href={lotPath(l, num)} className={link}>{fmt(L.label, { set: SET_NAME[l], n: num })} →</Link></p>
      </>}
      fit={{ yes: T.fitYes, no: T.fitNo }} how={T.how} free={T.free} paid={T.paid} boundary={T.boundary}
      promo={<CrossCards source="daily" locale={l} exclude={["today-qian"]} />}
    />
  );
}

/* ---------------------------------------------------------------- 解籤（輸入籤號） */

export function foreignJieqianMeta(l: Foreign) {
  const U = qianUi(l).jieqian;
  return { title: fmt(U.metaTitle, { set: SET_NAME[l] }), description: fmt(U.metaDesc, { set: SET_NAME[l] }) };
}
export function ForeignJieqian({ l, n }: { l: Foreign; n: string | undefined }) {
  const U = qianUi(l).jieqian, c = setCount(l);
  const num = Number(n);
  if (n && Number.isInteger(num) && num >= 1 && num <= c) redirect(lotPath(l, num));
  const bad = !!n;
  return (
    <ProductPage
      locale={l} preview={false}
      title={U.title} lead={isJa(l) ? U.leadSensoji : U.leadGuanyin}
      input={<>
        <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: U.title }} />
        <form method="get" action={`/${l}/jieqian`} className="flex flex-wrap items-end gap-3">
          <label className="t-small text-[var(--ink-66)] grid gap-2">{fmt(U.numLabel, { c })}
            <input name="n" type="number" min={1} max={c} required inputMode="numeric" className="w-32 border border-[var(--ink-16)] rounded-[2px] px-3 py-2.5 bg-transparent t-body" />
          </label>
          <button type="submit" className="min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[14px] tracking-[0.1em]">{U.go}</button>
        </form>
        {bad && <p className="t-small mt-2 text-[var(--cinnabar)]">{fmt(U.bad, { c })}</p>}
        <p className="mt-[var(--s-4)] flex flex-wrap gap-x-5 gap-y-2 t-small">
          <Link href={`/${l}/qiuqian`} className={link}>{U.drawOnline}</Link>
          <Link href={`/${l}/qian/${marketSet(l)}`} className={link}>{fmt(U.browse, { c })}</Link>
        </p>
      </>}
      fit={{ yes: U.fitYes, no: U.fitNo }} how={U.how} free={U.free} paid={U.paid} boundary={U.boundary}
      promo={<CrossCards source="daily" locale={l} exclude={["jieqian"]} />}
    />
  );
}
