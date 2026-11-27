import GEN from "@/data/l10n/almanac.json";
import YIJI from "@/data/mingli/huangli-yiji.json";
import NOTES from "@/data/mingli/huangli-notes.json";
import type { Foreign, Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";
import { PURPOSES } from "./zeri-purpose";

/**
 * 10-30 进度表 128 ⑤ (Neil 10-29: 欧美 Chinese Almanac，照原样翻译) — the 黃曆 and 擇日 pages in English, French, German,
 * Spanish and Portuguese: the same Taiwan almanac, explained for a reader who has never held a 通書. One 繁體 tree (the
 * page's words, the 宜／忌 words with their plain meaning, the twelve 建除, the 24 solar terms, the three 擇日 purposes),
 * translated by scripts/l10n (`almanac`). Japanese and Korean readers get their own calendars (koyomi.ts) instead.
 */
type Yiji = { tw: string; plain: string; example: string };
const Y = YIJI as Record<string, Yiji>;
const N = NOTES as { chongsha: string; duty: Record<string, string>; faq: { q: string; a: string }[] };

const PAGE = {
  metaTitle: "今日黃曆（中國傳統通書）｜每日宜忌、沖煞與吉時",
  metaDesc: "中國傳統黃曆（通書）上的今天：農曆日期、干支、節氣、這天適合做與建議換一天做的事、沖哪個生肖、黃道時辰，每一項都附白話說明。免費、不用註冊。",
  title: "今日黃曆",
  lead: "{date} · 中國傳統黃曆（通書）上的今天：適合做什麼、哪些事建議換一天、沖哪個生肖。",
  whatHead: "黃曆是什麼",
  what: "黃曆（又叫通書、農民曆）是華人社會流傳上千年的曆書。每天列出農曆日期、干支、節氣，以及通書認為這天適合做（宜）和建議換一天再做（忌）的事，例如結婚、搬家、開業、動土。今天在台灣、香港、新加坡、馬來西亞，許多家庭辦大事前仍會翻一翻。這一頁照著台灣通常用的通書內容，加上白話說明。",
  yi: "宜", ji: "忌",
  yiHint: "通書認為這天適合做的事（點一下看說明）",
  jiHint: "通書建議換一天再做的事",
  onlyListed: "通書寫「餘事勿取」：這天只適合上面列出的事，其他大事建議另選日子。",
  nothing: "通書寫「諸事不宜」：大事建議換一天。日常生活照常。",
  noneYi: "今天通書沒有特別列出適合做的事。",
  noneJi: "今天通書沒有特別列出要避開的事。",
  lunar: "農曆", lunarDate: "{m}月{d}日", lunarLeap: "閏{m}月{d}日",
  gz: "干支", gzLine: "{gz}日",
  term: "節氣", termToday: "今天交{t}", termNow: "{t}期間",
  chong: "沖煞", chongLine: "沖屬{z}的人；煞{dir}方",
  chongNote: N.chongsha,
  duty: "建除十二神",
  hours: "黃道時辰",
  hoursNote: "通書標為黃道（比較順手）的兩小時時段，以中國標準時間計。",
  hourItem: "{span}（{z}時）",
  prevDay: "前一天", nextDay: "後一天", thisMonth: "這個月", jump: "查別天", go: "看這天 →",
  prevMonth: "上個月", nextMonth: "下個月", back: "今日黃曆",
  dayTitle: "{date}的黃曆",
  dayMeta: "{date}的中國黃曆｜宜忌、沖煞與吉時",
  dayDesc: "{date}的中國傳統黃曆：農曆{lunar}，{gz}日。適合：{yi}。沖屬{z}的人。",
  monthTitle: "{month}的黃曆",
  monthMeta: "{month}的中國黃曆｜每天的宜忌與沖煞",
  monthDesc: "{month}每天的農曆日期、通書上適合做的事、沖哪個生肖，一頁看完；點一天看全部。",
  clashShort: "沖{z}",
  nothingShort: "諸事不宜",
  monthNote: "民間通書常見的宜忌，各家寫法不一，只供參考。",
  timeNote: "日期與時辰以中國標準時間（UTC+8）計算。",
  fitYes: ["想知道今天在中國傳統曆書上的樣子", "辦婚禮、搬家、開業前，看看通書怎麼寫", "農曆日期、干支與節氣"],
  fitNo: ["一件事會不會成、什麼時候有動靜——起一卦問", "吉凶判決"],
  how: ["打開就是今天", "往前、往後翻，或查任何一天", "要辦事，去擇日按事情挑日子"],
  free: "全部免費，不用註冊。",
  boundary: "依民間通書推算，各家做法不同，只供參考；它記錄的是一種文化傳統，不是預測。",
  toZeri: "要辦事？按事情挑日子：結婚、搬家、開業 →",
  cast: "心裡有一件放不下的事？起一卦，看這件事的走向和時機 →",
  faq: [
    { q: "黃曆和西方的曆法有什麼不同？", a: "黃曆同時記陽曆和農曆（陰陽合曆）：農曆月份跟著月亮走，節氣跟著太陽走。每天還配一組干支，六十天一輪。宜忌、沖煞都是從這些推出來的。" },
    { q: "我不是華人，也可以參考嗎？", a: "可以。很多人把黃曆當作了解華人文化的窗口，或在和華人家庭一起辦婚禮、開業時拿來參考。它是傳統習俗，不是規定，也不是預測。" },
    N.faq[2]!,
    N.faq[4]!,
  ],
};

/** the 宜／忌 words (keyed by the library's simplified word) with their plain meaning */
const YI_JI = Object.fromEntries(Object.entries(Y).map(([k, v]) => [k, { name: v.tw, plain: v.plain }]));
/** the twelve 建除 (keyed by the 繁體 name) */
const DUTY = Object.fromEntries(Object.entries(N.duty).map(([k, v]) => [k, { name: `${k}日`, note: v }]));
const TERMS = ["立春", "雨水", "驚蟄", "春分", "清明", "穀雨", "立夏", "小滿", "芒種", "夏至", "小暑", "大暑", "立秋", "處暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒"];
const DIRS = { 北: "北", 东: "東", 南: "南", 西: "西", 东南: "東南", 西北: "西北", 东北: "東北", 西南: "西南" };

const ZERI = {
  metaTitle: "擇日：按事情挑日子｜結婚、搬家、開業的好日子",
  metaDesc: "依中國傳統黃曆（通書），列出接下來三個月適合結婚、搬家、開業的日子，標出沖哪個生肖、是不是週末。免費。",
  title: "擇日：按事情挑日子",
  lead: "依中國傳統通書，接下來三個月適合辦這件事的日子。先挑幾天，再和家人、場地一起對。",
  pick: "要辦什麼事？",
  names: { wedding: "結婚", move: "搬家", opening: "開業" },
  matched: "通書寫：{w}",
  clash: "沖{z}",
  weekend: "週末",
  count: "{n} 天",
  none: "這段時間沒有合適的日子。",
  more: "看全部三個月 →",
  howItWorks: "怎麼挑的：這天的「宜」裡有這件事、「忌」裡沒有，也不是「破日」或「諸事不宜」。被沖的生肖，傳統上會換一天辦大事。",
  fitYes: ["結婚、搬家、開業前，先看通書上哪些日子適合", "和華人家庭一起挑日子"],
  fitNo: ["一件事會不會成——起一卦問", "吉凶判決"],
  how: ["選一件事", "看接下來三個月的日子，按月份排", "點一天看當天完整的黃曆"],
  free: "全部免費，不用註冊。",
  boundary: "依民間通書推算，各家做法不同，只供參考；大事請和家人、場地的時間一起安排。",
  purposes: Object.fromEntries((["wedding", "move", "opening"] as const).map((k) => [k, {
    title: { wedding: "{y} 結婚好日子｜{months}", move: "{y} 搬家好日子｜{months}", opening: "{y} 開業好日子｜{months}" }[k],
    h1: { wedding: "結婚的好日子", move: "搬家的好日子", opening: "開業的好日子" }[k],
    desc: { wedding: "依中國傳統通書，接下來三個月適合結婚的日子，按月份列出，標出沖哪個生肖、是不是週末。", move: "依中國傳統通書，接下來三個月適合搬家、入住新家的日子，按月份列出，標出沖哪個生肖、是不是週末。", opening: "依中國傳統通書，接下來三個月適合開店、開業的日子，按月份列出，標出沖哪個生肖、是不是週末。" }[k],
    intro: PURPOSES[k].intro,
    tips: PURPOSES[k].tips,
    faq: PURPOSES[k].faq,
  }])) as Record<"wedding" | "move" | "opening", { title: string; h1: string; desc: string; intro: string; tips: string[]; faq: { q: string; a: string }[] }>,
};

export const ALMANAC_HANT = { page: PAGE, yiji: YI_JI, duty: DUTY, terms: TERMS, dirs: DIRS, zeri: ZERI };
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type AlmanacText = Widen<typeof ALMANAC_HANT>;
/** the almanac's words in one of the five Western languages */
export const almanacText = (l: Foreign): AlmanacText => localize(ALMANAC_HANT as unknown as AlmanacText, GEN as unknown as Generated, l);
/** the Western languages that get the translated almanac (Japanese and Korean have their own calendars) */
export const WEST = new Set(["en", "fr", "de", "es", "pt"]);
