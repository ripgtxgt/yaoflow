import { ChildLimit, DefaultEightCharProvider, EarthBranch, Gender as TGender, HeavenStem, LunarHour, LunarSect2EightCharProvider, SixtyCycle, SixtyCycleYear, SolarTime, type EightChar } from "tyme4ts";
import { jiaoyun as jiaoyunOf, jiaoyunParts, siling as silingOf } from "./shensha";
import { insightOf } from "./insight";
import { checkGender, type Gender, type Normalized } from "@/lib/mingli/birth/normalize";

/**
 * 10-18 进度表 72 八字排盤: tyme4ts (6tail, MIT) EightChar → our BaziView. Runs in the browser. The time comes from the
 * birth layer (true solar time when on); 子時: the default provider starts the day at 23:00 (Neil 10-17), "same" uses
 * tyme4ts' LunarSect2 provider (晚子時 keeps the day). Without an hour only three pillars are drawn.
 *
 * 強弱 v2 (10-18): 助身 share of the 五行能量 (insight.ts) → five levels at 60/53/47/40 %. 用神傾向 v1: strong → the
 * elements that drain or restrain the day master (食傷、財、官殺), weak → those that support it (印、比劫); balanced → none.
 */
export const ELEMENTS = ["木", "火", "土", "金", "水"] as const;
export type Element = (typeof ELEMENTS)[number];
const ei = (e: string) => ELEMENTS.indexOf(e as Element);
/** relation of element b to day-master element a: same | gen (b generates a) | out (a generates b) | wealth (a restrains b) | power (b restrains a) */
export function rel(a: string, b: string): "same" | "gen" | "out" | "wealth" | "power" {
  const d = (ei(b) - ei(a) + 5) % 5;
  return (["same", "out", "wealth", "power", "gen"] as const)[d];
}

// simplified → Traditional for the few terms the chart shows (the client cannot load the opencc dictionary)
const TW: Record<string, string> = {
  劫财: "劫財", 伤官: "傷官", 偏财: "偏財", 正财: "正財", 七杀: "七殺",
  长生: "長生", 冠带: "冠帶", 临官: "臨官", 绝: "絕", 养: "養",
  炉中火: "爐中火", 剑锋金: "劍鋒金", 山头火: "山頭火", 涧下水: "澗下水", 城头土: "城頭土", 白蜡金: "白蠟金", 杨柳木: "楊柳木",
  腊月: "臘月", 闰: "閏", 子时: "子時", 丑时: "丑時", 寅时: "寅時", 卯时: "卯時", 辰时: "辰時", 巳时: "巳時", 午时: "午時", 未时: "未時", 申时: "申時", 酉时: "酉時", 戌时: "戌時", 亥时: "亥時",
  霹雳火: "霹靂火", 长流水: "長流水", 覆灯火: "覆燈火", 大驿土: "大驛土", 钗钏金: "釵釧金",
};
let HANS = false;
export const tw = (s: string) => (HANS ? s : TW[s] ?? s);
/** 10-18 神煞、關係、交運 lines come out of shensha.ts in simplified; one character at a time is enough for that vocabulary */
const T1: Record<string, string> = Object.fromEntries("蛰蟄 贵貴 禄祿 飞飛 红紅 艳豔 词詞 馆館 驿驛 马馬 医醫 学學 华華 盖蓋 将將 绞絞 舆輿 丧喪 门門 罗羅 网網 灾災 国國 厨廚 鸾鸞 恶惡 败敗 阴陰 阳陽 错錯 废廢 灵靈 专專 转轉 极極 冲沖 见見 会會 头頭 脚腳 争爭 后後 运運 伤傷 财財 杀殺 惊驚 种種 双雙 狮獅 处處 蝎蠍 虚虛 娄婁 毕畢 参參 张張 轸軫 东東 苍蒼 龙龍 炉爐 钗釵 钏釧 涧澗 剑劍 锋鋒 灯燈 长長 杨楊 蜡蠟 雳靂 汉漢 钟鐘 宫宮 气氣 坛壇 鸡雞 猪豬 马馬 龙龍 兑兌 离離 卦卦 宝寶 钗釵 杨楊".split(" ").map((p) => [p[0]!, p[1]!]));
export const trad = (s: string, hans: boolean) => (hans ? s : s.replace(/九丑/g, "九醜").replace(/./g, (c) => T1[c] ?? c));

