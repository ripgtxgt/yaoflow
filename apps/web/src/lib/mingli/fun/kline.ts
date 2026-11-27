import { SixtyCycle } from "tyme4ts";
import { baziOf, type BaziView } from "@/lib/mingli/bazi/chart";
import { avoidOf, branchRels, type Rel } from "@/lib/mingli/bazi/report-facts";
import { normalizeBirth, type BirthInput, type Gender } from "@/lib/mingli/birth/normalize";

/**
 * 10-29 进度表 126 運勢 K 線 (會員): one candle a year, from the 大運 the year sits in and the 流年 itself, by fixed rules —
 * the same weights as the 12-month curve of the 流年 report (lib/mingli/bazi/report-facts.ts CURVE_W), scaled:
 *   流年 天干 on the 喜用 side +0.5 / 忌 −0.5; 流年 地支 本氣 ±1; 流年支 against 日支 合 +0.5 沖 −1 刑 −0.5 害 −0.5;
 *   the 大運 天干 ±0.25, 大運 地支 本氣 ±0.5 (a slower layer under every year of the ten).
 * open = last year's close, close = this year's value; the wick goes up 0.25 for a 合 and down 0.25 for each 沖刑害.
 * The page says it plainly: 這是起伏的節奏，不是分數. Nothing is stored.
 */
export interface Candle { year: number; age: number; gz: string; decade: string | null; open: number; close: number; high: number; low: number; tags: string[] }

const W = { stemFav: 0.5, stemAvoid: -0.5, branchFav: 1, branchAvoid: -1, dStem: 0.25, dBranch: 0.5, day: { 合: 0.5, 冲: -1, 刑: -0.5, 害: -0.5 } as Record<Rel, number> };
const yearSc = (y: number) => SixtyCycle.fromIndex(((y - 4) % 60 + 60) % 60);
const elOf = (gz: string) => { const sc = SixtyCycle.fromName(gz); return { s: sc.getHeavenStem().getElement().getName(), b: sc.getEarthBranch().getHideHeavenStemMain().getElement().getName(), branch: sc.getEarthBranch().getName() }; };

export function klineOf(v: Pick<BaziView, "pillars" | "favour" | "strength" | "dmEl" | "decades">, birthYear: number, from: number, to: number): Candle[] {
  const fav = v.favour, avoid = avoidOf(v);
  const db = v.pillars[2]!.branch;
  const side = (el: string, f: number, a: number) => (fav.includes(el) ? f : avoid.includes(el) ? a : 0);
  const out: Candle[] = [];
  let prev = 3;
  for (let y = from; y <= to; y++) {
    const sc = yearSc(y), gz = sc.getName();
    const e = elOf(gz);
    const tags: string[] = [];
    let val = 3 + side(e.s, W.stemFav, W.stemAvoid) + side(e.b, W.branchFav, W.branchAvoid);
    if (fav.includes(e.b)) tags.push(`流年${e.branch}${e.b}・喜用`); else if (avoid.includes(e.b)) tags.push(`流年${e.branch}${e.b}・偏耗`);
    const rels = branchRels(e.branch, db);
    for (const r of rels) { val += W.day[r]; tags.push(`${e.branch}${r}日支${db}`); }
    const dec = [...v.decades].reverse().find((d) => d.startYear <= y) ?? null;
    if (dec) { const de = elOf(dec.gz); val += side(de.s, W.dStem, -W.dStem) + side(de.b, W.dBranch, -W.dBranch); }
    val = Math.round(val * 100) / 100;
    const open = y === from ? 3 : prev;
    const up = rels.includes("合") ? 0.25 : 0, down = rels.filter((r) => r !== "合").length * 0.25;
    out.push({ year: y, age: y - birthYear + 1, gz, decade: dec?.gz ?? null, open, close: val, high: Math.max(open, val) + up, low: Math.min(open, val) - down, tags });
    prev = val;
  }
  return out;
}

/** a profile's input → the candles from `from` to `to` (null when the birth does not compute) */
export function klineFromBirth(input: BirthInput, gender: Gender, from: number, to: number, thisYear = new Date().getFullYear()): Candle[] | null {
  try {
    const n = normalizeBirth(input);
    const v = baziOf(n, gender, thisYear, false);
    return klineOf(v, n.solarDate.y, from, to);
  } catch { return null; }
}
