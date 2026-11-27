// server-side only (lib/hant): the words are built on the server and handed to the page as plain strings
import { toHans } from "./hant";
import TRIGRAM_PLACES from "../data/xunwu-places.json";
import GEN from "../data/l10n/xunwu.json";
import { isForeign, type Generated } from "./l10n/core";
import { localize } from "./l10n/server";
import { MARKETS } from "./xunwu-markets";

/**
 * 10-29 进度表 127 尋物 — every word the 「東西不見了？」 page and its card show, in Taiwan Traditional. The simplified page
 * runs them through hans(); a Hong Kong reader gets 「唔見咗嘢」「搵返」 in the title and the lead only (进度表 127 网址与入口).
 * 口径: no 準 (the FAQ question quotes how readers search), no 一定找得到, no 神明, no 找不回來, never the word AI.
 */
export type XwCat = "doc" | "wallet" | "keys" | "phone" | "jewelry" | "clothes" | "other";
export type XwPlace = "home" | "out" | "unsure";
export type XwAgo = "today" | "days" | "long";
export type XwRegion = "tw" | "hk" | "cn";
export type XwRel = "same" | "yongShengTi" | "tiKeYong" | "tiShengYong" | "yongKeTi";
export type XwTier = "easy" | "medium" | "hard";

export const CATS: readonly XwCat[] = ["doc", "wallet", "keys", "phone", "jewelry", "clothes", "other"];
export const PLACES: readonly XwPlace[] = ["home", "out", "unsure"];
export const AGOS: readonly XwAgo[] = ["today", "days", "long"];
export const isCat = (x: unknown): x is XwCat => typeof x === "string" && (CATS as readonly string[]).includes(x);
export const isPlace = (x: unknown): x is XwPlace => typeof x === "string" && (PLACES as readonly string[]).includes(x);
export const isAgo = (x: unknown): x is XwAgo => typeof x === "string" && (AGOS as readonly string[]).includes(x);

export const CAT_LABEL: Record<XwCat, string> = { doc: "證件文書", wallet: "錢包現金卡片", keys: "鑰匙", phone: "手機與 3C", jewelry: "首飾", clothes: "衣物包包", other: "其他物品" };
/** the thing as it stands in the 六爻 question 「我的{…}找得回來嗎？」 */
const CAT_IN_Q: Record<XwCat, string> = { doc: "證件", wallet: "錢包", keys: "鑰匙", phone: "手機", jewelry: "首飾", clothes: "包包或衣物", other: "東西" };
export const PLACE_LABEL: Record<XwPlace, string> = { home: "在家裡", out: "在外面", unsure: "不確定" };
export const AGO_LABEL: Record<XwAgo, string> = { today: "今天", days: "這幾天", long: "更久" };
const PLACE_IN_Q: Record<XwPlace, string> = { home: "最後是在家裡", out: "最後是在外面", unsure: "不確定在哪裡掉的" };
const AGO_IN_Q: Record<XwAgo, string> = { today: "今天不見的", days: "這幾天不見的", long: "不見一陣子了" };

/** 「用六爻細看」 carries this into the cast (进度表 127 接现有产品: 「我的{類別}找得回來嗎？在哪裡？」＋②③) — the reader's own name for it never leaves the browser */
export const castQuestion = (cat: XwCat, place: XwPlace, ago: XwAgo) => `我的${CAT_IN_Q[cat]}找得回來嗎？在哪裡？（${PLACE_IN_Q[place]}，${AGO_IN_Q[ago]}）`;

/** the five 體用 by 卷二〈失物占第十五〉, and the three bands they fall in */
export const TIER_OF: Record<XwRel, XwTier> = { same: "easy", yongShengTi: "easy", tiKeYong: "medium", tiShengYong: "hard", yongKeTi: "hard" };
export const TIER_LABEL: Record<XwTier, string> = { easy: "比較容易找到", medium: "找得到，但要花點時間", hard: "不容易自己出現" };
const HARD_LINE = "別只等它出現——光靠翻找不容易，先把下面的實際動作做完，再慢慢找。";
export const REL_TEXT: Record<XwRel, { name: string; line: string }> = {
  same: { name: "比和", line: "多半沒真的丟，就在常放的地方附近。" },
  yongShengTi: { name: "用生體", line: "多半很快會出現。" },
  tiKeYong: { name: "體克用", line: "要花點時間，別太早放棄。" },
  tiShengYong: { name: "體生用", line: HARD_LINE },
  yongKeTi: { name: "用克體", line: HARD_LINE },
};

