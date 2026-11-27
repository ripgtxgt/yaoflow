"use client";

import { useMemo } from "react";
import { trad, type BaziView } from "@/lib/mingli/bazi/chart";
import { GROUP_ORDER, insightOf, TEN_ORDER } from "@/lib/mingli/bazi/insight";
import { EL_COLOR } from "./BaziPro";
import type { BzName } from "@/lib/mingli/bazi/names-fmt";

/**
 * 10-18 (Neil: 免費盤補上「看懂這張盤」那一層) — 格局、五行能量、十神占比、身強身弱、喜忌、神煞分組、四柱關係圖,
 * under the chart. Numbers come from lib/mingli/bazi/insight.ts (fixed rules); words from page-ui.
 * 10-30 进度表 128 ④: on a page in another language every term is said with its names (F, names.ts).
 */
const EL = ["木", "火", "土", "金", "水"] as const;
type Ui = Record<string, string>;

export default function BaziInsight({ v, ui, hans, F = null }: { v: BaziView; ui: Ui; hans: boolean; F?: BzName | null }) {
  const ins = useMemo(() => insightOf(v.pillars.map((p) => p.gz), v.gender), [v]);
  const T = (s: string) => trad(s, hans);
  const E = (e: string) => (F ? F.elOf(e) : e);
  const pct = (x: number, of: number) => (of ? Math.round((x / of) * 1000) / 10 : 0);
  const strong = v.strength.level === "偏強" || v.strength.level === "稍強";
  const weak = v.strength.level === "偏弱" || v.strength.level === "稍弱";
  const xi = v.favour;
  // 忌: the side that already weighs too much — 印、比劫 for a strong chart, 食傷、財、官殺 for a weak one
  const ji = !strong && !weak ? [] : EL.filter((e) => {
    const idx = (EL.indexOf(e) - EL.indexOf(v.dmEl as (typeof EL)[number]) + 5) % 5; // 0 比劫 1 食傷 2 財 3 官殺 4 印
    return strong ? idx === 0 || idx === 4 : idx >= 1 && idx <= 3;
  });
  const sect = "border-t border-[var(--ink-16)] pt-[var(--s-4)] mt-[var(--s-4)]";

  return (
    <div>
      {/* 格局 */}
      {ins.geju && (
        <div id="geju" className="scroll-mt-20">
          <p className="t-sect">{ui.gejuHead}</p>
          <p className="t-d3 mt-1">{F ? F.geju(ins.geju.name) : T(ins.geju.name)}</p>
          <p className="t-small mt-1 !text-[var(--ink-66)]">{(F ? F.josa : (s: string) => s)((ins.geju.shown ? ui.gejuShown : ui.gejuHidden).replace("{b}", F ? F.branch(v.pillars[1]!.branch) : v.pillars[1]!.branch).replace("{s}", F ? F.stem(ins.geju.stem) : ins.geju.stem))}</p>
          <p className="t-body mt-2 leading-relaxed">{ui[`geju_${ins.geju.ten}`] ?? ""}</p>
        </div>
      )}

      {/* 五行能量 */}
      <div className={sect}>
        <p className="t-sect">{ui.energyHead}</p>
        <div className="mt-2 grid gap-1.5">
          {EL.map((e) => (
            <div key={e} className={`grid ${F ? "grid-cols-[4.6em_1fr_6.5em]" : "grid-cols-[1.6em_1fr_6.5em]"} items-center gap-2 text-[13px]`}>
              <span style={{ color: EL_COLOR[e] }}>{E(e)}</span>
              <span className="h-2 rounded-[2px] bg-[var(--ink)]/[0.06] overflow-hidden"><span className="block h-full" style={{ width: `${pct(ins.energy[e], ins.total)}%`, background: EL_COLOR[e] }} /></span>
              <span className="tabular-nums text-right !text-[var(--ink-66)]">{ins.energy[e]} · {pct(ins.energy[e], ins.total)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* 十神 */}
      <div className={sect}>
        <p className="t-sect">{ui.tenHead}</p>
        <div className="mt-2 flex h-2.5 rounded-[2px] overflow-hidden">
          {GROUP_ORDER.map((g, i) => ins.groups[g]! > 0 && <span key={g} style={{ width: `${pct(ins.groups[g]!, ins.total)}%`, background: `color-mix(in srgb, var(--ink) ${70 - i * 12}%, var(--paper))` }} />)}
        </div>
        <div className="mt-2 grid grid-cols-5 text-center text-[12px]">
          {GROUP_ORDER.map((g) => <span key={g}><span className="block !text-[var(--ink-66)]">{ui[`grp_${g}`]}</span><span className="tabular-nums">{pct(ins.groups[g]!, ins.total)}%</span></span>)}
        </div>
        <div className="mt-1.5 grid grid-cols-5 text-center text-[11px] leading-[1.7] !text-[var(--ink-45)]">
          {GROUP_ORDER.map((g, i) => (
            <span key={g}>{TEN_ORDER.slice(i * 2, i * 2 + 2).map((t) => <span key={t} className={`block ${F ? "leading-tight mb-1" : "whitespace-nowrap"}`}>{F ? F.ten(t) : T(t)} {pct(ins.tens[t]!, ins.total)}%</span>)}</span>
          ))}
        </div>
      </div>

      {/* 身強身弱 */}
      <div className={sect}>
        <p className="t-sect">{ui.supportHead}</p>
        <p className="t-body mt-1">{ui.strengthLine.replace("{dm}", F ? F.dm(v.dayMaster) : `${v.dayMaster}${v.dmEl}`).replace("{lv}", F ? F.level(v.strength.level) : v.strength.level)}</p>
        <div className="mt-2 flex h-2.5 rounded-[2px] overflow-hidden">
          <span style={{ width: `${pct(ins.help, ins.help + ins.drain)}%`, background: "var(--gold)" }} />
          <span className="flex-1 bg-[var(--ink)]/[0.15]" />
        </div>
        <p className="mt-1 flex justify-between text-[12px] !text-[var(--ink-66)] tabular-nums">
          <span>{ui.help} {ins.help}{F ? F.paren(`${pct(ins.help, ins.help + ins.drain)}%`) : `（${pct(ins.help, ins.help + ins.drain)}%）`}</span>
          <span>{ui.drain} {ins.drain}{F ? F.paren(`${pct(ins.drain, ins.help + ins.drain)}%`) : `（${pct(ins.drain, ins.help + ins.drain)}%）`}</span>
        </p>
        <p className="text-[11px] mt-0.5 !text-[var(--ink-45)]">{ui.helpNote}</p>
        <p className="t-small mt-1 !text-[var(--ink-66)]">{ui[`lv_${v.strength.level}`] ?? ""}</p>
      </div>

      {/* 喜忌 */}
      <div id="xiji" className={`${sect} scroll-mt-20`}>
        <p className="t-sect">{ui.xijiHead}</p>
        {xi.length ? (
          <>
            <div className="mt-2 grid gap-2">
              {xi.map((e) => (
                <div key={e} className="flex items-baseline gap-3 text-[14px]">
                  <span className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-white text-[14px]" style={{ background: EL_COLOR[e] }} lang="zh-Hant" aria-hidden={F ? true : undefined}>{e}</span>
                  <span>{F ? `${E(e)} · ${ui[`el_${e}`]}` : ui[`el_${e}`]}</span>
                </div>
              ))}
            </div>
            {ji.length > 0 && <p className="t-small mt-3 !text-[var(--ink-66)]">{ui.jiLine.replace("{e}", F ? ji.map(E).join(F.list) : ji.join("、"))}</p>}
          </>
        ) : <p className="t-body mt-1">{ui.xijiNone}</p>}
      </div>

      {/* 神煞 */}
      {ins.shensha.length > 0 && (
        <div className={sect}>
          <p className="t-sect">{ui.ssHead}</p>
          <dl className={`mt-2 grid ${F ? "grid-cols-[9em_1fr]" : "grid-cols-[6em_1fr]"} gap-x-3 gap-y-1.5 text-[14px]`}>
            {ins.shensha.map((g) => <div key={g.key} className="contents"><dt className="!text-[var(--ink-66)]">{ui[`ss_${g.key}`]}</dt><dd>{F ? g.names.map((n) => F.ss(n) ?? T(n)).join(F.list) : g.names.map(T).join("、")}</dd></div>)}
          </dl>
        </div>
      )}

      {/* 四柱關係圖 */}
      <div className={sect}>
        <p className="t-sect">{ui.relHead}</p>
        <RelGraph v={v} links={ins.links} T={F ? F.relShort : T} cols={F ? [ui.p_year, ui.p_month, ui.p_day, ui.p_hour] : null} />
      </div>
    </div>
  );
}

function RelGraph({ v, links, T, cols = null }: { v: BaziView; links: ReturnType<typeof insightOf>["links"]; T: (s: string) => string; cols?: (string | undefined)[] | null }) {
  const n = v.pillars.length, W = 320, colW = W / n, x = (i: number) => colW * i + colW / 2;
  const top = links.filter((l) => l.row === "stem"), bot = links.filter((l) => l.row === "branch");
  const STEP = 26;
  const yS = 30 + top.length * STEP, yB = yS + 56, H = yB + 30 + bot.length * STEP;
  const tone = (label: string) => (/合|會|会/.test(label) ? "var(--gold-text)" : /沖|冲|克|剋/.test(label) ? "var(--cinnabar)" : "var(--ink-66)");
  const arc = (l: (typeof links)[number], k: number, up: boolean) => {
    const pts = [l.a, l.b, ...(l.c !== undefined ? [l.c] : [])].sort((p, q) => p - q);
    const x0 = x(pts[0]!), x1 = x(pts[pts.length - 1]!), y0 = up ? yS - 16 : yB + 14, dy = (k + 1) * STEP * (up ? -1 : 1);
    return (
      <g key={`${up}${k}`} stroke={tone(l.label)} fill="none" strokeWidth="1.2">
        <path d={`M${x0},${y0} V${y0 + dy} H${x1} V${y0}`} />
        {pts.slice(1, -1).map((p) => <path key={p} d={`M${x(p)},${y0} V${y0 + dy}`} />)}
        <text x={(x0 + x1) / 2} y={y0 + dy + (up ? -4 : 13)} textAnchor="middle" fontSize="11" fill={tone(l.label)} stroke="none">{T(l.label)}</text>
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[26rem] mt-2" role="img">
      {top.map((l, k) => arc(l, k, true))}
      {bot.map((l, k) => arc(l, k, false))}
      {v.pillars.map((p, i) => (
        <g key={p.label}>
          <text x={x(i)} y={yS} textAnchor="middle" fontSize="22" fill={EL_COLOR[p.stemEl]} lang="zh-Hant">{p.stem}</text>
          <text x={x(i)} y={yB} textAnchor="middle" fontSize="22" fill={EL_COLOR[p.branchEl]} lang="zh-Hant">{p.branch}</text>
          <text x={x(i)} y={yS + 28} textAnchor="middle" fontSize="10" fill="var(--ink-45)">{cols?.[i] ?? p.label}</text>
        </g>
      ))}
    </svg>
  );
}
