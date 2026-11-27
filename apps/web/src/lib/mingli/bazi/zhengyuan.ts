import { relationsFull, shenshaOf, type Gender, type Kind } from "./shensha";

/**
 * 10-18 八字③ 正缘画像: rule library. Pure (no React, no "@/" imports): only ./shensha (which only imports tyme4ts).
 * Sources and how strong each rule is: docs/mingli/zhengyuan-basis.md.
 *
 * zhengyuanOf({ pillars, gender })
 *   pillars: 年 月 日 [时] 干支 (simplified, "己巳"…); 3 pillars are fine (no hour).
 *   star    — 配偶星: male 正财/偏财, female 正官/七杀 (子平真诠·论妻子 "妻星者，干头之财也"; 三命通会·论女命).
 *             Pick order: 透干 before 藏支, 正 before 偏. where = every stem / hidden stem of that ten (day stem excluded).
 *             strength from 透干 + 藏支 (本气 heavier) + 月令旺衰 → 鲜明 / 适中 / 隐约 / 不见.
 *   palace  — 日支: element, 本气十神, relations from relationsFull() that involve the day branch.
 *   flowers — 桃花 / 红鸾 / 天喜 / 孤辰 / 寡宿 found on any natal column (shenshaOf).
 *   traits  — reader-facing lines (simplified, gender-neutral "TA", tendencies only — see BANNED).
 *   imagePrompt — structured hints for an illustration of a temperament type (no face, no text).
 */

/**
 * partner: the partner's sex (10-21, Neil: 可以加同性的伴侶). Default: the opposite of `gender`, the traditional reading.
 * The 配偶星 follows the partner — a male partner is read from 正官／七殺, a female partner from 正財／偏財 — while the
 * 神煞 keep the chart owner's own sex.
 */
export interface ZhengyuanInput { pillars: string[]; gender: Gender; partner?: Gender }
export type Strength = "鲜明" | "适中" | "隐约" | "不见";
export interface Trait { key: string; label: string; basis: string; text: string }
export interface Zhengyuan {
  /** the partner's sex the reading used */
  partner: Gender;
  star: { ten: string; element: string; where: { pillar: number; visible: boolean }[]; strength: Strength };
  palace: { branch: string; element: string; ten: string; relations: string[] };
  flowers: string[];
  traits: Trait[];
  imagePrompt: { element: string; palette: string[]; mood: string[]; scene: string };
}

/** words reader-facing text must never contain (also checked by the test over all 60 day pillars × 2 genders) */
export const BANNED = ["准", "命中注定", "注定", "一定会", "必定", "必然", "肯定", "吉", "凶", "克夫", "克妻", "刑克", "婚姻失败", "离婚", "改运", "化解", "这里", "规则", "他", "她"];

// ------------------------------------------------------------------------------------------------ 干支 basics
const S = "甲乙丙丁戊己庚辛壬癸";
const ELS = ["木", "火", "土", "金", "水"] as const;
const stemEl = (s: string) => ELS[Math.floor(S.indexOf(s) / 2)]!;
const BRANCH_EL: Record<string, string> = { 子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火", 午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水" };
/** 藏干, 本气 first (渊海子平 人元) */
const HIDDEN: Record<string, string> = { 子: "癸", 丑: "己癸辛", 寅: "甲丙戊", 卯: "乙", 辰: "戊乙癸", 巳: "丙庚戊", 午: "丁己", 未: "己丁乙", 申: "庚壬戊", 酉: "辛", 戌: "戊辛丁", 亥: "壬甲" };
const ei = (e: string) => ELS.indexOf(e as (typeof ELS)[number]);

/** 十神 of stem s seen from day master dm (simplified names) */
export function tenOf(dm: string, s: string): string {
  const d = (ei(stemEl(s)) - ei(stemEl(dm)) + 5) % 5;
  const same = S.indexOf(dm) % 2 === S.indexOf(s) % 2;
  return [["比肩", "劫财"], ["食神", "伤官"], ["偏财", "正财"], ["七杀", "正官"], ["偏印", "正印"]][d]![same ? 0 : 1]!;
}