export interface Pillar { label: string; gz: string; stem: string; branch: string; ten: string; hidden: { stem: string; ten: string; main: boolean; el: string }[]; nayin: string; terrain: string; selfTerrain: string; kong: string; stemEl: string; branchEl: string }
export type Level = "偏強" | "稍強" | "中和" | "稍弱" | "偏弱";
export interface Decade { gz: string; ten: string; startAge: number; endAge: number; startYear: number }
export interface BaziView {
  pillars: Pillar[]; // 年 月 日 [時]
  hasHour: boolean;
  dayMaster: string; dmEl: string;
  counts: Record<string, number>;
  strength: { level: Level; score: number; deLing: boolean; deDi: number; deShi: number };
  favour: string[]; // elements, primary first
  start: { years: number; months: number; days: number; forward: boolean; at: string } | null;
  gender: Gender;
  /** 農曆 birth year (for 虛歲) and a line like 1989年臘月初五 子時 */
  lunarYear: number; lunarText: string;
  /** 胎元、命宮、身宮 */
  extra: { fetal: string; own: string; body: string } | null;
  /** 交運 wording (逢戊、癸年 立春後27天 交大運) and 人元司令 */
  jiaoyun: string | null; siling: string | null;
  /** 10-30 进度表 128 ④: the same 交運 as parts, and the lunar date as numbers (a page in another language words them itself) */
  jiaoyunP?: { a: string; b: string; term: string; days: number } | null;
  lunar?: { y: number; m: number; leap: boolean; d: number; hb: string | null };
  decades: Decade[];
  years: { year: number; gz: string; ten: string }[];
}

const tenOf = (dm: ReturnType<SixtyCycle["getHeavenStem"]>, s: ReturnType<SixtyCycle["getHeavenStem"]>) => tw(dm.getTenStar(s).getName());

export function baziOf(n: Normalized, gender: Gender, thisYear: number, hans = false): BaziView {
  HANS = hans;
  if (!n.timeKnown || !n.chartTime) {
    // three pillars: noon of the birth date (the day pillar does not depend on the hour except across 23:00)
    const d = n.solarDate;
    return build(SolarTime.fromYmdHms(d.y, d.m, d.d, 12, 0, 0), false, gender, thisYear, "next");
  }
  const t = n.chartTime;
  return build(SolarTime.fromYmdHms(t.y, t.m, t.d, t.h, t.mi, 0), true, gender, thisYear, n.zi);
}

