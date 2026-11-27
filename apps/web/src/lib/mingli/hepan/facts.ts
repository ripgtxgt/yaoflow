import { baziOf, yearCycle } from "@/lib/mingli/bazi/chart";
import { insightOf as baziInsightOf } from "@/lib/mingli/bazi/insight";
import { avoidOf, baziReportOffense, chartYearAt, cleanQuestion, QUESTION_MAX } from "@/lib/mingli/bazi/report-facts";
import { tenOf, zhengyuanOf } from "@/lib/mingli/bazi/zhengyuan";
import { astrolabeOf, sanFang, viewOf, type ZiweiView } from "@/lib/mingli/ziwei/chart";
import { mainOf, MUTS, STEM_MUT } from "@/lib/mingli/ziwei/insight";
import { allStrings, astroDateOffense, astroYearAt, natalOf, type HitF, type Natal } from "@/lib/mingli/astro/report-facts";
import { ASPECTS, houseOf, SIGNS } from "@/lib/mingli/astro/chart";
import { elementOf } from "@/lib/mingli/astro/insight";
import { exactHits } from "@/lib/mingli/astro/report-sky";
import { normalizeBirth, type BirthInput, type Gender, type Normalized } from "@/lib/mingli/birth/normalize";

export { cleanQuestion, QUESTION_MAX };

/**
 * 10-20 合盤 (the fourth piece after 八字／紫微／星盤) — the pure half: no database, no model, no Next; runs in the
 * browser (the free overview — TA's birth data never leaves the device) and on the server (the paid report recomputes
 * from the two birth inputs and keeps only what is computed here). Design: docs/mingli/hepan.md.
 *
 * A = the reader (你), B = the other person (TA). Every pair fact is worked out in both directions, so swapping A and B
 * gives the same facts with the roles swapped. The facts carry ONLY computed chart values: no birth date, clock time,
 * place, coordinates, time zone or name; for both people no degrees and no month / hour pillars (only 日柱 and 生肖, the
 * 喜用 side, 紫微 命宮／夫妻宮 stars, planet signs and the 上升 sign).
 *
 * Themes (吸引, 相處節奏, 摩擦點, 溝通, 金錢與生活, 長期走向) collect the facts that point to them; `systems` = how many of the
 * three systems (八字, 紫微, 星盤) have a fact in it. It orders the themes and is never shown as a number — no scores,
 * no percentages, no verdict on the pair (Neil 10-20).
 */

/* ------------------------------------------------------------------ basics (Traditional) */

const ELS = ["木", "火", "土", "金", "水"] as const;
const ei = (e: string) => ELS.indexOf(e as (typeof ELS)[number]);
const STEMS = "甲乙丙丁戊己庚辛壬癸";
const stemEl = (s: string) => ELS[Math.floor(STEMS.indexOf(s) / 2)]!;
export const ZODIAC_T: Record<string, string> = { 子: "鼠", 丑: "牛", 寅: "虎", 卯: "兔", 辰: "龍", 巳: "蛇", 午: "馬", 未: "羊", 申: "猴", 酉: "雞", 戌: "狗", 亥: "豬" };
const TEN_T: Record<string, string> = { 比肩: "比肩", 劫财: "劫財", 食神: "食神", 伤官: "傷官", 偏财: "偏財", 正财: "正財", 七杀: "七殺", 正官: "正官", 偏印: "偏印", 正印: "正印" };
const tenT = (s: string) => TEN_T[s] ?? s;
const STRENGTH_T: Record<string, string> = { 鲜明: "鮮明", 适中: "適中", 隐约: "隱約", 不见: "不見" };

const STEM_HE: Record<string, string> = { 甲己: "土", 乙庚: "金", 丙辛: "水", 丁壬: "木", 戊癸: "火" };
const STEM_CHONG = ["甲庚", "乙辛", "丙壬", "丁癸"];
const LIUHE = ["子丑", "寅亥", "卯戌", "辰酉", "巳申", "午未"];
const CHONG = ["子午", "丑未", "寅申", "卯酉", "辰戌", "巳亥"];
const XING = ["子卯", "寅巳", "巳申", "寅申", "丑戌", "戌未", "丑未"];
const HAI = ["子未", "丑午", "寅巳", "卯辰", "申亥", "酉戌"];
const PO = ["子酉", "卯午", "辰丑", "未戌", "寅亥", "巳申"];
const SANHE = ["申子辰", "亥卯未", "寅午戌", "巳酉丑"];
const pair = (list: string[], a: string, b: string) => list.includes(a + b) || list.includes(b + a);

/** 天干: 相合 (with the element it makes) / 相沖 */
export function stemRels(a: string, b: string): string[] {
  const he = STEM_HE[a + b] ?? STEM_HE[b + a];
  const out: string[] = [];
  if (he) out.push(`相合（合${he}）`);
  if (pair(STEM_CHONG, a, b)) out.push("相沖");
  return out;
}
/** 地支: 六合 / 半合 (two of a 三合) / 相沖 / 相刑 / 相害 / 相破; the same branch is 同支 (自刑 for 辰午酉亥) */
export function branchRels(a: string, b: string): string[] {
  if (a === b) return ["辰午酉亥".includes(a) ? "自刑" : "同支"];
  const out: string[] = [];
  if (pair(LIUHE, a, b)) out.push("六合");
  const tri = SANHE.find((g) => g.includes(a) && g.includes(b));
  if (tri) out.push(`半合（${tri}）`);
  if (pair(CHONG, a, b)) out.push("相沖");
  if (pair(XING, a, b)) out.push("相刑");
  if (pair(HAI, a, b)) out.push("相害");
  if (pair(PO, a, b)) out.push("相破");
  return out;
}
const relTone = (rels: string[]): Tone => {
  const soft = rels.some((r) => /合/.test(r)), hard = rels.some((r) => /沖|刑|害|破/.test(r));
  return soft && !hard ? "順" : hard && !soft ? "磨" : "中";
};

/** how day-master element b stands to a: same, a feeds b (a生b), b feeds a, a curbs b (a制b), b curbs a */
export type DmRel = "same" | "aFeedsB" | "bFeedsA" | "aCurbsB" | "bCurbsA";
export function dmRelOf(a: string, b: string): DmRel {
  return (["same", "aFeedsB", "aCurbsB", "bCurbsA", "bFeedsA"] as const)[(ei(b) - ei(a) + 5) % 5]!;
}
const swapDm: Record<DmRel, DmRel> = { same: "same", aFeedsB: "bFeedsA", bFeedsA: "aFeedsB", aCurbsB: "bCurbsA", bCurbsA: "aCurbsB" };

/* ------------------------------------------------------------------ one person */

