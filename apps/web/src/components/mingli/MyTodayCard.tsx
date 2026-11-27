import Link from "next/link";
import { toHans } from "@/lib/hant";
import type { MyDay } from "@/lib/my-chart";

/**
 * 10-22 进度表 92 會員「你的今天」— the card on 每日運勢 (and the one line on 黃曆): a member with a chart sees their day read
 * against their own 八字 (lib/mingli/bazi/today.ts); a member without one is asked once for their birth; anyone else
 * sees one line on what the membership adds. Server-rendered; the chart itself never reaches the page.
 */
const z = (locale: string, s: string) => (locale === "zh" ? toHans(s) : s);
const dots = (n: number) => `${"●".repeat(n)}${"○".repeat(5 - n)}`;

export default function MyTodayCard({ locale, day, mode = "card" }: { locale: string; day: MyDay; mode?: "card" | "almanac" }) {
  const w = (s: string) => z(locale, s);
  if (day.state === "teaser") {
    return (
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]" data-heat={`mytoday-teaser-${mode}`}>
        {w(mode === "almanac" ? "會員：多一行「今天對你」，按你的八字看今天和你的日柱沖不沖。" : "會員：每天按你的八字算「你的今天」，也寫進每天早上的信。")}{" "}
        <Link href={`/${locale}/account#membership`} className="underline underline-offset-4">{w("看會員方案")} →</Link>
      </p>
    );
  }
  if (day.state === "need") {
    return (
      <div className="mt-[var(--s-4)] rounded-[2px] border border-[var(--gold)] px-[var(--s-4)] py-[var(--s-3)]" data-heat={`mytoday-need-${mode}`}>
        <p className="t-body">{w("填一次你的生辰（存在你的帳號裡，標成「自己」），這裡每天就會按你的八字算今天。")}</p>
        <Link href={`/${locale}/bazi?c=mytoday`} className="inline-block mt-[var(--s-2)] t-small underline underline-offset-4">{w("去填生辰")} →</Link>
      </div>
    );
  }
  const t = day.today;
  const x = day.plus ?? null;
  if (mode === "almanac") {
    return (
      <div className="mt-[var(--s-4)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-3)]" data-heat="mytoday-almanac">
        <p className="t-label !text-[var(--gold-text)]">{w("今天對你")}</p>
        <p className="t-body mt-1 leading-relaxed">{w(t.almanac)}</p>
      </div>
    );
  }
  return (
    <section className="mt-[var(--s-4)] rounded-[2px] border border-[var(--gold)] px-[var(--s-4)] py-[var(--s-4)]" data-heat="mytoday-card" aria-label={w("你的今天")}>
      <p className="t-label !text-[var(--gold-text)]">{w("你的今天 · 按你的八字")}</p>
      <p className="t-sect mt-1">{t.dayGz}{w("日")} · {w(t.word)} <span className="!text-[var(--gold-text)] tracking-[1px] t-small" aria-hidden>{dots(t.level)}</span></p>
      <p className="t-body mt-[var(--s-2)] leading-relaxed">{w(t.line)}</p>
      {t.tip && <p className="t-body mt-[var(--s-2)] leading-relaxed !text-[var(--ink-66)]">{w(t.tip)}</p>}
      {/* 10-26: 宜忌、時段、顏色方位、沖日預告、桃花、你們倆、七天 (lib/mingli/bazi/today-plus.ts) */}
      {x && (x.yi.length > 0 || x.ji.length > 0) && (
        <p className="t-body mt-[var(--s-3)] leading-relaxed">
          {x.yi.length > 0 && <><span className="!text-[var(--gold-text)]">{w("宜")}</span> {w(x.yi.join("、"))}</>}
          {x.yi.length > 0 && x.ji.length > 0 && <span className="mx-2 !text-[var(--ink-45)]">·</span>}
          {x.ji.length > 0 && <><span className="!text-[var(--cinnabar)]">{w("忌")}</span> {w(x.ji.join("、"))}</>}
        </p>
      )}
      {[x?.hours, x?.habits, x?.clashAhead].filter(Boolean).map((v) => <p key={v!} className="t-small mt-[var(--s-2)] leading-relaxed !text-[var(--ink-66)]">{w(v!)}</p>)}
      {x?.peach && <p className="t-small mt-[var(--s-2)] leading-relaxed"><span className="!text-[var(--cinnabar)]">{w("桃花日")}</span> {w(x.peach)} <Link href={`/${locale}/zhengyuan?c=mytoday`} className="underline underline-offset-4">{w("正緣畫像")} →</Link></p>}
      {x?.pair && <p className="t-small mt-[var(--s-2)] leading-relaxed"><span className="!text-[var(--gold-text)]">{w("你們倆")}</span> {w(x.pair)}</p>}
      {x && x.week.length === 7 && (
        <div className="mt-[var(--s-3)]">
          <div className="grid grid-cols-7 gap-1 text-center" aria-label={w("這七天")}>
            {x.week.map((d) => (
              <div key={d.ymd} className={`rounded-[2px] py-1 t-small leading-tight ${d.level >= 4 ? "bg-[var(--gold)]/[0.12] !text-[var(--gold-text)]" : d.level <= 2 ? "!text-[var(--ink-45)]" : ""}`}>
                <span className="block text-[11px]">{d.md.split(" ")[0]}</span><span className="block text-[11px]">{w(d.md.split(" ")[1] ?? "")}</span><span className="block text-[12px] font-medium">{w(d.word)}</span>
              </div>
            ))}
          </div>
          {x.weekLine && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{w(x.weekLine)} <Link href={`/${locale}/zeri?c=mytoday`} className="underline underline-offset-4">{w("擇日")} →</Link></p>}
        </div>
      )}
    </section>
  );
}
