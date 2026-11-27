import { HOUR_SPANS, term, WEEK_ZH, type HlLocale, type HuangliDay } from "@/lib/mingli/calendar/day";
import { loc, N, note, overview, yijiInfo } from "@/lib/mingli/calendar/content";
import { TermChips, type Chip } from "./HuangliBits";

/**
 * 10-17 进度表 69 黃曆: one day — the head, 宜／忌 (each word opens its plain meaning), the day in one plain sentence,
 * and the rest of the almanac folded below (沖煞、彭祖百忌、神煞、建除、二十八宿、九星、胎神、方位、時辰).
 */
export default function HuangliDayView({ d, locale, hk = false }: { d: HuangliDay; locale: HlLocale; hk?: boolean }) {
  const w = (s: string) => loc(s, locale);
  const t = (s: string) => term(s, locale);
  const chips = (keys: string[]): Chip[] => keys.map((k) => ({ key: k, ...yijiInfo(k, locale) }));
  const lunar = `農曆${d.lunar.yearGz}年${t(d.lunar.month)}${t(d.lunar.day)}`;
  const termLine = d.term.today
    ? w(`今天交${term(d.term.name)}（${d.term.at!.slice(5)}）`)
    : w(`${term(d.term.name)}第 ${d.term.dayIndex + 1} 天 · 下一個節氣${term(d.nextTerm.name)} ${d.nextTerm.at.slice(5).replace("-", "/")}`);
  const lucky = d.gods.filter((g) => g.lucky), unlucky = d.gods.filter((g) => !g.lucky);
  return (
    <div>
      {/* head */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="t-d2 tabular-nums">{d.y}.{d.m}.{d.d}</p>
        <p className="t-body !text-[var(--ink-66)]">{w(`星期${WEEK_ZH[d.weekday]}`)}</p>
      </div>
      <p className="t-body mt-1">{w(lunar)}</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{w(`${d.gz.year}年 ${d.gz.month}月 ${d.gz.day}日 · 屬${term(d.zodiacYear)}`)} · {termLine}</p>
      {d.festivals.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-2">{d.festivals.map((f) => <span key={f} className="t-label px-2 py-0.5 border border-[var(--gold)] !text-[var(--gold-text)] rounded-[2px]">{w(term(f))}</span>)}</p>
      )}

      {/* the answer: 宜 / 忌 */}
      <section className="mt-[var(--s-5)] grid gap-[var(--s-5)]">
        <div>
          <h2 className="t-sect mb-[var(--s-2)]">{w("宜")}</h2>
          {d.yi.length ? <TermChips items={chips(d.yi)} tone="yi" locale={locale} more={w("看「{t}」的說明 →")} /> : <p className="t-body !text-[var(--ink-66)]">—</p>}
          {d.onlyListed && <p className="t-small mt-2 !text-[var(--ink-66)]">{w("餘事勿取：上面列的之外，其他事不選這天。")}</p>}
        </div>
        <div>
          <h2 className="t-sect mb-[var(--s-2)] !text-[var(--cinnabar)]">{w("忌")}</h2>
          {d.nothing && <p className="t-body mb-2 !text-[var(--cinnabar)]">{w("諸事不宜")}</p>}
          {d.ji.length > 0 && <TermChips items={chips(d.ji)} tone="ji" locale={locale} more={w("看「{t}」的說明 →")} />}
        </div>
      </section>

      {/* today in one sentence */}
      <p className="t-body mt-[var(--s-5)] leading-relaxed border-l-2 border-[var(--gold)] pl-4">{overview(d, locale)}</p>

      {/* the rest, folded */}
      <details className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)] group" open>
        <summary className="cursor-pointer list-none t-sect">{w("沖煞、神煞與時辰")}</summary>
        <dl className="mt-[var(--s-3)] grid grid-cols-[6.5em_1fr] gap-x-4 gap-y-3 t-body">
          <dt className="t-sect pt-1">{w("沖煞")}</dt>
          <dd>{w(`沖${term(d.chong.zodiac)}（${d.chong.branch}）· 煞${term(d.sha)}`)}<span className="block t-small !text-[var(--ink-66)]">{w(N.chongsha)}</span></dd>
          <dt className="t-sect pt-1">{w("彭祖百忌")}</dt>
          <dd>{d.pengzu.map((p) => <span key={p} className="block">{t(p)}<span className="block t-small !text-[var(--ink-66)]">{note("pengzu", term(p), locale)}</span></span>)}</dd>
          <dt className="t-sect pt-1">{w("吉神")}</dt>
          <dd>{lucky.map((g) => t(g.name)).join("、") || "—"}</dd>
          <dt className="t-sect pt-1">{w("凶煞")}</dt>
          <dd>{unlucky.map((g) => t(g.name)).join("、") || "—"}</dd>
          <dt className="t-sect pt-1">{w("值神")}</dt>
          <dd>{w(`${term(d.twelveGod.name)}（${d.twelveGod.huangdao ? "黃道" : "黑道"}）`)}<span className="block t-small !text-[var(--ink-66)]">{note("twelveGods", term(d.twelveGod.name), locale)}</span></dd>
          <dt className="t-sect pt-1">{w("建除")}</dt>
          <dd>{w(`${term(d.duty)}日`)}<span className="block t-small !text-[var(--ink-66)]">{note("duty", term(d.duty), locale)}</span></dd>
          <dt className="t-sect pt-1">{w("二十八宿")}</dt>
          <dd>{w(`${term(d.xiu.name)}宿`)}<span className="block t-small !text-[var(--ink-66)]">{note("xiu", term(d.xiu.name), locale)}</span></dd>
          <dt className="t-sect pt-1">{w("九星")}</dt>
          <dd>{t(d.nineStar)}<span className="block t-small !text-[var(--ink-66)]">{note("nineStar", term(d.nineStar), locale)}</span></dd>
          <dt className="t-sect pt-1">{w("納音")}</dt>
          <dd>{t(d.nayin)}</dd>
          <dt className="t-sect pt-1">{w("胎神")}</dt>
          <dd>{t(d.fetus)}</dd>
          <dt className="t-sect pt-1">{w("方位")}</dt>
          <dd>{w(`喜神${term(d.dirs.xi)} · 福神${term(d.dirs.fu)} · 財神${term(d.dirs.cai)} · 陽貴${term(d.dirs.yangGui)} · 陰貴${term(d.dirs.yinGui)}`)}</dd>
        </dl>
        <h3 className="t-sect mt-[var(--s-5)] mb-[var(--s-2)]">{w("時辰")}</h3>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {d.hours.map((h) => (
            <li key={h.ganzhi} className={`px-3 py-2 rounded-[2px] border ${h.huangdao ? "border-[var(--gold)]/60" : "border-[var(--ink-16)]"}`}>
              <p className="t-body">{w(`${h.branch}時`)} <span className="t-small !text-[var(--ink-45)] tabular-nums">{HOUR_SPANS[h.branch]}</span></p>
              <p className="t-small !text-[var(--ink-66)]">{w(`${h.ganzhi} · ${h.huangdao ? "黃道" : "黑道"}`)}</p>
              {h.yi.length > 0 && <p className="t-small !text-[var(--ink-66)]">{w("宜")} {h.yi.slice(0, 3).map(t).join("、")}</p>}
            </li>
          ))}
        </ul>
      </details>
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{w(hk ? "民間通勝常見宜忌，各家不一，僅供參考。" : "民間通書常見宜忌，各家不一，僅供參考。")}</p>
    </div>
  );
}