export const TRIGRAM_ZH = { qian: "乾", dui: "兌", li: "離", zhen: "震", xun: "巽", kan: "坎", gen: "艮", kun: "坤" } as const;
export const EL_ZH = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" } as const;
/** compass order for the card's 八方 (北 at the top) */
export const DIRS = ["北", "東北", "東", "東南", "南", "西南", "西", "西北"] as const;
export const MOVE_ZH = ["", "初爻", "第二爻", "第三爻", "第四爻", "第五爻", "上爻"] as const;
export const BRANCH_ZH = "子丑寅卯辰巳午未申酉戌亥";

/** 〈失物占〉 itself — shown whole, with the plain words, on the lower half of the page */
export const SHIWU_ORIG = "占失物，以體為主，用為失物。體克用，可尋，遲得；用克體，不可尋。體生用，物難見；用生體，物易尋。體用比和，物不失矣。又以變卦為失物所在。";
export const SHIWU_SOURCE = "《梅花易數》卷二〈失物占第十五〉";
export const SHIWU_PLAIN: string[] = [
  "起出來的卦分上下兩半。有動爻的那一半叫「用」，代表那件東西；另一半叫「體」，代表你。",
  "兩半的五行怎麼生克，看找回的機會：用生體，比較容易找到；體用五行相同（比和），多半沒真的丟；體克用，找得到但要花點時間；體生用、用克體，東西不容易自己出現，要先做實際動作。",
  "用的那一半，動爻一變，變出來的卦看東西在哪個方向、哪一類地方。",
];

// ---- 实际行动清单 (进度表 127): 證件、錢包卡片、手機 go above the card; the rest below it ----

export interface XwBlock { h: string; items: string[] }

const TRANSIT: Record<XwRegion, string> = {
  tw: "打電話問最後去過的店家；搭過公車、捷運、計程車的，問失物招領。",
  hk: "打電話問最後去過的店舖；搭過巴士、港鐵、的士的，問失物招領。",
  cn: "打電話問最後去過的店家；坐過公交、地鐵、出租車的，問失物招領。",
};
const POLICE: Record<XwRegion, string> = {
  tw: "貴重的東西，或懷疑被偷：到附近派出所報案。",
  hk: "貴重的東西，或懷疑被偷：到附近警署報案。",
  cn: "貴重的東西，或懷疑被偷：到附近派出所報警。",
};
const commonItems = (r: XwRegion) => [
  "回想最後一次確定它還在、用到它的時間和地點，從那裡往回推。",
  "沿原路再走一次：常放的地方附近、口袋、包包夾層、座位縫都看一下。",
  TRANSIT[r],
];

/**
 * 證件 by the issuing office's own page (TW ris.gov.tw 身分證掛失 Q12; HK immd.gov.hk 補領已遺失身份證). Telephone numbers
 * only where the official page gives them (1996 內政服務熱線); none for HK — the office list has them, the card does not.
 */
