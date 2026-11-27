import GEN_PAGE from "@/data/l10n/yunshipage.json";
import GEN_ZODIAC from "@/data/l10n/yunshi.json";
import GEN_STAR from "@/data/l10n/horoscope.json";
import type { Foreign, Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";
import { C } from "./zodiac";
import { H, type HoroscopeContent } from "./horoscope";

/**
 * 10-30 进度表 128 ⑤ (Neil 10-29: 韓國띠별 운세；欧美和日本的每日运势加星座) — the 每日運勢 pages in the seven other
 * languages. Korean readers get the twelve animals (띠별 운세); Japanese and the Western languages get the twelve sun signs
 * first and the twelve animals after them. Three trees: the page's words (here), the animals' copy (data/mingli/yunshi.json)
 * and the signs' copy (data/mingli/horoscope.json), each translated by scripts/l10n (yunshipage / yunshi / horoscope).
 */
const PAGE = {
  metaTitle: "今日運勢｜十二星座與十二生肖每日運勢",
  metaDesc: "選你的星座或生肖，看今天的節奏：今天適合怎麼安排、哪件事先別急。每天更新，免費、不用註冊。",
  metaTitleAnimals: "今日生肖運勢｜十二生肖每日運勢",
  metaDescAnimals: "選你的生肖，看今天的節奏：今天適合怎麼安排、哪件事先別急。十二生肖每天更新，免費、不用註冊。",
  title: "今日運勢",
  titleAnimals: "今日生肖運勢",
  lead: "{date} · 選你的星座或生肖，看今天適合怎麼安排。",
  leadAnimals: "{date}（{gz}日）· 選你的生肖，看今天適合怎麼安排。",
  starHead: "十二星座",
  starPick: "你是什麼星座？",
  starMine: "你的星座",
  starUnsure: "不確定自己是什麼星座？用生日查",
  starResult: "你是{z}，看今天 →",
  zodiacHead: "十二生肖",
  zodiacNote: "中國傳統的十二生肖，以出生那年的立春（約 2 月 4 日）為界。今天是{gz}日。",
  pick: "你屬什麼？",
  mine: "你的生肖",
  unsure: "不確定自己屬什麼？用生日查",
  birth: "生日",
  result: "你屬{z}，看今天 →",
  y: "年", m: "月", d: "日",
  fitYes: ["今天大概怎麼安排", "哪件事先別急"],
  fitNo: ["一件具體的事會不會成——起一卦問那件事", "吉凶判決"],
  how: ["選你的星座或生肖；不確定就用生日查", "看今天的節奏和一句提醒", "每天更新"],
  howAnimals: ["選你的生肖；不確定就用生日查", "看今天的節奏和一句提醒", "每天更新"],
  free: "每天都免費看，不用註冊。",
  boundary: "星座運勢依占星傳統看今天月亮的位置，生肖運勢依當日干支和生肖的關係整理；看的是今天的節奏，不是吉凶判決，僅供參考。",
  boundaryAnimals: "依傳統生肖與當日干支的關係整理，看的是今天的節奏，不是吉凶判決，僅供參考。",
  // one sign's page
  back: "今日運勢",
  backAnimals: "十二生肖",
  todayYes: "今天適合",
  todayNo: "今天先別",
  starTitle: "{z}",
  starMeta: "{z}今日運勢｜{z}每日星座運勢",
  starMetaDesc: "{z}（{d}）今天的節奏：月亮走到哪裡、適合怎麼安排、哪件事先別急，每天更新。免費、不用註冊。",
  starDates: "{d} 出生",
  moonLine: "今天的月亮在{s}，落在從{z}數起的第 {h} 宮。",
  aboutStar: "關於{z}",
  animalTitle: "屬{z}",
  animalMeta: "屬{z}今日運勢｜生肖{z}每日運勢",
  animalMetaDesc: "屬{z}的人今天的節奏：適合怎麼安排、哪件事先別急，每天更新。免費、不用註冊。",
  relHead: "今天和屬{z}的關係",
  relLine: "今天是{gz}日，屬{z}的地支是{b}：{rel}。",
  rel: { chong: "相沖", xing: "相刑", hai: "相害", po: "相破", liuhe: "六合", sanhe: "三合", same: "同支（本命日）", ping: "沒有沖合，平常日" },
  aboutAnimal: "關於屬{z}",
  castLead: "今天有一件放不下的事嗎？",
  castBtn: "起一卦問那件事 →",
  tomorrow: "明天：{t}。明天再來看。",
  tierHead: "今天的節奏",
  natalLink: "想看自己完整的出生星盤？免費排一張 →",
};
export const YS_PAGE_HANT = PAGE;
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type YsPage = Widen<typeof PAGE>;
type ZodiacContent = typeof C;

/** the page's words, the animals' copy and the signs' copy in one of the seven other languages */
export const ysPage = (l: Foreign): YsPage => localize(PAGE as unknown as YsPage, GEN_PAGE as unknown as Generated, l);
export const ysZodiac = (l: Foreign): ZodiacContent => localize(C, GEN_ZODIAC as unknown as Generated, l);
export const ysStar = (l: Foreign): HoroscopeContent => localize(H, GEN_STAR as unknown as Generated, l);
/** 10-30: the twelve animals only (띠별 운세) for Korean readers; the signs first for everyone else */
export const animalsOnly = (l: string) => l === "ko";
