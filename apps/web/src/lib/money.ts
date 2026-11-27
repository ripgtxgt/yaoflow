import type { Locale } from "./locales";

/**
 * Prices in the buyer's own currency — set by hand per market, not converted.
 *
 * Why not Stripe's Adaptive Pricing alone: it only appears on the checkout
 * page, at a rate we do not know in advance (with a 2–4% conversion fee
 * folded in), so the page and the payment could never show the same number.
 * Here the page shows ¥68 and Stripe charges exactly ¥68; Stripe settles it
 * to USD for us (about 1% FX for a US account), which the table absorbs with
 * a 1–3% cushion over the day's mid-market rate (2 Sept 2026).
 *
 * Detection never touches an IP address of ours: a hand-picked preference
 * wins, then the device's own time zone name (Asia/Shanghai is Shanghai
 * whatever the proxy says), then the device language's region (zh-TW), then
 * the country the edge saw, then USD. Countries outside the table see USD and
 * Stripe's Adaptive Pricing still localises the checkout for them.
 */

export const CURRENCIES = ["USD", "CNY", "TWD", "HKD", "JPY", "KRW", "EUR", "GBP", "CAD", "AUD", "SGD", "BRL", "MXN", "CHF", "MYR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = "USD";

/** Stripe's zero-decimal currencies: amounts are whole units, not hundredths. */
export const ZERO_DECIMAL = new Set<Currency>(["JPY", "KRW"]);

export type Product = "one" | "deep" | "month" | "year";

/**
 * Amounts in Stripe minor units (cents; whole yen/won).
 *
 * v3 (2026-09-23, Neil: 「保持含税，检查所有的地区标价，需要交税的都提高价格」):
 * since 09-23 every price is tax-INCLUSIVE — Stripe carves the tax out of it
 * instead of adding it on top at payment. Where Managed Payments collects a
 * consumer tax, the price went up by roughly that rate and was rounded to a
 * local price point, so the pre-tax amount we keep is not lower than before.
 * Rates checked against what Stripe actually charged (TW 5.0% on every TWD
 * order; HK 0%) and the Managed Payments tax-coverage list.
 */
/**
 * v2 (2026-09-04), from the pricing survey of 360+ divination products:
 * CNY / JPY / BRL sit at 56–61% of the US price (their markets' AI readings
 * simply do not sell above ¥38 / 980円 / R$29.90 a month), TWD / HKD a
 * little under parity, everything else at parity. The deep reading always
 * costs exactly one month of membership — the lever that turns a single
 * buyer into a subscriber.
 */
export const PRICES: Record<Currency, Record<Product, number>> = {
  // no consumer tax collected on these (HK has none; CNY and BRL sell outside Managed Payments) — or, for USD, usually none
  USD: { one: 299, deep: 999, month: 999, year: 7900 },
  CNY: { one: 990, deep: 3800, month: 3800, year: 19800 },
  HKD: { one: 1800, deep: 6800, month: 6800, year: 54800 },
  BRL: { one: 990, deep: 2990, month: 2990, year: 23900 },
  // tax now included (v3, 09-23) — each set so what reaches us is at least the old pre-tax price
  TWD: { one: 7500, deep: 26900, month: 26900, year: 209000 },   // 5% VAT        was 69 / 249 / 1,990
  JPY: { one: 550, deep: 1100, month: 1100, year: 8800 },         // 10% JCT       was 480 / 980 / 7,800
  KRW: { one: 4400, deep: 15400, month: 15400, year: 120000 },    // 10% VAT       was 3,900 / 13,900 / 109,000
  EUR: { one: 349, deep: 1099, month: 1099, year: 8500 },         // ~21% VAT      was 2.79 / 8.99 / 69
  GBP: { one: 279, deep: 899, month: 899, year: 7200 },           // 20% VAT       was 2.29 / 7.49 / 59
  CAD: { one: 499, deep: 1599, month: 1599, year: 12500 },        // 5–15% GST/HST was 4.29 / 13.99 / 109
  AUD: { one: 479, deep: 1549, month: 1549, year: 12000 },        // 10% GST       was 4.29 / 13.99 / 109
  SGD: { one: 439, deep: 1449, month: 1449, year: 10800 },        // 9% GST        was 3.99 / 12.99 / 99
  MXN: { one: 5900, deep: 19900, month: 19900, year: 159000 },    // 16% IVA       was 49 / 169 / 1,349
  CHF: { one: 270, deep: 920, month: 920, year: 7100 },           // 8.1% MWST     was 2.50 / 8.50 / 65
  // new 09-23 (Neil). 8% service tax included. Set level with TWD/HKD (~US$2.2 / 8.5), USD/MYR ≈ 4.08
  MYR: { one: 990, deep: 3490, month: 3490, year: 27900 },
};

/**
 * 会员单月 (09-26, Neil chose B): the same membership for 30 days, paid once, never
 * renewed — about 11% above the monthly subscription, so subscribing stays the
 * better deal ("訂閱每月省 NT$30") and the one-off never looks like a trap.
 */
// 09-27 (Neil: 「单月会员改成 NT$349」): about 1.3× the monthly subscription everywhere (was ~1.1×) — not being
// renewed is worth something, but the subscription should be the plain better deal
export const PASS_PRICES: Record<Currency, number> = {
  USD: 1299, CNY: 4900, HKD: 8800, BRL: 3890, TWD: 34900, JPY: 1400, KRW: 19900, EUR: 1399,
  GBP: 1149, CAD: 2099, AUD: 1999, SGD: 1899, MXN: 25900, CHF: 1190, MYR: 4490,
};
export const passMinor = (currency: Currency): number => PASS_PRICES[currency];
/**
 * 10-22 通卡 (Neil: 「A/B 測試不用做了，我們來做這個通行證」, prices 「可以按照這個價格」): three buy-once passes,
 * 1 day / 7 days / 30 days, not renewed, everything paid for the whole site inside the window (lib/tongka.ts). The 30-day
 * one IS the old one-off month at its old price; the first 1-day pass of an account costs what the single light
 * reading used to (PRICES[c].one), so the entry price does not move. Only the renewing monthly plan is called 會員.
 */
export type TongkaDays = 1 | 7 | 30;
export const TONGKA_DAYS: readonly TongkaDays[] = [1, 7, 30];
export const TONGKA_PRICES: Record<TongkaDays, Record<Currency, number>> = {
  1: {
    USD: 399, CNY: 1290, HKD: 2500, BRL: 1290, TWD: 9900, JPY: 650, KRW: 5500, EUR: 399,
    GBP: 329, CAD: 549, AUD: 549, SGD: 499, MXN: 7900, CHF: 350, MYR: 1290,
  },
  7: {
    USD: 799, CNY: 2800, HKD: 5200, BRL: 2490, TWD: 19900, JPY: 1000, KRW: 11000, EUR: 799,
    GBP: 699, CAD: 1099, AUD: 1099, SGD: 999, MXN: 15900, CHF: 720, MYR: 2690,
  },
  30: { ...PASS_PRICES },
};
export const tongkaMinor = (currency: Currency, days: TongkaDays, first = false): number =>
  days === 1 && first ? PRICES[currency].one : TONGKA_PRICES[days][currency];
/** 10-22 會員 8 折 on the big one-offs (年書, 合盤 — Neil: 只給會員): rounded to the market's price step */
export const MEMBER_DISCOUNT = 0.8;
export function memberDiscountMinor(currency: Currency, minor: number): number {
  const step = currency === "TWD" ? 1000 : currency === "JPY" || currency === "KRW" ? 100 : currency === "MXN" || currency === "CNY" || currency === "HKD" ? 100 : 1;
  return Math.max(step, Math.round((minor * MEMBER_DISCOUNT) / step) * step);
}

/**
 * 10-10 首月同价 (Neil: 「按第1种做吧，然后需要把这个续费269写清楚」): someone who subscribed and turned renewal off
 * the same hour got the one-off month for NT$269 while a one-month buyer paid NT$349. A first-time member's first
 * month now costs what the one-off month costs; from the second month on, the monthly fee. Returning members (an
 * earlier subscription or one-off month) start at the monthly fee. The difference rides on the first invoice as a
 * one-time line next to the recurring price (lib/stripe createSubscriptionSession).
 */
export const firstMonthMinor = (currency: Currency): number => PASS_PRICES[currency];
export const firstMonthExtraMinor = (currency: Currency): number => Math.max(0, PASS_PRICES[currency] - PRICES[currency].month);

/**
 * 会员增购包 (09-29, Neil: 「15 份 699」): 15 full readings for a member whose period's
 * allowance ran out — about 0.62 × fifteen single extras at the member's extra price
 * (the light price), rounded to each market's price points. Still well above what a
 * reading costs inside the membership, so subscribing stays the better deal.
 */
export const PACK_PRICES: Record<Currency, number> = {
  USD: 2799, CNY: 9200, HKD: 16800, BRL: 9290, TWD: 69900, JPY: 5100, KRW: 41000, EUR: 3299,
  GBP: 2599, CAD: 4649, AUD: 4449, SGD: 4099, MXN: 54900, CHF: 2490, MYR: 9290,
};
/**
 * 10-02 小包 (Neil: 「1，出一个小包」): 5 full readings at about four single extras' price, rounded to each market's
 * price points — so it is cheaper than singles from the fourth extra on, and still dearer per reading than the
 * 15-pack (which stays the better deal for anyone who needs many). Most members who run out need one or two.
 */
export const PACK_SMALL_PRICES: Record<Currency, number> = {
  USD: 1199, CNY: 3900, HKD: 6800, BRL: 3990, TWD: 29900, JPY: 2200, KRW: 17600, EUR: 1399,
  GBP: 1099, CAD: 1999, AUD: 1899, SGD: 1699, MXN: 22900, CHF: 1090, MYR: 3990,
};
/**
 * 八字④ 流年報告, one year per purchase (Neil 10-19: 每年分開、可以再貴點), one-off for everyone — members pay it too.
 * NT$1,190 a year (the top of the 需求 §0.9 range), the other markets at matching price points.
 */
export const BAZI_YEAR_PRICES: Record<Currency, number> = {
  USD: 3999, CNY: 16800, HKD: 29800, BRL: 19990, TWD: 119000, JPY: 5800, KRW: 55000, EUR: 3699,
  GBP: 3199, CAD: 5499, AUD: 5999, SGD: 5299, MXN: 69900, CHF: 3590, MYR: 16900,
};
export const baziYearMinor = (currency: Currency): number => BAZI_YEAR_PRICES[currency];
/** 10-20 紫微年書, one year per purchase, one-off for everyone (members too) — the same price points as the 八字 年書 */
export const ZIWEI_YEAR_PRICES: Record<Currency, number> = { ...BAZI_YEAR_PRICES };
export const ziweiYearMinor = (currency: Currency): number => ZIWEI_YEAR_PRICES[currency];
/** 10-20 星盤年報, one calendar year per purchase, one-off for everyone (members too) — the same price points as the 紫微年書 */
export const ASTRO_YEAR_PRICES: Record<Currency, number> = { ...ZIWEI_YEAR_PRICES };
export const astroYearMinor = (currency: Currency): number => ASTRO_YEAR_PRICES[currency];
/**
 * 10-20 合盤報告, one pair per purchase, one-off for everyone (members too; pass holders 8 折 later — not yet).
 * Neil 10-21: NT$490 / HK$128 / US$15.99 / ¥68 (ziwei-competitors.md: kaucim 紫微合盤 HK$128), the other markets at
 * matching price points.
 */
export const HEPAN_PRICES: Record<Currency, number> = {
  USD: 1599, CNY: 6800, HKD: 12800, BRL: 7990, TWD: 49000, JPY: 2400, KRW: 22000, EUR: 1499,
  GBP: 1299, CAD: 2199, AUD: 2399, SGD: 2099, MXN: 27900, CHF: 1390, MYR: 6990,
};
export const hepanMinor = (currency: Currency): number => HEPAN_PRICES[currency];
/**
 * 10-26 正緣畫像 sold on its own like 合盤／年書 (Neil: 「跟合盤和年書一樣的模式」), one chart per purchase; a 會員 pays
 * 8 折, a 通卡 does not cover it. Neil 10-26: NT$290 / HK$78 / US$9.99 / ¥48, the other markets at matching price points.
 */
export const ZHENGYUAN_PRICES: Record<Currency, number> = {
  USD: 999, CNY: 4800, HKD: 7800, BRL: 4990, TWD: 29000, JPY: 1500, KRW: 13900, EUR: 949,
  GBP: 799, CAD: 1399, AUD: 1499, SGD: 1299, MXN: 17900, CHF: 890, MYR: 4290,
};
export const zhengyuanMinor = (currency: Currency): number => ZHENGYUAN_PRICES[currency];
/** 10-29 进度表 122 姓名學: 寶寶取名參考／改名參考, priced like 合盤 (Neil: NT$490 / HK$128 / US$15.99; he may change it) */
export const NAME_PRICES: Record<Currency, number> = { ...HEPAN_PRICES };
export const nameMinor = (currency: Currency): number => NAME_PRICES[currency];
/**
 * 10-21 三合一年書 (八字＋紫微＋星盤 one year, the only way the year is sold now), one-off for everyone (members too).
 * Neil 10-21: the regular price NT$1,190 / HK$298 / US$36.99 / ¥168 — the same step as the single 流年報告 was, and the
 * market's regular price for one year (click108 完整流年 NT$1,200, 論命 App NT$1,190, kaucim HK$488); the early-bird price
 * NT$890 / HK$228 / US$27.99 / ¥128 from 11/1 to 1/31 (lib/mingli/nianshu/sale.ts), between click108's NT$840 and
 * kaucim's HK$288 early birds. Other markets at matching price points.
 */
export const NIANSHU_PRICES: Record<Currency, number> = {
  USD: 3699, CNY: 16800, HKD: 29800, BRL: 18990, TWD: 119000, JPY: 5500, KRW: 49000, EUR: 3399,
  GBP: 2999, CAD: 4999, AUD: 5499, SGD: 4999, MXN: 64900, CHF: 3290, MYR: 15900,
};
export const NIANSHU_EARLY_PRICES: Record<Currency, number> = {
  USD: 2799, CNY: 12800, HKD: 22800, BRL: 13990, TWD: 89000, JPY: 4200, KRW: 37000, EUR: 2599,
  GBP: 2299, CAD: 3799, AUD: 4199, SGD: 3799, MXN: 48900, CHF: 2490, MYR: 11900,
};
export const nianshuMinor = (currency: Currency, early = false): number => (early ? NIANSHU_EARLY_PRICES : NIANSHU_PRICES)[currency];
export type PackSize = "small" | "large";
export const packMinor = (currency: Currency, size: PackSize = "large"): number => (size === "small" ? PACK_SMALL_PRICES : PACK_PRICES)[currency];

/** the browser cookie that says "this browser has already bought a deep reading at the first-time price" */
export const FIRST_DEEP_COOKIE = "yf_fd";

export function isCurrency(x: unknown): x is Currency {
  return typeof x === "string" && (CURRENCIES as readonly string[]).includes(x);
}

export function priceMinor(currency: Currency, product: Product): number {
  return PRICES[currency][product];
}

/** Percentage saved by paying yearly instead of twelve months, e.g. 34. */
export function yearlySavePct(currency: Currency): number {
  const p = PRICES[currency];
  return Math.round(100 * (1 - p.year / (p.month * 12)));
}

/* ---------------- where is the buyer ---------------- */

const EURO = ["AT", "BE", "BG", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES", "AD", "MC", "SM", "VA", "ME", "XK"];

export const COUNTRY_CURRENCY: Record<string, Currency> = {
  US: "USD", CN: "CNY", TW: "TWD", HK: "HKD", MO: "HKD", JP: "JPY", KR: "KRW",
  GB: "GBP", IM: "GBP", JE: "GBP", GG: "GBP", CA: "CAD", AU: "AUD", SG: "SGD", BR: "BRL", MX: "MXN", CH: "CHF", LI: "CHF", MY: "MYR",
  ...Object.fromEntries(EURO.map((c) => [c, "EUR" as Currency])),
};

export function currencyForCountry(country: string | null | undefined): Currency | null {
  if (!country) return null;
  return COUNTRY_CURRENCY[country.toUpperCase()] ?? null;
}

/** IANA zone → country, for the countries the table prices. Anything else → null. */
const TZ_COUNTRY: Record<string, string> = {
  "Asia/Shanghai": "CN", "Asia/Chongqing": "CN", "Asia/Chungking": "CN", "Asia/Harbin": "CN", "Asia/Urumqi": "CN", "Asia/Kashgar": "CN", PRC: "CN",
  "Asia/Taipei": "TW", ROC: "TW",
  "Asia/Hong_Kong": "HK", Hongkong: "HK", "Asia/Macau": "MO", "Asia/Macao": "MO",
  "Asia/Tokyo": "JP", Japan: "JP",
  "Asia/Seoul": "KR", ROK: "KR",
  "Asia/Singapore": "SG", Singapore: "SG",
  "Asia/Kuala_Lumpur": "MY", "Asia/Kuching": "MY",
  "Europe/London": "GB", "Europe/Belfast": "GB", GB: "GB", "GB-Eire": "GB", "Europe/Isle_of_Man": "IM", "Europe/Jersey": "JE", "Europe/Guernsey": "GG",
  "Europe/Zurich": "CH", "Europe/Vaduz": "LI",
  "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Busingen": "DE", "Europe/Madrid": "ES", "Atlantic/Canary": "ES", "Africa/Ceuta": "ES",
  "Europe/Rome": "IT", "Europe/Amsterdam": "NL", "Europe/Brussels": "BE", "Europe/Vienna": "AT", "Europe/Lisbon": "PT", "Atlantic/Azores": "PT", "Atlantic/Madeira": "PT",
  "Europe/Dublin": "IE", "Europe/Helsinki": "FI", "Europe/Athens": "GR", "Europe/Luxembourg": "LU", "Europe/Malta": "MT", "Asia/Nicosia": "CY", "Europe/Nicosia": "CY",
  "Europe/Tallinn": "EE", "Europe/Riga": "LV", "Europe/Vilnius": "LT", "Europe/Bratislava": "SK", "Europe/Ljubljana": "SI", "Europe/Zagreb": "HR", "Europe/Sofia": "BG",
  "Europe/Andorra": "AD", "Europe/Monaco": "MC", "Europe/San_Marino": "SM", "Europe/Vatican": "VA", "Europe/Podgorica": "ME",
  "America/Toronto": "CA", "America/Montreal": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Winnipeg": "CA", "America/Halifax": "CA",
  "America/St_Johns": "CA", "America/Regina": "CA", "America/Moncton": "CA", "America/Whitehorse": "CA", "America/Yellowknife": "CA", "America/Iqaluit": "CA",
  "America/Mexico_City": "MX", "America/Cancun": "MX", "America/Merida": "MX", "America/Monterrey": "MX", "America/Chihuahua": "MX", "America/Hermosillo": "MX",
  "America/Tijuana": "MX", "America/Mazatlan": "MX", "America/Matamoros": "MX", "America/Ojinaga": "MX", "America/Bahia_Banderas": "MX", "America/Ciudad_Juarez": "MX",
  "America/Sao_Paulo": "BR", "America/Manaus": "BR", "America/Fortaleza": "BR", "America/Recife": "BR", "America/Bahia": "BR", "America/Belem": "BR", "America/Cuiaba": "BR",
  "America/Campo_Grande": "BR", "America/Porto_Velho": "BR", "America/Boa_Vista": "BR", "America/Rio_Branco": "BR", "America/Maceio": "BR", "America/Araguaina": "BR",
  "America/Santarem": "BR", "America/Noronha": "BR", "America/Eirunepe": "BR",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US", "America/Phoenix": "US", "America/Anchorage": "US",
  "America/Detroit": "US", "America/Boise": "US", "America/Juneau": "US", "America/Adak": "US", "America/Nome": "US", "America/Sitka": "US",
  "America/Indianapolis": "US", "America/Louisville": "US", "America/Menominee": "US", "Pacific/Honolulu": "US",
};

export function countryFromTimeZone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz]!;
  if (tz.startsWith("Australia/")) return "AU";
  if (tz.startsWith("Canada/")) return "CA";
  if (tz.startsWith("Brazil/")) return "BR";
  if (tz.startsWith("Mexico/")) return "MX";
  if (tz.startsWith("US/") || tz.startsWith("America/Indiana/") || tz.startsWith("America/Kentucky/") || tz.startsWith("America/North_Dakota/")) return "US";
  return null;
}