const DOC: Record<XwRegion, string[]> = {
  tw: [
    "身分證：到任何一個戶政事務所，或打 1996 內政服務熱線，也可以在內政部戶政司網站線上掛失；掛失後本人到戶政事務所補發。",
    "健保卡、駕照、護照等其他證件，到各自發證單位的官網看掛失方式。",
  ],
  hk: [
    "香港身份證：發現遺失 14 天內，親身到任何一間人事登記辦事處報失並申請補領，不用預約，一般也不需要警方證明。報失後舊證即時失效，之後找回要交回人事登記辦事處或警署。",
    "護照、駕駛執照等其他證件，到各自簽發部門的官網看報失方式。",
  ],
  cn: [
    "身份證件先到發證機關掛失、補辦；各地辦法不同，以當地官方說明為準。",
    "護照、駕照等其他證件，到各自發證部門的官網看掛失方式。",
  ],
};
const WALLET: Record<XwRegion, string[]> = {
  tw: ["信用卡、提款卡：先打給發卡銀行停卡，電話在銀行 App 或官網上找；很多銀行的 App 也能直接把卡片暫停使用。", "錢包裡有身分證、駕照的，也要一起掛失。", "記名的悠遊卡、一卡通，可以向發卡公司掛失。"],
  hk: ["信用卡、提款卡：先打給發卡銀行停卡，電話在銀行 App 或官網上找；很多銀行的 App 也能直接把卡片暫停使用。", "錢包裡有身份證、駕駛執照的，也要一起報失。", "個人八達通可以向八達通公司報失。"],
  cn: ["信用卡、銀行卡：先打給發卡銀行掛失，電話在銀行 App 或官網上找；很多銀行的 App 也能直接把卡片凍結。", "錢包裡有身份證、駕照的，也要一起掛失。"],
};
const PHONE: Record<XwRegion, string[]> = {
  tw: ["iPhone、iPad：用另一台蘋果裝置的「尋找」App，或在電腦登入 icloud.com/find，可以看位置、播放聲音、標示為遺失。", "Android 手機：在電腦或別的手機打開 google.com/android/find（「尋找我的裝置」），可以看位置、響鈴、鎖定。", "其他品牌：用手機帳號的尋找裝置功能（各品牌名稱略有不同）。", "手機門號先打給電信公司暫停，避免被盜用。"],
  hk: ["iPhone、iPad：用另一部蘋果裝置的「尋找」App，或在電腦登入 icloud.com/find，可以看位置、播放聲音、標示為遺失。", "Android 手機：在電腦或另一部手機打開 google.com/android/find（「尋找我的裝置」），可以看位置、響鈴、鎖定。", "其他品牌：用手機帳號的尋找裝置功能（各品牌名稱略有不同）。", "電話號碼先打給電訊商暫停，避免被盜用。"],
  cn: ["iPhone、iPad：用另一台蘋果設備的「查找」App，或在電腦登入 icloud.com/find，可以看位置、播放聲音、標記為丟失。", "華為、小米等手機：登入手機帳號的「查找設備」。", "手機號先打給運營商掛失，避免被盜用。"],
};
const KEYS: Record<XwRegion, string> = {
  tw: "門禁卡、磁扣先請管理室停用；鑰匙上掛著地址或車牌的，考慮換鎖。",
  hk: "門禁卡、住戶卡先請管理處停用；鑰匙上掛著地址或車牌的，考慮換鎖。",
  cn: "門禁卡先請物業停用；鑰匙上掛著地址或車牌的，考慮換鎖。",
};
const URGENT_HEAD: Partial<Record<XwCat, string>> = { doc: "證件先掛失，再慢慢找", wallet: "卡片先停用", phone: "先用「尋找」定位、鎖定" };

/** what to do, for this thing and this reader's place: the urgent block (證件／錢包卡片／手機) and the rest */
export function actionsFor(cat: XwCat, region: XwRegion): { urgent: XwBlock | null; rest: XwBlock } {
  const urgentItems = cat === "doc" ? DOC[region] : cat === "wallet" ? WALLET[region] : cat === "phone" ? PHONE[region] : null;
  return {
    urgent: urgentItems ? { h: URGENT_HEAD[cat]!, items: urgentItems } : null,
    rest: { h: "實際動作先做", items: [...commonItems(region), ...(cat === "keys" ? [KEYS[region]] : []), POLICE[region]] },
  };
}

/** the lower half's 「東西不見了先做這幾件事」 — the same lists, one line each for the three urgent kinds */
export function firstSteps(region: XwRegion): string[] {
  const doc = { tw: "證件先掛失：身分證到任何一個戶政事務所、打 1996，或上內政部戶政司網站。", hk: "證件先報失：香港身份證在 14 天內親身到任何一間人事登記辦事處報失補領。", cn: "證件先到發證機關掛失，各地辦法以當地官方說明為準。" }[region];
  const card = region === "cn" ? "信用卡、銀行卡先打給發卡銀行掛失。" : "信用卡、提款卡先打給發卡銀行停卡。";
  const phone = region === "cn" ? "手機用「查找」（iPhone）或手機帳號的「查找設備」定位、鎖定。" : "手機用「尋找」（iPhone）或「尋找我的裝置」（Android）定位、鎖定。";
  return [...commonItems(region), doc, card, phone, POLICE[region]];
}

