"use client";

import { useMemo, useState, type ReactNode } from "react";
import { palaceLabel, type ZiweiView } from "@/lib/mingli/ziwei/chart";
import { compareRow, flyOf, neighbourInputs, nowOf, summaryOf, type CompareRow, type PalaceStars } from "@/lib/mingli/ziwei/insight";
import type { GFact, GejuHit } from "@/lib/mingli/ziwei/geju";
import type { ZwName } from "@/lib/mingli/ziwei/names-fmt";
import type { BirthInput, Gender, Normalized } from "@/lib/mingli/birth/normalize";
import type { astrolabeOf } from "@/lib/mingli/ziwei/chart";
import { track } from "@/lib/track";

/**
 * 10-19 紫微「看懂這張盤」 — the summary card (命宮、身宮、五行局、命主身主、生年四化、這步大限、今年流年), the strongest
 * 格局, the 宮干四化 list for an open palace, and the neighbouring-時辰 table. Facts from lib/mingli/ziwei/insight.ts
 * and geju.ts (keys in Traditional); words from page-ui; star and palace names swapped into the reader's script here.
 * 10-30 进度表 128 ④: on a page in another language (Z, lib/mingli/ziwei/names-fmt.ts) every chart word is said in its
 * words — stars in pinyin / kanji / hangul, palaces by their full names, a transformation by its full name.
 */
type Ui = Record<string, string>;
export type Hz = (s: string) => string;
const MUT_CLS: Record<string, string> = { 祿: "bg-[#5b7f4e]", 權: "bg-[#9a7b45]", 科: "bg-[#3f6386]", 忌: "bg-[var(--cinnabar)]" };
export const MUT_COLOR: Record<string, string> = { 祿: "#5b7f4e", 權: "#9a7b45", 科: "#3f6386", 忌: "var(--cinnabar)" };
export const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
/** a template filled for a page in another language (Korean takes the particle its word ends for) */
const fillZ = (Z: ZwName | null | undefined, t: string, v: Record<string, string | number>) => (Z ? Z.josa(fill(t, v)) : fill(t, v));
/**
 * 10-30 (live check): a phrase set inside a sentence ("leans toward Body and daily rhythm", "…suspicious; Its nature…")
 * starts lower-case in English, French, Spanish and Portuguese — German keeps its capital nouns, a star name its capitals
 */
const inner = (Z: ZwName | null | undefined, s: string): string =>
  (Z && (Z.l === "en" || Z.l === "fr" || Z.l === "es" || Z.l === "pt") && /^[A-ZÀ-Þ][a-zà-ÿ]/.test(s) && !Z.N.major.concat(Z.N.minor).some((n) => s.startsWith(n))) ||
  (Z?.l === "de" && /^(Die|Der|Das|Sie|Es|Er|Ein|Eine|Man|Hier|Wenn|Mit)\b/.test(s))
    ? s.charAt(0).toLowerCase() + s.slice(1)
    : s;

/** Traditional → the reader's script, learnt from the two iztro views of the same chart (zh pages only) */
export function hzOf(keys: ZiweiView, view: ZiweiView, hans: boolean): Hz {
  {
    if (!hans) return (s: string) => s;
    const map: Record<string, string> = { 祿: "禄", 權: "权", 廟: "庙", 宮: "宫", 貪: "贪", 機: "机", 陽: "阳", 陰: "阴", 貞: "贞", 殺: "杀", 軍: "军", 門: "门", 輔: "辅", 鉞: "钺", 羅: "罗", 鈴: "铃", 劫: "劫", 馬: "马", 存: "存" };
    const zip = (a: string, b: string) => { if (a.length === b.length) for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) map[a[i]!] = b[i]!; };
    keys.palaces.forEach((p, i) => {
      const q = view.palaces[i]!;
      zip(p.name, q.name);
      p.major.forEach((s, j) => { zip(s.name, q.major[j]?.name ?? ""); zip(s.bright ?? "", q.major[j]?.bright ?? ""); });
      p.minor.forEach((s, j) => zip(s.name, q.minor[j]?.name ?? ""));
    });
    return (s: string) => s.replace(/./g, (c) => map[c] ?? c);
  }
}

const starsText = (ps: PalaceStars, hz: Hz, Z?: ZwName | null) => (Z ? Z.stars(ps.stars) : ps.stars.map((s) => `${hz(s.name)}${s.bright ? `（${hz(s.bright)}）` : ""}`).join("、"));