export interface Person { input: BirthInput; gender: Gender }
/** what is worked out for one person (internal: holds longitudes and the full charts — never stored) */
interface Side {
  n: Normalized; gender: Gender;
  pillars: string[]; dayMaster: string; dmEl: string; strength: string; favour: string[]; avoid: string[];
  energy: Record<string, number>; hasHour: boolean;
  spouse: { ten: string; element: string; strength: string };
  zw: ZiweiView | null;
  nat: Natal; astroTime: boolean;
  lon: Record<string, number>;
}

/** partner: the other person's sex — the 配偶星 is read for the partner actually there (a same-sex couple included) */
function sideOf(p: Person, now: number, partner: Gender): Side {
  const n = normalizeBirth(p.input);
  const bz = baziOf(n, p.gender, chartYearAt(now), false);
  const pillars = bz.pillars.map((x) => x.gz);
  const ins = baziInsightOf(pillars, p.gender);
  const z = zhengyuanOf({ pillars, gender: p.gender, partner });
  let zw: ZiweiView | null = null;
  if (n.timeKnown && n.timeIndex !== null) { try { zw = viewOf(astrolabeOf(n, p.gender, "zh-TW")); } catch { zw = null; } }
  const nat = natalOf(n, p.input.houses === "whole" ? "whole" : "placidus");
  const astroTime = nat.v.timeKnown && nat.v.asc !== null;
  const lon: Record<string, number> = Object.fromEntries(nat.v.planets.map((x) => [x.name, x.lon]));
  if (astroTime) lon["上升"] = nat.v.asc!;
  return {
    n, gender: p.gender, pillars, dayMaster: bz.dayMaster, dmEl: bz.dmEl, strength: bz.strength.level, favour: [...bz.favour], avoid: avoidOf(bz),
    energy: { ...ins.energy }, hasHour: bz.hasHour,
    spouse: { ten: tenT(z.star.ten), element: z.star.element, strength: STRENGTH_T[z.star.strength] ?? z.star.strength },
    zw, nat, astroTime, lon,
  };
}

export interface CoreF {
  zodiac: string; yearBranch: string; dayPillar: string; dayMaster: string; dmEl: string; dayBranch: string;
  strength: string; favour: string[]; avoid: string[]; strongEl: string; weakEl: string; hasHour: boolean;
  /** this person's own 配偶星 (male 財, female 官殺) and how present it is */
  spouseStar: { ten: string; element: string; strength: string };
  ziwei: { soul: { stars: string[]; borrowed: boolean }; spouse: { stars: string[]; borrowed: boolean }; fiveClass: string } | null;
  astro: { timeKnown: boolean; sun: string; moon: string | null; moonSplit: [string, string] | null; mercury: string; venus: string; mars: string; saturn: string; asc: string | null; strongEl: string[]; weakEl: string[] };
}

function coreOf(s: Side): CoreF {
  const els = [...ELS].sort((a, b) => (s.energy[b] ?? 0) - (s.energy[a] ?? 0) || ei(a) - ei(b));
  const sign = (name: string) => s.nat.v.planets.find((p) => p.name === name)!.sign;
  const zwPal = (name: string) => {
    const p = s.zw!.palaces.find((x) => x.name === name)!;
    const m = mainOf(s.zw!, p.branch);
    return { stars: m.stars.map((x) => x.name), borrowed: m.borrowed };
  };
  const astroEls = ["火", "土", "風", "水"].map((e) => ({ e, n: s.nat.v.planets.filter((p) => elementOf(p.lon) === e).length + (s.astroTime && elementOf(s.lon["上升"]!) === e ? 1 : 0) }));
  const maxN = Math.max(...astroEls.map((x) => x.n));
  return {
    zodiac: ZODIAC_T[s.pillars[0]![1]!]!, yearBranch: s.pillars[0]![1]!, dayPillar: s.pillars[2]!, dayMaster: s.dayMaster, dmEl: s.dmEl, dayBranch: s.pillars[2]![1]!,
    strength: s.strength, favour: s.favour, avoid: s.avoid, strongEl: els[0]!, weakEl: els[4]!, hasHour: s.hasHour,
    spouseStar: s.spouse,
    ziwei: s.zw ? { soul: zwPal("命宮"), spouse: zwPal("夫妻"), fiveClass: s.zw.fiveClass } : null,
    astro: {
      timeKnown: s.astroTime, sun: sign("太陽"), moon: s.astroTime || !s.nat.moonSplit ? sign("月亮") : null, moonSplit: s.astroTime ? null : s.nat.moonSplit,
      mercury: sign("水星"), venus: sign("金星"), mars: sign("火星"), saturn: sign("土星"), asc: s.astroTime ? SIGNS[Math.floor((((s.lon["上升"]! % 360) + 360) % 360) / 30)]! : null,
      strongEl: astroEls.filter((x) => x.n === maxN).map((x) => x.e), weakEl: astroEls.filter((x) => x.n === 0).map((x) => x.e),
    },
  };
}

/* ------------------------------------------------------------------ pair facts */

