import type { Foreign } from "@/lib/l10n/core";

/**
 * 10-30 进度表 128 ④ — the 八字 chart's fixed words in the seven other languages: the ten stems and twelve branches as
 * readers of each language name them (pinyin for the Latin languages, as English BaZi books write them; the kanji of
 * 四柱推命 for Japanese; the hangul of 사주 for Korean), the zodiac animals, the five elements, the ten gods (十神), their
 * five groups, the twelve life stages (十二運), the thirty 納音, the symbolic stars a foreign page shows, the twelve 節,
 * the strength levels, the 旺相休囚死 states, the 格局 names and the templates for the relations between stems and
 * branches. Fixed, not translated: these are the terms each language's BaZi readers already use (English after the
 * usual Joey Yap / Jerry King set; French, German, Spanish and Portuguese after the same set as their BaZi sites write it).
 *
 * This file: the types, the fixed Chinese keys and the pure helpers (client-safe, no data — a chart component is handed
 * one language's names by its server page). The names themselves: names.ts.
 *
 * 神煞 outside Chinese: only the stars with a plain, kind meaning are shown (nobles, virtue, study, charm, travel, the
 * prosperity star, Kui Gang, Yang Blade, Void…). The mourning, robbery, calamity, solitude and "ten evils" stars are a
 * Chinese practitioner's detail that reads as an omen in another language — the hard rules of a foreign page forbid
 * omens — so they are left out of the foreign chart (the Chinese chart keeps them all).
 */
export type BzLang = Foreign;

/** the simplified names tyme4ts and the rule files print, in a fixed order */
export const TEN_KEYS = ["比肩", "劫财", "食神", "伤官", "偏财", "正财", "七杀", "正官", "偏印", "正印"] as const;
export const GROUP_KEYS = ["印", "比劫", "食伤", "财", "官杀"] as const;
export const STAGE_KEYS = ["长生", "沐浴", "冠带", "临官", "帝旺", "衰", "病", "死", "墓", "绝", "胎", "养"] as const;
export const LEVEL_KEYS = ["偏強", "稍強", "中和", "稍弱", "偏弱"] as const;
export const SEASON_KEYS = ["旺", "相", "休", "囚", "死"] as const;
export const STEMS = "甲乙丙丁戊己庚辛壬癸";
export const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
export const ELEMENTS_ZH = "木火土金水";
export const JIE_KEYS = ["立春", "惊蛰", "清明", "立夏", "芒种", "小暑", "立秋", "白露", "寒露", "立冬", "大雪", "小寒"] as const;
/** the stars a foreign page shows (simplified keys, as shensha.ts prints them); everything else stays on the Chinese chart only */
export const SS_KEPT = [
  "天乙贵人", "太极贵人", "天德贵人", "月德贵人", "天德合", "月德合", "福星贵人", "国印贵人", "德秀贵人",
  "文昌贵人", "学堂", "正学堂", "词馆", "正词馆", "华盖", "桃花", "红鸾", "天喜", "红艳煞",
  "禄神", "金舆", "天厨贵人", "驿马", "将星", "羊刃", "魁罡日", "十灵日", "天赦日", "空亡",
] as const;

export interface RelWords {
  /** 天干五合（合化）: {a} {b} stems, {e} element */ stemHe: string;
  /** 同陰陽相克: {a} restrains {b} */ stemKe: string;
  /** 爭合 */ zheng: string;
  /** 天干相沖 (流年 against a pillar) */ stemChong: string;
  /** 六合（合化）: {e} element */ brHe: string;
  /** 六合 without an element */ liuhe: string;
  /** 三合局: {a} {b} {c}, {e} */ sanhe: string;
  /** 半合局 */ banhe: string;
  /** 見X暗合: {s} the stem that ties them */ anheVia: string;
  /** 拱合X: {m} the missing middle branch */ gonghe: string;
  /** 三會局 */ sanhui: string;
  /** 見X暗三會 */ anhuiVia: string;
  /** 拱會 */ gonghui: string;
  /** 暗合 */ anhe: string;
  xing: string; zixing: string; chong: string; po: string; hai: string;
  /** whole pillars: {p} one pillar, {a} {b} two */ gaitou: string; jiejiao: string; fanyin: string; fuyin: string; zihe: string;
  /** short labels on the relation diagram */
  short: { he: string; ke: string; zheng: string; chong: string; xing: string; hai: string; po: string; banhe: string; sanhe: string; sanhui: string; anhe: string; liuhe: string };
  /** a year branch against a natal branch: {a} the year branch, {p} which natal branch (branchOf), {b} that branch, {r} the relation (yearRel) */
  year: string;
  yearRel: { 合: string; 冲: string; 刑: string; 害: string };
}

