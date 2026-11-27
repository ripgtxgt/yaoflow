"use client";

import { useMemo, useState } from "react";
import { cell, cycleOf, monthsOf, pillarOf, seasons, stemOf, trad, yearCycle, type BaziView, type Pillar } from "@/lib/mingli/bazi/chart";
import { relationsFull, shenshaOf, smallFortunes, type Kind } from "@/lib/mingli/bazi/shensha";
import { TEN_KEYS, branchIndex, stemIndex, type BzName } from "@/lib/mingli/bazi/names-fmt";
import { countWords } from "@/lib/l10n/core";

/**
 * 10-18 (Neil: 八字参考问真八字，大陆很多人用): the professional chart in the layout readers there know —
 * one table with 流年 · 大運 · 年 · 月 · 日 · 時 (主星、天干、地支、藏干、星運、自坐、空亡、納音), the 起運／交運 line,
 * a 大運 strip → its ten 流年 → that year's twelve 流月, the 原局 relations, and 旺相休囚死 for the month.
 * 10-30 进度表 128 ④: on a page in another language (F, names.ts) every term is said in its words; the stems and
 * branches stay the chart's glyphs (lang="zh-Hant") with their reading under them, the stars only the kind ones.
 */
export const EL_COLOR: Record<string, string> = { 木: "#4f7d43", 火: "#b5452f", 土: "#9a7240", 金: "#a3832b", 水: "#3a6ea5" };
export type ProUi = Record<string, string>;

const hue = (el: string) => ({ color: EL_COLOR[el] });
/** a stem or branch glyph, marked as Chinese for screen readers and fonts */
export const Glyph = ({ c }: { c: string }) => <span lang="zh-Hant">{c}</span>;

