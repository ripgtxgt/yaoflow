// server-side only (lib/l10n/server)
import UI_GEN from "../data/l10n/qianui.json";
import JA from "../data/l10n/qianja/ja.json";
import EN from "../data/l10n/qiangy/en.json";
import KO from "../data/l10n/qiangy/ko.json";
import FR from "../data/l10n/qiangy/fr.json";
import DE from "../data/l10n/qiangy/de.json";
import ES from "../data/l10n/qiangy/es.json";
import PT from "../data/l10n/qiangy/pt.json";
import type { Foreign, Generated } from "./l10n/core";
import { localize } from "./l10n/server";
import { allQian, qianByNum } from "./qian";

/**
 * 10-30 进度表 128 ⑤ (Neil 10-29: 籤類——日文おみくじ（淺草寺）、其他語言觀音籤翻譯) — the lot products in the seven other
 * languages, one set per market: Japanese readers draw and read the 淺草寺 hundred lots (the Sensō-ji おみくじ), everyone
 * else the 觀音一百籤 (the Guanyin oracle). The poem is shown as printed; the plain reading and what the lot says for love
 * and work are translated (scripts/l10n `qianja` / `qiangy`) and, as on the Chinese pages (Neil 10-13: 解籤一律付費), shown
 * to a reader with a Pass or a membership. The page words: `qianui`.
 */
export const marketSet = (l: Foreign) => (l === "ja" ? "sensoji" : "guanyin");
export const SET_NAME: Record<Foreign, string> = {
  ja: "浅草寺のおみくじ", en: "Guanyin oracle", ko: "관음 영첨", fr: "oracle de Guanyin", de: "Guanyin-Orakel", es: "oráculo de Guanyin", pt: "oráculo de Guanyin",
};
export const setCount = (l: Foreign) => allQian(marketSet(l)).length;