/**
 * 09-23 (Neil: 「为什么最近两笔付款又乱收币种呢？」). Windows has no Hong Kong
 * time zone: its UTC+8 entry is labelled "Beijing, Chongqing, Hong Kong,
 * Urumqi" and the browser reports it as Asia/Shanghai. So the clock we
 * trusted as "proxy-proof mainland" is also every Hong Kong (and Macau)
 * Windows PC — roytam19970717, billing address HK, reading in 繁體, was
 * charged CNY three times on 09-22/23 for exactly this reason.
 *
 * Asia/Shanghai is therefore only mainland when nothing says otherwise.
 * Traditional Chinese (our 繁體 interface, or a zh-HK / zh-TW / zh-Hant
 * system language) outweighs it — unless the system language itself says
 * zh-CN, which a mainland reader who merely prefers 繁體 would still have.
 * Taiwan has its own Windows zone (Taipei Standard Time), so a China clock
 * with Traditional Chinese is Hong Kong — even with a zh-TW language pack,
 * which many Hong Kong PCs carry — and Macau only when the language says MO.
 */
export function traditionalRegion(...tags: (string | null | undefined)[]): string | null {
  let trad = false;
  let region: string | null = null;
  for (const raw of tags) {
    if (!raw) continue;
    for (const one of raw.split(",")) {
      const t = one.trim().split(";")[0]!.toLowerCase();
      if (!t.startsWith("zh")) continue;
      if (/^zh[-_](cn|sg|hans)\b/.test(t) && !/hant/.test(t)) return null; // says mainland (or Simplified) outright
      if (/^zh[-_](hant|hk|mo|tw)\b/.test(t) || /[-_]hant[-_]/.test(t)) {
        trad = true;
        if (/[-_]mo\b/.test(t)) region = "MO";
      }
    }
  }
  return trad ? region ?? "HK" : null;
}