function build(st: SolarTime, hasHour: boolean, gender: Gender, thisYear: number, zi: "next" | "same"): BaziView {
  LunarHour.provider = zi === "same" ? new LunarSect2EightCharProvider() : new DefaultEightCharProvider();
  let ec: EightChar;
  try { ec = st.getLunarHour().getEightChar(); } finally { LunarHour.provider = new DefaultEightCharProvider(); }
  const dmStem = ec.getDay().getHeavenStem();
  const dmEl = dmStem.getElement().getName();
  const all = [ec.getYear(), ec.getMonth(), ec.getDay(), ...(hasHour ? [ec.getHour()] : [])];
  // 10-22: the 简体 page said 時柱 (one traditional character left in a simplified table)
  const labels = HANS ? ["年柱", "月柱", "日柱", "时柱"] : ["年柱", "月柱", "日柱", "時柱"];
  const pillars: Pillar[] = all.map((p, i) => ({ ...pillarOf(p, dmStem, labels[i]!), ten: i === 2 ? "日主" : tenOf(dmStem, p.getHeavenStem()) }));
  // 五行個數: 天干 + 地支本氣
  const counts: Record<string, number> = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
  for (const p of all) { counts[p.getHeavenStem().getElement().getName()]!++; counts[p.getEarthBranch().getHideHeavenStemMain().getElement().getName()]!++; }

  // 強弱 v1
  const support = (e: string) => { const r = rel(dmEl, e); return r === "same" || r === "gen"; };
  const monthMain = ec.getMonth().getEarthBranch().getHideHeavenStemMain().getElement().getName();
  const mr = rel(dmEl, monthMain);
  const ling = mr === "same" ? 40 : mr === "gen" ? 30 : mr === "out" ? 10 : mr === "wealth" ? 5 : 0;
  let diW = 0, diS = 0;
  all.forEach((p, i) => { if (i === 1) return; for (const h of p.getEarthBranch().getHideHeavenStems()) { const w = h.getType() === 2 ? 1 : h.getType() === 1 ? 0.5 : 0.3; diW += w; if (support(h.getHeavenStem().getElement().getName())) diS += w; } });
  let shiN = 0, shiS = 0;
  all.forEach((p, i) => { if (i === 2) return; shiN++; if (support(p.getHeavenStem().getElement().getName())) shiS++; });
  const deDi = diW ? diS / diW : 0, deShi = shiN ? shiS / shiN : 0;
  // 10-18: the level follows the 五行能量 the page shows (助身 = 印 + 比劫 + 日主, against 食傷 + 財 + 官殺), so the bar,
  // the words and the 喜用 never disagree (before, 月令／得地／得勢 points could call a 58 % chart 稍弱). The three
  // 得令／得地／得勢 facts stay for 「強弱怎麼看」.
  void ling;
  const ins = insightOf(all.map((p) => p.getName()), gender);
  const score = Math.round((ins.help / (ins.help + ins.drain)) * 100);
  const level: Level = score >= 60 ? "偏強" : score >= 53 ? "稍強" : score >= 47 ? "中和" : score >= 40 ? "稍弱" : "偏弱";

  // 用神傾向
  const cyc = (k: number) => ELEMENTS[(ei(dmEl) + k) % 5]!;
  let favour: string[] = [];
  if (level === "偏強" || level === "稍強") favour = [cyc(1), cyc(2), cyc(3)].sort((a, b) => counts[a]! - counts[b]!); // 食傷、財、官殺
  else if (level === "稍弱" || level === "偏弱") favour = [cyc(4), cyc(0)].sort((a, b) => counts[a]! - counts[b]!); // 印、比劫

  // 大運 (needs the moment; three-pillar charts use noon and say so on the page)
  let start: BaziView["start"] = null;
  const decades: Decade[] = [];
  try {
    const cl = ChildLimit.fromSolarTime(st, checkGender(gender) === "male" ? TGender.MAN : TGender.WOMAN);
    const et = cl.getEndTime();
    start = { years: cl.getYearCount(), months: cl.getMonthCount(), days: cl.getDayCount(), forward: cl.isForward(), at: `${et.getYear()}-${String(et.getMonth()).padStart(2, "0")}-${String(et.getDay()).padStart(2, "0")}` };
    let df = cl.getStartDecadeFortune();
    for (let i = 0; i < 8; i++) {
      const sc = df.getSixtyCycle();
      decades.push({ gz: sc.getName(), ten: tenOf(dmStem, sc.getHeavenStem()), startAge: df.getStartAge(), endAge: df.getEndAge(), startYear: df.getStartSixtyCycleYear().getYear() });
      df = df.next(1);
    }
  } catch { /* leave empty */ }

  // 流年: this year and the next three (by 立春 the year's 干支 is SixtyCycle of year − 4)
  const years = [0, 1, 2, 3].map((k) => {
    const y = thisYear + k;
    const sc = SixtyCycle.fromIndex(((y - 4) % 60 + 60) % 60);
    return { year: y, gz: sc.getName(), ten: tenOf(dmStem, sc.getHeavenStem()) };
  });

  const lh = st.getLunarHour(), ld = lh.getLunarDay();
  const lunarYear = ld.getLunarMonth().getLunarYear().getYear();
  const lm = ld.getLunarMonth().getMonth();
  const LM = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "臘月"];
  const lunarText = `${lunarYear}年${lm < 0 ? tw("闰") : ""}${HANS ? LM[Math.abs(lm) - 1]!.replace("臘", "腊") : LM[Math.abs(lm) - 1]}${ld.getName()}${hasHour ? ` ${tw(lh.getSixtyCycle().getEarthBranch().getName() + "时")}` : ""}`;
  let extra: BaziView["extra"] = null;
  try { extra = { fetal: ec.getFetalOrigin().getName(), own: ec.getOwnSign().getName(), body: ec.getBodySign().getName() }; } catch { /* */ }
  let jiaoyun: string | null = null, siling: string | null = null, jiaoyunP: BaziView["jiaoyunP"] = null;
  try {
    const end = ChildLimit.fromSolarTime(st, gender === "male" ? TGender.MAN : TGender.WOMAN).getEndTime();
    jiaoyun = trad(jiaoyunOf(end), HANS);
    jiaoyunP = jiaoyunParts(end);
  } catch { /* */ }
  try { siling = silingOf(st); } catch { /* */ }
  const lunar = { y: lunarYear, m: Math.abs(lm), leap: lm < 0, d: ld.getDay(), hb: hasHour ? lh.getSixtyCycle().getEarthBranch().getName() : null };
  return { gender, lunarYear, lunarText, lunar, extra, jiaoyun, jiaoyunP, siling, pillars, hasHour, dayMaster: dmStem.getName(), dmEl, counts, strength: { level, score, deLing: mr === "same" || mr === "gen", deDi, deShi }, favour, start, decades, years };
}


