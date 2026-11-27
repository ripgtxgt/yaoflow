import type { Situation } from "./situation";

/** 10-12 解籤 (进度表 §四 36): the parts of lib/qian.ts a client component needs — no lot text, so no 96 KB of JSON in the bundle. */
export const QIAN_LOCALE = "zh-hant" as const;
export const QIAN_SET = "liushi-jiazi" as const;
export const QIAN_SET_NAME = "六十甲子籤";
export const QIAN_COUNT = 60;

/**
 * 10-12 籤系 (Neil: 「把黄大仙签也收录了吧」；进度表 40 ③ 的「籤系」选择先做出来): each set its own count, pages
 * (/zh-hant/qian/<set>/<n>) and temples. 六十甲子籤 stays the default — every URL and draw made before keeps meaning it.
 * 黃大仙靈籤: 100 lots of 嗇色園黃大仙祠 (Hong Kong); poems and 籤題 as the temple prints them, our own plain reading.
 */
export const QIAN_SETS = [
  { id: "liushi-jiazi", name: "六十甲子籤", nameHans: "六十甲子签", short: "六十甲子籤", count: 60, where: "台灣媽祖廟、城隍廟常見，籤上寫著甲子、乙丑這類干支" },
  // 10-12 进度表 40 ⑧-2: the Mazu temples' 100-lot set (temples.tw 150 万); text from 臺南祀典大天后宮's own site
  { id: "tianhou", name: "天后宮一百籤", nameHans: "天后宫一百签", short: "天后宮籤", count: 100, where: "臺南大天后宮、鹿港天后宮、關渡宮、澎湖天后宮等媽祖廟常見，一百支，籤上附一個卦名（震、恒、小過…）" },
  // 10-12 进度表 40 ⑧-1: the most-looked-up set in Taiwan (temples.tw 337 万); text checked lot by lot against 臺北行天宮's slips
  { id: "guandi", name: "關聖帝君一百籤", nameHans: "关圣帝君一百签", short: "關帝籤", count: 100, where: "臺北行天宮、日月潭文武廟和各地關帝廟、城隍廟常見，一百支，籤上寫著甲甲、甲乙這類天干" },
  // 10-12 进度表 40 ⑧-3: the 100 Guanyin lots as at 艋舺龍山寺 (its own page is gone; text from 籤詩網, matches temples.tw)
  { id: "guanyin", name: "觀音一百籤", nameHans: "观音一百签", short: "觀音籤", count: 100, where: "艋舺龍山寺等觀音廟常見，一百支，籤上寫著上籤、中籤、下籤和子宮、丑宮這類宮位" },
  // 10-12 进度表 40 ⑧-4: love only; each lot is a line or two of the classics (temples.tw 68 万); 新竹普天宮's text
  { id: "yuelao", name: "月老聖籤", nameHans: "月老圣签", short: "月老籤", count: 100, where: "新竹普天宮等月老殿常見，一百支，每支是一兩句經史古文或詩詞名句，只問感情" },
  // 10-12 籤詩網的其餘各套 (Neil: 「这个网站上面不是还有很多庙的签吗？你全部都收录进来吧」)
  { id: "baosheng", name: "保生大帝六十籤", nameHans: "保生大帝六十签", short: "保生大帝籤", count: 60, where: "保生大帝（大道公）廟常見，六十支七言籤" },
  { id: "zhusheng", name: "註生娘娘三十籤", nameHans: "注生娘娘三十签", short: "註生娘娘籤", count: 30, where: "註生娘娘殿常見，三十支五言籤，很多人拿來問求子和孩子的事" },
  { id: "guanyin28", name: "觀音二十八籤", nameHans: "观音二十八签", short: "觀音二十八籤", count: 28, where: "高雄內門紫竹寺、台南南化紫竹寺等觀音廟用的二十八支七言籤" },
  { id: "guanyin24", name: "觀音二十四籤", nameHans: "观音二十四签", short: "觀音二十四籤", count: 24, where: "新竹五指山觀音禪寺等少數觀音廟用的二十四支七言籤" },
  { id: "qianbagua", name: "金錢卦三十二籤", nameHans: "金钱卦三十二签", short: "金錢卦", count: 32, where: "用三枚銅錢卜出的三十二支五言籤（金錢卦）" },
  { id: "sensoji", name: "淺草寺觀音籤", nameHans: "浅草寺观音签", short: "淺草寺籤", count: 100, where: "日本東京淺草寺（金龍山）的觀音籤，一百支五言漢詩，以凶籤多出名" },
  // 10-28 (Neil: 「補籤庫吧」— two of the six unrecognised photos were this set): the temple's own forty 七言 lots, not the 月老聖籤
  { id: "lecheng-yuelao", name: "臺中樂成宮月老靈籤", nameHans: "台中乐成宫月老灵签", short: "樂成宮月老籤", count: 40, where: "臺中樂成宮（旱溪媽祖廟）月老殿，四十首七言籤，籤上寫「第幾首」，右欄印「緣份」「婚姻」兩個詞" },
  // 10-28: 烘爐地 prints the 金錢卦 with its own numbering from 18 on and one lot of its own (24), so it is a set of its own
  { id: "hunglodei", name: "烘爐地南山福德宮三十二籤", nameHans: "烘炉地南山福德宫三十二签", short: "烘爐地籤", count: 32, where: "新北中和烘爐地南山福德宮（含財神殿），三十二支五言籤，籤上寫「第幾號」和上上、中平這類等第" },
  { id: "huangdaxian", name: "黃大仙靈籤", nameHans: "黄大仙灵签", short: "黃大仙籤", count: 100, where: "香港嗇色園黃大仙祠，一百支，每支有籤題（如「姜公封相」）" },
] as const;

