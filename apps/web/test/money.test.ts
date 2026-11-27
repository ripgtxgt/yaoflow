import { describe, expect, it } from "vitest";
import {
  CURRENCIES, PRICES, ZERO_DECIMAL, countryFromLanguage, countryFromTimeZone, currencyForCountry, detectCurrency, detectCurrencyWithSource,
  formatMoney, isMainlandTimeZone, priceLabels, yearlySavePct,
} from "../src/lib/money";

describe("price table", () => {
  it("prices every currency for all four products, in whole minor units, yearly cheaper than twelve months", () => {
    for (const c of CURRENCIES) {
      const p = PRICES[c];
      for (const v of Object.values(p)) { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThan(0); }
      expect(p.one).toBeLessThan(p.deep);
      expect(p.deep).toBe(p.month); // one deep reading costs a month
      expect(p.year).toBeLessThan(p.month * 12);
      const save = yearlySavePct(c);
      expect(save, c).toBeGreaterThanOrEqual(30);
      expect(save, c).toBeLessThanOrEqual(60); // mainland habit is 40–57% off on yearly
      if (ZERO_DECIMAL.has(c)) expect(p.one % 10).toBe(0);
    }
    expect(yearlySavePct("USD")).toBe(34);
  });
});

describe("where the buyer is", () => {
  it("maps device clocks and language regions to the priced countries", () => {
    expect(countryFromTimeZone("Asia/Shanghai")).toBe("CN");
    expect(countryFromTimeZone("Asia/Taipei")).toBe("TW");
    expect(countryFromTimeZone("Asia/Singapore")).toBe("SG");
    expect(countryFromTimeZone("Australia/Sydney")).toBe("AU");
    expect(countryFromTimeZone("America/Indiana/Indianapolis")).toBe("US");
    expect(countryFromTimeZone("Europe/Paris")).toBe("FR");
    expect(countryFromTimeZone("Asia/Bangkok")).toBeNull();
    expect(countryFromTimeZone("UTC")).toBeNull();
    expect(isMainlandTimeZone("Asia/Shanghai")).toBe(true);
    expect(isMainlandTimeZone("Asia/Hong_Kong")).toBe(false);
    expect(countryFromLanguage("zh-TW")).toBe("TW");
    expect(countryFromLanguage("zh-Hant-HK")).toBe("HK");
    expect(countryFromLanguage("en-GB,en;q=0.9")).toBe("GB");
    expect(countryFromLanguage("ja")).toBe("JP");
    expect(countryFromLanguage("zh")).toBeNull(); // mainland, Taiwan, Singapore — no guess
    expect(countryFromLanguage("es")).toBeNull();
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(currencyForCountry("BG")).toBe("EUR");
    expect(currencyForCountry("MO")).toBe("HKD");
    expect(currencyForCountry("TH")).toBeNull();
  });

  it("resolves in order: hand-picked → device clock → edge (IP) country → device language → USD (09-18: IP moved ahead of language)", () => {
    // a mainland reader behind a Hong Kong exit still sees yuan
    expect(detectCurrencyWithSource({ timeZone: "Asia/Shanghai", language: "zh-CN", edgeCountry: "HK" })).toEqual({ currency: "CNY", source: "tz" });
    // a Chinese speaker living in Japan pays in yen
    expect(detectCurrency({ timeZone: "Asia/Tokyo", language: "zh-CN", edgeCountry: "JP" })).toBe("JPY");
    // no usable clock: the edge's country now decides before the language region
    expect(detectCurrencyWithSource({ timeZone: "UTC", language: "zh-TW", edgeCountry: "GB" })).toEqual({ currency: "GBP", source: "edge" });
    // a device left on en-US in Hong Kong is not an American
    expect(detectCurrencyWithSource({ timeZone: "Etc/UTC", language: "en-US", edgeCountry: "HK" })).toEqual({ currency: "HKD", source: "edge" });
    // the edge sees a country the table does not price: the language region still gets its say
    expect(detectCurrencyWithSource({ timeZone: "Asia/Bangkok", language: "zh-TW", edgeCountry: "TH" })).toEqual({ currency: "TWD", source: "lang" });
    // nothing at all
    expect(detectCurrencyWithSource({ timeZone: "Asia/Bangkok", language: "th", edgeCountry: "TH" })).toEqual({ currency: "USD", source: "default" });
    // a choice beats everything; garbage is ignored
    expect(detectCurrencyWithSource({ chosen: "EUR", timeZone: "Asia/Shanghai", edgeCountry: "CN" })).toEqual({ currency: "EUR", source: "chosen" });
    expect(detectCurrency({ chosen: "XXX", timeZone: "Asia/Shanghai" })).toBe("CNY");
  });
});

