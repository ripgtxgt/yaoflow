"use client";

import { ASPECTS, PLANETS, SIGNS, type AstroView } from "@/lib/mingli/astro/chart";
import { ELEMENTS, MODES, elementOf, type AstroInsight as Ins } from "@/lib/mingli/astro/insight";

/**
 * 10-19 (Neil: 星盤也補上「看懂這張盤」) — 一句話、元素／模式比例、主導行星與星座、命主星、盤面圖形、半球分布、
 * 最緊的相位, under the wheel. Numbers come from lib/mingli/astro/insight.ts (fixed rules); words from page-ui.
 */
type Ui = Record<string, string>;
export const EL_COLOR: Record<string, string> = { 火: "#b5523b", 土: "#9a7b45", 風: "#5b7f9e", 水: "#3f6386" };
const MD_COLOR: Record<string, string> = { 基本: "color-mix(in srgb, var(--ink) 70%, var(--paper))", 固定: "color-mix(in srgb, var(--ink) 50%, var(--paper))", 變動: "color-mix(in srgb, var(--ink) 32%, var(--paper))" };
export const ASP_GLYPH: Record<string, string> = { 合: "☌", 六合: "⚹", 刑: "□", 拱: "△", 沖: "☍" };
export const ASP_COLOR: Record<string, string> = { 合: "#9a7b45", 六合: "#3f6386", 刑: "#b5523b", 拱: "#5b7f4e", 沖: "#b5523b" };

const fill = (s: string, m: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(m[k] ?? ""));