export interface BaziNames {
  stems: string[]; branches: string[];
  /** Japanese only: the kana readings of the stems and branches */
  stemKana?: string[]; branchKana?: string[];
  animals: string[]; elements: string[];
  yang: string; yin: string;
  /** a stem's kind: {yy} yang / yin, {e} element — 甲 = Yang Wood */
  stemKind: string;
  /** the day master named in a line: {s} the stem, {k} its kind, {e} its element */
  dm: string;
  /** a 干支 pillar written in words: {s} stem, {b} branch */
  gz: string;
  dayMaster: string;
  ten: Record<(typeof TEN_KEYS)[number], string>;
  tenShort: Record<(typeof TEN_KEYS)[number], string>;
  groups: Record<(typeof GROUP_KEYS)[number], string>;
  stages: string[];
  nayin: string[];
  shensha: Record<(typeof SS_KEPT)[number], string>;
  /** 孤辰 / 寡宿 — named only as the reason of a trait of the 正緣畫像 */
  guChen: string; guaSu: string;
  jie: string[];
  levels: Record<(typeof LEVEL_KEYS)[number], string>;
  seasons: Record<(typeof SEASON_KEYS)[number], string>;
  /** a 格局 from its ten god: {t} */
  geju: string; jianlu: string; yueren: string;
  pillars: string[]; branchOf: string[]; stemOf: string[];
  rel: RelWords;
  /** a lunar date: {y} year, {m} month number, {leap} the leap mark (or nothing), {d} day */
  lunar: string; leap: string;
  /** an hour by its branch: {b} */
  hour: string;
  /** 10-30: the colon between a label and its words where it is not ": " (French writes " : ") */
  colon?: string;
  /** 配偶星 strength in the 正緣畫像: 鮮明 / 適中 / 隱約 / 不見 */
  starStrength: { 鲜明: string; 适中: string; 隐约: string; 不见: string };
  /** the eight directions of the 正緣畫像 (北 东北 东 东南 南 西南 西 西北) */
  directions: Record<"北" | "东北" | "东" | "东南" | "南" | "西南" | "西" | "西北", string>;
  /** the twelve Western signs (Aries first) — the chart page adds them from lib/mingli/astro/names.ts for the 星座 row */
  signs?: string[];
}

/** the 納音 in the order of the sixty pillars, two by two (甲子乙丑 海中金 … 壬戌癸亥 大海水) */
export const NAYIN_ZH = ["海中金", "炉中火", "大林木", "路旁土", "剑锋金", "山头火", "涧下水", "城头土", "白蜡金", "杨柳木", "泉中水", "屋上土", "霹雳火", "松柏木", "长流水", "沙中金", "山下火", "平地木", "壁上土", "金箔金", "覆灯火", "天河水", "大驿土", "钗钏金", "桑柘木", "大溪水", "沙中土", "天上火", "石榴木", "大海水"];

/* ------------------------------------------------------------------ helpers (pure, client-safe) */

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
/** the few traditional characters the chart may hand over, back to the simplified keys above */
const SIMP: Record<string, string> = { 財: "财", 傷: "伤", 殺: "杀", 長: "长", 帶: "带", 臨: "临", 絕: "绝", 養: "养", 貴: "贵", 極: "极", 國: "国", 學: "学", 詞: "词", 館: "馆", 華: "华", 蓋: "盖", 紅: "红", 鸞: "鸾", 艷: "艳", 豔: "艳", 祿: "禄", 輿: "舆", 廚: "厨", 驛: "驿", 馬: "马", 將: "将", 靈: "灵", 爐: "炉", 劍: "剑", 頭: "头", 澗: "涧", 蠟: "蜡", 楊: "杨", 靂: "雳", 燈: "灯", 釵: "钗", 釧: "钏", 驚: "惊", 蟄: "蛰", 種: "种", 沖: "冲", 會: "会", 見: "见", 剋: "克", 爭: "争", 腳: "脚" };
/** 天干五合 and the element each pair makes */
const STEM_HE_EL: Record<string, string> = { 甲己: "土", 乙庚: "金", 丙辛: "水", 丁壬: "木", 戊癸: "火" };
export const simp = (s: string): string => [...s].map((c) => SIMP[c] ?? c).join("");