type Stem = ReturnType<SixtyCycle["getHeavenStem"]>;
/** one column of the table: any 干支 seen from the day master (原局四柱, 大運, 流年) */
export function pillarOf(p: SixtyCycle, dm: Stem, label: string): Pillar {
  const st = p.getHeavenStem(), b = p.getEarthBranch();
  return {
    label, gz: p.getName(), stem: st.getName(), branch: b.getName(), ten: tenOf(dm, st),
    hidden: b.getHideHeavenStems().map((h) => ({ stem: h.getHeavenStem().getName(), ten: tenOf(dm, h.getHeavenStem()), main: h.getType() === 2, el: h.getHeavenStem().getElement().getName() })),
    nayin: tw(p.getSound().getName()), terrain: tw(dm.getTerrain(b).getName()), selfTerrain: tw(st.getTerrain(b).getName()),
    kong: p.getExtraEarthBranches().map((x) => x.getName()).join(""), stemEl: st.getElement().getName(), branchEl: b.getElement().getName(),
  };
}
export const stemOf = (name: string) => HeavenStem.fromName(name);
export const cycleOf = (gz: string) => SixtyCycle.fromName(gz);
/** the 干支 of a year (by 立春) */
export const yearCycle = (y: number) => SixtyCycle.fromIndex(((y - 4) % 60 + 60) % 60);

/** 十神 in one character, as charts show them under a 干 or 支 */
const SHORT: Record<string, string> = { 比肩: "比", 劫財: "劫", 劫财: "劫", 食神: "食", 傷官: "傷", 伤官: "伤", 偏財: "才", 偏财: "才", 正財: "財", 正财: "财", 七殺: "殺", 七杀: "杀", 正官: "官", 偏印: "梟", 正印: "印" };
/** 10-22: 偏印 is 梟 in 繁體 and 枭 in 简体 (the 简体 strips said 梟) */
export const short = (ten: string, hans = HANS) => { const s = SHORT[ten] ?? ten.slice(0, 1); return hans && s === "梟" ? "枭" : s; };
export function cell(gz: string, dmName: string, hans = HANS) {
  const dm = HeavenStem.fromName(dmName), c = SixtyCycle.fromName(gz);
  const st = tenOf(dm, c.getHeavenStem()), bt = tenOf(dm, c.getEarthBranch().getHideHeavenStemMain());
  // 10-30: the full ten-god names too (a page in another language abbreviates them its own way)
  return { gz, stem: c.getHeavenStem().getName(), branch: c.getEarthBranch().getName(), stemTen: short(st, hans), branchTen: short(bt, hans), stemTenFull: st, branchTenFull: bt, stemEl: c.getHeavenStem().getElement().getName(), branchEl: c.getEarthBranch().getElement().getName() };
}

const JIE = ["立春", "驚蟄", "清明", "立夏", "芒種", "小暑", "立秋", "白露", "寒露", "立冬", "大雪", "小寒"];
const JIE_HANS = ["立春", "惊蛰", "清明", "立夏", "芒种", "小暑", "立秋", "白露", "寒露", "立冬", "大雪", "小寒"];
/** the twelve 流月 of a year: 節 that starts each, its date, its 干支 */
export function monthsOf(year: number, dmName: string, hans = false) {
  return SixtyCycleYear.fromYear(year).getMonths().map((m, i) => {
    const sd = m.getFirstDay().getSolarDay();
    return { term: (hans ? JIE_HANS : JIE)[i]!, date: `${sd.getMonth()}/${sd.getDay()}`, ...cell(m.getSixtyCycle().getName(), dmName, hans) };
  });
}

