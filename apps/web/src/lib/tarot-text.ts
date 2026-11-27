// server-side only (lib/hant through lib/l10n/server): the words are built on the server and handed to the page
import CARDS from "../data/tarot-cards.json";
import GEN from "../data/l10n/tarot.json";
import { fmt, type Generated } from "./l10n/core";
import { localize } from "./l10n/server";

/**
 * 10-29 进度表 128 — 線上塔羅 in all nine languages. Every word the tarot pages, the card library, the result page and
 * the two letters say, in 繁體 (the source); 简体 converted, the seven other languages generated offline
 * (scripts/l10n/translate.ts tarot → data/l10n/tarot.json; the 78 meanings are lib/tarot-meaning-text.ts →
 * data/l10n/tarot-meanings.json, kept apart so the letters and the draw do not load the whole library).
 */
const UI = {
  qLabel: "想問的一件事",
  qPh: "例：我跟他現在卡在曖昧，這段關係接下來會往哪裡走？",
  qHint: "問題不會公開。",
  spread1: "一事一張",
  spread1Sub: "這件事現在怎樣",
  spread3: "三張",
  spread3Sub: "現在／卡住的地方／接下來",
  shuffleBtn: "洗牌",
  shuffling: "洗牌中……",
  soundOn: "聲音 開",
  soundOff: "聲音 關",
  pickN: "憑感覺點 {n} 張",
  pickLeft: "還要點 {n} 張",
  flipAll: "翻開",
  upright: "正位",
  reversed: "逆位",
  toResult: "看每張牌的意思 →",
  again: "這件事你已經抽過了，牌在這裡：",
  againOpen: "打開上次的牌 →",
  rephrase: "把問題改清楚",
  short: "多寫幾個字，寫清楚是哪一件事。",
  error: "這次沒抽成，稍後再試一次。",
  refuse_crisis: "這件事比牌重要。如果你正在難受，先找身邊信任的人說，或打 1925 安心專線（24 小時）。",
  refuse_health: "身體和懷孕的事，請問醫生。",
  refuse_money: "投資、賭博、彩券的輸贏，不用牌來問。",
  refuse_affair: "換個角度問吧：你自己接下來想怎麼做？",
  buyMember: "解這幾張牌 · 會員已含",
  buyPrice: "解這幾張牌 · {price}",
  buyGoing: "正在前往付款…",
  buyWriting: "正在寫…",
  buyError: "沒能打開付款頁，稍後再試一次。",
  buyList1: "照你的問題寫：這幾張牌放在你這件事上怎麼讀",
  buyList2: "每張牌在你這件事裡各說了什麼",
  buyList3: "一句現在可以留意或去做的事",
  buyList4: "含一次追問：讀完還有想不通的，再問一句",
  buyList5: "不給日期：哪幾天，要起一卦看",
  buyMemberNote: "會員已含，不另收費。",
  // 10-24 (Neil: 「会员是会员，通卡是通卡」): what a 通卡 holder sees instead
  buyPass: "解這幾張牌 · 通卡已含",
  buyPassNote: "通卡已含，不另收費。",
  buyNote: "寫好也會寄到付款時填的信箱。會員已含。點擊付款即表示你同意服務條款，並要求立即交付這份數位內容。",
  fuHead: "這份解讀含一次追問",
  fuSub: "對這幾張牌、這件事還有哪裡想不通，問一句。想問哪一天，牌不給日子，起一卦才看得到。",
  fuPh: "例：如果他一直沒消息，我要先主動嗎？",
  fuSend: "送出追問",
  fuGoing: "正在寫…",
  fuShort: "多寫幾個字，才答得到點上。",
  fuError: "這次沒寫出來，追問還在，稍後再送一次。",
  fuYou: "你追問的",
  fuCast: "帶著這件事起一卦，看哪幾天 →",
  rvHead: "過一陣子回來問你",
  rvSub: "選個時間，我們寫信問你後來怎樣了。",
  rvOutcome: "怎樣算有結果？（選填）",
  rvOutcomePh: "例：他主動約我見面",
  rvWhen: "什麼時候回來問你",
  rv14: "2 週",
  rv30: "1 個月",
  rv90: "3 個月",
  rvSave: "就這樣",
  rvSaved: "好，{date} 寄信到你付款時填的信箱問你。",
  rvChange: "改時間",
  rvNoMail: "付款時沒有留信箱，回訪信寄不出去。",
  // 10-22 进度表 89／90: the plan line, and a free spread's own address
  rvPlan: "你打算怎麼做？（選填，只給你自己看）", rvPlanPh: "例：先不主動，等他開口", rvPlanShow: "你當時打算：{p}",
  rvEmail: "寄到哪個信箱", rvMine: "只用來寄這一封，不寄廣告。", rvSavedFree: "好，{date} 寫信問你後來怎樣了。",
  rvFreeSub: "免費的也算。選個時間，我們寫信問你後來怎樣了；應了沒應，都記下來。",
  ansHead: "後來怎樣了？",
  ansCounted: "你的回答只算進應驗紀錄的全站件數，問題和內容都不公開。",
  ansSave: "送出",
  ansDone: "記下了：{a}。謝謝你回來告訴我們。",
  castBtn: "想知道哪幾天會有動靜？起一卦看日子 →",
};

