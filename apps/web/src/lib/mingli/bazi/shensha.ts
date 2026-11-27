import { SixtyCycle, SolarTerm, SolarTime } from "tyme4ts";

/**
 * 10-18 神煞 / 小運 / 交運 / 人元司令 / 原局關係 — rules reverse-engineered to reproduce 问真八字 (bz.iwzwh.com) and checked
 * block by block against test/mingli/wenzhen-cases.json (16 charts). Pure: imports only tyme4ts. All output is simplified
 * Chinese exactly as 问真 prints it; the UI converts to traditional.
 *
 * Exports
 * - shenshaOf(gz, natal, gender, kind): string[]
 *     神煞 of one 干支 column. `natal` = the four natal pillars ("甲子"…; hour optional, no rule needs it).
 *     kind: "natal-year" | "natal-month" | "natal-day" | "natal-hour" for the 原局 columns, "fortune" for 大運 / 流年 / 小運.
 *     Reference points are always the natal chart (年干支、日干支、月支、年柱納音). Natal columns never use themselves as a
 *     reference (e.g. the year pillar does not get 將星/華蓋/空亡/學堂 from its own year branch). Day-only stars
 *     (十惡大敗、陰差陽錯、四廢日、九醜日、八專日、十靈日、魁罡日、天轉日、天赦日、孤鸞煞) appear on the natal day column only;
 *     童子煞 on the natal day and hour columns only; 天羅/地網 (by 年納音) on the natal day column and on fortune columns.
 *     Order follows the rule table, not 问真's display order.
 * - smallFortunes(hourGz, yearStem, gender, lunarBirthYear, fromYear, count): { year, age, gz }[]
 *     小運: from the hour pillar, one step per 虛歲 (age = year − 農曆出生年 + 1), forward for 陽男陰女, backward otherwise
 *     (陰陽 from the 立春 year pillar's stem).
 * - jiaoyun(startTime): string — "逢戊、癸年 立春後27天 交大运" (simplified), from the 起運 moment
 *     (tyme4ts ChildLimit.getEndTime()): the 立春 year stem of that moment and the stem five after it; the last 節 (12 節
 *     only, not 氣) at or before it, and whole days elapsed (floor of the exact time difference).
 * - siling(birth): string — 人元司令分野 (渊海子平 table) by time elapsed since the birth month's 節; "戊己" for early 申月.
 * - relationsFull(pillars): { stems, branches, whole } — 原局 relations, 年月日時 order in, 问真 order out (see below).
 */

const S = "甲乙丙丁戊己庚辛壬癸", B = "子丑寅卯辰巳午未申酉戌亥";
const si = (c: string) => S.indexOf(c), bi = (c: string) => B.indexOf(c);
const bAt = (i: number) => B[((i % 12) + 12) % 12]!;

export type Kind = "natal-year" | "natal-month" | "natal-day" | "natal-hour" | "fortune";
export type Gender = "male" | "female";
export interface Natal { year: string; month: string; day: string; hour?: string }

// ---------------------------------------------------------------------------------------------------------------- 神煞
type Ctx = { n: Natal; g: Gender; kind: Kind; gz: string; s: string; b: string; ys: string; yb: string; ds: string; db: string; mb: string };
type Rule = (c: Ctx) => boolean;
const tbl = (m: string) => { const o: Record<string, string> = {}; for (const p of m.split(" ")) o[p[0]!] = p.slice(1); return o; };
const nayinEl = (gz: string) => { const n = SixtyCycle.fromName(gz).getSound().getName(); return n[n.length - 1]!; };
const kongOf = (gz: string) => SixtyCycle.fromName(gz).getExtraEarthBranches().map((x) => x.getName()).join("");
const TRINES = ["申子辰", "寅午戌", "巳酉丑", "亥卯未"];
const trine = (b: string) => TRINES.find((g) => g.includes(b))!;
const season = (mb: string) => Math.floor(((bi(mb) - 2 + 12) % 12) / 3); // 0 春 1 夏 2 秋 3 冬
/** natal year / day as references, minus the column itself */
const refsYD = (c: Ctx, yb: string, db: string) => [c.kind === "natal-year" ? null : yb, c.kind === "natal-day" ? null : db].filter((x): x is string => !!x);
/** 干 → 支 tables checked from the natal year stem and/or day stem */
const byStem = (t: Record<string, string>, c: Ctx, refs: string[]) => refs.some((r) => (t[r] ?? "").includes(c.b));