describe("formatting", () => {
  it("prints each currency the way its buyers write it, with no ambiguous dollar sign", () => {
    expect(formatMoney("USD", 999, "en")).toBe("US$9.99");
    expect(formatMoney("USD", 7900, "zh")).toBe("US$79");
    expect(formatMoney("USD", 299, "ja")).toBe("US$2.99");
    expect(formatMoney("CNY", 3800, "zh")).toBe("¥38");
    expect(formatMoney("CNY", 990, "zh")).toBe("¥9.90");
    expect(formatMoney("TWD", 24900, "zh-hant")).toBe("NT$249");
    expect(formatMoney("MYR", 990, "zh")).toBe("RM9.90");
    expect(formatMoney("HKD", 6800, "zh-hant")).toBe("HK$68");
    expect(formatMoney("JPY", 980, "ja")).toBe("￥980");
    expect(formatMoney("JPY", 7800, "zh")).toBe("JP¥7,800");
    expect(formatMoney("KRW", 13900, "ko")).toBe("₩13,900");
    expect(formatMoney("SGD", 1299, "en")).toBe("S$12.99");
    expect(formatMoney("CAD", 1399, "en")).toBe("CA$13.99");
    expect(formatMoney("AUD", 1399, "en")).toBe("A$13.99");
    expect(formatMoney("MXN", 16900, "es")).toBe("MX$169");
    expect(formatMoney("GBP", 749, "en")).toBe("£7.49");
    expect(formatMoney("EUR", 899, "de")).toMatch(/^8,99\s€$/);
    expect(formatMoney("CHF", 850, "fr")).toMatch(/^8,50\sCHF$/);
    expect(formatMoney("BRL", 2990, "pt")).toMatch(/^R\$\s?29,90$/);
    // 09-24: fr-FR prints "$US" itself — never "US$US"
    expect(formatMoney("USD", 299, "fr")).toMatch(/^2,99\s\$US$/);
    expect(formatMoney("USD", 299, "es")).toMatch(/^2,99\sUS\$$/);
    expect(formatMoney("USD", 299, "de")).toMatch(/^2,99\sUS\$$/);
    const l = priceLabels("EUR", "fr");
    expect(l.year).toMatch(/^85\s€$/); // 09-23: tax-inclusive (was 69 before tax)
  });
});

