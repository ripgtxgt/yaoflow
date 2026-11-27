import GEN from "@/data/l10n/hepan.json";
import { isForeign, type Foreign, type Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { DM_LINE, HOUSE_WORD, HP_CHAPTERS, HP_UI, THEME_LINE, THEME_TITLE } from "./facts";

/**
 * 10-30 进度表 128 ④ — the 合盤 in the seven other languages: every fixed word of the pages, the overview, the report
 * page, the share card and the letter, as one 繁體 tree (translated by scripts/l10n/translate.ts hepan →
 * data/l10n/hepan.json). The Chinese pages keep building their words in facts.ts as before; a page in another language
 * gets this tree flattened (hepanT) and builds the facts' words from the templates below with that language's names
 * (lib/mingli/hepan/text-in.ts).
 */

/** the facts and the overview as templates — the Chinese page writes them inline in facts.ts */
const FOREIGN = {
  you: "你", taName: "對方", pairHead: "你 × 對方", metaTitle: "合盤：八字、紫微、星盤看兩個人",
  metaDesc: "兩個人的生辰放在一起看：八字、紫微、星盤三套合看相處的節奏、容易卡住的地方和各自要讓的一步。合盤報告單買，會員 8 折。",
  inviteMeta: "有人邀請你一起合盤", qaTitle: "答你的問題", yearNoteF: "今年的日期都是國曆（公曆）。八字的流年從立春（約 2 月 4 日）算起。",
  // a fact of the pair
  f_dm_same: "你的日主{a}和 TA 的日主{b}屬同一個五行（{e}）",
  f_dm_aFeedsB: "你的日主{a}生 TA 的日主{b}", f_dm_bFeedsA: "TA 的日主{b}生你的日主{a}",
  f_dm_aCurbsB: "你的日主{a}制 TA 的日主{b}", f_dm_bCurbsA: "TA 的日主{b}制你的日主{a}",
  f_dayStem: "日柱天干：你的{a}、TA 的{b}，{r}", f_dayBranch: "日支（夫妻宮）：你的{a}、TA 的{b}，{r}", f_zodiac: "生肖：你屬{a}、TA 屬{b}，{r}",
  f_spouseA: "你的配偶星是{e}（{t}），TA 的日主{dm}正是{e}，對你來說是{t2}",
  f_spouseB: "TA 的配偶星是{e}（{t}），你的日主{dm}正是{e}，對 TA 來說是{t2}",
  f_feedA_fav: "TA 八字裡最旺的是{e}，正是你的喜用五行（你喜用{fav}）", f_feedA_avoid: "TA 八字裡最旺的是{e}，正是你忌的五行",
  f_feedB_fav: "你八字裡最旺的是{e}，正是 TA 的喜用五行（TA 喜用{fav}）", f_feedB_avoid: "你八字裡最旺的是{e}，正是 TA 忌的五行",
  f_palaceA: "TA 的生肖{z}與你的日支{d}（夫妻宮）{r}", f_palaceB: "你的生肖{z}與 TA 的日支{d}（夫妻宮）{r}",
  f_zwSpouseA: "你的夫妻宮：{s1}；TA 的命宮：{s2}——{link}", f_zwSpouseB: "TA 的夫妻宮：{s1}；你的命宮：{s2}——{link}",
  f_zwShared: "同有{s}", f_zwGroup: "同屬{g}一系", f_zwEmpty: "沒有主星", f_zwBorrowed: "借對宮",
  f_zwMutA: "TA 的生年{m}（{s}）疊到你的{p}", f_zwMutB: "你的生年{m}（{s}）疊到 TA 的{p}",
  f_zwSoul: "你的命宮在{a}、TA 的命宮在{b}：{r}", soul_same: "落在同一個宮位", soul_opp: "互為對宮", soul_tri: "三合相連",
  f_syn: "你的{p}與 TA 的{q}成{asp}（{o}°）", f_satA: "你的土星與 TA 的{q}成{asp}（{o}°）", f_satB: "TA 的土星與你的{q}成{asp}（{o}°）",
  f_el: "{p}：你是{a}象、TA 是{b}象（{r}）", el_same: "同元素", el_ok: "相容", el_diff: "相異",
  f_houseA: "TA 的{p}落在你的第 {n} 宮（{w}）", f_houseB: "你的{p}落在 TA 的第 {n} 宮（{w}）",
  // a relation between two stems or branches
  r_he: "相合（合{e}）", r_chong: "相沖", r_liuhe: "六合", r_banhe: "半合（{g}）", r_xing: "相刑", r_hai: "相害", r_po: "相破", r_same: "同支", r_self: "自刑",
  sys_bazi: "八字", sys_ziwei: "紫微", sys_astro: "星盤",
  // the free overview
  ov_zodiac: "你屬{za}、日柱{pa}；TA 屬{zb}、日柱{pb}。", ov_relNone: "生肖和日柱之間沒有明顯的合沖，相處的味道要從其他地方看。",
  ov_relZodiac: "生肖{r}", ov_relStem: "日柱天干{r}", ov_relBranch: "日支{r}",
  ov_sun: "太陽：你{a}、TA {b}", ov_moon: "月亮：你{a}、TA {b}", ov_venus: "金星：你{a}、TA {b}", ov_or: "{a}或{b}",
  ov_top: "最緊的一組：你的{p}與 TA 的{q}成{asp}。",
  // the report page: the two people side by side, this year's facts
  row_zodiacV: "屬{z}・{p}",
  y_stem: "流年天干{s}與日干{d}{r}", y_branchSame: "流年地支{b}與日支{d}相同（同一個主題被放大）", y_branch: "流年地支{b}與日支{d}（夫妻宮）{r}",
  y_benming: "今年是{z}年，正逢本命年", y_zodiac: "流年地支{b}與生肖{z}{r}", y_fav: "流年天干{s}屬{e}，是喜用五行", y_avoid: "流年天干{s}屬{e}，偏忌的一邊",
  y_zwMut: "今年{m}（{s}）在{p}", y_transit: "流年{p}與本命{q}成{asp}", y_year: "{gz}年",
  // the share card
  card_lead: "我 × 對方", card_sub: "八字・紫微・星盤 三套合看", card_ask: "兩個人怎麼相處？", card_scan: "掃碼免費合盤，八字、紫微、星盤三套一起看",
  card_dm_same: "同屬{a}", card_dm_aFeedsB: "我的{a}生對方的{b}", card_dm_bFeedsA: "對方的{b}生我的{a}", card_dm_aCurbsB: "我的{a}制對方的{b}", card_dm_bCurbsA: "對方的{b}制我的{a}",
  card_zodiac: "生肖", card_pillar: "日柱", card_dmLabel: "日主",
  // the report page: its title, and the form that asks again in chapter 10
  metaReport: "你們的合盤報告",
  reaskGo: "送出，重寫這一章", reaskGoing: "正在寫…", reaskErr: "暫時沒辦法送出，請稍後再試。", reaskLogin: "請先登入買下這份報告的帳號。",
};

const { productNameHans: _hans, ...UI } = HP_UI;
export const HEPAN_HANT = {
  ui: { ...UI, ...FOREIGN },
  theme: THEME_TITLE,
  line: THEME_LINE,
  dm: DM_LINE,
  ch: Object.fromEntries(HP_CHAPTERS.map((c) => [c.key, c.title])) as Record<string, string>,
  house: Object.fromEntries(Object.entries(HOUSE_WORD).map(([k, v]) => [`h${k}`, v])) as Record<string, string>,
  mail: { subject: "你們的合盤報告寫好了", title: "合盤報告", body: "你和 TA 的合盤報告已經寫好了：兩個人的底色、吸引、相處節奏、摩擦與怎麼接、溝通、生活、長期功課和今年的互動都在裡面，之後也能隨時從這封信回去看。", button: "打開合盤報告", foot: "有問題直接回覆這封信。" },
};
type Tree = typeof HEPAN_HANT;
const memo = new Map<string, Record<string, string>>();
/**
 * one language's words, flat: the page words under their own keys, then theme_<key>, line_<key>_<順|磨|混|中>,
 * dm_<rel>, ch_<chapter>, house_<n>, mail_<field> — what the client components and the card read
 */
export function hepanT(l: Foreign): Record<string, string> {
  const hit = memo.get(l);
  if (hit) return hit;
  const t = localize(HEPAN_HANT as unknown as Tree, GEN as unknown as Generated, l) as Tree;
  const out: Record<string, string> = { ...(t.ui as Record<string, string>) };
  out.ta = out.taName ?? ""; // the Chinese pages' 「TA」 is said as the language's word for the other person

  for (const [k, v] of Object.entries(t.theme)) out[`theme_${k}`] = v;
  for (const [k, m] of Object.entries(t.line)) for (const [tone, v] of Object.entries(m as Record<string, string>)) out[`line_${k}_${tone}`] = v;
  for (const [k, v] of Object.entries(t.dm)) out[`dm_${k}`] = v;
  for (const [k, v] of Object.entries(t.ch)) out[`ch_${k}`] = v;
  for (const [k, v] of Object.entries(t.house)) out[`house_${k.slice(1)}`] = v;
  for (const [k, v] of Object.entries(t.mail)) out[`mail_${k}`] = v;
  memo.set(l, out);
  return out;
}

/** the free page's words for any open language: the generated ones abroad, the Chinese ones (converted for 简体) at home */
export function hepanUiFor(l: string): Record<string, string> {
  if (isForeign(l)) return hepanT(l);
  return Object.fromEntries(Object.entries(HP_UI).map(([k, v]) => [k, loc(v, l as HlLocale)])) as Record<string, string>;
}