const TIANYI = tbl("甲丑未 乙子申 丙亥酉 丁亥酉 戊丑未 己子申 庚丑未 辛寅午 壬卯巳 癸卯巳");
const TAIJI = tbl("甲子午 乙子午 丙卯酉 丁卯酉 戊辰戌丑未 己辰戌丑未 庚寅亥 辛寅亥 壬巳申 癸巳申");
const WENCHANG = tbl("甲巳 乙午 丙申 丁酉 戊申 己酉 庚亥 辛子 壬寅 癸卯");
const TIANCHU = tbl("甲巳 乙午 丙巳 丁午 戊申 己酉 庚亥 辛子 壬寅 癸卯");
const FUXING = tbl("甲寅子 乙卯丑 丙寅子 丁亥 戊申 己未 庚午 辛巳 壬辰 癸卯丑");
const GUOYIN = tbl("甲戌 乙亥 丙丑 丁寅 戊丑 己寅 庚辰 辛巳 壬未 癸申");
const JINYU = tbl("甲辰 乙巳 丙未 丁申 戊未 己申 庚戌 辛亥 壬丑 癸寅");
const LU = tbl("甲寅 乙卯 丙巳 丁午 戊巳 己午 庚申 辛酉 壬亥 癸子");
const YANGREN = tbl("甲卯 乙寅 丙午 丁巳 戊午 己巳 庚酉 辛申 壬子 癸亥"); // 陰干刃在祿後
const HONGYAN = tbl("甲午 乙午 丙寅 丁未 戊辰 己辰 庚戌 辛酉 壬子 癸申");
const LIUXIA = tbl("甲酉 乙戌 丙未 丁申 戊巳 己午 庚辰 辛卯 壬亥 癸寅");
// 月支 →
const TIANDE = tbl("寅丁 卯申 辰壬 巳辛 午亥 未甲 申癸 酉寅 戌丙 亥乙 子巳 丑庚");
const TIANDEHE = tbl("寅壬 卯巳 辰丁 巳丙 午寅 未己 申戊 酉亥 戌辛 亥庚 子申 丑乙");
const YUEDE: Record<string, string> = { 寅午戌: "丙", 申子辰: "壬", 亥卯未: "甲", 巳酉丑: "庚" };
const YUEDEHE: Record<string, string> = { 寅午戌: "辛", 申子辰: "丁", 亥卯未: "己", 巳酉丑: "乙" };
const DEXIU: Record<string, string> = { 寅午戌: "丙丁戊癸", 申子辰: "壬癸戊己丙辛甲", 巳酉丑: "庚辛乙", 亥卯未: "甲乙丁壬" };
const XUEREN = tbl("寅丑 卯未 辰寅 巳申 午卯 未酉 申辰 酉戌 戌巳 亥亥 子午 丑子");
// 年柱納音五行 → 長生 / 臨官 (土隨水)
const SHENG: Record<string, string> = { 木: "亥", 火: "寅", 土: "申", 金: "巳", 水: "申" };
const GUAN: Record<string, string> = { 木: "寅", 火: "巳", 土: "亥", 金: "申", 水: "亥" };
// 三合局 → 星 (年支、日支)
const TRINE_STAR: Record<string, Record<string, string>> = {
  将星: { 申子辰: "子", 寅午戌: "午", 巳酉丑: "酉", 亥卯未: "卯" },
  华盖: { 申子辰: "辰", 寅午戌: "戌", 巳酉丑: "丑", 亥卯未: "未" },
  桃花: { 申子辰: "酉", 寅午戌: "卯", 巳酉丑: "午", 亥卯未: "子" },
  驿马: { 申子辰: "寅", 寅午戌: "申", 巳酉丑: "亥", 亥卯未: "巳" },
  劫煞: { 申子辰: "巳", 寅午戌: "亥", 巳酉丑: "寅", 亥卯未: "申" },
  亡神: { 申子辰: "亥", 寅午戌: "巳", 巳酉丑: "申", 亥卯未: "寅" },
  灾煞: { 申子辰: "午", 寅午戌: "子", 巳酉丑: "卯", 亥卯未: "酉" }, // 年支 only
};
const GUCHEN: Record<string, string> = { 亥: "寅", 子: "寅", 丑: "寅", 寅: "巳", 卯: "巳", 辰: "巳", 巳: "申", 午: "申", 未: "申", 申: "亥", 酉: "亥", 戌: "亥" };
const GUASU: Record<string, string> = { 亥: "戌", 子: "戌", 丑: "戌", 寅: "丑", 卯: "丑", 辰: "丑", 巳: "辰", 午: "辰", 未: "辰", 申: "未", 酉: "未", 戌: "未" };
const DAY_LISTS: Record<string, string> = {
  十恶大败: "甲辰 乙巳 丙申 丁亥 戊戌 己丑 庚辰 辛巳 壬申 癸亥",
  阴差阳错: "丙子 丁丑 戊寅 辛卯 壬辰 癸巳 丙午 丁未 戊申 辛酉 壬戌 癸亥",
  孤鸾煞: "乙巳 丁巳 辛亥 戊申 甲寅 戊午 壬子 丙午",
  十灵日: "甲辰 乙亥 丙辰 丁酉 戊午 庚戌 庚寅 辛亥 壬寅 癸未",
  九丑日: "丁酉 戊子 戊午 己卯 己酉 辛卯 辛酉 壬子 壬午",
  八专日: "甲寅 乙卯 丁未 戊戌 己未 庚申 辛酉 癸丑",
  魁罡日: "庚辰 庚戌 壬辰 戊戌",
};
const DAY_SEASON: Record<string, string[]> = { // 春 夏 秋 冬 by 月支
  四废日: ["庚申 辛酉", "壬子 癸亥", "甲寅 乙卯", "丙午 丁巳"],
  天转日: ["乙卯", "丙午", "辛酉", "壬子"],
  天赦日: ["戊寅", "甲午", "戊申", "甲子"],
};
const isDay = (c: Ctx) => c.kind === "natal-day";
const fortuneOrDay = (c: Ctx) => c.kind === "fortune" || c.kind === "natal-day";

