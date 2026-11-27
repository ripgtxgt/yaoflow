import { branchRels } from "./hepan/facts";

/**
 * 10-29 进度表 125 第一期 犯太歲查詢 (Neil: 「做吧」 — the old line 「不碰安太歲／改運推銷」 opened for information pages):
 * the year's branch against each 生肖's branch — 值 (the same), 沖, 刑, 害, 破 — computed the way the folk almanacs do,
 * from the same branch tables as 合盤 (lib/mingli/hepan/facts.ts). Information only: what it means as a pace, and how
 * people 安太歲 by custom. Never 保證平安, never 化解, nothing sold.
 */
export const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
export const STEMS = "甲乙丙丁戊己庚辛壬癸";
export interface Zodiac { slug: string; animal: string; branch: string }
export const ZODIACS: Zodiac[] = [
  { slug: "rat", animal: "鼠", branch: "子" }, { slug: "ox", animal: "牛", branch: "丑" }, { slug: "tiger", animal: "虎", branch: "寅" },
  { slug: "rabbit", animal: "兔", branch: "卯" }, { slug: "dragon", animal: "龍", branch: "辰" }, { slug: "snake", animal: "蛇", branch: "巳" },
  { slug: "horse", animal: "馬", branch: "午" }, { slug: "goat", animal: "羊", branch: "未" }, { slug: "monkey", animal: "猴", branch: "申" },
  { slug: "rooster", animal: "雞", branch: "酉" }, { slug: "dog", animal: "狗", branch: "戌" }, { slug: "pig", animal: "豬", branch: "亥" },
];
export const zodiacBySlug = (s: string) => ZODIACS.find((z) => z.slug === s) ?? null;
export const zodiacByBranch = (b: string) => ZODIACS.find((z) => z.branch === b) ?? null;

/** the year's 干支 (by 立春 — the year of the 生肖 starts at 立春, said on the page) */
export const yearGanzhi = (y: number) => `${STEMS[((y - 4) % 10 + 10) % 10]}${BRANCHES[((y - 4) % 12 + 12) % 12]}`;

export type TaisuiKind = "值" | "沖" | "刑" | "害" | "破";
/** which ways this 生肖 meets the year's 太歲 (empty: not 犯太歲 this year) */
export function taisuiOf(zodiacBranch: string, year: number): TaisuiKind[] {
  const yb = yearGanzhi(year)[1]!;
  const rels = branchRels(zodiacBranch, yb);
  const out: TaisuiKind[] = [];
  if (zodiacBranch === yb) out.push("值");
  if (rels.includes("相沖")) out.push("沖");
  if (rels.includes("相刑") || rels.includes("自刑")) out.push("刑");
  if (rels.includes("相害")) out.push("害");
  if (rels.includes("相破")) out.push("破");
  return out;
}
/** every 生肖 of the year, by kind */
export function yearTable(year: number): Record<TaisuiKind, Zodiac[]> {
  const t: Record<TaisuiKind, Zodiac[]> = { 值: [], 沖: [], 刑: [], 害: [], 破: [] };
  for (const z of ZODIACS) for (const k of taisuiOf(z.branch, year)) t[k].push(z);
  return t;
}

/** what each kind means, in our own plain words — a pace to keep, never danger */
export const KIND_WORDS: Record<TaisuiKind, { name: string; plain: string }> = {
  值: { name: "值太歲（本命年）", plain: "生肖和這一年同一個地支。傳統說法是這一年的變動、責任都比較集中在自己身上，適合盤點、打底，做事多留一步確認。" },
  沖: { name: "沖太歲", plain: "生肖和這一年的地支相對。傳統說法是這一年動得多：搬家、換工作、關係變化較常見，節奏會比平常快。" },
  刑: { name: "刑太歲", plain: "生肖和這一年的地支相刑。傳統說法是容易有小摩擦、口角或計畫要改第二版，說話做事放慢一點。" },
  害: { name: "害太歲", plain: "生肖和這一年的地支相害。傳統說法是人際上容易有誤會或暗地的不順，多溝通、少猜測。" },
  破: { name: "破太歲", plain: "生肖和這一年的地支相破。傳統說法是計畫容易被打斷、要重來一部分，重要的事留點餘裕。" },
};

/** the 安太歲 guide — how people do it by custom (shared by every 生肖 page) */
export const GUIDE: { h: string; p: string }[] = [
  { h: "什麼時候安", p: "依習俗多在農曆新年後到元宵前後安太歲，很多宮廟從年前就開始受理登記；年底（多在農曆十二月送神前後）再「謝太歲」。各宮廟日期不同，以宮廟公告為準。" },
  { h: "去哪裡安", p: "許多供奉太歲星君的宮廟都有受理，常見是在大型廟宇的太歲殿或光明燈區；也有人回家鄉的廟、或常去的廟登記。可以先打電話或看宮廟網站，問清楚受理時間與方式。" },
  { h: "要帶什麼、填什麼", p: "通常要填姓名、農曆或國曆生日、地址；有的宮廟要本人到場，有的可以代辦或線上登記。供品依各宮廟規定，常見是鮮花、水果、餅乾，有些宮廟不需自備。" },
  { h: "大概多少錢", p: "安太歲多是一年一筆香油錢或燈資，各宮廟訂價不同，從數百元到上千元台幣都有；以宮廟公告的價格為準，不需要額外購買其他物品。" },
  { h: "自己在家怎麼拜", p: "沒辦法到廟裡的人，依習俗也有在家用紅紙寫上「本年太歲星君」貼在高處、初一十五上香的做法。心意到就好，不必為此花大錢。" },
  { h: "一定要安嗎", p: "這是習俗，不是規定。安了圖個心安；不安也不代表會出事。比起儀式，這一年把重要的事多確認一次、作息穩一點，更實在。" },
];
