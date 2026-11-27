import { PLANETS, SIGNS, type Aspect, type AstroView } from "./chart";

/**
 * 10-19 (Neil: 星盤也補上「看懂這張盤」那一層, docs/mingli/astro-competitors.md ①) — the reading layer under the wheel,
 * all by fixed rules, no model. Pure; runs in the browser and in the card route. Names stay Traditional (as chart.ts
 * prints them); the page turns them into the reader's script.
 *
 * ① 元素／模式 — each point adds its weight to the element (火土風水) and the modality (基本／固定／變動) of its sign:
 *      太陽 2 · 月亮 2 · 上升 2 · 天頂 1 (上升、天頂 only with a known birth time) · the other eight planets 1 each.
 *      Totals: 12 without a birth time, 15 with one. 偏多 = share ≥ 40 %; 偏少 = share ≤ 10 % (0 = 沒有).
 * ② 主導行星 — score per planet, highest wins; ties → more aspects, then the order 太陽…冥王星:
 *      角宮 (1／4／7／10) +3 · within 8° of 上升 or 天頂 +2 (both need a birth time)
 *      命主星 (modern ruler of the 上升 sign) +3 · its traditional co-ruler (天蠍 火星, 水瓶 土星, 雙魚 木星) +2
 *      ruler (or co-ruler) of the 太陽 sign +1 · of the 月亮 sign +1
 *      入廟 (domicile, traditional or modern) +3 · 旺 (exaltation) +2 · 陷 (detriment) −1 · 弱 (fall) −1
 *      +1 per major aspect it makes (chart.ts orbs: 8° with 太陽／月亮, else 6°), +1 more when that orb ≤ 2°.
 *    主導星座 — Σ of the ① weights of the points in each sign, +1 for the sign the 主導行星 rules; ties → more points
 *      in the sign, then zodiac order.
 *    命主星 — the modern ruler of the 上升 sign, with its sign and house.
 * ③ 圖形 — planets only (no angles, no nodes); legs use the chart.ts orbs (8° with 太陽／月亮, else 6°), except:
 *      上帝之指 the two 150° legs ≤ 3° and the 60° base ≤ 5°.
 *      大三角 three mutual 120° · T三角 one 180° + a planet 90° to both ends · 大十字 two 180° + four 90°
 *      風箏 a 大三角 + a fourth planet 180° to one corner and 60° to the other two
 *      星群 ≥ 3 planets in one sign, or ≥ 3 in one house (house only with a birth time).
 *      A T三角 inside a 大十字 and a 大三角 inside a 風箏 are not listed again; T三角 with the same apex and a shared
 *      end (a conjunction at one end) are merged into one.
 * ④ 半球 — with a birth time only, by house: 東 (上升 side) 10–12 + 1–3 · 西 4–9 · 南 (above the horizon) 7–12 · 北 1–6.
 * ⑤ 最緊的相位 — chart.ts aspects tightest first, leaving out pairs of two outer planets (天王星／海王星／冥王星 —
 *      those last for years and belong to a generation); at most 5.
 */
export const ELEMENTS = ["火", "土", "風", "水"] as const;
export const MODES = ["基本", "固定", "變動"] as const;
export type Element = (typeof ELEMENTS)[number];
export type Mode = (typeof MODES)[number];

const norm = (x: number) => ((x % 360) + 360) % 360;
const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
export const signIdx = (lon: number) => Math.floor(norm(lon) / 30);
export const elementOf = (lon: number): Element => ELEMENTS[signIdx(lon) % 4]!;
export const modeOf = (lon: number): Mode => MODES[signIdx(lon) % 3]!;

/** point weights for ① */
export const WEIGHTS = { 太陽: 2, 月亮: 2, 上升: 2, 天頂: 1, planet: 1 } as const;