/** Device clock → country, with the Windows Hong Kong case resolved by language (see above). */
export function countryFromClock(tz: string | null | undefined, ...langs: (string | null | undefined)[]): string | null {
  const c = countryFromTimeZone(tz);
  if (c !== "CN") return c;
  return traditionalRegion(...langs) ?? "CN";
}

/** Mainland China by the device clock — the signal the Managed-Payments routing needs, proxy or not. */
export function isMainlandTimeZone(tz: string | null | undefined, ...langs: (string | null | undefined)[]): boolean {
  return countryFromClock(tz, ...langs) === "CN";
}

/** Region from a BCP 47 tag ("zh-TW" → TW); a bare language only when it points at one market. */
export function countryFromLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const first = tag.split(",")[0]!.trim().split(";")[0]!.trim();
  const parts = first.split(/[-_]/);
  const lang = parts[0]?.toLowerCase();
  const region = parts.find((p, i) => i > 0 && /^[A-Za-z]{2}$/.test(p));
  if (region) return region.toUpperCase();
  const BARE: Record<string, string> = { ja: "JP", ko: "KR", de: "DE", fr: "FR", it: "IT", nl: "NL", ms: "MY" };
  return lang ? BARE[lang] ?? null : null;
}

export interface Signals {
  /** the yf_cur cookie, if any */
  chosen?: string | null;
  /** Intl.DateTimeFormat().resolvedOptions().timeZone on the device */
  timeZone?: string | null;
  /** navigator.language or the Accept-Language header */
  language?: string | null;
  /** country the edge saw (cf-ipcountry) */
  edgeCountry?: string | null;
  /** the interface language they are reading in (zh-hant …) — decides whether a China clock is Hong Kong (09-23) */
  uiLocale?: string | null;
}