export const stemIndex = (s: string): number => STEMS.indexOf(s);
export const branchIndex = (b: string): number => BRANCHES.indexOf(b);
/** the place of a 干支 in the sixty (甲子 = 0) */
export const cycleIndex = (gz: string): number => { const s = stemIndex(gz[0] ?? ""), b = branchIndex(gz[1] ?? ""); return s < 0 || b < 0 ? -1 : (((6 * s - 5 * b) % 60) + 60) % 60; };

/** everything a foreign page needs to name a thing, for one language's names */
export function bzNameOf(N: BaziNames) {
  const elOf = (zh: string) => { const i = ELEMENTS_ZH.indexOf(zh); return i >= 0 ? N.elements[i]! : zh; };
  const stem = (s: string) => { const i = stemIndex(s); return i >= 0 ? N.stems[i]! : s; };
  const branch = (b: string) => { const i = branchIndex(b); return i >= 0 ? N.branches[i]! : b; };
  const stemEl = (s: string) => ELEMENTS_ZH[Math.floor(stemIndex(s) / 2)] ?? "";
  const kind = (s: string) => fill(N.stemKind, { yy: stemIndex(s) % 2 === 0 ? N.yang : N.yin, e: elOf(stemEl(s)) });
  /** a 干支 in words: Jia Zi, 甲子, 갑자 */
  const gz = (x: string) => (x.length === 2 && stemIndex(x[0]!) >= 0 ? fill(N.gz, { s: stem(x[0]!), b: branch(x[1]!) }) : [...x].map((c) => (stemIndex(c) >= 0 ? stem(c) : branch(c))).join(N.gz.includes(" ") ? " " : ""));
  /** a stem or a branch, one character */
  const ch = (c: string) => (stemIndex(c) >= 0 ? stem(c) : branch(c));
  const ten = (t: string) => (N.ten as Record<string, string>)[simp(t)] ?? (t === "日主" || t === "日元" ? N.dayMaster : t);
  const tenShort = (t: string) => (N.tenShort as Record<string, string>)[simp(t)] ?? t;
  const stage = (x: string) => { const i = (STAGE_KEYS as readonly string[]).indexOf(simp(x)); return i >= 0 ? N.stages[i]! : x; };
  const nayinOf = (x: string) => { const i = cycleIndex(x); return i >= 0 ? N.nayin[i >> 1]! : x; };
  const nayinName = (name: string) => { const i = NAYIN_ZH.indexOf(simp(name).replace("砂中金", "沙中金")); return i >= 0 ? N.nayin[i]! : name; };
  const ss = (x: string): string | null => (N.shensha as Record<string, string>)[simp(x)] ?? null;
  const jie = (x: string) => { const i = (JIE_KEYS as readonly string[]).indexOf(simp(x)); return i >= 0 ? N.jie[i]! : x; };
  const level = (x: string) => (N.levels as Record<string, string>)[x] ?? x;
  const group = (x: string) => (N.groups as Record<string, string>)[simp(x)] ?? x;
  const season = (x: string) => (N.seasons as Record<string, string>)[x] ?? x;
  const dm = (s: string) => fill(N.dm, { s: stem(s), k: kind(s), e: elOf(stemEl(s)) });
  /** a 格局 from tyme4ts / insight.ts ("正官格", "建禄格", "月刃格") */
  const geju = (name: string) => {
    const n = simp(name);
    if (n === "建禄格") return N.jianlu;
    if (n === "月刃格") return N.yueren;
    return fill(N.geju, { t: ten(n.replace(/格$/, "")) });
  };
  /** a whole relation line as shensha.ts / chart.ts / report-facts.ts print it (simplified), in this language */
  const rel = (raw: string): string => relIn(N, simp(raw), { stem, branch, elOf, gz });
  /** a label on the relation diagram (insight.ts links: 合土, 相冲, 半合水局, 三合水局…) */
  const relShort = (raw: string): string => {
    const s = simp(raw), R = N.rel.short;
    let m: RegExpExecArray | null;
    if ((m = /^合(?:化)?([木火土金水])$/.exec(s))) return fill(R.he, { e: elOf(m[1]!) });
    if ((m = /^半合([木火土金水])局$/.exec(s))) return fill(R.banhe, { e: elOf(m[1]!) });
    if ((m = /^三合([木火土金水])局$/.exec(s))) return fill(R.sanhe, { e: elOf(m[1]!) });
    if ((m = /^三会([木火土金水])局$/.exec(s))) return fill(R.sanhui, { e: elOf(m[1]!) });
    if (/相克|克/.test(s)) return R.ke;
    if (/争合/.test(s)) return R.zheng;
    if (/冲/.test(s)) return R.chong;
    if (/刑/.test(s)) return R.xing;
    if (/害/.test(s)) return R.hai;
    if (/破/.test(s)) return R.po;
    if (/暗合/.test(s)) return R.anhe;
    if (/六合|合/.test(s)) return R.liuhe;
    return raw;
  };
  // 10-30 (seen on the live English chart: 「Supporting 7.1（65.1%）」「In season：No」「Love　When…」): the punctuation
  // around the words — Japanese keeps the full-width marks of the Chinese page, every other language takes its own
  const cjk = /[㐀-鿿]/.test(N.stems[0] ?? "");
  const punct = cjk ? { colon: "：", gap: "　", list: "、", paren: (s: string) => `（${s}）` } : { colon: N.colon ?? ": ", gap: " ", list: ", ", paren: (s: string) => ` (${s})` };
  return { N, elOf, stem, branch, ch, kind, gz, ten, tenShort, stage, nayinOf, nayinName, ss, jie, level, group, season, dm, geju, rel, relShort, fill, josa, ...punct };
}