/** modern rulers (sign index → planet); co-rulers are the traditional ones for 天蠍／水瓶／雙魚 */
export const RULER = ["火星", "金星", "水星", "月亮", "太陽", "水星", "金星", "冥王星", "木星", "土星", "天王星", "海王星"] as const;
export const CO_RULER: Record<number, string> = { 7: "火星", 10: "土星", 11: "木星" };
const DOMICILE: Record<string, number[]> = {
  太陽: [4], 月亮: [3], 水星: [2, 5], 金星: [1, 6], 火星: [0, 7], 木星: [8, 11], 土星: [9, 10], 天王星: [10], 海王星: [11], 冥王星: [7],
};
const EXALT: Record<string, number> = { 太陽: 0, 月亮: 1, 水星: 5, 金星: 11, 火星: 9, 木星: 3, 土星: 6 };
export type Dignity = "入廟" | "旺" | "陷" | "弱" | null;
export function dignityOf(planet: string, lon: number): Dignity {
  const s = signIdx(lon);
  if (DOMICILE[planet]?.includes(s)) return "入廟";
  if (EXALT[planet] === s) return "旺";
  if (DOMICILE[planet]?.some((d) => (d + 6) % 12 === s)) return "陷";
  if (EXALT[planet] !== undefined && (EXALT[planet]! + 6) % 12 === s) return "弱";
  return null;
}
const DIGNITY_SCORE: Record<string, number> = { 入廟: 3, 旺: 2, 陷: -1, 弱: -1 };

export type PatternKind = "大三角" | "T三角" | "大十字" | "風箏" | "上帝之指" | "星群星座" | "星群宮位";
export interface Pattern { kind: PatternKind; planets: string[]; apex?: string; sign?: string; house?: number }

export interface AstroInsight {
  elements: Record<Element, number>; modes: Record<Mode, number>; total: number;
  elementList: { el: Element; points: string[] }[];
  /** 偏多／偏少 flags */
  strongEl: Element[]; weakEl: Element[]; strongMode: Mode[]; weakMode: Mode[];
  dominant: { planet: string; score: number; why: string[] }[];
  domSign: { sign: string; score: number } | null;
  ruler: { planet: string; co: string | null; sign: string; house: number | null } | null;
  patterns: Pattern[];
  hemi: { east: number; west: number; south: number; north: number } | null;
  tight: Aspect[];
}

const OUTER = new Set(["天王星", "海王星", "冥王星"]);
const orbOf = (a: string, b: string) => (a === "太陽" || a === "月亮" || b === "太陽" || b === "月亮" ? 8 : 6);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** do two planets make `angle` within the orb */
function hit(lons: Record<string, number>, a: string, b: string, angle: number, orb = orbOf(a, b)) {
  return Math.abs(sep(lons[a]!, lons[b]!) - angle) <= orb;
}