const RULES: [string, Rule][] = [
  // 年干、日干 →
  ["天乙贵人", (c) => byStem(TIANYI, c, [c.ys, c.ds])],
  ["太极贵人", (c) => byStem(TAIJI, c, [c.ys, c.ds])],
  ["文昌贵人", (c) => byStem(WENCHANG, c, [c.ys, c.ds])],
  ["天厨贵人", (c) => byStem(TIANCHU, c, [c.ys, c.ds])],
  ["福星贵人", (c) => byStem(FUXING, c, [c.ys, c.ds])],
  ["国印贵人", (c) => byStem(GUOYIN, c, [c.ys, c.ds])],
  ["金舆", (c) => byStem(JINYU, c, [c.ys, c.ds])],
  // 日干 →
  ["禄神", (c) => byStem(LU, c, [c.ds])],
  ["羊刃", (c) => byStem(YANGREN, c, [c.ds])],
  ["飞刃", (c) => bAt(bi(YANGREN[c.ds]!) + 6) === c.b],
  ["红艳煞", (c) => byStem(HONGYAN, c, [c.ds])],
  ["流霞", (c) => byStem(LIUXIA, c, [c.ds])],
  // 月支 →
  ["天德贵人", (c) => TIANDE[c.mb] === c.s || TIANDE[c.mb] === c.b],
  ["天德合", (c) => TIANDEHE[c.mb] === c.s || TIANDEHE[c.mb] === c.b],
  ["月德贵人", (c) => YUEDE[trine(c.mb)] === c.s],
  ["月德合", (c) => YUEDEHE[trine(c.mb)] === c.s],
  ["德秀贵人", (c) => DEXIU[trine(c.mb)]!.includes(c.s)],
  ["血刃", (c) => XUEREN[c.mb] === c.b],
  ["天医", (c) => bAt(bi(c.mb) - 1) === c.b],
  // 年支、日支 三合
  ...Object.entries(TRINE_STAR).map(([name, t]) => [name, (c: Ctx) =>
    (name === "灾煞" ? refsYD(c, c.yb, "") : refsYD(c, c.yb, c.db)).some((r) => t[trine(r)] === c.b)] as [string, Rule]),
  // 年支 →
  ["孤辰", (c) => GUCHEN[c.yb] === c.b],
  ["寡宿", (c) => GUASU[c.yb] === c.b],
  ["丧门", (c) => bAt(bi(c.yb) + 2) === c.b],
  ["吊客", (c) => bAt(bi(c.yb) - 2) === c.b],
  ["披麻", (c) => bAt(bi(c.yb) - 3) === c.b],
  ["勾绞煞", (c) => bAt(bi(c.yb) + 3) === c.b],
  ["红鸾", (c) => bAt(3 - bi(c.yb)) === c.b],
  ["天喜", (c) => bAt(9 - bi(c.yb)) === c.b],
  ["元辰", (c) => { const yang = si(c.ys) % 2 === 0; const fwd = yang === (c.g === "male"); return bAt(bi(c.yb) + (fwd ? 7 : 5)) === c.b; }],
  // 旬空: 日柱 and 年柱 (not on themselves)
  ["空亡", (c) => (!isDay(c) && kongOf(c.n.day).includes(c.b)) || (c.kind !== "natal-year" && kongOf(c.n.year).includes(c.b))],
  // 年柱納音 長生 / 臨官; 正 when the column's own 納音 has the same element
  ["学堂", (c) => c.kind !== "natal-year" && SHENG[nayinEl(c.n.year)] === c.b && nayinEl(c.gz) !== nayinEl(c.n.year)],
  ["正学堂", (c) => c.kind !== "natal-year" && SHENG[nayinEl(c.n.year)] === c.b && nayinEl(c.gz) === nayinEl(c.n.year)],
  ["词馆", (c) => c.kind !== "natal-year" && GUAN[nayinEl(c.n.year)] === c.b && nayinEl(c.gz) !== nayinEl(c.n.year)],
  ["正词馆", (c) => c.kind !== "natal-year" && GUAN[nayinEl(c.n.year)] === c.b && nayinEl(c.gz) === nayinEl(c.n.year)],
  // 天羅地網: the column's 支 pairs 辰巳 / 戌亥 with the natal year or day 支
  ["天罗地网", (c) => refsYD(c, c.yb, c.db).some((r) => { const k = r + c.b; return k === "辰巳" || k === "巳辰" || k === "戌亥" || k === "亥戌"; })],
  // 天羅 / 地網 by 年納音: 火命見戌亥, 水土命見辰巳 (natal day + fortune columns)
  ["天罗", (c) => fortuneOrDay(c) && nayinEl(c.n.year) === "火" && "戌亥".includes(c.b)],
  ["地网", (c) => fortuneOrDay(c) && "水土".includes(nayinEl(c.n.year)) && "辰巳".includes(c.b)],
  // 童子煞: 春秋寅子、冬夏卯未辰; 金木午卯、水火酉戌、土辰巳 (年納音) — natal day / hour only
  ["童子煞", (c) => (c.kind === "natal-day" || c.kind === "natal-hour") &&
    ((season(c.mb) % 2 === 0 ? "寅子" : "卯未辰").includes(c.b) || ({ 金: "午卯", 木: "午卯", 水: "酉戌", 火: "酉戌", 土: "辰巳" } as Record<string, string>)[nayinEl(c.n.year)]!.includes(c.b))],
  // 日柱 only
  ...Object.entries(DAY_LISTS).map(([name, l]) => [name, (c: Ctx) => isDay(c) && l.split(" ").includes(c.gz)] as [string, Rule]),
  ...Object.entries(DAY_SEASON).map(([name, l]) => [name, (c: Ctx) => isDay(c) && l[season(c.mb)]!.split(" ").includes(c.gz)] as [string, Rule]),
];