// ---- the page ----

export const PAGE = {
  title: "東西不見了？",
  titleHk: "唔見咗嘢？",
  lead: "點三下、擲三顆骰子，看先往哪個方向、哪一類地方找。不用登入，你填的東西只存在這台裝置。",
  leadHk: "點三下、擲三顆骰子，看先往哪個方向、哪一類地方搵返。不用登入，你填的東西只存在這台裝置。",
  metaTitle: "東西不見了？擲三顆骰子，看往哪個方向找｜線上尋物",
  metaDesc: "免費線上尋物：點三下、擲三顆骰子，照梅花易數〈失物占〉看找回的機會、先往哪個方向、哪一類地方找，附證件掛失、銀行停卡、手機定位的實際步驟。不用登入。",
  fitYes: ["證件、錢包、鑰匙、手機、首飾、包包這類東西", "記得大概最後在家裡還是在外面", "想先有個方向，再動手找"],
  fitNo: ["找人——請直接報警", "找寵物（之後會有專門的版本）", "同一件東西一直重擲"],
  how: ["點選丟了什麼、最後在哪、多久了；東西的名字可以不填。", "擲三顆骰子：點數總和配上現在的時辰，照梅花易數起一卦。", "看找回的機會、往哪個方向、先找哪一類地方，再照實際步驟做。"],
  free: ["全部免費，不用登入。", "想知道大概哪幾天、有沒有被移動，可以接著用六爻細看（要登入）。"],
  boundary: ["這是傳統〈失物占〉的看法，不保證找得到；實際動作先做。", "同一件東西，24 小時內看第一次的結果。", "證件、卡片、手機先掛失、停卡、定位，再慢慢找。"],
  firstHead: "東西不見了先做這幾件事",
  origHead: "〈失物占〉原文與白話",
  trigramHead: "八個卦各指哪個方向、哪一類地方",
  homeLabel: "家中",
  outLabel: "在外",
  howWeHead: "我們怎麼看",
  howWe: [
    "點數總和當作「數」，照《梅花易數》卷一〈聲音占例〉〈物數占例〉：上卦＝總和除以 8 的餘數（整除算 8）；下卦＝總和加時辰數，除以 8 的餘數；動爻＝總和加時辰數，除以 6 的餘數（整除算 6）。",
    "卦數照卷一〈周易卦數〉：乾 1、兌 2、離 3、震 4、巽 5、坎 6、艮 7、坤 8。時辰照你這台裝置的時間：子時（23:00–00:59）算 1、丑時 2……亥時 12。",
    "五行照卷一〈八宮所屬五行〉：乾兌屬金、坤艮屬土、震巽屬木、坎屬水、離屬火。卦氣旺衰這一版不算。",
    "〈失物占〉沒有說哪幾天找到，這裡也不另外算日子；要看日子，用六爻細看。",
    "六爻細看裡，證件、文件、衣物包包看「父母」；錢包、首飾、鑰匙看「妻財」；手機、電腦這類 3C 古書沒有寫到，我們照器物的看法歸「妻財」。",
    "找人、找寵物不在這裡看：找人請直接報警；找寵物的版本之後會上。",
  ],
  faq: [
    { q: "線上尋物準不準？", a: "不保證。這是傳統〈失物占〉的看法，用來決定先往哪裡找、先找哪一類地方；證件、卡片、手機請先掛失、停卡、定位，再慢慢找。" },
    { q: "為什麼是擲骰子？", a: "梅花易數可以「以數起卦」：一個數字，加上起卦當下的時辰，就能起出一卦。三顆骰子的點數總和就是這個數，再配上你這邊的時辰，決定上下卦和動爻。" },
    { q: "找不到可以再擲嗎？", a: "同一件東西，24 小時內再擲，看到的是第一次的結果——同一件事接受第一次的結果。還沒找到，就照實際步驟再做一輪；想看大概哪幾天、有沒有被移動，可以用六爻細看。" },
    { q: "為什麼要選「最後在哪」？", a: "方向以最後見到它的地方為中心。在家裡，就看家中那一版的地方；在外面，看外面那一版；不確定，兩種都列出來，家中在前。" },
    { q: "我填的東西會被存起來嗎？", a: "東西的名字只存在這台裝置，不會送出去。我們只記下類別、擲出的點數和結果，用來統計這個頁面有多少人用、多少人找到。" },
  ],
} as const;