/**
 * 10-30 (seen live: 「경이(가) 천간에 드러나 있습니다」): a Korean template written 「{s}이(가)」 takes the particle the filled
 * word ends for — 이 after a final consonant, 가 after a vowel (을/를, 은/는, 과/와 the same way; 으로/로 with ㄹ as a vowel).
 * Other languages pass through.
 */
export function josa(s: string): string {
  return s.replace(/([가-힣])(이\(가\)|을\(를\)|은\(는\)|과\(와\)|\(으\)로)/g, (_m, ch: string, p: string) => {
    const jong = (ch.charCodeAt(0) - 0xac00) % 28; // 0 = no final consonant, 8 = ㄹ
    const pick: Record<string, [string, string]> = { "이(가)": ["이", "가"], "을(를)": ["을", "를"], "은(는)": ["은", "는"], "과(와)": ["과", "와"], "(으)로": ["으로", "로"] };
    const [withFinal, without] = pick[p]!;
    const final = p === "(으)로" ? jong !== 0 && jong !== 8 : jong !== 0;
    return ch + (final ? withFinal : without);
  });
}
/** 10-30 进度表 128 ④-5: josa() reaching over a bracket — 「화록(태양)이(가)」 takes the particle of 화록, not of the bracket */
export function josaBr(s: string): string {
  const P = "이\\(가\\)|을\\(를\\)|은\\(는\\)|과\\(와\\)|\\(으\\)로";
  const t = s.replace(new RegExp(`([가-힣])(\\s?[(（][^)）]*[)）])(${P})`, "g"), (_m, ch: string, br: string, p: string) => {
    const r = josa(ch + p);
    return `${r.slice(0, 1)}${br}${r.slice(1)}`;
  });
  return josa(t);
}
export type BzName = ReturnType<typeof bzNameOf>;