describe("per-market scoreboard", () => {
  it("files a session's funnel under the currency it saw, and counts paid orders by currency with the first-time flag", async () => {
    const { computeStats } = await import("../src/lib/analytics-server");
    const { recordOrder, salesByCurrency, upsertCustomer } = await import("../src/lib/db");
    const t = Date.now();
    const ev = (e: string, s: string, extra: Record<string, unknown> = {}) => ({ t, e, s, ...extra }) as never;
    const stats = computeStats([
      ev("cast_complete", "a", { cur: "CNY" }), ev("reading_click", "a", { cur: "CNY", tier: "deep" }), ev("checkout_start", "a", { cur: "CNY", tier: "deep" }),
      ev("cast_complete", "b", { cur: "CNY" }), ev("reading_click", "b", { tier: "one" }), // no cur on the click: inherits the session's
      ev("cast_complete", "c", { cur: "USD" }), ev("sub_redeem", "c", { cur: "USD", tier: "deep" }),
      ev("cast_complete", "d"), // never saw a price — not filed anywhere
    ]);
    const cny = stats.byCurrency.find((c) => c.cur === "CNY")!;
    expect(cny).toMatchObject({ casts: 2, clicksDeep: 1, clicksOne: 1, checkout: 1, subRedeems: 0 });
    expect(stats.byCurrency.find((c) => c.cur === "USD")).toMatchObject({ casts: 1, subRedeems: 1 });
    expect(stats.byCurrency[0]!.cur).toBe("CNY"); // most casts first

    const cid = upsertCustomer("scoreboard@example.com", "zh");
    recordOrder({ sessionId: "cs_test_sb1", customerId: cid, castId: null, tier: "deep", amountCents: 990, currency: "cny", email: "scoreboard@example.com", status: "paid", firstDeep: true });
    recordOrder({ sessionId: "cs_test_sb2", customerId: cid, castId: null, tier: "deep", amountCents: 3800, currency: "cny", email: "scoreboard@example.com", status: "paid" });
    recordOrder({ sessionId: "cs_test_sb3", customerId: cid, castId: null, tier: "one", amountCents: 299, currency: "usd", email: "scoreboard@example.com", status: "paid" });
    recordOrder({ sessionId: "sub_sb4", customerId: cid, castId: null, tier: "deep", amountCents: 0, currency: null, email: "scoreboard@example.com", status: "subscription" });
    const sales = salesByCurrency(t - 60_000);
    expect(sales.orders.find((o) => o.currency === "CNY" && o.tier === "deep")).toMatchObject({ n: 2, amount: 4790, first: 1 });
    expect(sales.orders.find((o) => o.currency === "USD" && o.tier === "one")).toMatchObject({ n: 1, amount: 299, first: 0 });
    expect(sales.orders.some((o) => o.tier === "deep" && o.currency === "USD")).toBe(false); // the allowance reading is not a sale
  });
});

/**
 * 09-22, after Neil asked why a Hong Kong customer was charged CNY. The answer
 * was that his laptop clock said Asia/Shanghai and our rule puts the device
 * clock above everything — deliberately, because a proxy rewrites the IP but
 * not the clock, and a mainland buyer routed to a non-CNY checkout gets
 * refused by Stripe outright. These lock the order of trust so nobody
 * "simplifies" it later without meeting the case it was built for.
 */
describe("currency: the order of trust", () => {
  it("a hand-picked currency beats every signal", async () => {
    const { detectCurrencyWithSource } = await import("../src/lib/money");
    const r = detectCurrencyWithSource({ chosen: "HKD", timeZone: "Asia/Shanghai", edgeCountry: "JP", language: "en-US" });
    expect(r).toEqual({ currency: "HKD", source: "chosen" });
  });

  it("the device clock beats the IP — the mainland-behind-a-proxy case", async () => {
    const { detectCurrencyWithSource } = await import("../src/lib/money");
    // 09-23: this used to read language "zh-HK" — but a China clock with a
    // Hong Kong language IS a Hong Kong Windows PC (see currency-hk-windows).
    // The mainland-behind-a-proxy reader has a mainland language.
    const r = detectCurrencyWithSource({ timeZone: "Asia/Shanghai", edgeCountry: "HK", language: "zh-CN" });
    expect(r).toEqual({ currency: "CNY", source: "tz" });
  });

  it("and the cost of that rule: a Shanghai clock on a Hong Kong card still reads CNY", async () => {
    const { detectCurrencyWithSource } = await import("../src/lib/money");
    // order #542, 09-22: clock Asia/Shanghai, IP JP, card HK. No signal we can
    // see before payment says HK, so this is the documented trade-off, not a bug.
    expect(detectCurrencyWithSource({ timeZone: "Asia/Shanghai", edgeCountry: "JP" }).currency).toBe("CNY");
  });

  it("falls to the IP when the clock names no market we price", async () => {
    const { detectCurrencyWithSource } = await import("../src/lib/money");
    expect(detectCurrencyWithSource({ timeZone: "Asia/Kolkata", edgeCountry: "HK" })).toEqual({ currency: "HKD", source: "edge" });
  });

  it("and to USD when nothing says anything", async () => {
    const { detectCurrencyWithSource } = await import("../src/lib/money");
    expect(detectCurrencyWithSource({}).source).toBe("default");
  });
});
