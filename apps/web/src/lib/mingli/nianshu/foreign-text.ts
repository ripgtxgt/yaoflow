import GEN from "@/data/l10n/nianshu.json";
import type { Foreign, Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";

/**
 * 10-30 进度表 128 ④-5 — the 年書 outside Chinese: the product page, the 年書's own page, its two letters, the key-month
 * letter and the revisit line (繁體 here is the translator's source — the Chinese pages keep NS_UI and their own letters;
 * scripts/l10n/translate.ts nianshu). The year's local custom (Japanese 厄年, Korean 삼재) is written in those two
 * languages directly (local-custom.ts); the Chinese 太歲 chapter is not shown outside Chinese.
 * Server only (the product page hands the words to its client part as props).
 */
const UI = {
  head: "年書",
  lead: "同一年，用八字、紫微斗數和西洋星盤三套一起看：哪裡說法一致、哪裡不一樣，每個季節該推什麼、該慢什麼，再一個月一個月細看。",
  me: "我", pickMe: "選我的生辰", change: "換一份",
  needTime: "年書要有出生時間，請換一份有時間的生辰。", needGender: "這份生辰沒有填性別，請重新填一份。",
  insideHead: "書裡有什麼",
  inside: "三套合看這一年：主調、三套都指向的地方、說法不一樣的地方|四季節奏：全年最該把握和最該放慢的時段|五個領域合看：事業、財務節奏、感情、作息與身心、人際，加三個建議|八字篇：流年與大運，十二個節氣月逐月|紫微篇：流年四化與流年命宮，逐月細看|星盤篇：外行星過境、日月食與逆行，逐月細看|附一個你想問的問題，三套一起回答",
  year: "{y} · {gz}年（{a}年）", thisYear: "今年", nextYear: "明年",
  buy: "購買 {p}", memberOff: "會員 8 折", early: "早鳥價", earlyUntil: "早鳥價到 {d} 止", regular: "原價 {p}",
  test: "測試帳號：免費打開", going: "前往付款…", writing: "正在建立…", buyErr: "暫時沒辦法建立，請稍後再試。",
  ask: "想在年書裡問的一件事（選填）", askHint: "例如：今年適合換工作嗎？（200 字以內）",
  buyNote: "同一年只收一次錢；之後想問別的事，在年書裡直接再問。",
  disclaimer: "年書描述的是這一年的傾向和節奏，不替你下結論；不談健康、投資與法律。",
  // the 年書's own page
  back: "年書", kindLabel: "年書", kindSub: "八字、紫微斗數、西洋星盤三套合看",
  writingAll: "年書正在寫：先寫八字、紫微、星盤三篇，再寫三套合看的章節。全部大約五到八分鐘，寫好的會先出現，頁面會自己更新，寫完也會寄信給你。",
  writingChapter: "這一章正在寫……", waitingChapter: "等三篇寫好，這一章就會開始寫……", failedChapter: "這一章這次沒寫成，我們會補上，寫好會寄信通知你。",
  unpaidHead: "這份年書還沒付款", unpaidBody: "付款完成後，年書會直接寫在這一頁，也會寄到你的信箱。",
  chZong: "三套合看這一年", chTong: "三套都指向的地方", chYi: "說法不一樣的地方", chSeasons: "四季節奏", chPeak: "全年最該把握的時段", chSlow: "全年最該放慢的時段",
  chAreas: "五個領域合看", chJianyi: "給你的三個建議", chParts: "三篇細看", chQa: "答你的問題",
  career: "事業", money: "財務節奏", love: "感情", rhythm: "作息與身心", people: "人際",
  partOpen: "打開 →", partWriting: "正在寫", partKeyword: "關鍵詞",
  bazi: "八字篇", ziwei: "紫微篇", astro: "星盤篇",
  baziSub: "流年與大運，十二個節氣月逐月", ziweiSub: "流年四化與流年命宮，逐月細看", astroSub: "外行星過境、日月食與逆行，逐月細看",
  dateNote: "書裡的日期都是國曆。八字的一年從立春（2 月 4 日前後）算起，紫微的一年從農曆新年算起，星盤的一年從 1 月 1 日算起。",
  questionYou: "你問的是", questionCast: "想看這件事接下來的走向，可以為它起一卦 →", prevAsked: "你之前問過的",
  reaskHead: "想再問一件今年的事？", reaskPh: "例如：下半年適合搬家嗎？（200 字以內）",
  reaskGo: "送出，重寫這一章", reaskGoing: "送出中…", reaskErr: "沒送出，請稍後再試。", reaskLogin: "請先用買年書的帳號登入。",
  backToBook: "回到年書",
  revisitHead: "到期回來問你", revisitSub: "年書標的關鍵月過完兩天，寫信問你一句：像書上說的那樣嗎？", answered: "已回答", sent: "已寄信", askOn: "{d} 問你",
  productName: "YaoFlow 年書 {y}：八字、紫微、星盤三套合看（數位內容）",
  metaTitle: "年書：八字、紫微斗數、西洋星盤三套合看一整年",
  metaDesc: "八字、紫微斗數、西洋星盤三套合看一整年：每一季的節奏、全年最有動靜、最該放慢、最順手的月份，關鍵月到了寫信提醒，過完再問你像不像。",
  metaReport: "你的年書",
};

/** the two letters: payment received (it takes minutes to write), and written */
const MAIL = {
  recvTitle: "收到了，正在寫你的年書",
  recvA: "付款已經收到。年書要寫幾分鐘，寫好會再寄一封信給你，附上連結。",
  recvB: "這段時間可以關掉頁面，不影響；想看進度，隨時打開下面的連結。",
  recvCta: "看寫作進度", reply: "有問題直接回覆這封信。",
  readySubject: "你的年書寫好了", readyTitle: "年書",
  readyBody: "你的年書已經寫好了：八字、紫微、星盤三套合看的這一年，加上三篇各自的逐月細節，之後也能隨時從這封信回去看。",
  readyButton: "打開年書", readyFoot: "有問題直接回覆這封信。",
};

/** the key-month letter (lib/milestone-letter.ts): one of the three months the book singled out has begun */
const KM = {
  head: "年書 {y} · 關鍵月到了",
  kind: { pivot: "全年最有動靜的月份", slow: "全年最該放慢的月份", smooth: "全年最順手的月份" },
  p1: "你的 {y} 年書把這個月（{m}）標成{k}。它現在開始了。",
  marks: "這個月的記號：",
  noMarks: "這個月沒有特別的記號，照書上寫的節奏走就好。",
  p3: { slow: "放慢不是停下：把要定的事往後挪一挪，手上的先收尾。", pivot: "有動靜的月份，事情來了先接住，再決定要不要接下去。", smooth: "順手的月份，把拖了很久的那件事排進來。" },
  bookBtn: "回到年書看這個月", cast: "這個月有事要問，起一卦",
  foot: "買了年書才寄這一封；一年最多三封，關鍵月到了才有。", stop: "不用再寄",
  subject: "年書 {y}：關鍵月到了——{k}",
  /** a month's marks in plain words (the 八字 month marks) */
  flag: {
    冲日支: "跟你的日支相沖，變動大的一個月：換位置、換主意、有人走有人來",
    合日支: "合你的日支，容易有人靠近、有事談成",
    合日干: "合你的日主，想配合人、也容易被人帶著走",
    冲月支: "沖月支，家裡與工作的節奏會被打亂一下",
    合月支: "合月支，環境順，適合把事定下來",
    刑日支: "刑日支，心裡容易有疙瘩，話慢一點說",
    害日支: "害日支，小摩擦多，別為小事翻臉",
    天乙贵人: "天乙貴人到，有人幫一把的月份，該開口就開口",
    禄神: "祿神到，靠本事吃飯的月份，手上的活要做足",
    驿马: "驛馬動，走動、出差、搬遷的事多",
    桃花: "桃花到，人緣與感情的月份",
    旬空: "旬空，事情先別急著定，等它落地",
    文昌: "文昌到，讀書、考試、寫東西順",
    伏吟大运: "與大運同一組干支，老問題會再回來一次，這次把它處理完",
    伏吟流年: "與流年同一組干支，同一件事重複出現，別用同一個方法",
  },
};

/** the revisit two days after a key month (lib/self-revisit.ts): its name on 「我的」 and in the letter, and the line under it */
const REV = { label: "年書 {y} · {m}", hint: "年書把這個月標成{k}；它過去了，像那樣嗎？" };

export const NS_FOREIGN_HANT = { ui: UI, mail: MAIL, km: KM, rev: REV };
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type NsForeignText = Widen<typeof NS_FOREIGN_HANT>;
/** the 年書's words in one of the seven other languages */
export const nsForeignText = (l: Foreign): NsForeignText => localize(NS_FOREIGN_HANT as unknown as NsForeignText, GEN as unknown as Generated, l);