export function shenshaOf(gz: string, natal: Natal, gender: Gender, kind: Kind): string[] {
  const c: Ctx = { n: natal, g: gender, kind, gz, s: gz[0]!, b: gz[1]!, ys: natal.year[0]!, yb: natal.year[1]!, ds: natal.day[0]!, db: natal.day[1]!, mb: natal.month[1]! };
  return RULES.filter(([, f]) => f(c)).map(([k]) => k);
}

// ---------------------------------------------------------------------------------------------------------------- 小運
export function smallFortunes(hourGz: string, yearStem: string, gender: Gender, lunarBirthYear: number, fromYear: number, count: number): { year: number; age: number; gz: string }[] {
  const yang = si(yearStem) % 2 === 0;
  const dir = yang === (gender === "male") ? 1 : -1;
  const h = SixtyCycle.fromName(hourGz);
  return Array.from({ length: count }, (_, k) => { const year = fromYear + k, age = year - lunarBirthYear + 1; return { year, age, gz: h.next(dir * age).getName() }; });
}

// ---------------------------------------------------------------------------------------------------------------- 節
/** the last 節 (not 氣) at or before t, and days elapsed (fractional) */
function lastJie(t: SolarTime): { term: SolarTerm; days: number } {
  const jd = t.getJulianDay().getDay();
  let term = SolarTerm.fromIndex(t.getYear() + 1, 0);
  while (!term.isJie() || term.getJulianDay().getDay() > jd) term = term.next(-1);
  return { term, days: jd - term.getJulianDay().getDay() };
}