const PAGE = {
  metaTitle: "線上塔羅牌占卜｜免費抽牌，看懂每張牌的意思",
  metaDesc: "免費線上塔羅：先寫下想問的一件事，洗牌、自己選牌、翻開，看每張牌正位逆位的意思。一事一張或三張（現在、卡住的地方、接下來）。78 張牌義，感情與工作分開寫。",
  title: "線上塔羅",
  lead: "寫下一件想問的事，洗牌，憑感覺選牌，翻開。每張牌的意思免費看；要把這幾張牌放在你這件事上讀，再決定。",
  notes: [
    { h: "同一件事，看第一次的牌", p: "重抽到喜歡的牌為止，牌就不再回答你的問題。想問別的事，換一件事寫清楚再抽。" },
    { h: "正位和逆位", p: "翻開時牌是倒過來的，就是逆位。逆位不是壞兆頭，說的是同一股力量被卡住、延後、轉向內心，或用得太過頭。" },
    { h: "塔羅不給日子", p: "塔羅適合看一件事現在的狀態、卡在哪裡、往哪裡走；它沒有推算時間的方法。想知道哪幾天會有動靜，用同一個問題起一卦看日子。" },
    { h: "牌面從哪裡來", p: "牌面據 1909–1910 年 Pamela Colman Smith 繪製的 Rider–Waite 原版（公有領域）。" },
  ],
  fitYes: ["一件事現在的狀態、卡在哪裡、往哪裡走", "感情、工作上一個具體的處境", "一事一張，或三張：現在、卡住的地方、接下來"],
  fitNo: ["想知道哪幾天會有動靜（那要起一卦）", "一次問好幾件事", "重抽到喜歡的牌為止"],
  how: ["寫下想問的一件事。", "洗牌，憑感覺選一張或三張。", "翻開，看每張牌正位或逆位的意思。", "要把這幾張牌放在你這件事上讀，再決定。"],
  free: "抽牌、每張牌本身的意思（正位、逆位、關鍵字）都免費，不用註冊。",
  paid: "把這幾張牌放在你這件事上讀的專屬解讀，含一次追問和到期回訪；一次輕解讀的價格，會員已含。",
  boundary: ["塔羅不給日子；想知道哪幾天會有動靜，用同一個問題起一卦。", "同一件事，看第一次的牌。"],
  disclaimer: "牌面據 1909–1910 年 Rider–Waite 原版（公有領域）。",
  allCards: "78 張牌的意思 →",
};

const LIBRARY = {
  metaTitle: "塔羅牌 78 張牌義｜正位逆位、感情與工作",
  metaDesc: "78 張塔羅牌的意思：大阿爾克那 22 張、權杖、聖杯、寶劍、錢幣各 14 張，每張分正位、逆位，感情與工作分開寫。",
  back: "線上塔羅",
  title: "78 張牌的意思",
  groups: { major: "大阿爾克那", wands: "權杖", cups: "聖杯", swords: "寶劍", pentacles: "錢幣" },
  drawOne: "寫下你的事，抽一次 →",
};

const CARD = {
  /** 「{name}（{en}）正位逆位意思：感情、工作｜線上塔羅」 — {name} is the card, 「…牌」 for a major */
  metaTitle: "{name}（{en}）正位逆位意思：感情、工作｜線上塔羅",
  majorName: "{name}牌",
  metaDesc: "{name}正位：{up}；逆位：{rev}。{overall}…",
  love: "感情",
  work: "工作",
  askNext: "想一想",
  major: "大阿爾克那 {roman}",
  minor: "小阿爾克那",
  keywordsLine: "{side}：{words}",
  draw: "寫下你的事，抽一張 →",
  revNote: "逆位不是壞兆頭：同一股力量被卡住、延後、轉向內心，或用得太過頭。塔羅不給日子，想知道哪幾天有動靜，起一卦。",
  faces: "牌面據 1910 年 Rider–Waite 原版（公有領域）。",
  preview: "預覽中：只有登入後台的瀏覽器看得到。",
};