/** the {x} of a 格局 fact in the page's words: a brightness, a 四化, a branch or a stem */
function xIn(f: GFact, Z: ZwName): string {
  const x = f.x ?? "";
  if (f.k === "bright" || f.k === "dim") return Z.brightWord(x);
  if (f.k === "mut") return Z.mutFull(x);
  if (f.k === "branchNot") return Z.branch(x);
  if (f.k === "stem" || f.k === "stemNot") return Z.stem(x);
  return x;
}
export function factText(f: GFact, ui: Ui, hz: Hz, pl: (x: string) => string, Z?: ZwName | null): string {
  const t = ui[`f_${f.k}`];
  if (!t) return "";
  if (Z) return fillZ(Z, t, { s: (f.s ?? []).map(Z.star).join(Z.list), p: f.p ? Z.palaceFull(f.p) : "", b: f.b ? Z.branch(f.b) : "", x: xIn(f, Z) });
  return fill(t, { s: (f.s ?? []).map(hz).join("、"), p: f.p ? pl(hz(f.p)) : "", b: f.b ?? "", x: hz(f.x ?? "") });
}

type Astrolabe = ReturnType<typeof astrolabeOf>;

export function ZiweiSummary({ keys, a, ui, hz, hans, gj, Z = null }: { keys: ZiweiView; a: Astrolabe; ui: Ui; hz: Hz; hans: boolean; gj: { top: GejuHit | null; others: number }; Z?: ZwName | null }) {
  const pl = (x: string) => (Z ? Z.palaceFull(x) : palaceLabel(x, hans));
  const sum = useMemo(() => summaryOf(keys), [keys]);
  const now = useMemo(() => nowOf(a, keys, new Date()), [a, keys]);
  const topic = (name: string) => inner(Z, ui[`topic_${name}`] ?? "");
  const semi = Z ? (Z.l === "ja" ? "；" : Z.l === "fr" ? " ; " : "; ") : "；";
  const starLines = (ps: PalaceStars) => ps.stars.map((s) => fillZ(Z, ui.starLine!, { s: Z ? Z.star(s.name) : hz(s.name), t: [ui[`star_${s.name}`], s.bright ? inner(Z, ui[`bright_${s.bright}`] ?? "") : ""].filter(Boolean).join(semi) })).join(Z && Z.l !== "ja" ? " · " : "　");
  const br = (b: string) => (Z ? Z.branch(b) : b);
  const rows: [string, ReactNode][] = [
    [ui.s_soul!, <>{fillZ(Z, sum.soul.borrowed ? ui.soulEmpty! : ui.soulLine!, { b: br(sum.soul.branch), s: starsText(sum.soul, hz, Z) })}<span className="block mt-0.5 !text-[var(--ink-66)]">{starLines(sum.soul)}</span></>],
    [ui.s_body!, sum.sameBody ? ui.bodySame! : fillZ(Z, ui.bodyLine!, { p: pl(hz(sum.body.name)), s: starsText(sum.body, hz, Z), t: topic(sum.body.name) })],
    [ui.s_five!, fillZ(Z, ui.fiveLine!, { f: Z ? Z.five(sum.fiveClass) : hz(sum.fiveClass), n: sum.startAge })],
    [ui.s_lords!, fillZ(Z, ui.lordsLine!, { a: Z ? Z.star(sum.soulStar) : hz(sum.soulStar), b: Z ? Z.star(sum.bodyStar) : hz(sum.bodyStar) })],
    [ui.s_mut!, <ul className="grid gap-1">{sum.natal.map((x) => (
      <li key={x.m}><span className={`text-[11px] text-white px-1 mr-1 rounded-[1px] ${MUT_CLS[x.m] ?? ""}`}>{Z ? Z.mut(x.m) : hz(x.m)}</span>{fillZ(Z, ui.mutLine!, { m: Z ? Z.mutFull(x.m) : hz(x.m), s: Z ? Z.star(x.star) : hz(x.star), p: pl(hz(x.palace)), t: topic(x.palace), u: ui[`mut_${x.m}`] ?? "" })}</li>
    ))}</ul>],
  ];
  return (
    <div className="grid gap-[var(--s-4)]">
      <div id="zw-sum" className="scroll-mt-20 rounded-[2px] border border-[var(--ink-16)] px-[var(--s-4)] py-[var(--s-4)]">
        <h2 className="t-d3 mb-[var(--s-3)]">{ui.insightHead}</h2>
        <dl className={`grid ${Z && Z.l !== "ja" ? "grid-cols-[7.5em_1fr]" : "grid-cols-[5.5em_1fr]"} gap-x-3 gap-y-2.5 text-[14px] leading-relaxed`}>
          {rows.map(([k, v]) => <div key={k} className="contents"><dt className="!text-[var(--ink-45)]">{k}</dt><dd>{v}</dd></div>)}
          <div id="zw-now" className="contents">
            <dt className="!text-[var(--ink-45)] scroll-mt-20">{ui.s_dec}</dt>
            <dd>{now.decadal ? fillZ(Z, ui.decLine!, { a: now.decadal.range[0], b: now.decadal.range[1], p: pl(hz(now.decadal.name)), s: starsText(now.decadal, hz, Z), t: topic(now.decadal.name) }) : fillZ(Z, ui.decChild!, { n: sum.startAge })}</dd>
          </div>
          {now.yearly && <div className="contents"><dt className="!text-[var(--ink-45)]">{ui.s_year}</dt><dd>{fillZ(Z, ui.yearLine!, { y: new Date().getFullYear(), gz: Z ? Z.gz(now.yearly.gz) : now.yearly.gz, p: pl(hz(now.yearly.name)), s: starsText(now.yearly, hz, Z), t: topic(now.yearly.name) })}</dd></div>}
        </dl>
      </div>

      <div id="zw-geju" className="scroll-mt-20">
        <p className="t-sect">{ui.gjHead}</p>
        {gj.top ? (
          <>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <p className="t-d3">{ui[`gjn_${gj.top.id}`]}</p>
              <span className={`t-small px-2 py-0.5 rounded-full border ${gj.top.status === "成" ? "border-[var(--gold)] !text-[var(--gold-text)]" : "border-[var(--ink-16)] !text-[var(--ink-66)]"}`}>{ui[`gjSt_${gj.top.status}`]}</span>
            </div>
            <p className="t-body mt-2 leading-relaxed">{ui[`gjp_${gj.top.id}`]}</p>
            <ul className="mt-2 t-small grid gap-0.5">
              <li><b className="font-medium">{ui.gjWhy}</b>{Z ? Z.colon : "　"}{gj.top.facts.map((f) => factText(f, ui, hz, pl, Z)).filter(Boolean).join(semi)}</li>
              {gj.top.missing.length > 0 && <li className="!text-[var(--ink-66)]"><b className="font-medium">{ui.gjMissing}</b>{Z ? Z.colon : "　"}{gj.top.missing.map((f) => factText(f, ui, hz, pl, Z)).join(semi)}</li>}
              {gj.top.breaks.length > 0 && <li className="!text-[var(--ink-66)]"><b className="font-medium">{ui.gjBreaks}</b>{Z ? Z.colon : "　"}{gj.top.breaks.map((f) => factText(f, ui, hz, pl, Z)).join(semi)}</li>}
              <li className="!text-[var(--ink-45)]">{ui.gjSrc}{Z ? Z.colon : "　"}{ui[`gjs_${gj.top.id}`]}</li>
            </ul>
            {gj.others > 0 && <p className="t-small mt-2 !text-[var(--ink-66)]">{fill(ui.gjMore!, { n: gj.others })}</p>}
          </>
        ) : <p className="t-body mt-1">{ui.gjNone}</p>}
      </div>
    </div>
  );
}

