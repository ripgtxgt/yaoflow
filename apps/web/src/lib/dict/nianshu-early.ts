/**
 * 10-23 进度表 112 年书早鸟信 (11/1): the copy Neil read on 10-23 — 「内容没有问题」 (《年书早鸟信-1101-草稿.md》). Traditional
 * as written, Simplified alongside. {early} {regular} are the reader's own currency; **bold** marks the price.
 */
export interface NianshuEarlyCopy {
  subject: string; preheader: string; hello: string; intro: string;
  whatTitle: string; whatLead: string; whatItems: string[];
  priceTitle: string; priceItems: string[];
  see: string; free: string; help: string; sign: string; unsubLine: string; unsub: string;
}

export const NIANSHU_EARLY_T: Record<"zh-hant" | "zh", NianshuEarlyCopy> = {
  "zh-hant": {
    subject: "2027 年書開賣：八字、紫微、星盤三套合看一整年，早鳥到 1/31",
    preheader: "早鳥價 {early}（原價 {regular}），國曆 11/1 到 2027/1/31。",
    hello: "您好，",
    intro: "2027 年的年書今天開賣了。",
    whatTitle: "年書是什麼",
    whatLead: "把八字、紫微、星盤三套合起來，看您的 2027 年：",
    whatItems: [
      "三套各一篇：八字看流年、大運和十二個節氣月；紫微看流年四化和逐月；星盤看外行星過境、日月食、逆行和逐月。",
      "合看的幾章：三套都指向的、說法不一樣的；四季的節奏，哪幾個月最該把握、哪幾段要放慢；五個領域合看，再加三個建議。",
      "新的一章「太歲」：您的生肖和 2027 太歲的關係（值、沖、刑、害、破），依習俗怎麼安太歲。",
      "買的時候可以寫下一件您最在意的事，年書裡會專門回答；之後想換個問題，在年書裡重問就好，不用再付錢。",
      "年書標出的關鍵月份到了，我們會寫信提醒您；那段時間過了，再問您過得怎麼樣。",
    ],
    priceTitle: "價格",
    priceItems: [
      "早鳥價 **{early}**（原價 {regular}），國曆 11/1 到 2027/1/31。",
      "同一張盤、同一年只收一次錢。早鳥價已經比會員的 8 折更低，不再另外打折。",
      "需要您的出生日期和時間（紫微要用到時辰）。",
    ],
    see: "看年書的內容：",
    free: "還沒排過自己的盤，也可以先免費排八字、紫微、星盤，看看「看懂這張盤」。",
    help: "有任何問題，直接回覆這封信就好。",
    sign: "爻流 YaoFlow",
    unsubLine: "不想再收到這類信？", unsub: "一鍵退訂",
  },
  zh: {
    subject: "2027 年书开卖：八字、紫微、星盘三套合看一整年，早鸟到 1/31",
    preheader: "早鸟价 {early}（原价 {regular}），国历 11/1 到 2027/1/31。",
    hello: "你好，",
    intro: "2027 年的年书今天开卖了。",
    whatTitle: "年书是什么",
    whatLead: "把八字、紫微、星盘三套合起来，看你的 2027 年：",
    whatItems: [
      "三套各一篇：八字看流年、大运和十二个节气月；紫微看流年四化和逐月；星盘看外行星过境、日月食、逆行和逐月。",
      "合看的几章：三套都指向的、说法不一样的；四季的节奏，哪几个月最该把握、哪几段要放慢；五个领域合看，再加三个建议。",
      "新的一章「太岁」：你的生肖和 2027 太岁的关系（值、冲、刑、害、破），依习俗怎么安太岁。",
      "买的时候可以写下一件你最在意的事，年书里会专门回答；之后想换个问题，在年书里重问就好，不用再付钱。",
      "年书标出的关键月份到了，我们会写信提醒你；那段时间过了，再问你过得怎么样。",
    ],
    priceTitle: "价格",
    priceItems: [
      "早鸟价 **{early}**（原价 {regular}），国历 11/1 到 2027/1/31。",
      "同一张盘、同一年只收一次钱。早鸟价已经比会员的 8 折更低，不再另外打折。",
      "需要你的出生日期和时间（紫微要用到时辰）。",
    ],
    see: "看年书的内容：",
    free: "还没排过自己的盘，也可以先免费排八字、紫微、星盘，看看「看懂这张盘」。",
    help: "有任何问题，直接回复这封信就好。",
    sign: "爻流 YaoFlow",
    unsubLine: "不想再收到这类信？", unsub: "一键退订",
  },
};