export const UI = {
  stepCat: "丟了什麼？",
  stepPlace: "最後在哪裡？",
  stepAgo: "多久了？",
  catNote: "找人請直接報警；找寵物的版本之後上。",
  nameLabel: "東西的名字（可以不填，只存在這台裝置）",
  namePh: "例：藍色錢包",
  roll: "擲骰子",
  rolling: "擲……",
  needPick: "三個都點選了，才能擲。",
  privacy: "不用登入，你填的東西只存在這台裝置。",
  same: "同一件事接受第一次的結果——這是第一次擲出來的。",
  limitDay: "今天已經擲了很多次了。先照實際步驟找找看，明天再來。",
  limitFast: "擲得太快了，稍等一下再試。",
  failed: "沒有擲成功，請再試一次。",
  diceLine: "{a}＋{b}＋{c}＝{sum}，{hour}",
  dirHead: "先往哪個方向找",
  dirLine: "以最後見到它的地方為中心，往「{dir}」找。",
  center: "最後見到它的地方",
  centerNote: "方向以你最後見到它的地方為中心，不是你現在站的位置。",
  placeHead: "先找哪一類地方",
  homeLabel: "家中",
  outLabel: "在外",
  urgentHead: "先做這件事",
  toCast: "用六爻細看：大概哪幾天、有沒有被移動 →",
  toCastNote: "要登入。",
  guaLine: "這一卦是〈{hex}〉，動{move}；變出〈{changed}〉。",
  foot: "這是傳統〈失物占〉的看法，實際動作先做。",
  again: "換一件東西",
  backAsk: "上次找的{x}，找到了沒？",
  backFound: "找到了",
  backNot: "還沒",
  backThanks: "太好了，東西回來就好。",
  backNotLead: "還沒找到的話，先把這幾件事做完：",
  backClose: "關閉",
  // 10-29 进度表 128: the punctuation around the pieces, so each language sets its own (「」, “”, « », „“; ：or :)
  urgentLine: "{head}：{what}",
  quote: "「{q}」",
  labelLine: "{label}：{text}",
  sourceLine: "——{source}",
  trigramLine: "{name}·{dir}",
} as const;

// ---- 10-29 进度表 128: the same words in all nine languages (lib/l10n) ----

/** the 「為什麼」 line under the band, as templates — {U}/{L} the halves, {Y} the thing's, {T} yours, {ey}/{et} their elements */
export const WHY = {
  headSame: "上下卦都是{U}，動在{move}：有動爻的那個{Y}代表東西（用），另一個代表你（體）。",
  head: "上卦{U}、下卦{L}，動在{move}：有動爻的{Y}代表東西（用），{T}代表你（體）。",
  same: "兩個都屬{ey}，是「{name}」。",
  yongShengTi: "{Y}屬{ey}、{T}屬{et}，{ey}生{et}，是「{name}」。",
  tiKeYong: "{Y}屬{ey}、{T}屬{et}，{et}克{ey}，是「{name}」。",
  tiShengYong: "{Y}屬{ey}、{T}屬{et}，{et}生{ey}，是「{name}」。",
  yongKeTi: "{Y}屬{ey}、{T}屬{et}，{ey}克{et}，是「{name}」。",
} as const;

/** the page's words without the two Hong Kong lines (those stay 繁體, for Hong Kong readers only) */
const PAGE_ALL = Object.fromEntries(Object.entries(PAGE).filter(([k]) => k !== "titleHk" && k !== "leadHk")) as Omit<typeof PAGE, "titleHk" | "leadHk">;