// ---------------------------------------------------------------------------------------------------------------- 交運
export function jiaoyun(startTime: SolarTime): string {
  const p = jiaoyunParts(startTime);
  return `逢${p.a}、${p.b}年 ${p.term}后${p.days}天 交大运`;
}
/** 10-30 进度表 128 ④: the same, as parts (a page in another language words it itself): the two year stems, the 節 (simplified), the days */
export function jiaoyunParts(startTime: SolarTime): { a: string; b: string; term: string; days: number } {
  const { term, days } = lastJie(startTime);
  const ys = startTime.getLunarHour().getEightChar().getYear().getHeavenStem().getName();
  return { a: ys, b: S[(si(ys) + 5) % 10]!, term: term.getName(), days: Math.floor(days) };
}

// ---------------------------------------------------------------------------------------------------------------- 司令
const SILING: Record<string, [string, number][]> = {
  子: [["壬", 10], ["癸", 20]], 丑: [["癸", 9], ["辛", 3], ["己", 18]], 寅: [["戊", 7], ["丙", 7], ["甲", 16]],
  卯: [["甲", 10], ["乙", 20]], 辰: [["乙", 9], ["癸", 3], ["戊", 18]], 巳: [["戊", 5], ["庚", 9], ["丙", 16]],
  午: [["丙", 10], ["己", 9], ["丁", 11]], 未: [["丁", 9], ["乙", 3], ["己", 18]], 申: [["戊己", 10], ["壬", 3], ["庚", 17]],
  酉: [["庚", 10], ["辛", 20]], 戌: [["辛", 9], ["丁", 3], ["戊", 18]], 亥: [["戊", 7], ["甲", 5], ["壬", 18]],
};
const JIE_BRANCH: Record<string, string> = { 立春: "寅", 惊蛰: "卯", 清明: "辰", 立夏: "巳", 芒种: "午", 小暑: "未", 立秋: "申", 白露: "酉", 寒露: "戌", 立冬: "亥", 大雪: "子", 小寒: "丑" };
export function siling(birth: SolarTime): string {
  const { term, days } = lastJie(birth);
  let acc = 0;
  const segs = SILING[JIE_BRANCH[term.getName()]!]!;
  for (const [s, n] of segs) { acc += n; if (days < acc) return s; }
  return segs[segs.length - 1]![0];
}