/** 旺相休囚死 of element e in the month of branch mb */
function seasonState(mb: string, e: string): "旺" | "相" | "休" | "囚" | "死" {
  const season = "辰戌丑未".includes(mb) ? "土" : BRANCH_EL[mb]!;
  const d = (ei(e) - ei(season) + 5) % 5; // 0 same, 1 season generates e, 2 season restrains e, 3 e restrains season, 4 e generates season
  return (["旺", "相", "死", "囚", "休"] as const)[d]!;
}

const DIRECTION: Record<string, string> = { 子: "北", 丑: "东北", 寅: "东北", 卯: "东", 辰: "东南", 巳: "东南", 午: "南", 未: "西南", 申: "西南", 酉: "西", 戌: "西北", 亥: "西北" };

// ------------------------------------------------------------------------------------------------ 配偶星
function findStar(pillars: string[], partner: Gender) {
  const dm = pillars[2]![0]!;
  const [zheng, pian] = partner === "female" ? ["正财", "偏财"] : ["正官", "七杀"];
  const spots = (ten: string) => {
    const w: { pillar: number; visible: boolean; main: boolean }[] = [];
    pillars.forEach((p, i) => {
      if (i !== 2 && tenOf(dm, p[0]!) === ten) w.push({ pillar: i, visible: true, main: true });
      [...HIDDEN[p[1]!]!].forEach((h, k) => { if (tenOf(dm, h) === ten) w.push({ pillar: i, visible: false, main: k === 0 }); });
    });
    return w;
  };
  const z = spots(zheng!), p = spots(pian!);
  const vis = (w: typeof z) => w.some((x) => x.visible);
  const ten = vis(z) ? zheng! : vis(p) ? pian! : z.length ? zheng! : p.length ? pian! : zheng!;
  const where = ten === zheng ? z : p;
  const element = partner === "female" ? ELS[(ei(stemEl(dm)) + 2) % 5]! : ELS[(ei(stemEl(dm)) + 3) % 5]!;

  // strength: the whole element counts (both 正 and 偏), 透干 heavier than 藏支, 月令 adds or takes away
  let score = 0;
  for (const w of [...z, ...p]) {
    if (w.visible) score += 2 + (w.pillar === 1 || w.pillar === 3 ? 0.5 : 0);
    else score += w.main ? 1.5 : 0.5;
  }
  const any = z.length + p.length > 0;
  score += { 旺: 2, 相: 1.5, 休: 0, 囚: -0.5, 死: -1 }[seasonState(pillars[1]![1]!, element)];
  const strength: Strength = !any ? "不见" : score >= 4.5 ? "鲜明" : score >= 2 ? "适中" : "隐约";
  return { ten, element, where: where.map(({ pillar, visible }) => ({ pillar, visible })), strength, both: vis(z) && vis(p) };
}