export default function AstroInsight({ v, ins, ui, sn, pn, moonSplit, aspTexts }: {
  v: AstroView; ins: Ins; ui: Ui; sn: (s: string) => string; pn: (s: string) => string;
  moonSplit: [string, string] | null; aspTexts: Record<string, string>;
}) {
  const sect = "border-t border-[var(--ink-16)] pt-[var(--s-4)] mt-[var(--s-4)] scroll-mt-20";
  const pct = (x: number) => (ins.total ? Math.round((x / ins.total) * 100) : 0);
  const sun = v.planets[0]!, moon = v.planets[1]!;
  const ascSign = v.asc !== null && v.timeKnown ? SIGNS[Math.floor(v.asc / 30)]! : null;
  const an = (n: string) => ui.aspectNames.split(",")[ASPECTS.findIndex((a) => a.name === n)] ?? n;
  // 10-30 进度表 128 ④: joined the page language's way
  const list = (ps: string[]) => ps.map(pn).join(ui.listSep ?? "、");
  const colon = ui.colon ?? "：", gap = ui.gap ?? "　", slash = ui.slash ?? "／";

  const moonPart = moonSplit ? fill(ui.moonTwo, { a: sn(moonSplit[0]), b: sn(moonSplit[1]) }) : fill(ui.moonOne, { m: sn(moon.sign) });
  const summary = fill(ascSign ? ui.sumFull : ui.sumNoTime, {
    s: sn(sun.sign), sk: ui[`sk_${sun.sign}`]!, m: moonPart, mk: moonSplit ? `${ui[`sk_${moonSplit[0]}`]}${slash}${ui[`sk_${moonSplit[1]}`]}` : ui[`sk_${moon.sign}`]!,
    a: ascSign ? sn(ascSign) : "", ak: ascSign ? ui[`sk_${ascSign}`]! : "",
  });

  const why = (w: string) => {
    const m = /^角宮(\d+)$/.exec(w); if (m) return fill(ui.w_angular, { n: m[1]! });
    const a = /^相位(\d+)$/.exec(w); if (a) return fill(ui.w_asp, { n: a[1]! });
    return ({ 近軸點: ui.w_axis, 命主星: ui.w_ruler, "命主星（古典）": ui.w_coruler, 太陽星座守護: ui.w_sun, 月亮星座守護: ui.w_moon } as Record<string, string | undefined>)[w] ?? ui[`w_${w}`] ?? w;
  };
  const top = ins.dominant[0];

  const patText = (p: Ins["patterns"][number]) => {
    const base = { p: list(p.planets), n: p.planets.length };
    switch (p.kind) {
      case "大三角": return fill(ui.pt_大三角!, { ...base, e: ui[`el_${elementOf(v.planets.find((x) => x.name === p.planets[0])!.lon)}`]!.replace(/象$/, "") });
      case "T三角": return fill(ui.pt_T三角!, { ...base, a: pn(p.planets[0]!), b: pn(p.planets[1]!), c: pn(p.apex!) });
      case "風箏": return fill(ui.pt_風箏!, { ...base, c: pn(p.apex!) });
      case "上帝之指": return fill(ui.pt_上帝之指!, { ...base, a: pn(p.planets[0]!), b: pn(p.planets[1]!), c: pn(p.apex!) });
      case "星群星座": return fill(ui.pt_星群星座!, { ...base, s: sn(p.sign!) });
      case "星群宮位": return fill(ui.pt_星群宮位!, { ...base, h: p.house!, area: ui[`hs_${p.house}`]! });
      default: return fill(ui[`pt_${p.kind}`]!, base);
    }
  };

  const hemiNotes = ins.hemi ? [
    ins.hemi.east >= 6 ? ui.hemi_east : ins.hemi.west >= 6 ? ui.hemi_west : null,
    ins.hemi.south >= 6 ? ui.hemi_south : ins.hemi.north >= 6 ? ui.hemi_north : null,
  ].filter(Boolean) : [];

  const Bars = ({ keys, vals, color, label }: { keys: readonly string[]; vals: Record<string, number>; color: (k: string) => string; label: (k: string) => string }) => (
    <div className="mt-2 grid gap-1.5">
      {keys.map((k) => (
        <div key={k} className="grid grid-cols-[2.6em_1fr_5.5em] items-center gap-2 text-[13px]">
          <span style={{ color: color(k) }}>{label(k)}</span>
          <span className="h-2 rounded-[2px] bg-[var(--ink)]/[0.06] overflow-hidden"><span className="block h-full" style={{ width: `${pct(vals[k]!)}%`, background: color(k) }} /></span>
          <span className="tabular-nums text-right !text-[var(--ink-66)]">{vals[k]} · {pct(vals[k]!)}%</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {/* 一句話 */}
      <div>
        <p className="t-sect">{ui.sumHead}</p>
        <p className="t-body mt-1 leading-relaxed">{summary}</p>
      </div>

      {/* 元素／模式 */}
      <div id="astro-el" className={sect}>
        <p className="t-sect">{ui.elHead}</p>
        <Bars keys={ELEMENTS} vals={ins.elements} color={(k) => EL_COLOR[k]!} label={(k) => ui[`el_${k}`]!} />
        <p className="t-small mt-2 leading-relaxed">{[...ins.strongEl.map((e) => ui[`elHi_${e}`]), ...ins.weakEl.map((e) => ui[`elLo_${e}`])].join(" ") || ui.elBal}</p>
        <p className="t-sect mt-[var(--s-3)]">{ui.mdHead}</p>
        <Bars keys={MODES} vals={ins.modes} color={(k) => MD_COLOR[k]!} label={(k) => ui[`md_${k}`]!} />
        <p className="t-small mt-2 leading-relaxed">{[...ins.strongMode.map((m) => ui[`mdHi_${m}`]), ...ins.weakMode.map((m) => ui[`mdLo_${m}`])].join(" ") || ui.mdBal}</p>
      </div>

      {/* 主導 */}
      <div id="astro-dom" className={sect}>
        <p className="t-sect">{ui.domHead}</p>
        {top && (
          <>
            <p className="t-d3 mt-1">{ins.dominant.map((d) => pn(d.planet)).join(" · ")}</p>
            <p className="t-body mt-2 leading-relaxed">{ui[`dom_${top.planet}`]}</p>
            <p className="t-small mt-1 !text-[var(--ink-66)]">{ui.domWhy}{colon}{top.why.map(why).join(ui.listSep ?? "、")}</p>
          </>
        )}
        {ins.domSign && <p className="t-body mt-2">{fill(ui.domSignLine, { s: sn(ins.domSign.sign), sk: ui[`sk_${ins.domSign.sign}`]! })}</p>}
        {ins.ruler && ascSign && (
          <div className="mt-[var(--s-3)]">
            <p className="t-sect">{ui.rulerHead}</p>
            <p className="t-body mt-1 leading-relaxed">
              {fill(ui.rulerLine, {
                a: sn(ascSign), p: pn(ins.ruler.planet) + (ins.ruler.co ? fill(ui.rulerCo, { c: pn(ins.ruler.co) }) : ""), s: sn(ins.ruler.sign),
                h: ins.ruler.house ? fill(ui.rulerHouse, { n: ins.ruler.house, area: ui[`hs_${ins.ruler.house}`]! }) : "",
              })}
            </p>
          </div>
        )}
      </div>

      {/* 圖形 */}
      <div id="astro-pat" className={sect}>
        <p className="t-sect">{ui.patHead}</p>
        {ins.patterns.length ? <ul className="mt-2 grid gap-2">{ins.patterns.map((p, i) => <li key={i} className="t-body leading-relaxed">{patText(p)}</li>)}</ul> : <p className="t-body mt-1">{ui.noPattern}</p>}
      </div>

      {/* 半球 */}
      <div className={sect}>
        <p className="t-sect">{ui.hemiHead}</p>
        <p className="t-body mt-1">{ins.hemi ? fill(ui.hemiLine, { e: ins.hemi.east, w: ins.hemi.west, s: ins.hemi.south, n: ins.hemi.north }) : ui.hemiNoTime}</p>
        {hemiNotes.length > 0 && <p className="t-small mt-1 !text-[var(--ink-66)]">{hemiNotes.join(" ")}</p>}
      </div>

      {/* 最緊的相位 */}
      {ins.tight.length > 0 && (
        <div id="astro-asp" className={sect}>
          <p className="t-sect">{ui.tightHead}</p>
          <ul className="mt-2 grid gap-2.5">
            {ins.tight.map((a) => {
              const own = aspTexts[`${a.a}-${a.b}|${a.name}`] ?? aspTexts[`${a.b}-${a.a}|${a.name}`];
              const text = own ?? fill(ui.fAspText ?? "{a}（{ak}）和{b}（{bk}）{t}", { a: pn(a.a), ak: ui[`pk_${a.a}`]!, b: pn(a.b), bk: ui[`pk_${a.b}`]!, t: ui[`at_${a.name}`]! });
              return (
                <li key={`${a.a}${a.b}`} className="t-body leading-relaxed">
                  <b className="font-medium" style={{ color: ASP_COLOR[a.name] }}>{ASP_GLYPH[a.name]}</b>{" "}
                  <b className="font-medium">{fill(ui.fAspName ?? "{a}{n}{b}", { a: pn(a.a), n: an(a.name), b: pn(a.b) })}</b>
                  <span className="t-small !text-[var(--ink-45)]">{gap}{fill(ui.orb, { o: a.orb.toFixed(1) })}</span>
                  <span className="block mt-0.5">{text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 相位表: the triangular grid of the five major aspects between the ten planets */
export function AspectGrid({ v, ui, pn, glyphs, sel, onSel }: { v: AstroView; ui: Ui; pn: (s: string) => string; glyphs: string[]; sel: string | null; onSel: (p: string) => void }) {
  const find = (a: string, b: string) => v.aspects.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  const an = (n: string) => ui.aspectNames.split(",")[ASPECTS.findIndex((a) => a.name === n)] ?? n;
  return (
    <div className="mt-[var(--s-3)] overflow-x-auto">
      <p className="t-sect">{ui.gridHead}</p>
      <table className="mt-2 border-collapse text-[13px] mx-auto">
        <tbody>
          {PLANETS.map((row, i) => (
            <tr key={row}>
              {PLANETS.slice(0, i).map((col) => {
                const a = find(row, col);
                const hot = sel !== null && (sel === row || sel === col);
                return (
                  <td key={col} title={a ? `${fill(ui.fAspName ?? "{a}{n}{b}", { a: pn(row), n: an(a.name), b: pn(col) })} ${a.orb.toFixed(1)}°` : undefined}
                    className={`w-7 h-7 text-center border border-[var(--ink-16)] ${hot ? "bg-[var(--ink)]/[0.06]" : ""}`}>
                    {a && <span className="block leading-none" style={{ color: ASP_COLOR[a.name] }}>{ASP_GLYPH[a.name]}<span className="block text-[8px] !text-[var(--ink-45)] tabular-nums">{a.orb.toFixed(0)}°</span></span>}
                  </td>
                );
              })}
              <td className="w-7 h-7 text-center">
                <button type="button" onClick={() => onSel(row)} aria-label={pn(row)} className={`w-7 h-7 ${sel === row ? "rounded-full bg-[var(--ink)] text-[var(--paper)]" : ""}`}>{glyphs[i]}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