/** every word the page, the card and the revisit card say — the 繁體 the other eight languages come from */
export const XW_HANT = {
  cat: CAT_LABEL, catInQ: CAT_IN_Q, place: PLACE_LABEL, placeInQ: PLACE_IN_Q, ago: AGO_LABEL, agoInQ: AGO_IN_Q,
  castQ: "我的{thing}找得回來嗎？在哪裡？（{place}，{ago}）",
  tier: TIER_LABEL,
  rel: REL_TEXT,
  trigram: TRIGRAM_ZH,
  element: EL_ZH,
  dirs: [...DIRS],
  move: [...MOVE_ZH],
  hour: BRANCH_ZH.split("").map((b) => `${b}時`),
  why: WHY,
  shiwu: { orig: SHIWU_ORIG, source: SHIWU_SOURCE, plain: SHIWU_PLAIN },
  // the eight trigrams only (the file also keeps a `_note` for us)
  places: Object.fromEntries(Object.entries(TRIGRAM_PLACES as Record<string, unknown>).filter(([k]) => !k.startsWith("_"))) as Record<string, { dir: string; orig: string; home: string; out: string }>,
  page: PAGE_ALL,
  ui: UI,
};
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type XwText = Widen<typeof XW_HANT>;

/** the words in the reader's language: 繁體, 简体 (乾 kept), or the generated translation */
export function xwText(locale: string): XwText {
  return localize(XW_HANT as unknown as XwText, GEN as unknown as Generated, locale, hans);
}

/** the practical steps for this thing: Taiwan / Hong Kong / mainland by region on Chinese pages, the reader's country elsewhere (lib/xunwu-markets.ts) */
export function actionsIn(cat: XwCat, locale: string, region: XwRegion): { urgent: XwBlock | null; rest: XwBlock } {
  if (!isForeign(locale)) return scriptAll(actionsFor(cat, region), locale);
  const m = MARKETS[locale];
  const items = cat === "doc" ? m.doc : cat === "wallet" ? m.wallet : cat === "phone" ? m.phone : null;
  return {
    urgent: items ? { h: m.urgentHead[cat as "doc" | "wallet" | "phone"], items: [...items] } : null,
    rest: { h: m.restHead, items: [...m.common, ...(cat === "keys" ? [m.keys] : []), m.police] },
  };
}
/** the lower half's 「東西不見了先做這幾件事」 */
export function firstStepsIn(locale: string, region: XwRegion): string[] {
  if (!isForeign(locale)) return scriptAll(firstSteps(region), locale);
  const m = MARKETS[locale];
  return [...m.common, m.first.doc, m.first.card, m.first.phone, m.police];
}

/** what the page's client part needs, in the reader's language */
export function xunwuPageUi(locale: string) {
  const t = xwText(locale);
  return {
    ui: { ...t.ui } as Record<string, string>,
    cats: CATS.map((c) => [c, t.cat[c]] as [string, string]),
    places: PLACES.map((p) => [p, t.place[p]] as [string, string]),
    agos: AGOS.map((a) => [a, t.ago[a]] as [string, string]),
    dirs: [...t.dirs],
    // the compass's own short labels (N, NE … outside Chinese)
    dirShort: isForeign(locale) ? [...MARKETS[locale].dirShort] : [...t.dirs],
  };
}
/** the revisit card's words (mounted on every page of an open language by the layout) */
export function xunwuBackUi(locale: string) {
  const t = xwText(locale);
  const u = t.ui;
  return {
    ui: { backAsk: u.backAsk, backFound: u.backFound, backNot: u.backNot, backThanks: u.backThanks, backNotLead: u.backNotLead, backClose: u.backClose, toCast: u.toCast } as Record<string, string>,
    cats: Object.fromEntries(CATS.map((c) => [c, t.cat[c]])) as Record<string, string>,
  };
}

/** 繁 → 简 for the simplified page, keeping 乾 the trigram (OpenCC would write 干) */
export function hans(s: string): string {
  return toHans(s.replace(/乾/g, "")).replace(//g, "乾");
}
/** a string in the reader's script (the Hong Kong wording is chosen by the caller, title and lead only) */
export const inScript = (s: string, locale: string) => (locale === "zh" ? hans(s) : s);
export function scriptAll<T>(v: T, locale: string): T {
  if (locale !== "zh") return v;
  const walk = (x: unknown): unknown => (typeof x === "string" ? hans(x) : Array.isArray(x) ? x.map(walk) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)])) : x);
  return walk(v) as T;
}
