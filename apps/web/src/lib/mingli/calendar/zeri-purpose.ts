import { matterBySlug, zeriDays, type Matter, type ZeriDay } from "./zeri";
import { loc } from "./content";
import type { HlLocale } from "./day";

/**
 * 10-29 进度表 123 擇日按用途: three pages readers search by name — 結婚 (/zeri/wedding), 搬家 (/zeri/move), 開市
 * (/zeri/opening) — each listing the next three months of days the almanac marks suitable, grouped by month. The title
 * follows the months shown (「2026 結婚好日子｜11月、12月、1月」), so it moves by itself each month. Members see the days
 * that 沖／刑 their own 日柱 (and, for 結婚, the partner's) crossed out — only which days, never the chart.
 */
export type PurposeSlug = "wedding" | "move" | "opening";
export interface Purpose {
  slug: PurposeSlug;
  /** the almanac matters whose days count (a day suits if any of them suits) */
  matters: string[];
  word: string;
  /** the reader's own search words for the title; {y} the year, {months} the months shown */
  title: string;
  desc: string;
  intro: string;
  tips: string[];
  faq: { q: string; a: string }[];
  pair: boolean;
  /** what to ask the 六爻 about, prefilled */
  ask: string;
}

export const PURPOSES: Record<PurposeSlug, Purpose> = {
  wedding: {
    slug: "wedding", matters: ["jiehun"], word: "結婚", pair: true,
    title: "{y} 結婚好日子｜{months}結婚吉日一覽",
    desc: "接下來三個月通書上宜嫁娶的日子，依月份列出，標出沖哪個生肖。會員可再按自己和另一半的八字，去掉沖、刑日柱的日子。",
    intro: "挑結婚日子，多數人先看通書上這天有沒有寫「嫁娶」，再避開沖到新人生肖的日子；很多家庭也會避開農曆七月。下面是接下來三個月宜嫁娶的日子，可以先圈出幾個，再和雙方家人、場地檔期一起對。",
    tips: ["先跟場地、婚紗、宴客餐廳確認檔期，再定日子。", "雙方家長若有習慣請的老師，可以把這份清單帶去參考。", "剖腹產擇日以醫師安排為準，不必為了日子更動醫療時程。"],
    faq: [
      { q: "結婚日子一定要看八字嗎？", a: "不一定。通書上寫宜嫁娶、又不沖新人生肖的日子，很多人就直接用了；想更細，可以再對照兩人的八字，避開沖、刑自己日柱的日子。" },
      { q: "登記和宴客要同一天嗎？", a: "不必。很多人登記選一個日子、宴客另選方便賓客的週末，兩個日子各自挑就好。" },
      { q: "農曆七月可以結婚嗎？", a: "台灣民間很多人會避開農曆七月辦喜事，這是習俗不是規定，看雙方家庭怎麼想。" },
    ],
    ask: "我們這個日子辦婚禮順不順？",
  },
  move: {
    slug: "move", matters: ["banjia", "ruzhai"], word: "搬家", pair: false,
    title: "{y} 搬家吉日｜{months}搬家、入厝好日子",
    desc: "接下來三個月通書上宜移徙、入宅的日子，依月份列出，標出沖哪個生肖。會員可再按自己的八字，去掉沖、刑日柱的日子。",
    intro: "搬家看日子，常看通書上這天有沒有寫「移徙」或「入宅」，再避開沖到家中主事者生肖的日子。下面列出接下來三個月合適的日子，先挑幾天，再和搬家公司、交屋時間一起對。",
    tips: ["先跟搬家公司確認檔期，熱門月份要提早訂。", "入厝當天可以先搬幾樣代表性的東西進門，其餘再慢慢搬。", "家裡有長輩的，先問問他們習慣怎麼拜。"],
    faq: [
      { q: "搬家和入厝要同一天嗎？", a: "不一定。很多人先挑一天「入厝」象徵性地進門，再另選方便的日子把東西搬完。" },
      { q: "租房子也要看日子嗎？", a: "看個人。想圖個安心，挑一個通書上適合、不沖自己生肖的日子就好；趕時間就以方便為先。" },
      { q: "日子跟交屋時間撞不上怎麼辦？", a: "把範圍放寬，或先挑一個合適的日子象徵性入厝，正式搬遷照實際安排。" },
    ],
    ask: "這次搬家順不順？",
  },
  opening: {
    slug: "opening", matters: ["kaishi"], word: "開市", pair: false,
    title: "{y} 開市吉日｜{months}開幕、開工好日子",
    desc: "接下來三個月通書上宜開市的日子，依月份列出，標出沖哪個生肖。會員可再按自己的八字，去掉沖、刑日柱的日子。",
    intro: "開店、開幕、新公司開市，常看通書上這天有沒有寫「開市」，再避開沖到負責人生肖的日子。下面列出接下來三個月合適的日子，可以和裝修進度、進貨、宣傳排程一起對。",
    tips: ["先把裝修、證照、進貨的時程排好，再從清單裡挑日子。", "開幕活動要約客人，週末的日子會比較方便。", "合夥開店的，以主要負責人的生肖為主。"],
    faq: [
      { q: "開市和開工有什麼不一樣？", a: "開市多指店面、生意開張；開工多指工程或新年第一天上班。查開工日子可以看擇日裡的「開工」。" },
      { q: "一定要在吉時開門嗎？", a: "看習慣。很多店家會挑一個好時辰拜拜、開門；沒有講究的，選方便的時間就好。" },
      { q: "網路商店也要挑日子嗎？", a: "看個人。想圖個好的開始，挑一個通書上適合的日子上線就好。" },
    ],
    ask: "這家店開幕後順不順？",
  },
};
export const PURPOSE_SLUGS = Object.keys(PURPOSES) as PurposeSlug[];

export interface PurposeMonth { ym: string; label: string; days: ZeriDay[] }
/** the next ~92 days that suit any of the purpose's matters, by month */
export function purposeDays(p: Purpose, fromYmd: string, locale: HlLocale): PurposeMonth[] {
  const byYmd = new Map<string, ZeriDay>();
  for (const slug of p.matters) {
    const m = matterBySlug(slug) as Matter | null;
    if (!m) continue;
    for (const d of zeriDays(m, fromYmd, 92, locale).days) if (!byYmd.has(d.ymd)) byYmd.set(d.ymd, d);
  }
  const months = new Map<string, ZeriDay[]>();
  for (const d of [...byYmd.values()].sort((a, b) => a.ymd.localeCompare(b.ymd))) {
    const ym = d.ymd.slice(0, 7);
    months.set(ym, [...(months.get(ym) ?? []), d]);
  }
  return [...months].map(([ym, days]) => ({ ym, label: `${+ym.slice(5)}月`, days }));
}

/** the title for the months shown: 「2026 結婚好日子｜11月、12月、1月結婚吉日一覽」 */
export function purposeTitle(p: Purpose, months: { ym: string; label: string }[], locale: HlLocale): string {
  // the three months can cross the new year: 「2026–2027」 then (searchers type either year)
  const y0 = months[0]?.ym.slice(0, 4) ?? "", y1 = months[Math.min(2, months.length - 1)]?.ym.slice(0, 4) ?? y0;
  const y = y1 && y1 !== y0 ? `${y0}–${y1}` : y0;
  const ms = months.slice(0, 3).map((m) => m.label).join("、");
  return loc(p.title.replace("{y}", y).replace("{months}", ms), locale);
}