// ---------------------------------------------------------------------------------------------------------------- 關係
/*
 * 天干: 「X Y相克」 same 陰陽 only (克者在前), sorted by the 克者; then 「合化」 (all 五合 present), then 「争合」 (one side doubled).
 * 地支, category by category: 六合「合化」 → 三合 family per group (三合局 / 半合局 / 见X暗合 / 拱合X) → 三會 family
 *   (三会局 / 见X暗三会 / 拱会) → 暗合 (fixed nine pairs) → 刑 → 冲 → 破 → 害. Inside a category pairs are visited
 *   (時,日) (時,月) (時,年) (日,月) (日,年) (月,年). 「见X暗合/暗三会」 = 生墓 (or 方 ends) present and the missing middle's 本氣 stem
 *   among the stems (listed even when the middle is present); 拱 only when the middle is absent. 半合 is dropped when a
 *   branch is already 合化 into another element (庚寅 壬午 己亥 庚午: 寅亥化木 → no 寅午半合火局).
 * 整柱: 盖头 (干克支) → 截脚 (支克干) → 反吟 (天克地冲, 克者在前) → 伏吟 → 自合 (日柱 only; replaces 盖头/截脚).
 */
const SEL = (c: string) => Math.floor(si(c) / 2); // 0木 1火 2土 3金 4水
const BEL: Record<string, number> = { 寅: 0, 卯: 0, 巳: 1, 午: 1, 辰: 2, 戌: 2, 丑: 2, 未: 2, 申: 3, 酉: 3, 亥: 4, 子: 4 };
const ke = (a: number, b: number) => (b - a + 5) % 5 === 2; // a restrains b
const STEM_HE: Record<string, string> = { 甲己: "土", 乙庚: "金", 丙辛: "水", 丁壬: "木", 戊癸: "火" };
const BR_HE: Record<string, string> = { 子丑: "土", 寅亥: "木", 卯戌: "火", 辰酉: "金", 巳申: "水", 午未: "火" };
const SANHE: [string, string][] = [["申子辰", "水"], ["亥卯未", "木"], ["寅午戌", "火"], ["巳酉丑", "金"]];
const SANHUI: [string, string][] = [["寅卯辰", "木"], ["巳午未", "火"], ["申酉戌", "金"], ["亥子丑", "水"]];
const CENTER_STEM: Record<string, string> = { 子: "癸", 卯: "乙", 午: "丁", 酉: "辛" };
const ANHE = ["丑寅", "午亥", "卯申", "子戌", "子辰", "巳酉", "子巳", "寅午", "寅未"];
const XING = ["子卯", "寅巳", "巳申", "申寅", "丑戌", "戌未", "未丑"]; // 刑者在前
const CHONG = ["子午", "丑未", "寅申", "卯酉", "辰戌", "巳亥"];
const PO = ["子酉", "午卯", "巳申", "寅亥", "辰丑", "戌未"];
const HAI = ["子未", "丑午", "寅巳", "卯辰", "申亥", "酉戌"];
const ZIHE = ["甲午", "丁亥", "戊子", "己亥", "辛巳", "壬午", "癸巳", "壬戌"];
const find = (list: string[], a: string, b: string) => list.find((k) => k === a + b || k === b + a);
const pairOrder = (n: number) => { const o: [number, number][] = []; for (let i = n - 1; i > 0; i--) for (let j = i - 1; j >= 0; j--) o.push([j, i]); return o; };
const uniq = (x: string[]) => [...new Set(x)];
const byIdx = (s: string) => [...s].sort((p, q) => bi(p) - bi(q)).join("");