export type Sys = "八字" | "紫微" | "星盤";
export type Tone = "順" | "磨" | "中";
export const THEME_KEYS = ["attract", "rhythm", "friction", "talk", "life", "long"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export const THEME_TITLE: Record<ThemeKey, string> = { attract: "吸引", rhythm: "相處節奏", friction: "摩擦點", talk: "溝通", life: "金錢與生活", long: "長期走向" };

export interface FactF { id: string; sys: Sys; text: string; tone: Tone; themes: ThemeKey[] }
export interface ThemeF { key: ThemeKey; title: string; systems: number; facts: string[]; lean: Tone | "混" }
/** a synastry aspect: a = one of A's points, b = one of B's */
export interface SynF { a: string; b: string; name: string; orb: number }
export interface MutF { m: string; star: string; palace: string }

export interface HepanFacts {
  v: 1;
  a: CoreF; b: CoreF;
  bazi: {
    dm: DmRel; dayStem: string[]; dayBranch: string[]; zodiac: string[];
    /** what the other's day stem is for this one (十神), e.g. tenOfB = what B's day stem is to A */
    tenOfB: string; tenOfA: string;
    /** the other's day master is this one's 配偶星 element */
    spouseA: boolean; spouseB: boolean;
    /** the other's strongest element is on this one's 喜用 / 忌 side */
    feedA: "喜用" | "忌" | null; feedB: "喜用" | "忌" | null;
    /** the other's 生肖 (year branch) against this one's 日支 (夫妻宮) */
    palaceA: string[]; palaceB: string[];
  };
  ziwei: {
    /** this one's 夫妻宮 against the other's 命宮: shared star / same group / neither */
    spouseA: { link: "同星" | "同系" | null; shared: string[]; group: string | null };
    spouseB: { link: "同星" | "同系" | null; shared: string[]; group: string | null };
    /** the other's 生年四化 laid on this one's chart by branch: mutInA = B's 四化 in A's palaces */
    mutInA: MutF[]; mutInB: MutF[];
    soul: "同宮" | "對宮" | "三合" | null;
  } | null;
  astro: {
    syn: SynF[];
    /** A's 土星 to B's 太陽／月亮／金星 (satA) and the other way */
    satA: SynF[]; satB: SynF[];
    elements: { point: string; a: string | null; b: string | null; rel: "同元素" | "相容" | "相異" | null }[];
    /** B's 太陽／月亮／金星／火星 in A's houses (A's birth time needed), and the other way */
    inA: { planet: string; house: number }[] | null; inB: { planet: string; house: number }[] | null;
  };
  facts: FactF[];
  themes: ThemeF[];
  year?: YearF;
}

export interface TransitF extends HitF { who: "你" | "TA" }
export interface YearF {
  /** calendar year (星盤 transits, 國曆) and the 八字 year by 立春 */
  year: number; baziYear: number; gz: string;
  bazi: { a: string[]; b: string[] };
  ziwei: { stem: string; mut: { m: string; star: string }[]; a: { mut: MutF[]; soulPalace: string | null }; b: { mut: MutF[]; soulPalace: string | null } } | null;
  transits: TransitF[];
}

export const ZW_GROUP: Record<string, string> = {
  紫微: "紫府", 天府: "紫府", 天相: "紫府", 廉貞: "紫府", 武曲: "紫府",
  七殺: "殺破狼", 破軍: "殺破狼", 貪狼: "殺破狼",
  天機: "機月同梁", 太陰: "機月同梁", 天同: "機月同梁", 天梁: "機月同梁",
  巨門: "巨日", 太陽: "巨日",
};
export const HOUSE_WORD: Record<number, string> = { 1: "自我與第一印象", 2: "金錢與資源", 3: "溝通與學習", 4: "家與歸屬", 5: "戀愛與玩樂", 6: "日常與作息", 7: "伴侶與合作", 8: "親密與共同資源", 9: "眼界與信念", 10: "事業與方向", 11: "朋友與願望", 12: "獨處與內心" };
const HOUSE_THEME: Record<number, ThemeKey[]> = { 1: ["attract"], 2: ["life"], 3: ["talk"], 4: ["rhythm", "long"], 5: ["attract"], 6: ["life", "rhythm"], 7: ["long", "attract"], 8: ["attract", "life"], 9: ["talk"], 10: ["long"], 11: ["rhythm"], 12: ["friction"] };
const KEY_PALACE = ["命宮", "夫妻", "財帛", "田宅", "官祿", "福德"];
const MUT_THEME: Record<string, Record<string, [ThemeKey[], Tone]>> = {
  祿: { 命宮: [["attract"], "順"], 夫妻: [["attract"], "順"], 財帛: [["life"], "順"], 田宅: [["life"], "順"], 官祿: [["long"], "順"], 福德: [["rhythm"], "順"] },
  權: { 命宮: [["rhythm"], "中"], 夫妻: [["rhythm"], "中"], 財帛: [["life"], "中"], 田宅: [["life"], "中"], 官祿: [["long"], "中"], 福德: [["rhythm"], "中"] },
  科: { 命宮: [["talk"], "順"], 夫妻: [["talk"], "順"], 財帛: [["life"], "順"], 田宅: [["life"], "順"], 官祿: [["talk"], "順"], 福德: [["rhythm"], "順"] },
  忌: { 命宮: [["friction", "long"], "磨"], 夫妻: [["friction", "long"], "磨"], 財帛: [["life"], "磨"], 田宅: [["life"], "磨"], 官祿: [["long"], "磨"], 福德: [["rhythm"], "磨"] },
};
export const palaceWord = (name: string) => (/宮$/.test(name) ? name : `${name}宮`);

/** synastry: which themes an aspect between two points feeds */
function synThemes(p: string, q: string, name: string): [ThemeKey[], Tone] {
  const has = (x: string, y: string) => (p === x && q === y) || (p === y && q === x);
  const soft = name === "六合" || name === "拱", hard = name === "刑" || name === "沖";
  const tone: Tone = soft ? "順" : hard ? "磨" : "中";
  const t = new Set<ThemeKey>();
  if (has("金星", "火星")) { t.add("attract"); if (hard) t.add("friction"); }
  if (has("太陽", "月亮")) { t.add(hard ? "friction" : "long"); t.add("rhythm"); }
  if (has("月亮", "月亮")) t.add("rhythm");
  if (has("太陽", "太陽")) { t.add("rhythm"); t.add("long"); }
  if (has("金星", "太陽")) t.add("attract");
  if (has("金星", "月亮")) { t.add("attract"); t.add("rhythm"); }
  if (has("金星", "金星")) { t.add("life"); t.add("attract"); }
  if (p === "水星" || q === "水星") { t.add("talk"); if (has("水星", "金星")) t.add("life"); if (hard) t.add("friction"); }
  if (p === "火星" || q === "火星") { if (hard) t.add("friction"); else if (!has("金星", "火星")) t.add(name === "合" ? "attract" : "rhythm"); }
  if (p === "上升" || q === "上升") t.add("attract");
  if (!t.size) t.add(hard ? "friction" : "rhythm");
  return [[...t], tone];
}

const ORB = (p: string, q: string) => (["太陽", "月亮"].includes(p) || ["太陽", "月亮"].includes(q) ? 7 : p === "上升" || q === "上升" ? 6 : 5);
const r1 = (x: number) => Math.round(x * 10) / 10;
function aspectOf(l1: number, l2: number, orbMax: number): { name: string; orb: number } | null {
  const sep = Math.abs(((l1 - l2 + 540) % 360) - 180);
  let best: { name: string; orb: number } | null = null;
  for (const a of ASPECTS) { const o = Math.abs(sep - a.angle); if (o <= orbMax && (!best || o < best.orb)) best = { name: a.name, orb: o }; }
  return best ? { name: best.name, orb: r1(best.orb) } : null;
}
const SYN_POINTS = ["太陽", "月亮", "水星", "金星", "火星"];
/** the points of one side used for synastry: the Moon only with a birth time (without one it can be 6° off), 上升 likewise */
const pointsOf = (s: Side) => [...SYN_POINTS.filter((p) => p !== "月亮" || s.astroTime), ...(s.astroTime ? ["上升"] : [])];
const AST_EL_COMPAT = (a: string, b: string): "同元素" | "相容" | "相異" => (a === b ? "同元素" : ["火風", "風火", "土水", "水土"].includes(a + b) ? "相容" : "相異");

/** the facts of a pair. `year: true` adds this year's facts (the paid report); the free overview leaves them out. */
export function pairFacts(pa: Person, pb: Person, opt: { now?: number; year?: boolean } = {}): HepanFacts {
  const now = opt.now ?? Date.now();
  const A = sideOf(pa, now, pb.gender), B = sideOf(pb, now, pa.gender);
  const a = coreOf(A), b = coreOf(B);
  const facts: FactF[] = [];
  const push = (id: string, sys: Sys, text: string, tone: Tone, themes: ThemeKey[]) => facts.push({ id, sys, text: spaceTa(text), tone, themes });
  const who = (x: "A" | "B") => (x === "A" ? "你" : "TA");
  const of = (x: "A" | "B") => (x === "A" ? "你的" : "TA 的");

  /* 八字 */
  const dm = dmRelOf(A.dmEl, B.dmEl);
  const dayStem = stemRels(A.dayMaster, B.dayMaster);
  const dayBranch = branchRels(a.dayBranch, b.dayBranch);
  const zodiac = branchRels(a.yearBranch, b.yearBranch);
  const dmText: Record<DmRel, string> = {
    same: `你的日主${a.dayMaster}、TA 的日主${b.dayMaster}，同屬${a.dmEl}`,
    aFeedsB: `你的日主${a.dayMaster}${a.dmEl}生 TA 的日主${b.dayMaster}${b.dmEl}`,
    bFeedsA: `TA 的日主${b.dayMaster}${b.dmEl}生你的日主${a.dayMaster}${a.dmEl}`,
    aCurbsB: `你的日主${a.dayMaster}${a.dmEl}制 TA 的日主${b.dayMaster}${b.dmEl}`,
    bCurbsA: `TA 的日主${b.dayMaster}${b.dmEl}制你的日主${a.dayMaster}${a.dmEl}`,
  };
  push("bz.dm", "八字", dmText[dm], dm === "same" || dm === "aFeedsB" || dm === "bFeedsA" ? "順" : "磨", dm === "same" ? ["rhythm"] : dm === "aFeedsB" || dm === "bFeedsA" ? ["rhythm", "long"] : ["friction", "rhythm"]);
  if (dayStem.length) push("bz.dayStem", "八字", `日柱天干：你的${a.dayMaster}、TA 的${b.dayMaster}，天干${a.dayMaster}${b.dayMaster}${dayStem.join("、")}`, relTone(dayStem), dayStem.some((r) => r.startsWith("相合")) ? ["attract", "long"] : ["friction"]);
  if (dayBranch.length) {
    const tone = relTone(dayBranch);
    push("bz.dayBranch", "八字", `日支（夫妻宮）：你的${a.dayBranch}、TA 的${b.dayBranch}，${dayBranch.join("、")}`, tone,
      dayBranch.includes("六合") ? ["attract", "long"] : tone === "順" ? ["rhythm"] : tone === "磨" ? (dayBranch.includes("相沖") ? ["friction", "rhythm"] : ["friction"]) : ["rhythm"]);
  }
  if (zodiac.length) {
    const tone = relTone(zodiac);
    push("bz.zodiac", "八字", `生肖：你屬${a.zodiac}、TA 屬${b.zodiac}，${a.yearBranch}${b.yearBranch}${zodiac.join("、")}`, tone, tone === "順" ? ["rhythm", "long"] : tone === "磨" ? ["friction"] : ["rhythm"]);
  }
  const tenOfB = tenT(tenOf(A.dayMaster, B.dayMaster)), tenOfA = tenT(tenOf(B.dayMaster, A.dayMaster));
  const spouseA = B.dmEl === A.spouse.element, spouseB = A.dmEl === B.spouse.element;
  for (const [x, hit, s, other, ten] of [["A", spouseA, A, B, tenOfB], ["B", spouseB, B, A, tenOfA]] as const) {
    if (hit) push(`bz.spouse.${x}`, "八字", `${of(x)}配偶星是${s.spouse.element}（${s.spouse.ten}），${of(x === "A" ? "B" : "A")}日主${other.dayMaster}正是${s.spouse.element}，對${who(x)}來說是${ten}`, "順", ["attract", "long"]);
  }
  const feed = (s: Side, other: Side): "喜用" | "忌" | null => {
    const strong = coreStrong(other);
    return s.favour.includes(strong) ? "喜用" : s.avoid.includes(strong) ? "忌" : null;
  };
  const feedA = feed(A, B), feedB = feed(B, A);
  for (const [x, f, s, o] of [["A", feedA, a, b], ["B", feedB, b, a]] as const) {
    if (!f) continue;
    const ox = x === "A" ? "B" : "A";
    push(`bz.feed.${x}`, "八字", `${of(ox)}八字裡最旺的是${o.strongEl}，正是${of(x)}${f === "喜用" ? "喜用" : "忌"}五行${f === "喜用" ? `（${who(x)}喜用${s.favour.join("、")}）` : ""}`, f === "喜用" ? "順" : "磨", f === "喜用" ? ["life", "long"] : ["life", "friction"]);
  }
  const palaceA = branchRels(a.dayBranch, b.yearBranch).filter((r) => r !== "同支"), palaceB = branchRels(b.dayBranch, a.yearBranch).filter((r) => r !== "同支");
  for (const [x, rels, s, o] of [["A", palaceA, a, b], ["B", palaceB, b, a]] as const) {
    const sig = rels.filter((r) => r === "六合" || r === "相沖");
    if (!sig.length) continue;
    const ox = x === "A" ? "B" : "A";
    push(`bz.palace.${x}`, "八字", `${of(ox)}生肖${o.zodiac}（${o.yearBranch}）與${of(x)}日支${s.dayBranch}（夫妻宮）${sig.join("、")}`, sig.includes("六合") ? "順" : "磨", sig.includes("六合") ? ["attract"] : ["friction"]);
  }

  /* 紫微 (both birth times needed) */
  let ziwei: HepanFacts["ziwei"] = null;
  if (A.zw && B.zw) {
    const link = (mine: CoreF, theirs: CoreF) => {
      const sp = mine.ziwei!.spouse.stars, so = theirs.ziwei!.soul.stars;
      const shared = sp.filter((s) => so.includes(s));
      if (shared.length) return { link: "同星" as const, shared, group: ZW_GROUP[shared[0]!] ?? null };
      const g = sp.map((s) => ZW_GROUP[s]).find((x) => x && so.some((t) => ZW_GROUP[t] === x)) ?? null;
      return g ? { link: "同系" as const, shared: [], group: g } : { link: null, shared: [], group: null };
    };
    const spA = link(a, b), spB = link(b, a);
    for (const [x, l, s, o] of [["A", spA, a, b], ["B", spB, b, a]] as const) {
      if (!l.link) continue;
      const ox = x === "A" ? "B" : "A";
      const stars = (st: { stars: string[]; borrowed: boolean }) => `${st.stars.join("、") || "（空宮）"}${st.borrowed ? "（借對宮）" : ""}`;
      push(`zw.spouse.${x}`, "紫微", `${of(x)}夫妻宮${stars(s.ziwei!.spouse)}，${of(ox)}命宮${stars(o.ziwei!.soul)}：${l.link === "同星" ? `同有${l.shared.join("、")}` : `同屬${l.group}一系`}`, "順", l.link === "同星" ? ["attract", "long"] : ["rhythm", "attract"]);
    }
    const natalMut = (v: ZiweiView) => v.palaces.flatMap((p) => [...p.major, ...p.minor].filter((s) => s.mut).map((s) => ({ m: s.mut!, star: s.name, branch: p.branch })));
    const lay = (from: ZiweiView, onto: ZiweiView): MutF[] => natalMut(from).map((x) => ({ m: x.m, star: x.star, palace: onto.palaces.find((p) => p.branch === x.branch)!.name }))
      .sort((p, q) => MUTS.indexOf(p.m as (typeof MUTS)[number]) - MUTS.indexOf(q.m as (typeof MUTS)[number]));
    const mutInA = lay(B.zw, A.zw), mutInB = lay(A.zw, B.zw);
    for (const [x, list] of [["A", mutInA], ["B", mutInB]] as const) {
      const ox = x === "A" ? "B" : "A";
      for (const m of list) {
        const t = MUT_THEME[m.m]?.[m.palace];
        if (!t) continue;
        push(`zw.mut.${x}.${m.m}`, "紫微", `${of(ox)}生年化${m.m}（${m.star}）疊到${of(x)}${palaceWord(m.palace)}`, t[1], t[0]);
      }
    }
    const sa = A.zw.soulBranch, sb = B.zw.soulBranch;
    const soul = sa === sb ? "同宮" as const : sanFang(sa)[3] === sb ? "對宮" as const : sanFang(sa).slice(1, 3).includes(sb) ? "三合" as const : null;
    if (soul) push("zw.soul", "紫微", `你的命宮在${sa}、TA 的命宮在${sb}：${soul === "同宮" ? "落在同一個宮位" : soul === "對宮" ? "互為對宮" : "三合相連"}`, soul === "三合" ? "順" : "中", soul === "三合" ? ["rhythm", "long"] : soul === "對宮" ? ["attract", "friction"] : ["rhythm"]);
    ziwei = { spouseA: spA, spouseB: spB, mutInA, mutInB, soul };
  }

  /* 星盤 */
  const syn: SynF[] = [];
  for (const p of pointsOf(A)) for (const q of pointsOf(B)) {
    if (p === "上升" && q === "上升") continue;
    const x = aspectOf(A.lon[p]!, B.lon[q]!, ORB(p, q));
    if (x) syn.push({ a: p, b: q, name: x.name, orb: x.orb });
  }
  syn.sort((x, y) => x.orb - y.orb || (x.a + x.b).localeCompare(y.a + y.b));
  for (const s of syn) {
    const [themes, tone] = synThemes(s.a, s.b, s.name);
    push(`as.syn.${s.a}.${s.b}`, "星盤", `你的${s.a}與 TA 的${s.b}成${s.name}（${s.orb}°）`, tone, themes);
  }
  const sat = (s: Side, o: Side): SynF[] => ["太陽", "月亮", "金星"].filter((q) => q !== "月亮" || o.astroTime).flatMap((q) => {
    const x = aspectOf(s.lon["土星"]!, o.lon[q]!, 4);
    return x ? [{ a: "土星", b: q, name: x.name, orb: x.orb }] : [];
  });
  const satA = sat(A, B), satB = sat(B, A);
  for (const [x, list] of [["A", satA], ["B", satB]] as const) {
    const ox = x === "A" ? "B" : "A";
    for (const s of list) {
      const hard = s.name === "刑" || s.name === "沖";
      push(`as.sat.${x}.${s.b}`, "星盤", `${of(x)}土星與${of(ox)}${s.b}成${s.name}（${s.orb}°）`, hard ? "磨" : s.name === "合" ? "中" : "順", hard ? ["long", "friction"] : ["long"]);
    }
  }
  const elements = (["太陽", "月亮", "金星"] as const).map((p) => {
    const ea = p === "月亮" && !a.astro.moon ? null : elementOf(A.lon[p]!), eb = p === "月亮" && !b.astro.moon ? null : elementOf(B.lon[p]!);
    return { point: p, a: ea, b: eb, rel: ea && eb ? AST_EL_COMPAT(ea, eb) : null };
  });
  for (const e of elements) {
    if (!e.rel) continue;
    const themes: ThemeKey[] = e.point === "太陽" ? ["rhythm", "long"] : e.point === "月亮" ? ["rhythm"] : ["attract", "life"];
    push(`as.el.${e.point}`, "星盤", `${e.point}：你在${e.a}象、TA 在${e.b}象（${e.rel}）`, e.rel === "相異" ? "中" : "順", themes);
  }
  const overlay = (host: Side, guest: Side) => (host.astroTime && host.nat.v.cusps
    ? ["太陽", "月亮", "金星", "火星"].filter((p) => p !== "月亮" || guest.astroTime).map((p) => ({ planet: p, house: houseOf(guest.lon[p]!, host.nat.v.cusps!) }))
    : null);
  const inA = overlay(A, B), inB = overlay(B, A);
  for (const [x, list] of [["A", inA], ["B", inB]] as const) {
    if (!list) continue;
    const ox = x === "A" ? "B" : "A";
    for (const h of list) push(`as.house.${x}.${h.planet}`, "星盤", `${of(ox)}${h.planet}落在${of(x)}第${h.house}宮（${HOUSE_WORD[h.house]}）`, h.house === 12 ? "中" : "順", HOUSE_THEME[h.house]!);
  }

  const out: HepanFacts = {
    v: 1, a, b,
    bazi: { dm, dayStem, dayBranch, zodiac, tenOfB, tenOfA, spouseA, spouseB, feedA, feedB, palaceA, palaceB },
    ziwei,
    astro: { syn, satA, satB, elements, inA, inB },
    facts, themes: themesOf(facts),
  };
  if (opt.year) out.year = yearFacts(A, B, now);
  return out;
}
/** 「與TA 的」 → 「與 TA 的」: TA always stands apart from the characters around it */
export const spaceTa = (s: string) => s.replace(/([^\s（「、，；：。])TA(?![A-Za-z])/g, "$1 TA").replace(/(^|[^A-Za-z])TA(?=[^\s\x00-\x7f，。、；：）」])/g, "$1TA ").trim();
const coreStrong = (s: Side) => [...ELS].sort((x, y) => (s.energy[y] ?? 0) - (s.energy[x] ?? 0) || ei(x) - ei(y))[0]!;

/** themes in reading order: more systems first, then more facts, then the fixed order */
export function themesOf(facts: FactF[]): ThemeF[] {
  return THEME_KEYS.map((key) => {
    const list = facts.filter((f) => f.themes.includes(key));
    const soft = list.filter((f) => f.tone === "順").length, hard = list.filter((f) => f.tone === "磨").length;
    return { key, title: THEME_TITLE[key], systems: new Set(list.map((f) => f.sys)).size, facts: list.map((f) => f.id), lean: (soft > hard ? "順" : hard > soft ? "磨" : "混") as ThemeF["lean"] };
  }).sort((x, y) => y.systems - x.systems || y.facts.length - x.facts.length || THEME_KEYS.indexOf(x.key) - THEME_KEYS.indexOf(y.key));
}

/* ------------------------------------------------------------------ this year */

function yearFacts(A: Side, B: Side, now: number): YearF {
  const year = astroYearAt(now), baziYear = chartYearAt(now);
  const gz = yearCycle(baziYear).getName(), ys = gz[0]!, yb = gz[1]!;
  const baziOf1 = (s: Side) => {
    const out: string[] = [];
    const ds = s.pillars[2]![0]!, db = s.pillars[2]![1]!, zb = s.pillars[0]![1]!;
    for (const r of stemRels(ys, ds)) out.push(`流年天干${ys}與日干${ds}${r}`);
    for (const r of branchRels(yb, db)) out.push(r === "同支" ? `流年地支${yb}與日支${db}相同（同一個主題被放大）` : `流年地支${yb}與日支${db}（夫妻宮）${r}`);
    for (const r of branchRels(yb, zb)) out.push(r === "同支" || r === "自刑" ? `今年是${ZODIAC_T[zb]}年，正逢本命年` : `流年地支${yb}與生肖${ZODIAC_T[zb]}（${zb}）${r}`);
    const el = stemEl(ys);
    if (s.favour.includes(el)) out.push(`流年天干${ys}屬${el}，是喜用五行`);
    else if (s.avoid.includes(el)) out.push(`流年天干${ys}屬${el}，偏忌的一邊`);
    return out;
  };
  let ziwei: YearF["ziwei"] = null;
  if (A.zw && B.zw) {
    const mut = (STEM_MUT[ys] ?? []).map((star, i) => ({ m: MUTS[i]!, star }));
    const where = (v: ZiweiView) => ({
      mut: mut.flatMap((x) => { const p = v.palaces.find((q) => [...q.major, ...q.minor].some((s) => s.name === x.star)); return p ? [{ m: x.m, star: x.star, palace: p.name }] : []; }),
      soulPalace: v.palaces.find((p) => p.branch === yb)?.name ?? null,
    });
    ziwei = { stem: ys, mut, a: where(A.zw), b: where(B.zw) };
  }
  const tz = A.nat.tz || "Asia/Taipei";
  const transits: TransitF[] = [];
  for (const [label, s] of [["你", A], ["TA", B]] as const) {
    const pts = ["太陽", "金星", ...(s.astroTime ? ["月亮", "上升"] : [])].map((p) => ({ name: p, lon: s.lon[p]! }));
    for (const planet of ["木星", "土星"]) {
      for (const h of exactHits(planet, pts, year, tz, 1)) transits.push({ who: label, planet: h.planet, point: h.point, aspect: h.aspect, exact: h.exact, from: h.from, to: h.to });
    }
  }
  return { year, baziYear, gz, bazi: { a: baziOf1(A), b: baziOf1(B) }, ziwei, transits };
}

/* ------------------------------------------------------------------ the free overview (fixed copy, Traditional; zh pages map the characters) */

export const DM_LINE: Record<DmRel, string> = {
  same: "你們的日主同屬{ea}：看事情的角度接近，容易懂彼此，也容易一起卡在同一個地方。",
  aFeedsB: "你的{ea}生 TA 的{eb}：你多半是付出、照顧的那一方，記得也讓 TA 照顧你。",
  bFeedsA: "TA 的{eb}生你的{ea}：TA 容易成為你的支撐，你在 TA 身邊比較能放鬆。",
  aCurbsB: "你的{ea}制 TA 的{eb}：你容易替兩人定方向，給 TA 留一些自己決定的空間。",
  bCurbsA: "TA 的{eb}制你的{ea}：TA 容易帶著你走，覺得被管的時候直接說出來，比悶著好。",
};
export const THEME_LINE: Record<ThemeKey, Record<Tone | "混", string>> = {
  attract: { 順: "彼此身上有對方想靠近的東西，好幾處盤面都看得到這份吸引。", 磨: "吸引裡帶著一點拉扯，越在意越容易較勁，把在意說成好好說的話。", 混: "吸引有甜也有刺，靠近的速度放慢一點，讓好感站穩。", 中: "吸引是慢慢長出來的，越相處越看得到對方的好。" },
  rhythm: { 順: "生活步調容易對上，相處起來省力，不必一直解釋自己。", 磨: "兩人的步調不太一樣，一個快一個慢，先講好各自需要的空間。", 混: "有些地方很合拍，有些地方要磨合，日常小事多商量就順了。", 中: "步調不用一樣，知道彼此的節奏就好配合。" },
  friction: { 順: "看得到的摩擦不多，真有分歧時也比較容易各退一步。", 磨: "最容易卡住的地方很清楚，先知道彼此在意的點，吵的時候就不會越吵越遠。", 混: "摩擦集中在少數幾件事上，抓住它們就好處理。", 中: "摩擦多半來自習慣不同，不是誰對誰錯。" },
  talk: { 順: "說話的方式容易接得上，很多事一點就通。", 磨: "說話的節奏不同，一方想講清楚、一方想先緩緩，約好什麼時候談比談什麼更重要。", 混: "有時一句話就懂，有時越講越偏，重要的事約時間好好說。", 中: "溝通靠練習，把想法說完整，比猜對方的意思省力。" },
  life: { 順: "在錢和生活習慣上容易互補，一方的長處正好補上另一方。", 磨: "花錢和生活習慣的想法不同，早點把分工講好，少很多小摩擦。", 混: "生活上有互補也有落差，分工講清楚就能各用所長。", 中: "生活習慣各有一套，彼此尊重就好相處。" },
  long: { 順: "盤面上有幾處讓這段關係有走得長的底子，越相處越穩。", 磨: "長期來看有幾門功課要一起做，願意調整的話，關係會越磨越結實。", 混: "長期的底子和功課都有，關鍵在兩人願不願意一起調整。", 中: "長期怎麼走，看兩人怎麼經營，盤面給的是起點。" },
};
export interface Overview { zodiac: string; dm: string; astro: string; themes: { key: ThemeKey; title: string; line: string; chips: string[] }[] }
/** the free page's cards: 生肖與日柱, 日主五行, 星盤日月金星, the top two themes with their facts as chips */
export function overviewOf(f: HepanFacts): Overview {
  const rel = [
    f.bazi.zodiac.length ? `生肖${f.a.yearBranch}${f.b.yearBranch}${f.bazi.zodiac.join("、")}` : "",
    f.bazi.dayStem.length ? `日柱天干${f.bazi.dayStem.join("、")}` : "",
    f.bazi.dayBranch.length ? `日支${f.bazi.dayBranch.join("、")}` : "",
  ].filter(Boolean);
  const zodiac = `你屬${f.a.zodiac}、日柱${f.a.dayPillar}；TA 屬${f.b.zodiac}、日柱${f.b.dayPillar}。${rel.length ? `${rel.join("；")}。` : "生肖和日柱之間沒有明顯的合沖，相處的味道要從其他地方看。"}`;
  const dm = DM_LINE[f.bazi.dm].replace("{ea}", f.a.dmEl).replace("{eb}", f.b.dmEl);
  const moon = (c: CoreF) => (c.astro.moon ? `${c.astro.moon}座` : c.astro.moonSplit ? `${c.astro.moonSplit[0]}座或${c.astro.moonSplit[1]}座` : "—");
  const el = (p: string) => f.astro.elements.find((e) => e.point === p)?.rel;
  const top = f.astro.syn.find((s) => ["太陽", "月亮", "金星", "火星"].includes(s.a) && ["太陽", "月亮", "金星", "火星"].includes(s.b));
  const astro = [
    `太陽：你${f.a.astro.sun}座、TA ${f.b.astro.sun}座${el("太陽") ? `（${el("太陽")}）` : ""}`,
    `月亮：你${moon(f.a)}、TA ${moon(f.b)}${el("月亮") ? `（${el("月亮")}）` : ""}`,
    `金星：你${f.a.astro.venus}座、TA ${f.b.astro.venus}座${el("金星") ? `（${el("金星")}）` : ""}`,
  ].join("；") + (top ? `。最緊的一組：你的${top.a}與 TA 的${top.b}成${top.name}。` : "。");
  const byId = new Map(f.facts.map((x) => [x.id, x]));
  const themes = f.themes.slice(0, 2).map((t) => ({
    key: t.key, title: t.title, line: THEME_LINE[t.key][t.lean],
    chips: t.facts.map((id) => byId.get(id)!).filter(Boolean).slice(0, 5).map(chipOf),
  }));
  return { zodiac, dm, astro, themes };
}
/** a fact as a short chip: 「八字・日支子丑六合」 */
export function chipOf(f: FactF): string {
  const short = f.text.replace(/（\d+(?:\.\d)?°）/, "").replace(/^日柱天干：|^日支（夫妻宮）：|^生肖：/, "");
  return `${f.sys}・${[...short].length > 44 ? `${[...short].slice(0, 43).join("")}…` : short}`;
}

/* ------------------------------------------------------------------ checks (the report's text) */

/**
 * The 八字 banned list (準 as accuracy, 保證, AI, 吉／凶, 化解／改運, 太歲, 離婚, 剋夫, medical / investment / legal,
 * mechanics …) plus what a 合盤 adds (Neil 10-20): no verdict on the pair (配不配, 合不合適, 會不會分手, 分手, 復合,
 * 天生一對, 正緣, 命定), no score (分數, 幾分, 百分, %, 契合度, 速配, 指數), no 克／剋 (克服 and 克制 are everyday words
 * and pass), no third party, the fate words of the 星盤 report, 他／她 for the partner (only TA; 其他 and 他人 pass),
 * and no English word (TA passes).
 */
let hepanBannedCache: [string, RegExp][] | null = null;
const hepanBanned = (): [string, RegExp][] => (hepanBannedCache ??= [
  ["verdict", /配不配|合不合適|合不合适|適不適合|适不适合|適合不適合|适合不适合|會不會分手|会不会分手|分手|復合|复合|天生一對|天生一对|絕配|绝配|正緣|正缘|命定|姻緣註定|姻缘注定/],
  ["score", /分數|分数|幾分|几分|百分|[%％]|契合度|速配|指數|指数|評分|评分|得分|相容度/],
  ["ke", /[克剋](?![服制])/],
  ["third", /小三|第三者|外遇|出軌|出轨|劈腿|偷吃/],
  ["fate", /宿命|業力|业力|前世|報應|报应|命不好|命苦|倒楣|倒霉|災難|灾难/],
  ["pronoun", /(?<!其)[他她](?![人])/],
]);
export function hepanOffense(text: string): string | null {
  const b = baziReportOffense(text, "deep");
  if (b) return b;
  for (const [k, re] of hepanBanned()) { const m = text.match(re); if (m) return `${k}:${m[0]}`; }
  const en = text.match(/(?<![A-Za-z])(?!TA(?![A-Za-z]))[A-Za-z]{2,}/);
  if (en) return `latin:${en[0]}`;
  return null;
}
/** every date of this year's facts must be 「國曆 M/D」 and one of them; no lunar month names (astroDateOffense) */
export function hepanDateOffense(value: unknown, y: YearF | undefined): string | null {
  if (!y) return null;
  return astroDateOffense(value, { year: y.year, slow: [], hits: y.transits, eclipses: [], retro: [], months: [] });
}
export { allStrings };

/* ------------------------------------------------------------------ chapters, writing calls, page copy */

export const HP_CHAPTERS: { key: string; title: string; theme?: ThemeKey }[] = [
  { key: "dise", title: "兩個人的底色" },
  { key: "xiyin", title: "吸引你們的地方", theme: "attract" },
  { key: "jiezou", title: "相處的節奏", theme: "rhythm" },
  { key: "mocha", title: "容易摩擦的地方與怎麼接", theme: "friction" },
  { key: "goutong", title: "溝通方式", theme: "talk" },
  { key: "shenghuo", title: "金錢與生活習慣", theme: "life" },
  { key: "changqi", title: "長期一起走的功課", theme: "long" },
  { key: "liunian", title: "今年兩人的流年互動" },
  { key: "jianyi", title: "給你們的三個建議" },
  { key: "qa", title: "答你的問題" },
];
/** five writing calls (+ qa when there is a question) */
export const HP_GROUPS: Record<string, string[]> = { A: ["dise", "xiyin"], B: ["jiezou", "goutong"], C: ["mocha", "shenghuo"], D: ["changqi", "jianyi"], E: ["liunian"] };
export const hpGroupKeys = (opt: { question?: boolean } = {}) => [...Object.keys(HP_GROUPS), ...(opt.question ? ["qa"] : [])];
export const hpGroupOf = (chapter: string) => (chapter === "qa" ? "qa" : Object.keys(HP_GROUPS).find((g) => HP_GROUPS[g]!.includes(chapter)) ?? "A");
/** lower bounds the prompt asks for; under half is sent back */
export const HP_MIN: Record<string, number> = { dise: 600, xiyin: 500, jiezou: 500, mocha: 500, goutong: 500, shenghuo: 500, changqi: 500, liunian: 500, jianyi: 120, qa: 600 };

export const HP_UI = {
  head: "合盤", me: "我", ta: "TA",
  lead: "選你自己和 TA 的生辰，用八字、紫微、星盤三套看法，看兩個人怎麼相處。TA 的資料只留在這台裝置上。",
  pickMe: "選我的生辰", pickTa: "選 TA 的生辰", change: "換一份", needGender: "這份生辰沒有填性別，請重新填一份。",
  sameOne: "兩邊選了同一份生辰，請換一份。",
  zodiacHead: "生肖與日柱", dmHead: "日主五行", astroHead: "星盤：日、月、金星", themesHead: "最明顯的兩件事",
  noZiwei: "紫微要兩個人都有出生時辰才排得出來，這次只看八字和星盤。",
  noTimeAstro: "沒有出生時間的一方，不看上升和宮位，月亮只看星座。",
  buyHead: "完整合盤報告", buyLine: "十章：兩個人的底色、吸引、相處節奏、摩擦與怎麼接、溝通、金錢與生活、長期功課、今年的流年互動、三個建議，可以附一個你想問的問題。",
  buyNote: "同一對只收一次錢；之後想問別的事，在報告裡直接再問。報告只存算好的盤面，不存兩個人的生日、時間、地點和名字。",
  buy: "購買 {p}", test: "測試帳號：免費打開", going: "前往付款…", writing: "正在建立…", buyErr: "暫時沒辦法建立，請稍後再試。",
  ask: "想在報告裡問的一件事（選填）", askHint: "例如：我們今年適合一起搬家嗎？（200 字以內）",
  askHead: "你可能想問", asks: "這段關係接下來三個月的走向,我該主動多走一步嗎,最近的摩擦怎麼處理比較好,我們要不要一起做這個決定",
  basis: "依據", disclaimer: "合盤描述的是兩個人相處的傾向，不替任何一段關係下結論；不談健康、投資與法律。",
  // report page
  back: "合盤", kindLabel: "合盤報告", kindSub: "八字、紫微、星盤三套看法，看兩個人怎麼相處",
  writingAll: "報告正在寫，一章一章出來，寫好的會先出現在這裡。大約一兩分鐘，頁面會自己更新。",
  writingChapter: "這一章正在寫……", failedChapter: "這一章這次沒寫成，我們會補上，寫好會寄信通知你。",
  unpaidHead: "這份報告還沒付款", unpaidBody: "付款完成後，報告會直接寫在這一頁，也會寄到你的信箱。",
  coreHead: "兩個人", rowZodiac: "生肖・日柱", rowDm: "日主・強弱", rowFavour: "喜用", rowZiwei: "紫微命宮", rowAstro: "太陽・月亮・上升", rowVenus: "金星・火星",
  yearNote: "今年的日期都是國曆。八字的流年從立春算起。",
  questionYou: "你問的是", questionCast: "想看這件事接下來的走向，可以為它起一卦 →", prevAsked: "你之前問過的",
  reaskHead: "想再問一件你們之間的事？", reaskPh: "例如：我們適合一起換城市生活嗎？（200 字以內）",
  productName: "YaoFlow 合盤報告：兩個人怎麼相處（數位內容）", productNameHans: "YaoFlow 合盘报告：两个人怎么相处（数字内容）",
  linkHead: "和 TA 合盤", linkLine: "用八字、紫微、星盤一起看兩個人怎麼相處 →",
  // 10-21 邀請連結 — the inviter's side
  inviteBtn: "邀請 TA 自己填 →", inviteHead: "邀請 TA 自己填生辰",
  inviteLead: "把這個連結傳給 TA。連結裡帶著你的生辰，只傳給 TA 本人；TA 在自己的手機上填好，你們兩個都看得到合盤。",
  inviteCopy: "複製連結", inviteCopied: "已複製", inviteShare: "傳給 TA", inviteShareText: "一起來合盤？用八字、紫微、星盤看我們兩個怎麼相處，點開連結填你的生辰就好。",
  inviteAgain: "再傳一次連結", inviteWaiting: "等 TA 填好，結果會出現在這裡。", inviteMade: "邀請已發出",
  inviteReady: "TA 填好了", inviteOpen: "看你們的合盤 →", inviteFilledTa: "TA（自己填的）",
  inviteTaNote: "TA 的生辰留在 TA 的裝置上，這裡只有算好的盤面。", inviteExpired: "這個邀請已經過期（30 天），請再邀請一次。", inviteForget: "移除",
  inviteGone: "這個邀請的結果已經過期（30 天），請再邀請 TA 一次。",
  // 10-21 邀請連結 — TA's landing page
  landHead: "有人邀請你一起合盤", landHeadNamed: "{n} 邀請你一起合盤",
  landLead: "填上你的生辰，兩個人都看得到結果。填好後，算好的盤面會傳給邀請你的人：對方看到的是生肖、日柱、星座這些盤面，不是你填的生日、時間和地點；我們這裡也不存。",
  landBad: "這個邀請連結打不開：可能已經過期（30 天），或是沒有完整複製。請對方再傳一次。",
  landSending: "正在把算好的盤面傳給對方……", landSent: "已經把算好的盤面傳給對方了。", landSendFail: "盤面沒傳成功，重新整理這一頁會再試一次。",
  inviterName: "邀請我的人",
  // 10-21 兩人分享卡
  cardLead: "把兩個人的盤做成一張圖，分享給 TA 或朋友。", cardText: "我和 TA 的合盤：八字、紫微、星盤三套一起看。",
};
/** every fixed string of the 合盤, for the banned-word test and the zh character map */
export function hepanStaticStrings(): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => { if (typeof x === "string") out.push(x); else if (x && typeof x === "object") Object.values(x).forEach(walk); };
  walk(HP_UI); walk(THEME_LINE); walk(THEME_TITLE); walk(DM_LINE); walk(HP_CHAPTERS.map((c) => c.title)); walk(HOUSE_WORD);
  return out.filter(Boolean);
}
/**
 * Every character the free page can show (fixed copy, chart names, the fact templates) — the server turns it into a
 * Traditional → Simplified character map for zh pages, since the client cannot load the converter.
 */
export function hepanVocab(): string {
  return [
    ...hepanStaticStrings(), ...SIGNS, ...Object.values(ZODIAC_T), ...Object.values(TEN_T), ...Object.values(STRENGTH_T), ...Object.keys(ZW_GROUP), ...Object.values(ZW_GROUP),
    "命宮兄弟夫妻子女財帛疾厄遷移交友官祿田宅福德父母", "太陽月亮水星金星火星木星土星天王星海王星冥王星上升", "合六合刑拱沖相合相沖六合半合相刑相害相破同支自刑",
    "你的日主同屬生制配偶星正是對來說是八字裡最旺的喜用忌五行生肖與日支夫妻宮借對宮空宮同有同屬一系生年化祿權科忌疊到命宮在落在同一個宮位互為對宮三合相連成象同元素相容相異第宮最緊的一組或",
    "自我與第一印象金錢與資源溝通與學習家與歸屬戀愛與玩樂日常與作息伴侶與合作親密與共同資源眼界與信念事業與方向朋友與願望獨處與內心",
    "火土風水木金局偏強稍強中和稍弱偏弱",
  ].join("");
}