/** 10-12: the line under each lot's card — whose wording the poem follows (never a temple's 解曰) */
export const QIAN_SET_SOURCE: Record<string, string> = {
  "liushi-jiazi": "",
  huangdaxian: "籤詩與籤題照香港嗇色園黃大仙祠的原文；下面的白話、感情與工作是我們自己寫的，不是廟方的解曰。",
  tianhou: "籤詩照臺南祀典大天后宮的籤文；下面的白話、感情與工作是我們自己寫的，不是廟方的解曰。",
  guanyin: "籤詩依籤詩網所收觀音一百籤；下面的白話、感情與工作是我們自己寫的，不是廟方的解曰。",
  baosheng: "籤詩依籤詩網（chance.org.tw）所收保生大帝六十籤；下面的白話、感情與工作是我們自己寫的，不是廟方的解曰；問病請以醫師的判斷為準。",
  zhusheng: "籤詩依籤詩網（chance.org.tw）所收註生娘娘三十籤；下面的白話是我們自己寫的，不是廟方的解曰；求子、懷孕的事請以醫師的判斷為準。",
  guanyin28: "籤詩照高雄內門紫竹寺官網的籤文；下面的白話、感情與工作是我們自己寫的，不是廟方的解曰。",
  guanyin24: "籤詩依籤詩網（chance.org.tw）所收觀音二十四籤；下面的白話、感情與工作是我們自己寫的，不是廟方的解曰。",
  qianbagua: "籤詩依籤詩網（chance.org.tw）所收金錢卦三十二籤的台版籤詩；下面的白話、感情與工作是我們自己寫的。",
  sensoji: "籤詩依籤詩網（chance.org.tw）所錄東京淺草寺觀音籤的漢詩原文；下面的白話是我們自己寫的，不是寺方的解說，也不顯示吉凶。",
  yuelao: "籤文照新竹普天宮月老聖籤；下面的白話是我們自己寫的，不是廟方的解曰。",
  "lecheng-yuelao": "籤詩照臺中樂成宮月老靈籤的籤紙；下面的白話、感情與工作是我們自己寫的，不是廟方的意解。",
  hunglodei: "籤詩照烘爐地南山福德宮的籤紙；下面的白話、感情與工作是我們自己寫的，不是廟方的斷曰。",
  guandi: "籤詩照臺北行天宮的籤；下面的白話、感情與工作是我們自己寫的，不是廟方的解曰。",
};
export type QianSetId = (typeof QIAN_SETS)[number]["id"];
export const isQianSet = (x: unknown): x is QianSetId => QIAN_SETS.some((s) => s.id === x);
export const qianSet = (id?: string | null) => QIAN_SETS.find((s) => s.id === id) ?? QIAN_SETS[0];