export function patternsOf(lonList: number[], houses: (number | null)[] | null): Pattern[] {
  const names = PLANETS.slice(0, lonList.length) as readonly string[];
  const L: Record<string, number> = Object.fromEntries(names.map((n, i) => [n, lonList[i]!]));
  const n = names.length;
  const out: Pattern[] = [];
  const trines: [string, string, string][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const [a, b, c] = [names[i]!, names[j]!, names[k]!];
    if (hit(L, a, b, 120) && hit(L, b, c, 120) && hit(L, a, c, 120)) trines.push([a, b, c]);
  }
  // 風箏: a 大三角 + a planet opposite one corner and sextile the other two
  const kiteTrines = new Set<string>();
  for (const t of trines) for (const d of names) {
    if (t.includes(d)) continue;
    for (const apex of t) {
      const others = t.filter((x) => x !== apex);
      if (hit(L, d, apex, 180) && others.every((o) => hit(L, d, o, 60))) {
        out.push({ kind: "風箏", planets: [...t, d], apex: d });
        kiteTrines.add(t.join());
      }
    }
  }
  for (const t of trines) if (!kiteTrines.has(t.join())) out.push({ kind: "大三角", planets: [...t] });
  // 大十字
  const crosses: string[][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const [a, b] = [names[i]!, names[j]!];
    if (!hit(L, a, b, 180)) continue;
    for (let k = i + 1; k < n; k++) for (let m = k + 1; m < n; m++) {
      const [c, d] = [names[k]!, names[m]!];
      if ([c, d].some((x) => x === a || x === b) || !hit(L, c, d, 180)) continue;
      if ([a, b].every((x) => hit(L, x, c, 90) && hit(L, x, d, 90))) {
        const set = [a, b, c, d].sort((x, y) => names.indexOf(x) - names.indexOf(y));
        if (!crosses.some((cr) => cr.join() === set.join())) crosses.push(set);
      }
    }
  }
  for (const c of crosses) out.push({ kind: "大十字", planets: c });
  // T三角 (not inside a 大十字)
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const [a, b] = [names[i]!, names[j]!];
    if (!hit(L, a, b, 180)) continue;
    for (const c of names) {
      if (c === a || c === b || !hit(L, c, a, 90) || !hit(L, c, b, 90)) continue;
      if (crosses.some((cr) => [a, b, c].every((x) => cr.includes(x)))) continue;
      // same apex sharing an end (a conjunction at one end) → one T三角 with the extra planet added
      const same = out.find((p) => p.kind === "T三角" && p.apex === c && (p.planets.includes(a) || p.planets.includes(b)));
      if (same) { for (const x of [a, b]) if (!same.planets.includes(x)) same.planets.splice(same.planets.length - 1, 0, x); continue; }
      // 10-20: the same opposition with two apexes that sit together (太陽 and 火星 conjunct) → one T三角, both apexes listed
      const pair = out.find((p) => p.kind === "T三角" && p.planets.includes(a) && p.planets.includes(b));
      if (pair) { if (!pair.planets.includes(c)) pair.planets.push(c); continue; }
      out.push({ kind: "T三角", planets: [a, b, c], apex: c });
    }
  }
  // 上帝之指: base sextile ≤ 5°, apex quincunx both ≤ 3°
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const [a, b] = [names[i]!, names[j]!];
    if (!hit(L, a, b, 60, 5)) continue;
    for (const c of names) {
      if (c === a || c === b) continue;
      if (hit(L, c, a, 150, 3) && hit(L, c, b, 150, 3)) out.push({ kind: "上帝之指", planets: [a, b, c], apex: c });
    }
  }
  // 星群
  for (let s = 0; s < 12; s++) {
    const inS = names.filter((x) => signIdx(L[x]!) === s);
    if (inS.length >= 3) out.push({ kind: "星群星座", planets: inS, sign: SIGNS[s] });
  }
  if (houses) for (let h = 1; h <= 12; h++) {
    const inH = names.filter((_, i) => houses[i] === h);
    if (inH.length >= 3) out.push({ kind: "星群宮位", planets: inH, house: h });
  }
  return out;
}

/** 10-19 wheel glyphs: spread planets that sit closer than `min` degrees, symmetrically and across 0° (astro-compare.md ④) */
export function spreadGlyphs(lons: number[], min = 7): number[] {
  const p = lons.map(norm);
  const n = p.length;
  if (n < 2 || min * n >= 360) return p;
  for (let it = 0; it < 300; it++) {
    let moved = false;
    const idx = p.map((_, i) => i).sort((a, b) => p[a]! - p[b]! || a - b);
    for (let k = 0; k < n; k++) {
      const a = idx[k]!, b = idx[(k + 1) % n]!;
      const gap = norm(p[b]! - p[a]!);
      if (gap < min - 1e-6) { const d = (min - gap) / 2; p[a] = norm(p[a]! - d); p[b] = norm(p[b]! + d); moved = true; }
    }
    if (!moved) break;
  }
  return p;
}