/** 旺相休囚死 of the five elements in the birth month */
export function seasons(monthBranch: string): { el: string; state: string }[] {
  const season = "辰戌丑未".includes(monthBranch) ? "土" : EarthBranch.fromName(monthBranch).getElement().getName();
  const st = ["旺", "相", "死", "囚", "休"]; // season itself, what it generates, what it restrains, what restrains it, what generates it
  const i0 = ELEMENTS.indexOf(season as Element);
  const out = [0, 1, 2, 3, 4].map((k) => ({ el: ELEMENTS[(i0 + k) % 5]!, state: st[k]! }));
  const order = ["旺", "相", "休", "囚", "死"];
  return out.sort((a, b2) => order.indexOf(a.state) - order.indexOf(b2.state));
}

/** 原局 relations among stems and branches */
const STEM_HE: Record<string, string> = { 甲己: "合土", 乙庚: "合金", 丙辛: "合水", 丁壬: "合木", 戊癸: "合火" };
const STEM_CHONG = ["甲庚", "乙辛", "丙壬", "丁癸"];
const BR_LIUHE: Record<string, string> = { 子丑: "合土", 寅亥: "合木", 卯戌: "合火", 辰酉: "合金", 巳申: "合水", 午未: "合火" };
const BR_CHONG = ["子午", "丑未", "寅申", "卯酉", "辰戌", "巳亥"];
const BR_HAI = ["子未", "丑午", "寅巳", "卯辰", "申亥", "酉戌"];
const BR_PO = ["子酉", "卯午", "辰丑", "未戌", "寅亥", "巳申"];
const BR_XING = ["子卯", "寅巳", "巳申", "寅申", "丑戌", "戌未", "丑未"];
const SANHE: [string, string][] = [["申子辰", "水"], ["亥卯未", "木"], ["寅午戌", "火"], ["巳酉丑", "金"]];
const pairKey = (a: string, b: string, list: string[]) => list.find((k) => k === a + b || k === b + a);
export function relations(stems: string[], branches: string[], hans = false): { stems: string[]; branches: string[] } {
  const S: string[] = [], B: string[] = [];
  for (let i = 0; i < stems.length; i++) for (let j = i + 1; j < stems.length; j++) {
    const a = stems[i]!, b = stems[j]!;
    const he = Object.keys(STEM_HE).find((k) => k === a + b || k === b + a);
    if (he) S.push(`${a}${b}${STEM_HE[he]}`);
    if (pairKey(a, b, STEM_CHONG)) S.push(`${a}${b}相沖`);
  }
  for (let i = 0; i < branches.length; i++) for (let j = i + 1; j < branches.length; j++) {
    const a = branches[i]!, b = branches[j]!;
    if (a === b) { if ("辰午酉亥".includes(a)) B.push(`${a}${b}自刑`); continue; }
    const lh = Object.keys(BR_LIUHE).find((k) => k === a + b || k === b + a);
    if (lh) B.push(`${a}${b}六合`);
    if (pairKey(a, b, BR_CHONG)) B.push(`${a}${b}相沖`);
    if (pairKey(a, b, BR_XING)) B.push(`${a}${b}相刑`);
    if (pairKey(a, b, BR_HAI)) B.push(`${a}${b}相害`);
    if (pairKey(a, b, BR_PO)) B.push(`${a}${b}相破`);
    const sh = SANHE.find(([g]) => g.includes(a) && g.includes(b));
    if (sh) B.push(`${a}${b}半合${sh[1]}局`);
  }
  for (const [g, e] of SANHE) if ([...g].every((c) => branches.includes(c))) B.push(`${g}三合${e}局`);
  const uniq = (x: string[]) => [...new Set(x)];
  const f = (x: string) => (hans ? x.replace("相沖", "相冲") : x);
  return { stems: uniq(S).map(f), branches: uniq(B).map(f) };
}