/** the open palace's 宮干四化: where each lands, 自化 marked */
export function ZiweiFlyList({ keys, branch, ui, hz, hans, Z = null }: { keys: ZiweiView; branch: string; ui: Ui; hz: Hz; hans: boolean; Z?: ZwName | null }) {
  const fly = flyOf(keys, branch);
  const stem = keys.palaces.find((p) => p.branch === branch)?.stem ?? "";
  if (!fly.length) return null;
  return (
    <div className="mt-3">
      <p className="t-sect">{fillZ(Z, ui.flyHead!, { g: Z ? Z.stem(stem) : stem })}</p>
      <ul className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[13px]">
        {fly.map((f) => (
          <li key={f.m} className="flex items-center gap-1.5">
            <span className={`text-[11px] text-white px-1 rounded-[1px] ${MUT_CLS[f.m] ?? ""}`}>{Z ? Z.mut(f.m) : hz(f.m)}</span>
            <span>{Z ? Z.star(f.star) : hz(f.star)} {f.self ? <b className="font-medium !text-[var(--cinnabar)]">{ui.flySelf}</b> : f.toName ? fill(ui.flyTo!, { p: Z ? Z.palaceFull(f.toName) : palaceLabel(hz(f.toName), hans) }) : ""}</span>
          </li>
        ))}
      </ul>
      {fly.some((f) => f.self) && <p className="t-small mt-1 !text-[var(--ink-45)]">{ui.flyNote}</p>}
    </div>
  );
}