/** 第 N 籤 in Chinese numerals, the way the temples print it */
export function qianOrdinal(n: number): string {
  const D = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (n < 10) return D[n]!;
  if (n === 10) return "十";
  if (n < 20) return `十${D[n - 10]}`;
  if (n === 100) return "一百";
  return `${D[Math.floor(n / 10)]}十${D[n % 10]}`;
}

export const qianPath = (n: number, set: string = QIAN_SET) => `/${QIAN_LOCALE}/qian/${qianSet(set).id}/${n}`;
export const qianIndexPath = (set: string = QIAN_SET) => `/${QIAN_LOCALE}/qian/${qianSet(set).id}`;
export const JIEQIAN_PATH = `/${QIAN_LOCALE}/jieqian`;
export const qianResultPath = (token: string) => `${JIEQIAN_PATH}/r/${token}`;

/** Where the lot was drawn — recorded only, never in a title (the page is not any temple's). */
/**
 * 10-12 核对 (Neil: 「这些庙的所有签都有的吗？」): only temples that draw from the 六十甲子籤 are offered — 東港鎮海宮 (our
 * text follows its site lot by lot), 北港朝天宮 (its 港運籤 己卯「黃金忽然變成鐵」 is our 32), 新港奉天宮 (國運籤 第廿六首 戊寅
 * 「選出牡丹第一枝」 is our 26), 臺灣省城隍廟 (its site lists 60 lots, 第 60 癸亥「月出光輝本清吉」 is ours). 鹿港天后宮 uses the
 * 100-lot 天后宮籤 (澎湖天后宮靈籤), as do many Mazu temples — not this set, so it is no longer listed, nor is 「其他媽祖廟」;
 * the ids stay so earlier draws still name their temple.
 */
export const TEMPLES = [
  { id: "donggang", name: "東港鎮海宮", set: "liushi-jiazi" },
  { id: "beigang", name: "北港朝天宮", set: "liushi-jiazi" },
  { id: "xingang", name: "新港奉天宮", set: "liushi-jiazi" },
  { id: "chenghuang", name: "臺灣省城隍廟", set: "liushi-jiazi" },
  { id: "other", name: "其他（籤上寫著甲子、乙丑這類干支的）", set: "liushi-jiazi" },
  { id: "siksikyuen", name: "嗇色園黃大仙祠", set: "huangdaxian" },
  { id: "hdx-other", name: "其他黃大仙廟", set: "huangdaxian" },
  { id: "tainan", name: "臺南大天后宮", set: "tianhou" },
  { id: "lugang", name: "鹿港天后宮", set: "tianhou" },
  { id: "guandu", name: "關渡宮", set: "tianhou" },
  { id: "penghu", name: "澎湖天后宮", set: "tianhou" },
  { id: "th-other", name: "其他天后宮、媽祖廟（一百首的）", set: "tianhou" },
  { id: "longshan", name: "艋舺龍山寺", set: "guanyin" },
  { id: "gy-other", name: "其他觀音廟、寺院", set: "guanyin" },
  { id: "baosheng-temple", name: "保生大帝廟（大道公）", set: "baosheng" },
  { id: "zhusheng-temple", name: "註生娘娘殿", set: "zhusheng" },
  { id: "neimen", name: "高雄內門紫竹寺", set: "guanyin28" },
  { id: "nanhua", name: "台南南化紫竹寺", set: "guanyin28" },
  { id: "g28-other", name: "其他觀音廟", set: "guanyin28" },
  { id: "wuzhishan", name: "新竹五指山觀音禪寺", set: "guanyin24" },
  { id: "g24-other", name: "其他觀音廟", set: "guanyin24" },
  { id: "qianbagua-any", name: "金錢卦（不限廟）", set: "qianbagua" },
  { id: "sensoji", name: "東京淺草寺", set: "sensoji" },
  { id: "jp-other", name: "其他日本寺院（同一套觀音籤）", set: "sensoji" },
  { id: "lecheng", name: "臺中樂成宮（旱溪媽祖廟）", set: "lecheng-yuelao" },
  { id: "hunglodei-temple", name: "中和烘爐地南山福德宮", set: "hunglodei" },
  { id: "putian", name: "新竹普天宮", set: "yuelao" },
  { id: "yl-other", name: "其他月老廟", set: "yuelao" },
  { id: "xingtian", name: "臺北行天宮", set: "guandi" },
  { id: "wenwu", name: "日月潭文武廟", set: "guandi" },
  { id: "gd-other", name: "其他關帝廟、城隍廟", set: "guandi" },
  { id: "mazu", name: "其他媽祖廟", set: "liushi-jiazi", listed: false },
] as const;
export const LISTED_TEMPLES = TEMPLES.filter((t) => !("listed" in t) || t.listed !== false);
/** the temples a reader can pick for this set */
export const templesFor = (set: string) => LISTED_TEMPLES.filter((t) => t.set === qianSet(set).id);
/** temple ids that say nothing about where (never passed into a prompt) */
export const isVagueTemple = (id: string | null | undefined) => !id || id === "other" || id.endsWith("-other") || id === "qianbagua-any" || id === "baosheng-temple" || id === "zhusheng-temple";
export type TempleId = (typeof TEMPLES)[number]["id"];
export const isTemple = (x: unknown): x is TempleId => TEMPLES.some((t) => t.id === x);