// ------------------------------------------------------------------------------------------------ copy
// 气韵: 灵枢·阴阳二十五人 + 渊海子平/三命通会 五行性情
const QIYUN: Record<string, string> = {
  木: "TA 身上多半有一股向上舒展的劲儿，气质清朗，待人温和、心软，像春天里安静生长的树，有自己的分寸。",
  火: "TA 容易给人明亮、热络的第一印象，表情生动，反应快，热情来得直接，和 TA 在一起很少冷场。",
  土: "TA 多半给人厚实、可靠的感觉，举止稳当，说话算数，不急不躁，让人想靠近、想安顿下来。",
  金: "TA 的气质偏清爽利落，做事果断、讲原则，带着一点干净的距离感；外表也许偏冷，心里却很讲义气。",
  水: "TA 的气质偏灵动、内敛，心思细，懂得体察人心，聪明而不张扬，像夜里的水面，安静却映得出很多东西。",
};
const SHAPE: Record<string, string> = { 木: "身形偏修长挺拔", 火: "神采外放、动作轻快", 土: "体态敦实匀称", 金: "骨相清朗、线条利落", 水: "体态柔和、带一点松弛感" };
const DENSITY: Record<Strength, string> = {
  鲜明: "这份气质在 TA 身上很鲜明，存在感强，属于走进房间就容易被注意到的类型。",
  适中: "这份气质在 TA 身上浓淡刚好，不刻意，相处久了越来越清晰，舒服而耐看。",
  隐约: "这份气质在 TA 身上淡淡的，像隔着一层薄雾，初见未必显眼，要慢慢走近才看得见 TA 的好。",
  不见: "TA 多半不是一眼就能被定义的人，第一印象也许很普通，真正的样子要在日常相处里一点点显出来。",
};
// 底色: 渊海子平·干支体象·地支 (imagery only)
const DISE: Record<string, string> = {
  子: "像溪涧里的活水，清而有源，TA 心思灵活，情绪来得快，也散得快。",
  丑: "像冬末带霜的土地，外表沉静、甚至有点冷，内里却藏着慢慢回暖的耐心。",
  寅: "像初春里带着火种的树木，TA 有朝气，愿意往前走，常常是先迈出一步的那一个。",
  卯: "像仲春的繁花，TA 温润、有审美，喜欢美好的事物，也值得被温柔对待。",
  辰: "像春末湿润的泥土，能养万物，TA 包容度高，心里装得下很多人和事。",
  巳: "像初夏渐亮的日光，TA 聪敏、有光彩，做事有热度，也有巧思。",
  午: "像正午的阳光，TA 明朗直接，情绪写在脸上，热情坦荡。",
  未: "像夏末晒暖的土地，TA 温和、念旧，喜欢把日子经营得有烟火气。",
  申: "像刚出炉的金属，TA 刚健、行动力强，遇事不拖泥带水。",
  酉: "像清亮的白金，TA 精致、讲究，对细节和品质有自己的要求。",
  戌: "像深秋收藏的土地，TA 性子偏刚却很重情，守信、护着自己人，认定了就很长情。",
  亥: "像深水的源头，TA 心思深，包容而富有想象力，安静的时候自有一片海。",
};
// 神态: 日支刑冲合害破
const SHENTAI: Record<string, string> = {
  冲: "TA 的眼神里多半带着动感和反差，安静时很安静，认真起来很有冲劲；你们之间容易有火花，也需要给彼此留一点余地。",
  刑: "TA 的神态里有一点棱角和自我要求，认真、较真，对在乎的人尤其如此；磨合之后，这份认真会变成很踏实的在意。",
  害: "TA 也许有点外冷内热，话不说满，心里却记得很细；读懂 TA 的沉默，是靠近 TA 的一把钥匙。",
  合: "TA 的神态多半柔和、亲近，眼神里有一种愿意靠近的温度，你们之间容易有默契，不太需要多余的解释。",
  破: "TA 的神态有点随性，计划常常跟着心情走，相处里多一点弹性，会更轻松。",
  无: "TA 的神态多半平和安定，不太起伏，眼神里有一种让人放心的稳。",
};
// 相处: 日坐十神 (性格面)
const XIANGCHU: Record<string, string> = {
  比肩: "相处起来多半像老朋友，平等、坦率，有话直说，也尊重彼此各自的空间。",
  劫财: "TA 多半热烈、好胜，喜欢一起做事、一起冒险，感情里带着一点较劲的乐趣。",
  食神: "TA 多半温和、会享受生活，懂吃懂玩，和 TA 在一起节奏松弛，日子过得有滋味。",
  伤官: "TA 多半有才气、有想法，口才好，也有自己的小脾气；欣赏 TA 的独特，相处会很有意思。",
  正财: "TA 多半务实、顾家，看重细水长流的安稳，会把日子安排得井井有条。",
  偏财: "TA 多半大方、爱热闹，交游广，喜欢带你认识新的人、去新的地方。",
  正官: "TA 多半端正、有分寸，讲规矩也讲担当，是会认真规划两个人未来的类型。",
  七杀: "TA 多半有主见、有魄力，做决定干脆，偶尔显得强势，却很能扛事。",
  正印: "TA 多半体贴、包容，常常是会照顾人的那一方，给人被稳稳接住的安心感。",
  偏印: "TA 多半安静、有自己的精神世界，想法独特，需要一点独处，也懂得尊重你的独处。",
};
// 相遇: 星所在柱 (宫位远近) + 五行场景 + 日支方位
const MEET_PILLAR = [
  "缘分多半来自稍远的地方，或经由长辈、家族、旧识牵线，也许要走出熟悉的环境才遇得到。",
  "缘分多半出现在工作、学业或同城的生活圈里，也可能经由同事、同学或家人朋友介绍。",
  "缘分多半就在身边，也许是早就认识的同学、同事或邻近的人，相处久了才发现彼此。",
  "缘分可能来得稍晚一些，多在兴趣、进修或新的圈子里出现，慢慢熟悉起来。",
];
const MEET_NONE = "缘分多半在日常、熟悉的场景里慢慢发生，不必刻意去找。";
const MEET_SCENE: Record<string, string> = { 木: "书店、课堂、公园这类有书卷气或草木气的地方", 火: "热闹的聚会、活动或阳光充足的场合", 土: "家附近、熟人饭局或常去的老地方", 金: "工作场合、专业交流或城市里节奏明快的地方", 水: "水边、旅途中，或夜晚安静的时刻" };