/** the 時辰 before and after, side by side: 命宮, its stars, 身宮, 五行局 */
export function ZiweiCompare({ input, n, gender, ui, locale, onOpen, Z = null }: { input: BirthInput; n: Normalized; gender: Gender; ui: Ui; locale: string; onOpen: (i: BirthInput) => void; Z?: ZwName | null }) {
  const [open, setOpen] = useState(false);
  const lang = locale === "zh" ? "zh-CN" : "zh-TW";
  const rows = useMemo(() => {
    if (!open) return [];
    const nb = neighbourInputs(input, n).map((x) => ({ ...x, row: compareRow(x.input, gender, lang) }));
    return [nb[0], { dir: 0 as const, input, row: compareRow(input, gender, lang) }, nb[1]].filter((x): x is NonNullable<typeof x> => !!x && !!x.row);
  }, [open, input, n, gender, lang]);
  const names = ui.branchNames!.split(",");
  const key = (r: CompareRow) => r.soul.stars.map((s) => s.name).join();
  const same = rows.length === 3 && rows.every((r) => key(r.row!) === key(rows[1]!.row!));
  const starList = (r: CompareRow) => (Z
    ? (r.soul.borrowed ? fill(ui.cmpEmpty!, { s: r.soul.stars.map((s) => Z.star(s.name)).join(Z.list) }) : Z.stars(r.soul.stars))
    : (r.soul.borrowed ? fill(ui.cmpEmpty!, { s: r.soul.stars.map((s) => s.name).join("、") }) : r.soul.stars.map((s) => `${s.name}${s.bright ? `（${s.bright}）` : ""}`).join("、")));
  return (
    <div className="mt-2">
      <button type="button" className="t-small underline underline-offset-4" onClick={() => { setOpen(!open); if (!open) track("ziwei", { locale, method: "compare_hours" }); }}>{open ? ui.cmpHide : ui.cmpBtn}</button>
      {open && rows.length > 0 && (
        <div className="mt-2">
          <p className="t-small !text-[var(--ink-66)]">{ui.cmpLead}</p>
          <table className="mt-2 w-full text-[13px] border-collapse">
            <thead><tr className="!text-[var(--ink-45)] text-left">{[ui.cmpHour, ui.cmpSoul, ui.cmpStars, ui.cmpBody, ui.cmpFive, ""].map((h, i) => <th key={i} className="font-normal py-1 pr-2">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.dir} className={`border-t border-[var(--ink-16)] ${r.dir === 0 ? "bg-[var(--gold)]/[0.08]" : ""}`}>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{names[r.row!.hour]}{r.dir === 0 && <span className="block text-[11px] !text-[var(--ink-45)]">{ui.cmpNow}</span>}</td>
                  <td className="py-1.5 pr-2">{Z ? Z.branch(r.row!.soul.branch) : r.row!.soul.branch}</td>
                  <td className="py-1.5 pr-2">{starList(r.row!)}</td>
                  <td className="py-1.5 pr-2">{Z ? Z.palace(r.row!.bodyName) : r.row!.bodyName.replace(/[宮宫]$/, "")}</td>
                  <td className="py-1.5 pr-2">{Z ? Z.five(r.row!.fiveClass) : r.row!.fiveClass}</td>
                  <td className="py-1.5 text-right">{r.dir !== 0 && <button type="button" className="underline underline-offset-4" onClick={() => { onOpen(r.input); track("ziwei", { locale, method: "compare_open" }); }}>{ui.cmpOpen}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="t-small mt-2 !text-[var(--ink-66)]">{same ? ui.cmpSame : ui.cmpDiff}</p>
        </div>
      )}
    </div>
  );
}
