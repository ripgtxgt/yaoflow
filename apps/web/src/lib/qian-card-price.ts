import type { Currency } from "./money";

/** 10-14 进度表 50 籤卡 prices (minor units): NT$59 / HK$15 / US$1.99, the rest the nearest round figure at the same level. Pure — the page shows it too. */
export const CARD_PRICES: Record<Currency, number> = {
  TWD: 5900, HKD: 1500, USD: 199, CNY: 1400, JPY: 300, KRW: 2700, EUR: 199, GBP: 169, CAD: 279, AUD: 299, SGD: 269, BRL: 1090, MXN: 3900, CHF: 179, MYR: 890,
};
export const cardMinor = (c: Currency): number => CARD_PRICES[c];
/** the Stripe line-item name (10-14); moved here 10-22 so lib/catalog.ts can read it without the whole of today-qian */
export const CARD_NAMES: Record<string, string> = {
  "zh-hant": "YaoFlow 今日一籤 · 籤卡 30 天（數位內容，不續訂）", zh: "YaoFlow 今日一签 · 签卡 30 天（数字内容，不续费）", en: "YaoFlow daily lot card, 30 days (digital content, no renewal)",
};