const UI = {
  set: {
    whereSensoji: "東京淺草寺（金龍山）的觀音籤，一百首五言漢詩。淺草寺的籤以「凶」多出名，籤上的話說得直，讀的時候看的是提醒和心態。",
    whereGuanyin: "觀音一百籤，是台灣艋舺龍山寺等觀音廟常見的籤，一百首七言詩。在華人社會的寺廟裡，求籤是把心裡的一件事帶到神前，抽一支籤，讀籤詩給的方向。",
  },
  lot: {
    metaTitle: "{set}第 {n} 籤：{t}｜籤詩與白話",
    metaDesc: "{set}第 {n} 籤「{t}」：籤詩原文，以及這支籤的白話、放在感情和工作上怎麼讀。",
    label: "{set} · 第 {n} 籤",
    h1: "第 {n} 籤：{t}",
    poemNote: "籤詩原文，照籤紙上印的。白話在下面。",
    readHead: "這支籤的白話與解讀",
    plainH: "籤詩在說什麼", overallH: "整體來看", loveH: "感情", workH: "工作", yiH: "現在適合", jiH: "先別",
    lockLead: "開一張通卡或會員，就能看這支籤的白話，以及放在感情、工作上怎麼讀。",
    lockLink: "看通卡與會員 →",
    loading: "讀取中…",
    castBtn: "為同一件事起一卦，看哪幾天有動靜 →",
    prev: "← 第 {n} 籤", next: "第 {n} 籤 →", all: "全部 {c} 籤",
    back: "解籤",
    boundary: "籤給的是方向和心態，不是吉凶判決，也不是預言。",
  },
  index: {
    metaTitle: "{set}全部 {c} 籤｜籤詩與白話",
    metaDesc: "{set}第 1 到 {c} 籤的籤詩，每一籤一頁：籤詩原文、白話，和放在感情、工作上怎麼讀。",
    h1: "{set}，全部 {c} 籤",
    draw: "線上求一支籤 →",
    have: "在廟裡抽到了？輸入籤號 →",
  },
  qiuqian: {
    metaTitle: "線上求籤｜先擲筊請示，抽一支{set}，再擲筊確認籤號",
    metaDesc: "照廟裡的順序線上求籤：寫下想問的一件事，擲筊請示，搖籤筒抽一支{set}，再擲筊確認籤號，然後看籤詩。免費，登入就能用。",
    title: "線上求籤",
    lead: "照廟裡的順序：想好一件事，擲筊請示，抽一支籤，再擲筊確認籤號。",
    templeSensoji: "淺草寺", templeGuanyin: "觀音廟",
    toJiaobei: "只想擲筊問一件事 →",
    fitYes: ["一件具體的事，想知道大方向和心態", "沒辦法去廟裡，或去之前先問一次"],
    fitNo: ["一次問好幾件事", "想知道事情落在哪幾天（那要起一卦）", "抽到不喜歡的籤就重抽"],
    how: ["寫下想問的一件事。", "擲筊請示可不可以抽；聖筊才抽。", "搖籤筒抽一支，再擲筊確認籤號。", "看籤詩；白話與感情、工作的讀法，通卡或會員可以看。"],
    free: "求籤和籤詩免費，登入就能用。",
    paid: "這支籤的白話，以及放在感情、工作上怎麼讀：通卡或會員。",
    boundary: ["線上求籤不取代到廟裡親手求籤。", "籤給方向；哪幾天會有動靜，要為同一件事起一卦。"],
  },
  today: {
    metaTitle: "今日一籤｜每天從{set}抽一支",
    metaDesc: "每天從{set}抽一支籤，整天固定不變。看今天的籤詩和籤題；白話與今日宜忌，通卡或會員可以看。免費。",
    title: "今日一籤",
    lead: "{date} · 每天從{set}抽一支。籤看的是大方向和心態；心裡那件事落在哪幾天，起一卦看日子。",
    yours: "今天你的籤",
    again: "今天的籤整天固定不變，明天再來抽。",
    fitYes: ["每天抽一支，看今天的大方向和心態"],
    fitNo: ["一件事落在哪幾天——起一卦看日子", "吉凶判決"],
    how: ["打開就是今天的一支，整天固定不變", "看籤詩與籤題", "每天回來抽一支"],
    free: "抽籤、籤詩與籤題。",
    paid: "這支籤的白話、放在感情和工作上怎麼讀、今日宜忌：通卡或會員。",
    boundary: "籤看的是方向和心態，不是吉凶判決；不談健康診斷、投資與法律。",
  },
  jieqian: {
    metaTitle: "解籤｜輸入籤號，看{set}的籤詩與白話",
    metaDesc: "在廟裡抽到了{set}？輸入籤號，看籤詩原文、白話，以及放在感情、工作上怎麼讀。",
    title: "解籤",
    leadSensoji: "在淺草寺抽到了觀音籤（おみくじ）？輸入籤號，看籤詩和它在說什麼。",
    leadGuanyin: "在觀音廟抽到了籤？輸入籤號，看籤詩和它在說什麼。",
    numLabel: "籤號（1–{c}）",
    go: "看這支籤 →",
    bad: "請輸入 1 到 {c} 的數字。",
    drawOnline: "還沒抽？線上求一支 →",
    browse: "看全部 {c} 籤 →",
    fitYes: ["在廟裡抽到了籤，想知道籤詩在說什麼", "想知道這支籤放在感情、工作上怎麼讀"],
    fitNo: ["想知道事情落在哪幾天——起一卦", "吉凶判決"],
    how: ["輸入籤號", "看籤詩原文", "通卡或會員看白話，以及放在感情、工作上怎麼讀"],
    free: "籤詩原文與籤題。",
    paid: "這支籤的白話，以及放在感情、工作上怎麼讀：通卡或會員。",
    boundary: "籤給的是方向和心態，不是吉凶判決；我們不代表任何寺廟。",
  },
};
export const QIAN_UI_HANT = UI;
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type QianUi = Widen<typeof UI>;
export const qianUi = (l: Foreign): QianUi => localize(UI as unknown as QianUi, UI_GEN as unknown as Generated, l);

type LotText = { title: string; plain: string; overall: string; love: string; work: string; ask_next: string; yi: string; ji: string };
const LOTS: Record<Foreign, Record<string, LotText>> = { ja: JA, en: EN, ko: KO, fr: FR, de: DE, es: ES, pt: PT } as unknown as Record<Foreign, Record<string, LotText>>;

export interface ForeignLot { num: number; set: string; poem: string[]; title: string }
/** the lot as anyone may see it: the poem and its title line */
export function foreignLot(l: Foreign, n: number): ForeignLot | null {
  const set = marketSet(l);
  const e = qianByNum(n, set);
  const t = LOTS[l]?.[String(n)] ?? (LOTS[l] as unknown as LotText[] | undefined)?.[n];
  if (!e || !t?.title) return null;
  return { num: n, set, poem: e.poem, title: t.title };
}
/** the reading (Pass or membership): the plain words, overall, love, work, what suits and what to hold off */
export function foreignReading(l: Foreign, n: number): LotText | null {
  const t = LOTS[l]?.[String(n)] ?? (LOTS[l] as unknown as LotText[] | undefined)?.[n];
  return t?.plain ? t : null;
}
export const lotPath = (l: Foreign, n: number) => `/${l}/qian/${marketSet(l)}/${n}`;