// 插画提示
const PALETTE: Record<string, string[]> = {
  木: ["竹青", "嫩绿", "浅杏", "米白"], 火: ["朱砂红", "橘红", "暖金", "象牙白"], 土: ["赭石", "驼色", "麦黄", "米白"],
  金: ["月白", "银灰", "浅金", "雾蓝"], 水: ["墨蓝", "黛青", "银白", "烟灰"],
};
const EL_MOOD: Record<string, string> = { 木: "舒展", 火: "热烈", 土: "安稳", 金: "清冷", 水: "灵动" };
const STRENGTH_MOOD: Record<Strength, string> = { 鲜明: "笃定", 适中: "温润", 隐约: "朦胧", 不见: "含蓄" };
const REL_MOOD: Record<string, string> = { 冲: "张力", 刑: "克制", 害: "欲言又止", 合: "亲近", 破: "随性", 无: "安宁" };
const SEASON_SCENE: Record<string, string> = { 子: "冬夜", 丑: "冬末清晨", 寅: "早春黎明", 卯: "仲春花间", 辰: "春末雨后", 巳: "初夏上午", 午: "盛夏正午", 未: "夏末午后", 申: "初秋傍晚", 酉: "中秋黄昏", 戌: "深秋暮色", 亥: "初冬夜晚" };
const EL_SCENE: Record<string, string> = { 木: "竹林或树影间的小径", 火: "灯火与晚霞映照的街角", 土: "暖色的旧院落与田野", 金: "清朗的城市天台与金属光泽", 水: "湖面、雨丝与倒影" };

/** which family a relation string belongs to, strongest first */
const REL_KINDS: [string, RegExp][] = [["冲", /相冲/], ["刑", /相刑/], ["害", /相害/], ["合", /合|会/], ["破", /相破/]];
const relKind = (r: string) => REL_KINDS.find(([, re]) => re.test(r))?.[0];

const FLOWER_NAMES = ["桃花", "红鸾", "天喜", "孤辰", "寡宿"];
const KINDS: Kind[] = ["natal-year", "natal-month", "natal-day", "natal-hour"];
const PILLAR_NAME = ["年", "月", "日", "时"];

/**
 * 10-30 进度表 128 ④: every fixed sentence of the portrait in one place — the Chinese reading uses it as written; a page in
 * another language gets the same tree translated (lib/mingli/bazi/zhengyuan-in.ts) and builds the same traits from it.
 */