function relIn(N: BaziNames, s: string, f: { stem: (x: string) => string; branch: (x: string) => string; elOf: (x: string) => string; gz: (x: string) => string }): string {
  const R = N.rel;
  const ch = (c: string) => (stemIndex(c) >= 0 ? f.stem(c) : f.branch(c));
  const P = "[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]";
  let m: RegExpExecArray | null;
  // whole pillars
  if ((m = new RegExp(`^(${P})盖头$`).exec(s))) return fill(R.gaitou, { p: f.gz(m[1]!) });
  if ((m = new RegExp(`^(${P})截脚$`).exec(s))) return fill(R.jiejiao, { p: f.gz(m[1]!) });
  if ((m = new RegExp(`^(${P})(${P})反吟$`).exec(s))) return fill(R.fanyin, { a: f.gz(m[1]!), b: f.gz(m[2]!) });
  if ((m = new RegExp(`^(${P})伏吟$`).exec(s))) return fill(R.fuyin, { p: f.gz(m[1]!) });
  if ((m = new RegExp(`^(${P})自合$`).exec(s))) return fill(R.zihe, { p: f.gz(m[1]!) });
  // three branches
  if ((m = /^(.)(.)(.)三合([木火土金水])局$/.exec(s))) return fill(R.sanhe, { a: ch(m[1]!), b: ch(m[2]!), c: ch(m[3]!), e: f.elOf(m[4]!) });
  if ((m = /^(.)(.)(.)三会([木火土金水])局$/.exec(s))) return fill(R.sanhui, { a: ch(m[1]!), b: ch(m[2]!), c: ch(m[3]!), e: f.elOf(m[4]!) });
  // a year branch against a natal branch (report-facts.ts yearFacts: 午冲日支子)
  if ((m = /^(.)(合|冲|刑|害)(年|月|日|时|時)支(.)$/.exec(s))) {
    const i = "年月日时".indexOf(m[3] === "時" ? "时" : m[3]!);
    return fill(R.year, { a: ch(m[1]!), p: N.branchOf[i]!, b: ch(m[4]!), r: R.yearRel[m[2] as "合"]! });
  }
  // 流年 against a pillar (report-facts.ts gzRels): 天干甲己相合, 地支子午相冲 …
  if ((m = /^天干(.)(.)相合$/.exec(s))) return fill(R.stemHe, { a: ch(m[1]!), b: ch(m[2]!), e: f.elOf(STEM_HE_EL[m[1]! + m[2]!] ?? STEM_HE_EL[m[2]! + m[1]!] ?? "") });
  if ((m = /^天干(.)(.)相冲$/.exec(s))) return fill(R.stemChong, { a: ch(m[1]!), b: ch(m[2]!) });
  if ((m = /^地支(.)(.)(六合|相冲|相刑|相害|相破|自刑)$/.exec(s))) {
    const k = { 六合: R.liuhe, 相冲: R.chong, 相刑: R.xing, 相害: R.hai, 相破: R.po, 自刑: R.zixing }[m[3] as "六合"]!;
    return fill(k, { a: ch(m[1]!), b: ch(m[2]!) });
  }
  // two stems or two branches
  if ((m = /^(.)(.)合化([木火土金水])$/.exec(s))) return fill(stemIndex(m[1]!) >= 0 ? R.stemHe : R.brHe, { a: ch(m[1]!), b: ch(m[2]!), e: f.elOf(m[3]!) });
  if ((m = /^(.)(.)合([木火土金水])$/.exec(s))) return fill(stemIndex(m[1]!) >= 0 ? R.stemHe : R.brHe, { a: ch(m[1]!), b: ch(m[2]!), e: f.elOf(m[3]!) });
  if ((m = /^(.)(.)争合$/.exec(s))) return fill(R.zheng, { a: ch(m[1]!), b: ch(m[2]!) });
  if ((m = /^(.)(.)相克$/.exec(s))) return fill(R.stemKe, { a: ch(m[1]!), b: ch(m[2]!) });
  if ((m = /^(.)(.)半合([木火土金水])局$/.exec(s))) return fill(R.banhe, { a: ch(m[1]!), b: ch(m[2]!), e: f.elOf(m[3]!) });
  if ((m = /^(.)(.)见(.)暗合$/.exec(s))) return fill(R.anheVia, { a: ch(m[1]!), b: ch(m[2]!), s: ch(m[3]!) });
  if ((m = /^(.)(.)见(.)暗三会$/.exec(s))) return fill(R.anhuiVia, { a: ch(m[1]!), b: ch(m[2]!), s: ch(m[3]!) });
  if ((m = /^(.)(.)拱合(.)$/.exec(s))) return fill(R.gonghe, { a: ch(m[1]!), b: ch(m[2]!), m: ch(m[3]!) });
  if ((m = /^(.)(.)拱会$/.exec(s))) return fill(R.gonghui, { a: ch(m[1]!), b: ch(m[2]!) });
  if ((m = /^(.)(.)暗合$/.exec(s))) return fill(R.anhe, { a: ch(m[1]!), b: ch(m[2]!) });
  if ((m = /^(.)(.)六合$/.exec(s))) return fill(R.liuhe, { a: ch(m[1]!), b: ch(m[2]!) });
  if ((m = /^(.)(.)自刑$/.exec(s))) return fill(R.zixing, { a: ch(m[1]!), b: ch(m[2]!) });
  if ((m = /^(.)(.)相刑$/.exec(s))) return fill(m[1] === m[2] ? R.zixing : R.xing, { a: ch(m[1]!), b: ch(m[2]!) });
  if ((m = /^(.)(.)相冲$/.exec(s))) return fill(stemIndex(m[1]!) >= 0 ? R.stemChong : R.chong, { a: ch(m[1]!), b: ch(m[2]!) });
  if ((m = /^(.)(.)相破$/.exec(s))) return fill(R.po, { a: ch(m[1]!), b: ch(m[2]!) });
  if ((m = /^(.)(.)相害$/.exec(s))) return fill(R.hai, { a: ch(m[1]!), b: ch(m[2]!) });
  return s;
}