export function relationsFull(pillars: string[]): { stems: string[]; branches: string[]; whole: string[] } {
  const st = pillars.map((p) => p[0]!), br = pillars.map((p) => p[1]!);
  const P = pairOrder(pillars.length);
  // 天干
  const keL: [number, string][] = [], he: string[] = [], zheng: string[] = [];
  const cnt = (c: string) => st.filter((x) => x === c).length;
  for (const [i, j] of P) {
    const a = st[i]!, b = st[j]!;
    if (a === b) continue;
    const k = find(Object.keys(STEM_HE), a, b);
    if (k) { he.push(`${k}合化${STEM_HE[k]}`); if (cnt(k[0]!) > 1 || cnt(k[1]!) > 1) zheng.push(`${k}争合`); continue; }
    if (si(a) % 2 !== si(b) % 2) continue;
    if (ke(SEL(a), SEL(b))) keL.push([si(a), `${a}${b}相克`]);
    else if (ke(SEL(b), SEL(a))) keL.push([si(b), `${b}${a}相克`]);
  }
  const stems = uniq([...keL.sort((x, y) => x[0] - y[0]).map((x) => x[1]), ...he, ...zheng]);
  // 地支
  const has = (c: string) => br.includes(c);
  const heHua: string[] = [], huaEl: Record<string, string[]> = {};
  for (const [i, j] of P) {
    const k = find(Object.keys(BR_HE), br[i]!, br[j]!);
    if (k) { heHua.push(`${byIdx(k)}合化${BR_HE[k]}`); for (const c of k) (huaEl[c] ??= []).push(BR_HE[k]!); }
  }
  const groupRank = (g: string) => { let r = 99; P.forEach(([i, j], n) => { if (br[i] !== br[j] && g.includes(br[i]!) && g.includes(br[j]!)) r = Math.min(r, n); }); return r; };
  const family = (groups: [string, string][], kind: "合" | "会") => groups.map(([g, e]): [number, string[]] => {
    const [a, m, z] = [...g] as [string, string, string], out: string[] = [];
    const full = has(a) && has(m) && has(z);
    if (full) out.push(`${g}三${kind}${e}局`);
    else if (kind === "合") for (const [x, y] of [[a, m], [m, z]] as [string, string][]) {
      if (has(x) && has(y) && ![x, y].some((q) => (huaEl[q] ?? []).some((el) => el !== e))) out.push(`${x}${y}半合${e}局`);
    }
    if (has(a) && has(z)) {
      if (st.includes(CENTER_STEM[m]!)) out.push(`${a}${z}见${CENTER_STEM[m]}暗${kind === "合" ? "合" : "三会"}`);
      if (!has(m)) out.push(kind === "合" ? `${a}${z}拱合${m}` : `${a}${z}拱会`);
    }
    return [groupRank(g), out];
  }).filter((x) => x[1].length).sort((x, y) => x[0] - y[0]).flatMap((x) => x[1]);
  const byPair = (list: string[], suffix: string, self = "") => {
    const o: string[] = [];
    for (const [i, j] of P) {
      const a = br[i]!, b = br[j]!;
      if (a === b) { if (self.includes(a)) o.push(`${a}${b}${suffix}`); continue; }
      const k = find(list, a, b);
      if (k) o.push(`${k}${suffix}`);
    }
    return o;
  };
  const branches = uniq([
    ...heHua, ...family(SANHE, "合"), ...family(SANHUI, "会"),
    ...byPair(ANHE, "").map((k) => `${byIdx(k)}暗合`),
    ...byPair(XING, "相刑", "辰午酉亥"), ...byPair(CHONG, "相冲"), ...byPair(PO, "相破"), ...byPair(HAI, "相害"),
  ]);
  // 整柱
  const gai: string[] = [], jie: string[] = [], fan: string[] = [], fu: string[] = [], zi: string[] = [];
  pillars.forEach((p, idx) => {
    if (idx === 2 && ZIHE.includes(p)) { zi.push(`${p}自合`); return; }
    const se = SEL(p[0]!), be = BEL[p[1]!]!;
    if (ke(se, be)) gai.push(`${p}盖头`);
    else if (ke(be, se)) jie.push(`${p}截脚`);
  });
  for (let i = 0; i < pillars.length; i++) for (let j = i + 1; j < pillars.length; j++) {
    const a = pillars[i]!, b = pillars[j]!;
    if (a === b) { fu.push(`${a}伏吟`); continue; }
    if (!find(CHONG, a[1]!, b[1]!)) continue;
    if (ke(SEL(a[0]!), SEL(b[0]!))) fan.push(`${a}${b}反吟`);
    else if (ke(SEL(b[0]!), SEL(a[0]!))) fan.push(`${b}${a}反吟`);
  }
  return { stems, branches, whole: uniq([...gai, ...jie, ...fan, ...fu, ...zi]) };
}