export const ZY_COPY = {
  qiyun: QIYUN, shape: SHAPE, density: DENSITY, dise: DISE, shentai: SHENTAI, xiangchu: XIANGCHU,
  slow: "TA 多半慢热，好处藏在细节里。", near: "而且 TA 多半离你的日常生活很近。", both: "TA 身上也许同时有稳重和灵活两面。",
  flowerPeach: "TA 多半自带好人缘和吸引力，容易在人群里被看见。",
  flowerRed: "你们的相处里容易有喜气和仪式感，适合一起把小日子过得热闹一点。",
  flowerAlone: "TA 也可能很需要一些各自的空间，彼此独立，反而更亲近。",
  flowerNone: "你们的缘分气息偏安静，不靠热闹，靠相处中一点点积累。",
  meetPillar: MEET_PILLAR, meetNone: MEET_NONE, meetScene: MEET_SCENE,
  /** {pillar} a whole sentence of meetPillar / meetNone, {scene} a meetScene, {dir} a direction */
  meet: "{pillar}也许是在{scene}；方向上，偏{dir}的地方或许值得多留意。",
  labels: { qiyun: "气韵意象", titai: "气质浓淡", dise: "宫位底色", shentai: "眼神与张力", xiangchu: "相处节奏", yuanfen: "缘分气息", xiangyu: "相遇场景" },
};
export type ZyCopy = typeof ZY_COPY;

/** everything the traits are built from (the same for every language) */
export interface ZyKeys {
  partner: Gender; db: string;
  star: { ten: string; element: string; where: { pillar: number; visible: boolean }[]; strength: Strength; both: boolean };
  palace: { branch: string; element: string; ten: string; relations: string[] };
  flowers: string[]; mainKind: string; el: string; shown: boolean; inPalace: boolean; visible: boolean;
  first: { pillar: number; visible: boolean } | null;
  /** the 日支's compass direction (simplified: 北 东北 …) */
  dir: string;
}
export function zyKeys(input: ZhengyuanInput): ZyKeys {
  const { pillars, gender } = input;
  const partner: Gender = input.partner ?? (gender === "male" ? "female" : "male");
  if (pillars.length < 3) throw new Error("zhengyuanOf: need at least 年月日 pillars");
  const dm = pillars[2]![0]!, db = pillars[2]![1]!;
  const star = findStar(pillars, partner);
  // 夫妻宫
  const rel = relationsFull(pillars);
  const relations = [...rel.branches.filter((r) => r.includes(db)), ...rel.whole.filter((r) => r.includes(pillars[2]!) && /自合/.test(r))];
  const palace = { branch: db, element: BRANCH_EL[db]!, ten: tenOf(dm, HIDDEN[db]![0]!), relations };
  const kinds = relations.map(relKind).filter((k): k is string => !!k);
  const mainKind = REL_KINDS.map(([k]) => k).find((k) => kinds.includes(k)) ?? "无";
  // 神煞
  const natal = { year: pillars[0]!, month: pillars[1]!, day: pillars[2]!, hour: pillars[3] };
  const found = new Set<string>();
  pillars.forEach((p, i) => shenshaOf(p, natal, gender, KINDS[i]!).forEach((n) => FLOWER_NAMES.includes(n) && found.add(n)));
  const flowers = FLOWER_NAMES.filter((n) => found.has(n));
  const shown = star.strength !== "不见";
  const first = star.where.find((w) => w.visible) ?? star.where[0] ?? null;
  return {
    partner, db, star: { ten: star.ten, element: star.element, where: star.where, strength: star.strength, both: star.both }, palace, flowers, mainKind,
    el: shown ? star.element : palace.element, // 星不见 → 取日支
    shown, inPalace: star.where.some((w) => w.pillar === 2), visible: star.where.some((w) => w.visible), first, dir: DIRECTION[db]!,
  };
}
/**
 * the trait texts from a copy (Chinese, or the same tree in another language): `dir` names the direction in that
 * language, `stop` ends the body-shape phrase (。 in Chinese and Japanese, a full stop elsewhere), `sep` joins sentences
 * (nothing in Chinese and Japanese, a space elsewhere)
 */