/** Which signal settled the currency — kept on the order so the dashboard can say why (09-18). */
export type CurrencySource = "chosen" | "tz" | "edge" | "lang" | "default";
export const CURRENCY_SOURCES: readonly CurrencySource[] = ["chosen", "tz", "edge", "lang", "default"];
export function isCurrencySource(x: unknown): x is CurrencySource {
  return typeof x === "string" && (CURRENCY_SOURCES as readonly string[]).includes(x);
}

/**
 * The order of trust, 09-18 (Neil: 「除了设备时区，能加上 IP 辅助更精确吗」):
 * a hand-picked currency; the device clock (a proxy cannot rewrite it, so a
 * mainland reader behind a HK/JP/US exit still pays in CNY); then the country
 * the edge saw for the IP; the system language last — it is the weakest
 * signal, a device left on en-US says nothing about where the money is.
 */
export function detectCurrencyWithSource(s: Signals): { currency: Currency; source: CurrencySource } {
  if (isCurrency(s.chosen)) return { currency: s.chosen, source: "chosen" };
  const tz = currencyForCountry(countryFromClock(s.timeZone, s.uiLocale, s.language));
  if (tz) return { currency: tz, source: "tz" };
  const edge = currencyForCountry(s.edgeCountry);
  if (edge) return { currency: edge, source: "edge" };
  const lang = currencyForCountry(countryFromLanguage(s.language));
  if (lang) return { currency: lang, source: "lang" };
  return { currency: DEFAULT_CURRENCY, source: "default" };
}