/** The reader's kind of matter: which part of the lot they see first, and the cast page's situation chip. */
export const QIAN_SITUATIONS = [
  { id: "fuhe", label: "復合", section: "love", st: "apart" },
  { id: "duanlian", label: "斷聯", section: "love", st: "apart" },
  { id: "aimei", label: "曖昧", section: "love", st: "ambiguous" },
  { id: "love", label: "感情其他", section: "love" },
  { id: "work", label: "工作", section: "work" },
  { id: "other", label: "其他", section: "overall" },
] as const satisfies readonly { id: string; label: string; section: "love" | "work" | "overall"; st?: Situation }[];
export type QianSituation = (typeof QIAN_SITUATIONS)[number]["id"];
export const isQianSituation = (x: unknown): x is QianSituation => QIAN_SITUATIONS.some((s) => s.id === x);
/** 10-12 月老聖籤 only asks about love — the kinds of matter a set offers */
export const situationsFor = (set: string) => (qianSet(set).id === "yuelao" ? QIAN_SITUATIONS.filter((s) => s.section === "love") : QIAN_SITUATIONS);
export const qianSituation = (id: string) => QIAN_SITUATIONS.find((s) => s.id === id) ?? QIAN_SITUATIONS[QIAN_SITUATIONS.length - 1]!;

/** The cast the lot leads to: the same question, the situation chip, the draw, and its campaign tag. */
export function qianCastUrl(i: { token: string; question: string; situation: string; num?: number; title?: string; set?: string }): string {
  const q = new URLSearchParams();
  if (i.question.trim()) q.set("q", i.question.trim());
  const st = (qianSituation(i.situation) as { st?: string }).st;
  if (st) q.set("st", st);
  q.set("qian", i.token);
  // 10-12 承接 ⑨: the cast page says which lot this follows (number and gist; the poem stays on the lot's page)
  if (i.num) q.set("qn", String(i.num));
  if (i.title) q.set("qt", i.title);
  if (i.set && i.set !== QIAN_SET) q.set("qs", i.set); // 10-12 籤系: the cast page names the set
  q.set("c", "jieqian");
  return `/${QIAN_LOCALE}/cast?${q.toString()}`;
}

export const QIAN_TOKEN_RE = /^[0-9a-f]{24}$/;


/** 10-12 承接 ⑨ 分享回流: where a shared lot sends a stranger — the entry, its number filled in, tagged so the return is counted. */
export const qianShareUrl = (site: string, n: number, set: string = QIAN_SET) => `${site}${JIEQIAN_PATH}?n=${n}${qianSet(set).id !== QIAN_SET ? `&s=${qianSet(set).id}` : ""}&c=qian-share`;
