/**
 * 10-26 正緣畫像 sold on its own (Neil: 「跟合盤和年書一樣的模式」) — every fixed word of the product page (Traditional; the
 * server maps 简体 pages). Client-safe: no server imports here.
 */
export const ZY_UI = {
  head: "正緣畫像",
  lead: "從你的八字裡的配偶星和夫妻宮，畫出容易和你走在一起的那類人：TA 的樣子和氣質、你們相處的節奏、可能在哪裡、哪個方向遇見。",
  me: "我", pickMe: "選我的生辰", change: "換一份",
  needGender: "這份生辰沒有填性別，請重新填一份。",
  ta: "想看的 TA", taOther: "異性", taSame: "同性",
  freeHead: "先免費看一句：TA 給人的感覺",
  freeLoading: "正在看你的盤……", freeErr: "暫時算不出來，請換一份生辰或稍後再試。",
  lockedHead: "完整的畫像裡還有",
  inside: "一張 TA 的畫像插畫（AI 生成）|體態與氣質：TA 大概的樣子|底色與神態：TA 的個性和眼神|相處的節奏：你們在一起時誰快誰慢|緣分氣息：桃花、紅鸞與你的緣分節奏|相遇的場景與方向：可能在哪裡、偏哪個方向遇見",
  buy: "看完整畫像 {p}", memberOff: "會員 8 折", test: "測試帳號：免費打開", going: "前往付款…", writing: "正在建立…", buyErr: "暫時沒辦法建立，請稍後再試。",
  buyNote: "同一份生辰、同一種 TA 只收一次錢，之後隨時從「我的」打開。",
  disclaimer: "正緣畫像描述的是容易吸引你、和你相處得來的那類人的傾向，不是預言某一個人，也不替你決定感情裡的事。",
  productName: "YaoFlow 正緣畫像（數位內容）", productNameHans: "YaoFlow 正缘画像（数字内容）",
};
export type ZyUi = Record<keyof typeof ZY_UI, string>;