const RESULT = {
  metaTitle: "你的塔羅牌",
  personalHead: "這幾張牌放在你這件事上",
  stepNow: "現在先做的一步",
  writing: "專屬你的解讀正在寫，大約半分鐘，寫好會直接出現在這裡，也會寄到你的信箱。",
  head3: "三張：現在／卡住的地方／接下來",
  head1: "一事一張",
  payHead: "把這幾張牌放在你這件事上讀",
  payLead: "上面是每張牌本身的意思。照你的問題，把牌放在感情或工作上、放在你現在的處境裡讀，寫成一份給你。",
  castHead: "塔羅看的是現在和方向；這件事哪幾天會有動靜，要起一卦看。",
  castLead: "問題已經幫你帶過去，不用重打。起卦不用錢，先看一句斷語，要日子再看深斷。",
  faces: "牌面據 1910 年 Rider–Waite 原版（公有領域）。",
  back: "線上塔羅",
  stickyBuy: "把這幾張牌放在你這件事上讀",
  stickyRevisit: "設定回訪",
  /** a card's heading: 「現在 · 戀人（逆位）」 */
  cardHead: "{pos} · {name}（{side}）",
  cardHeadNoPos: "{name}（{side}）",
  quote: "「{q}」",
  /** the cards carried into the cast page's line: 「戀人（逆位）、權杖三」 */
  castCard: "{name}（逆位）",
  castSep: "、",
};

const MAIL = {
  readySubject: "你的塔羅解讀寫好了",
  readyLead: "這幾張牌放在你這件事上的解讀已經寫好了，之後也能隨時從這封信回去看。",
  readyBtn: "打開我的塔羅解讀",
  readyMore: "讀完還有想不通的，可以再追問一句，已經含在這次裡；也可以選一個日子，到時我們寫信回來問你結果。",
  rvSubject: "上次抽的塔羅，後來怎樣了？",
  rvAsked: "你上次問的是：",
  rvOutcome: "你那時說，怎樣算有結果：{o}",
  rvPlan: "你當時打算：{p}",
  rvLead: "到了你選的日子。這件事現在怎樣了？點一下就好：",
  rvPage: "回到那次的牌 →",
  readyCast: "塔羅不給日子。想知道這件事哪幾天會有動靜，帶著同一個問題起一卦 →",
  foot: "有問題直接回覆這封信。",
  rvFoot: "你的回答只算進應驗紀錄的全站件數，問題和內容都不公開。",
};

export const TAROT_HANT = {
  ui: UI,
  positions: { one: ["這件事現在"], three: ["現在", "卡住的地方", "接下來"] },
  answers: { happened: "發生了", moving: "有動靜", nothing: "沒動靜", undecided: "還沒定" },
  kinds: { love: "感情", work: "工作與事業", overall: "其他" },
  cards: Object.fromEntries((CARDS as { id: string; zh: string }[]).map((c) => [c.id, c.zh])) as Record<string, string>,
  page: PAGE,
  library: LIBRARY,
  card: CARD,
  result: RESULT,
  mail: MAIL,
};
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type TarotText = Widen<typeof TAROT_HANT>;

export function tarotText(locale: string): TarotText {
  return localize(TAROT_HANT as unknown as TarotText, GEN as unknown as Generated, locale);
}

/** a card's name in the reader's language (the standard Rider–Waite name outside Chinese) */
export const cardName = (id: string, locale: string): string => tarotText(locale).cards[id] ?? id;

/** the spread's position labels in the reader's language */
export const positionsIn = (locale: string, spread: number): string[] => (spread === 3 ? tarotText(locale).positions.three : tarotText(locale).positions.one);

/** 「戀人（逆位）、權杖三」 — the cards on one line (the cast page's line, the letter's head) */
export function cardsLineIn(cards: { id: string; rev: boolean }[], locale: string): string {
  const t = tarotText(locale);
  const sep = t.result.castSep.trim() === "," ? ", " : t.result.castSep; // (a generated "," lost its space)
  return cards.map((x) => (x.rev ? fmt(t.result.castCard, { name: t.cards[x.id] ?? x.id }) : (t.cards[x.id] ?? x.id))).join(sep);
}
