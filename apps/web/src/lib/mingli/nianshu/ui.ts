/**
 * 10-21 三合一年書 — every fixed word of the product page and the 年書 page (Traditional; the server maps 简体 pages).
 * Client-safe: no server imports here.
 */
export const NS_UI = {
  // product page
  head: "年書",
  lead: "同一年，用八字、紫微、星盤三套一起看：哪裡說法一致、哪裡不一樣，每個季節該推什麼、該慢什麼，再一個月一個月細看。",
  me: "我", pickMe: "選我的生辰", change: "換一份",
  needTime: "年書要有出生時間，請換一份有時間的生辰。", needGender: "這份生辰沒有填性別，請重新填一份。",
  insideHead: "書裡有什麼",
  inside: "三套合看這一年：主調、三套都指向的地方、說法不一樣的地方|四季節奏：全年最該把握和最該放慢的時段|五個領域合看：事業、財務節奏、感情、作息與身心、人際，加三個建議|八字篇：流年與大運，十二個節氣月逐月|紫微篇：流年四化與流年命宮，逐月細看|星盤篇：外行星過境、日月食與逆行，逐月細看|太歲：這一年你的生肖和太歲的關係（值、沖、刑、害、破），依習俗怎麼安|附一個你想問的問題，三套一起回答",
  yearTag: "年書", year: "{y} {gz}年", thisYear: "今年", nextYear: "明年",
  buy: "購買 {p}", memberOff: "會員 8 折", early: "早鳥價", earlyUntil: "早鳥價到國曆 {d} 止", regular: "原價 {p}", test: "測試帳號：免費打開", going: "前往付款…", writing: "正在建立…", buyErr: "暫時沒辦法建立，請稍後再試。",
  ask: "想在年書裡問的一件事（選填）", askHint: "例如：今年適合換工作嗎？（200 字以內）",
  buyNote: "同一年只收一次錢；之後想問別的事，在年書裡直接再問。",
  disclaimer: "年書描述的是這一年的傾向和節奏，不替你下結論；不談健康、投資與法律。",
  // 年書 page
  back: "年書", kindLabel: "年書", kindSub: "八字、紫微、星盤三套合看",
  writingAll: "年書正在寫：先寫八字、紫微、星盤三篇，再寫三套合看的章節。全部大約五到八分鐘，寫好的會先出現，頁面會自己更新，寫完也會寄信給你。",
  writingChapter: "這一章正在寫……", waitingChapter: "等三篇寫好，這一章就會開始寫……", failedChapter: "這一章這次沒寫成，我們會補上，寫好會寄信通知你。",
  unpaidHead: "這份年書還沒付款", unpaidBody: "付款完成後，年書會直接寫在這一頁，也會寄到你的信箱。",
  chZong: "三套合看這一年", chTong: "三套都指向的地方", chYi: "說法不一樣的地方", chSeasons: "四季節奏", chPeak: "全年最該把握的時段", chSlow: "全年最該放慢的時段",
  chAreas: "五個領域合看", chJianyi: "給你的三個建議", chParts: "三篇細看", chQa: "答你的問題",
  q1: "國曆 1–3 月", q2: "國曆 4–6 月", q3: "國曆 7–9 月", q4: "國曆 10–12 月",
  career: "事業", money: "財務節奏", love: "感情", rhythm: "作息與身心", people: "人際",
  partOpen: "打開 →", partWriting: "正在寫", partKeyword: "關鍵詞",
  bazi: "八字篇", ziwei: "紫微篇", astro: "星盤篇",
  baziSub: "流年與大運，十二個節氣月逐月", ziweiSub: "流年四化與流年命宮，逐月細看", astroSub: "外行星過境、日月食與逆行，逐月細看",
  dateNote: "書裡的月份都是國曆。八字的一年從立春算起，紫微從正月初一算起，星盤從一月一日算起。",
  questionYou: "你問的是", questionCast: "想看這件事接下來的走向，可以為它起一卦 →", prevAsked: "你之前問過的",
  reaskHead: "想再問一件今年的事？", reaskPh: "例如：下半年適合搬家嗎？（200 字以內）",
  backToBook: "回到年書",
  productName: "YaoFlow 年書 {y}：八字、紫微、星盤三套合看（數位內容）", productNameHans: "YaoFlow 年书 {y}：八字、紫微、星盘三套合看（数字内容）",
};
export type NsUi = Record<keyof typeof NS_UI, string>;