export function zyTexts(k: ZyKeys, c: ZyCopy, o: { dir?: (zh: string) => string; stop?: string; sep?: string } = {}): Record<"qiyun" | "titai" | "dise" | "shentai" | "xiangchu" | "yuanfen" | "xiangyu", string> {
  const dir = o.dir ?? ((x: string) => x), stop = o.stop ?? "。", sep = o.sep ?? "";
  const join = (a: string, b: string) => (a ? `${a}${sep}${b}` : b);
  // a phrase written with no capital (it was made to sit inside a sentence): a Latin text starts with one
  const shape0 = c.shape[k.el as "木"].trim();
  const shape = stop === "." ? shape0.charAt(0).toUpperCase() + shape0.slice(1) : shape0;
  let density = join(/[。．.!?！？]$/.test(shape) ? shape : `${shape}${stop}`, c.density[k.star.strength]);
  if (k.shown && !k.visible) density = join(density, c.slow);
  else if (k.shown && k.inPalace) density = join(density, c.near);
  if (k.star.both) density = join(density, c.both);
  const fl: string[] = [];
  if (k.flowers.includes("桃花")) fl.push(c.flowerPeach);
  if (k.flowers.includes("红鸾") || k.flowers.includes("天喜")) fl.push(c.flowerRed);
  if (k.flowers.includes("孤辰") || k.flowers.includes("寡宿")) fl.push(c.flowerAlone);
  const meet = c.meet.split("{pillar}").join(k.first ? c.meetPillar[k.first.pillar]! : c.meetNone).split("{scene}").join(c.meetScene[k.el as "木"]).split("{dir}").join(dir(k.dir));
  return {
    qiyun: c.qiyun[k.el as "木"], titai: density, dise: c.dise[k.db as "子"], shentai: c.shentai[k.mainKind as "冲"], xiangchu: c.xiangchu[k.palace.ten as "比肩"],
    yuanfen: fl.length ? fl.reduce((a, b) => join(a, b), "") : c.flowerNone, xiangyu: meet,
  };
}

// ------------------------------------------------------------------------------------------------ main
export function zhengyuanOf(input: ZhengyuanInput): Zhengyuan {
  const k = zyKeys(input);
  const { partner, star, palace, flowers, db, el, shown, inPalace, mainKind, first } = k;
  const t = zyTexts(k, ZY_COPY);
  const starTag = `${star.ten}·${star.element}`;
  const whereTag = star.where.length
    ? [...new Set(star.where.map((w) => `${PILLAR_NAME[w.pillar]}${w.visible ? "干" : "支藏"}`))].join("、")
    : "四柱不见";
  const relations = palace.relations;

  const traits: Trait[] = [];
  traits.push({ key: "qiyun", label: "气韵意象", basis: shown ? `配偶星 ${starTag}` : `配偶星不见 · 取夫妻宫${db}${palace.element}`, text: t.qiyun });
  traits.push({ key: "titai", label: "气质浓淡", basis: `${whereTag} · ${star.strength}${inPalace ? " · 坐配偶宫" : ""}`, text: t.titai });
  traits.push({ key: "dise", label: "宫位底色", basis: `夫妻宫 ${db}（${palace.element}）`, text: t.dise });
  traits.push({ key: "shentai", label: "眼神与张力", basis: relations.length ? `夫妻宫 ${db} · ${relations.join("、")}` : `夫妻宫 ${db} · 无刑冲合会`, text: t.shentai });
  traits.push({ key: "xiangchu", label: "相处节奏", basis: `日坐${palace.ten}`, text: t.xiangchu });
  traits.push({ key: "yuanfen", label: "缘分气息", basis: flowers.length ? flowers.join("、") : "无桃花红鸾", text: t.yuanfen });
  traits.push({ key: "xiangyu", label: "相遇场景", basis: `${first ? `配偶星在${PILLAR_NAME[first.pillar]}柱` : "配偶星不见"} · ${el} · 日支${db}${DIRECTION[db]}`, text: t.xiangyu });

  const imagePrompt = {
    element: el,
    palette: PALETTE[el]!,
    mood: [EL_MOOD[el]!, STRENGTH_MOOD[star.strength], REL_MOOD[mainKind]!],
    scene: `${SEASON_SCENE[db]}，${EL_SCENE[el]}；人物只以背影或侧影出现，不画清晰面孔，画面中不出现任何文字`,
  };

  return { partner, star: { ten: star.ten, element: star.element, where: star.where, strength: star.strength }, palace, flowers, traits, imagePrompt };
}