export function detectCurrency(s: Signals): Currency {
  return detectCurrencyWithSource(s).currency;
}

/* ---------------- display ---------------- */

const INTL: Record<Locale, string> = {
  zh: "zh-CN", "zh-hant": "zh-TW", en: "en-US", ja: "ja-JP", ko: "ko-KR", fr: "fr-FR", de: "de-DE", es: "es-ES", pt: "pt-BR",
};

/**
 * "US$9.99", "¥68", "NT$320", "￥1,600", "₩13,900", "8,99 €", "R$ 52,90".
 * Whole amounts drop the decimals (US$79, not US$79.00). Symbols that are
 * ambiguous on a nine-language site are made explicit: a bare $ is always
 * US$ or NT$, SGD is S$.
 */
export function formatMoney(currency: Currency, minor: number, locale: Locale): string {
  const zero = ZERO_DECIMAL.has(currency);
  const amount = zero ? minor : minor / 100;
  const whole = zero || minor % 100 === 0;
  let s = new Intl.NumberFormat(INTL[locale], {
    style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
  // fr-FR already prints "2,99 $US" (and es-ES "US$") — only a bare "$" gets the prefix,
  // otherwise French read "2,99 US$US" (09-24 review).
  if (currency === "USD" && !/US/.test(s)) s = s.replace(/(^|[^A-Z])\$/, "$1US$");
  if (currency === "TWD" && !/NT|TW/.test(s)) s = s.replace(/(^|[^A-Z])\$/, "$1NT$");
  if (currency === "SGD") s = s.replace(/SGD\s?/, "S$");
  if (currency === "MXN" && /MXN/.test(s)) s = "MX$" + s.replace(/\s?MXN\s?/, "").trim();
  // Malaysians write RM9.90 in every language; Intl prints "MYR 9.90" or "9,90 MYR"
  if (currency === "MYR") s = "RM" + new Intl.NumberFormat(INTL[locale], { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(amount);
  return s.trim();
}

/** All four prices of one currency, formatted for one interface language. */
export function priceLabels(currency: Currency, locale: Locale): Record<Product, string> {
  return {
    one: formatMoney(currency, PRICES[currency].one, locale),
    deep: formatMoney(currency, PRICES[currency].deep, locale),
    month: formatMoney(currency, PRICES[currency].month, locale),
    year: formatMoney(currency, PRICES[currency].year, locale),
  };
}

/** The currency's own name in the interface language ("日元", "Japanese Yen"), for the switcher. */
export function currencyName(currency: Currency, locale: Locale): string {
  try {
    return new Intl.DisplayNames([INTL[locale]], { type: "currency" }).of(currency) ?? currency;
  } catch {
    return currency;
  }
}

/** Stripe's lowercase currency code. */
export const stripeCurrency = (c: Currency) => c.toLowerCase();

export const CURRENCY_COOKIE = "yf_cur";