export function insightOf(v: AstroView): AstroInsight {
  const time = v.timeKnown && v.asc !== null;
  const elements = Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;
  const modes = Object.fromEntries(MODES.map((m) => [m, 0])) as Record<Mode, number>;
  const elPoints = Object.fromEntries(ELEMENTS.map((e) => [e, [] as string[]])) as Record<Element, string[]>;
  const signScore = new Array(12).fill(0) as number[], signCount = new Array(12).fill(0) as number[];
  const add = (name: string, lon: number, w: number) => {
    elements[elementOf(lon)] += w; modes[modeOf(lon)] += w; elPoints[elementOf(lon)].push(name);
    signScore[signIdx(lon)] += w; signCount[signIdx(lon)] += 1;
  };
  for (const p of v.planets) add(p.name, p.lon, p.name === "太陽" ? WEIGHTS.太陽 : p.name === "月亮" ? WEIGHTS.月亮 : WEIGHTS.planet);
  if (time) { add("上升", v.asc!, WEIGHTS.上升); if (v.mc !== null) add("天頂", v.mc, WEIGHTS.天頂); }
  const total = ELEMENTS.reduce((a, e) => a + elements[e], 0);
  const share = (x: number) => (total ? x / total : 0);
  const strongEl = ELEMENTS.filter((e) => share(elements[e]) >= 0.4), weakEl = ELEMENTS.filter((e) => share(elements[e]) <= 0.1);
  const strongMode = MODES.filter((m) => share(modes[m]) >= 0.4), weakMode = MODES.filter((m) => share(modes[m]) <= 0.1);

  // 主導行星
  const ascS = time ? signIdx(v.asc!) : null;
  const sunS = signIdx(v.planets[0]!.lon), moonS = signIdx(v.planets[1]!.lon);
  const rulesOf = (s: number) => [RULER[s], CO_RULER[s]].filter(Boolean) as string[];
  const scored = v.planets.map((p, order) => {
    let score = 0; const why: string[] = [];
    if (time && p.house && [1, 4, 7, 10].includes(p.house)) { score += 3; why.push(`角宮${p.house}`); }
    if (time && (sep(p.lon, v.asc!) <= 8 || (v.mc !== null && sep(p.lon, v.mc) <= 8))) { score += 2; why.push("近軸點"); }
    if (ascS !== null && RULER[ascS] === p.name) { score += 3; why.push("命主星"); }
    else if (ascS !== null && CO_RULER[ascS] === p.name) { score += 2; why.push("命主星（古典）"); }
    if (rulesOf(sunS).includes(p.name)) { score += 1; why.push("太陽星座守護"); }
    if (rulesOf(moonS).includes(p.name)) { score += 1; why.push("月亮星座守護"); }
    const dg = dignityOf(p.name, p.lon);
    if (dg) { score += DIGNITY_SCORE[dg]!; why.push(dg); }
    const asp = v.aspects.filter((a) => a.a === p.name || a.b === p.name);
    const tightN = asp.filter((a) => a.orb <= 2).length;
    score += asp.length + tightN;
    if (asp.length) why.push(`相位${asp.length}`);
    return { planet: p.name, score, why, nAsp: asp.length, order };
  });
  scored.sort((a, b) => b.score - a.score || b.nAsp - a.nAsp || a.order - b.order);
  const dominant = scored.slice(0, 3).map(({ planet, score, why }) => ({ planet, score, why }));

  // 主導星座
  const top = dominant[0]?.planet;
  const ss = signScore.map((s, i) => ({ i, s: s + (top && rulesOf(i).includes(top) && signCount[i]! > 0 ? 1 : 0), c: signCount[i]! }));
  ss.sort((a, b) => b.s - a.s || b.c - a.c || a.i - b.i);
  const domSign = ss[0] && ss[0].s > 0 ? { sign: SIGNS[ss[0].i]!, score: ss[0].s } : null;

  // 命主星
  let ruler: AstroInsight["ruler"] = null;
  if (ascS !== null) {
    const rp = v.planets.find((p) => p.name === RULER[ascS])!;
    ruler = { planet: rp.name, co: CO_RULER[ascS] ?? null, sign: rp.sign, house: rp.house };
  }

  const patterns = patternsOf(v.planets.map((p) => p.lon), time ? v.planets.map((p) => p.house) : null);
  const hemi = time ? {
    east: v.planets.filter((p) => p.house !== null && (p.house >= 10 || p.house <= 3)).length,
    west: v.planets.filter((p) => p.house !== null && p.house >= 4 && p.house <= 9).length,
    south: v.planets.filter((p) => p.house !== null && p.house >= 7).length,
    north: v.planets.filter((p) => p.house !== null && p.house <= 6).length,
  } : null;
  const tight = v.aspects.filter((a) => !(OUTER.has(a.a) && OUTER.has(a.b))).slice(0, 5);

  for (const e of ELEMENTS) elements[e] = r1(elements[e]);
  for (const m of MODES) modes[m] = r1(modes[m]);
  return {
    elements, modes, total: r1(total), elementList: ELEMENTS.map((el) => ({ el, points: elPoints[el] })),
    strongEl, weakEl, strongMode, weakMode, dominant, domSign, ruler, patterns, hemi, tight,
  };
}