export default function BaziPro({ v, ui, thisYear, hans, F = null, locale = "zh-hant" }: { v: BaziView; ui: ProUi; thisYear: number; hans: boolean; F?: BzName | null; locale?: string }) {
  const ageOf = (year: number) => year - v.lunarYear + 1;
  const curDec = v.decades.findIndex((d) => thisYear >= d.startYear && thisYear < d.startYear + 10);
  const [dec, setDec] = useState(curDec >= 0 ? curDec : 0);
  const decStart = v.decades[dec]?.startYear ?? thisYear;
  const [year, setYear] = useState(curDec === dec ? thisYear : decStart);
  const [month, setMonth] = useState<number | null>(null);

  const dm = stemOf(v.dayMaster);
  const decPillar = v.decades[dec] ? pillarOf(cycleOf(v.decades[dec]!.gz), dm, ui.dayun) : null;
  const yearPillar = pillarOf(yearCycle(year), dm, ui.liunian);
  const natal = { year: v.pillars[0]!.gz, month: v.pillars[1]!.gz, day: v.pillars[2]!.gz, hour: v.pillars[3]?.gz };
  const NK: Kind[] = ["natal-year", "natal-month", "natal-day", "natal-hour"];
  // a foreign page shows only the kind stars, in its words (names.ts SS_KEPT)
  const ss = (gz: string, k: Kind) => (F ? shenshaOf(gz, natal, v.gender, k).map((x) => F.ss(x)).filter((x): x is string => !!x) : shenshaOf(gz, natal, v.gender, k).map((x) => trad(x, hans)));
  const natalLabel = [ui.p_year, ui.p_month, ui.p_day, ui.p_hour];
  const cols: (Pillar & { kind: "fortune" | "natal"; ss: string[] })[] = [
    { ...yearPillar, kind: "fortune", ss: ss(yearPillar.gz, "fortune") }, ...(decPillar ? [{ ...decPillar, kind: "fortune" as const, ss: ss(decPillar.gz, "fortune") }] : []),
    ...v.pillars.map((p, i) => ({ ...p, label: F ? natalLabel[i] ?? p.label : p.label, kind: "natal" as const, ss: ss(p.gz, NK[i]!) })),
  ];
  const xiao = useMemo(() => {
    if (!v.hasHour) return new Map<number, string>();
    return new Map(smallFortunes(v.pillars[3]!.gz, v.pillars[0]!.stem, v.gender, v.lunarYear, decStart, 10).map((x) => [x.year, x.gz]));
  }, [v, decStart]);
  const years = useMemo(() => Array.from({ length: 10 }, (_, i) => decStart + i).map((y) => ({ y, ...cell(yearCycle(y).getName(), v.dayMaster, hans) })), [decStart, v.dayMaster, hans]);
  const months = useMemo(() => monthsOf(year, v.dayMaster, hans), [year, v.dayMaster, hans]);
  const T = (x: string[]) => x.map((y) => (F ? F.rel(y) : trad(y, hans)));
  const R = relationsFull(v.pillars.map((p) => p.gz));
  const rel = { stems: T(R.stems), branches: T(R.branches), whole: T(R.whole) };
  const RF = relationsFull([...v.pillars.map((p) => p.gz), ...(decPillar ? [decPillar.gz] : []), yearPillar.gz]);
  const fortuneOnly = { stems: T(RF.stems).filter((x) => !rel.stems.includes(x)), branches: T(RF.branches).filter((x) => !rel.branches.includes(x)) };
  const season = seasons(v.pillars[1]!.branch);
  /** the words of a foreign page: the reading under a glyph (pinyin; kana; hangul), a ten god in a cell, the joiner of a list */
  const reading = (c: string) => (!F ? "" : stemIndex(c) >= 0 ? F.N.stemKana?.[stemIndex(c)] ?? F.stem(c) : F.N.branchKana?.[branchIndex(c)] ?? F.branch(c));
  const tenIn = (t: string) => (t === "日主" ? (v.gender === "male" ? ui.dmMale : ui.dmFemale) : F ? F.ten(t) : t);
  const sep = F ? (F.gap === "　" ? "　" : " · ") : "　";
  /** Latin pages abbreviate the ten gods in the narrow cells: the codes are spelled out under the table */
  const coded = !!F && F.N.tenShort["正官"] !== F.N.ten["正官"];
  const monthTop = (m: { date: string }) => {
    if (!F) return "";
    const [mm, dd] = m.date.split("/").map(Number);
    try { return new Date(Date.UTC(mm! < 2 ? year + 1 : year, mm! - 1, dd!)).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" }); } catch { return m.date; }
  };

  const head = "py-1.5 text-[12px] !text-[var(--ink-45)] font-normal";
  const rowLabel = "py-2 pr-1 text-[12px] !text-[var(--ink-45)] whitespace-nowrap align-top text-left";
  const td = (c: { kind: string }) => `py-2 px-0.5 text-center align-top ${c.kind === "fortune" ? "bg-[var(--ink)]/[0.03]" : ""}`;
  /** the strip labels stand upright in Chinese and Japanese; the other languages put them above the strip */
  const vert = !F || F.N.stemKana !== undefined;
  const small = F && !coded ? "text-[12px]" : F ? "text-[11px] leading-tight" : "text-[13px]";

  return (
    <div>
      {/* the table */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[22rem] border-collapse">
          <thead>
            <tr><th className={`${head} text-left`}>{ui.date}</th>{cols.map((c, i) => <th key={`${c.label}${i}`} className={head}>{c.label}</th>)}</tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-[var(--ink-16)]">
            <tr><td className={rowLabel}>{ui.mainStar}</td>{cols.map((c, i) => <td key={i} className={`${td(c)} ${small}`}>{tenIn(c.ten)}</td>)}</tr>
            <tr><td className={rowLabel}>{ui.stem}</td>{cols.map((c, i) => (
              <td key={i} className={`${td(c)} text-[26px] leading-none font-medium`} style={hue(c.stemEl)}><Glyph c={c.stem} />{F && <span className="block mt-1 text-[11px] font-normal !text-[var(--ink-66)]">{reading(c.stem)}</span>}</td>
            ))}</tr>
            <tr><td className={rowLabel}>{ui.branch}</td>{cols.map((c, i) => (
              <td key={i} className={`${td(c)} text-[26px] leading-none font-medium`} style={hue(c.branchEl)}><Glyph c={c.branch} />{F && <span className="block mt-1 text-[11px] font-normal !text-[var(--ink-66)]">{reading(c.branch)}</span>}</td>
            ))}</tr>
            <tr><td className={rowLabel}>{ui.hidden}</td>{cols.map((c, i) => (
              <td key={i} className={`${td(c)} text-[12px] leading-[1.7]`}>{c.hidden.map((h) => <span key={h.stem} className="block whitespace-nowrap"><span style={hue(h.el)}><Glyph c={h.stem} /></span>{F ? ` ${F.tenShort(h.ten)}` : h.ten}</span>)}</td>
            ))}</tr>
            <tr><td className={rowLabel}>{ui.terrain}</td>{cols.map((c, i) => <td key={i} className={`${td(c)} ${small}`}>{F ? F.stage(c.terrain) : c.terrain}</td>)}</tr>
            <tr><td className={rowLabel}>{ui.self}</td>{cols.map((c, i) => <td key={i} className={`${td(c)} ${small}`}>{F ? F.stage(c.selfTerrain) : c.selfTerrain}</td>)}</tr>
            <tr><td className={rowLabel}>{ui.kong}</td>{cols.map((c, i) => <td key={i} className={`${td(c)} ${small}`}>{F ? [...c.kong].map((k) => F.branch(k)).join(F.N.gz.includes(" ") ? " " : "") : c.kong}</td>)}</tr>
            <tr><td className={rowLabel}>{ui.nayin}</td>{cols.map((c, i) => <td key={i} className={`${td(c)} ${F ? "text-[11px] leading-tight" : "text-[12px]"}`}>{F ? F.nayinOf(c.gz) : c.nayin}</td>)}</tr>
            <tr><td className={rowLabel}>{ui.shensha}</td>{cols.map((c, i) => (
              <td key={i} className={`${td(c)} text-[10px] sm:text-[11px] leading-[1.75] !text-[var(--ink-66)]`}>{c.ss.map((x) => <span key={x} className={`block ${F ? "leading-tight mb-1" : "whitespace-nowrap"}`}>{x}</span>)}</td>
            ))}</tr>
          </tbody>
        </table>
      </div>
      {!v.hasHour && <p className="t-small mt-2 !text-[var(--ink-66)]">{ui.threePillars}</p>}
      {coded && F && (
        <p className="mt-2 text-[11px] leading-relaxed !text-[var(--ink-45)]">{ui.legend}: {TEN_KEYS.map((k) => `${F.N.tenShort[k]} = ${F.N.ten[k]}`).join(" · ")}</p>
      )}

      {/* 起運 */}
      {v.start && (
        <p className="t-small mt-[var(--s-4)] !text-[var(--ink-66)] leading-relaxed">
          {countWords(ui.qiyun.replace("{y}", String(v.start.years)).replace("{m}", String(v.start.months)).replace("{d}", String(v.start.days)), locale)}
          <span className="mx-2">·</span>{F
            ? (v.jiaoyunP ? ui.jiaoyun.replace("{t}", F.fill(ui.jiaoyunF ?? "", { a: F.stem(v.jiaoyunP.a), b: F.stem(v.jiaoyunP.b), t: F.jie(v.jiaoyunP.term), d: v.jiaoyunP.days })).replace("{at}", v.start.at) : v.start.at)
            : v.jiaoyun ? ui.jiaoyun.replace("{t}", v.jiaoyun).replace("{at}", v.start.at) : v.start.at}
          {v.siling && <><span className="mx-2">·</span>{ui.siling.replace("{s}", F ? [...v.siling].map((s) => F.stem(s)).join(" / ") : v.siling)}</>}
          {v.extra && <><span className="mx-2">·</span>{ui.extra.replace("{f}", F ? F.gz(v.extra.fetal) : v.extra.fetal).replace("{o}", F ? F.gz(v.extra.own) : v.extra.own).replace("{b}", F ? F.gz(v.extra.body) : v.extra.body)}</>}
        </p>
      )}

      {/* 大運 → 流年 → 流月 */}
      <Strip label={ui.dayun} vertical={vert}>
        {v.decades.map((d, i) => {
          const c = cell(d.gz, v.dayMaster, hans);
          return (
            <Cell key={d.gz} on={i === dec} now={i === curDec} onClick={() => { setDec(i); setYear(i === curDec ? thisYear : d.startYear); setMonth(null); }}
              top={String(d.startYear)} sub={ui.age.replace("{a}", String(ageOf(d.startYear)))} c={c} F={F} />
          );
        })}
      </Strip>
      <Strip label={ui.liunian} vertical={vert}>
        {years.map((y) => <Cell key={y.y} on={y.y === year} now={y.y === thisYear} onClick={() => { setYear(y.y); setMonth(null); }} top={String(y.y)} sub={ui.age.replace("{a}", String(ageOf(y.y)))} c={y} F={F}
          foot={!xiao.has(y.y) ? undefined : F
            // 10-30 (seen live: 「Minor luck 丁未」 spilling over the next year): outside Chinese the label and the pillar each take a line, the pillar in words
            ? <><span className="block whitespace-normal leading-tight">{ui.xiaoyun}</span><span className="block">{F.gz(xiao.get(y.y)!)}</span></>
            : <>{ui.xiaoyun} <Glyph c={xiao.get(y.y)!} /></>} />)}
      </Strip>
      <Strip label={ui.liuyue} vertical={vert}>
        {months.map((m, i) => <Cell key={m.term} on={i === month} onClick={() => setMonth(i === month ? null : i)} top={F ? monthTop(m) : m.term} sub={F ? "" : m.date} c={m} F={F} />)}
      </Strip>
      {F && ui.ageNote && <p className="mt-2 text-[11px] !text-[var(--ink-45)]">{ui.ageNote}</p>}

      {/* relations and seasons */}
      <dl className={`mt-[var(--s-4)] grid ${F ? "grid-cols-[8em_1fr]" : "grid-cols-[6.5em_1fr]"} gap-x-2 gap-y-1.5 text-[13px]`}>
        <dt className="!text-[var(--ink-45)]">{ui.relStem}</dt><dd>{rel.stems.join(sep) || ui.none}</dd>
        <dt className="!text-[var(--ink-45)]">{ui.relBranch}</dt><dd>{rel.branches.join(sep) || ui.none}</dd>
        <dt className="!text-[var(--ink-45)]">{ui.relWhole}</dt><dd>{rel.whole.join(sep) || ui.none}</dd>
        {(fortuneOnly.stems.length > 0 || fortuneOnly.branches.length > 0) && (
          <><dt className="!text-[var(--ink-45)]">{ui.relFortune.replace("{y}", String(year))}</dt><dd>{[...fortuneOnly.stems, ...fortuneOnly.branches].join(sep)}</dd></>
        )}
      </dl>
      <div className="mt-[var(--s-3)] grid grid-cols-5 rounded-[2px] overflow-hidden text-center text-[13px]">
        {season.map((s) => <span key={s.el} className={`py-1.5 text-white ${F ? "text-[12px] leading-tight px-0.5" : ""}`} style={{ background: EL_COLOR[s.el] }}>{F ? `${F.elOf(s.el)}${F.N.gz.includes(" ") ? " " : ""}${F.season(s.state)}` : `${s.el}${s.state}`}</span>)}
      </div>
    </div>
  );
}

function Strip({ label, children, vertical = true }: { label: string; children: React.ReactNode; vertical?: boolean }) {
  if (!vertical) {
    return (
      <div className="mt-[var(--s-3)] border-t border-[var(--ink-16)] pt-2">
        <span className="block text-[12px] mb-1 !text-[var(--ink-45)]">{label}</span>
        <div className="overflow-x-auto [scrollbar-width:thin]"><div className="flex gap-1 min-w-max pb-1">{children}</div></div>
      </div>
    );
  }
  return (
    <div className="mt-[var(--s-3)] flex items-stretch border-t border-[var(--ink-16)] pt-2">
      <span className="w-6 shrink-0 text-[12px] leading-tight !text-[var(--ink-45)] [writing-mode:vertical-rl] tracking-[0.3em] self-center">{label}</span>
      <div className="flex-1 overflow-x-auto [scrollbar-width:thin]"><div className="flex gap-1 min-w-max pb-1">{children}</div></div>
    </div>
  );
}

function Cell({ top, sub, c, on, now, onClick, foot, F = null }: { top: string; sub: string; foot?: React.ReactNode; c: { stem: string; branch: string; stemTen: string; branchTen: string; stemTenFull?: string; branchTenFull?: string; stemEl: string; branchEl: string }; on: boolean; now?: boolean; onClick: () => void; F?: BzName | null }) {
  const st = F && c.stemTenFull ? F.tenShort(c.stemTenFull) : c.stemTen, bt = F && c.branchTenFull ? F.tenShort(c.branchTenFull) : c.branchTen;
  return (
    <button type="button" onClick={onClick}
      className={`w-[3.4rem] shrink-0 rounded-[3px] py-1.5 text-center transition-colors ${on ? "bg-[var(--ink)]/[0.08] ring-1 ring-[var(--ink-45)]" : "hover:bg-[var(--ink)]/[0.04]"}`}>
      <span className={`block text-[11px] tabular-nums whitespace-nowrap ${now ? "font-semibold !text-[var(--gold-text)]" : "!text-[var(--ink-66)]"}`}>{top}</span>
      {sub && <span className="block text-[10px] !text-[var(--ink-45)] tabular-nums whitespace-nowrap">{sub}</span>}
      <span className="block mt-1 text-[16px] leading-tight"><span style={hue(c.stemEl)}><Glyph c={c.stem} /></span><span className="text-[10px] ml-px !text-[var(--ink-66)]">{st}</span></span>
      <span className="block text-[16px] leading-tight"><span style={hue(c.branchEl)}><Glyph c={c.branch} /></span><span className="text-[10px] ml-px !text-[var(--ink-66)]">{bt}</span></span>
      {foot && <span className="block mt-0.5 text-[10px] !text-[var(--ink-45)] whitespace-nowrap">{foot}</span>}
    </button>
  );
}
