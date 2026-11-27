import { afterEach, describe, expect, it } from "vitest";
import { llmsFullTxt, llmsTxt } from "../src/lib/llms";
import { PRICES, PASS_PRICES, TONGKA_PRICES, HEPAN_PRICES, NIANSHU_EARLY_PRICES, formatMoney } from "../src/lib/money";
import { MEMBER_FOLLOWUP_LIMIT } from "../src/lib/sub-plan";
import { LOCALES } from "../src/lib/locales";
import { isEnglishFallback } from "../src/lib/content";
import { TERMS } from "../src/lib/legal";
import { GET } from "../src/app/llms.txt/route";
import { GET as GET_FULL } from "../src/app/llms-full.txt/route";

const SITE = "https://yaoflow.com";
const prevPaywall = process.env.PAYWALL;
afterEach(() => { process.env.PAYWALL = prevPaywall; });

/** 进度表 26: llms.txt — facts only, prices from the checkout's own tables */
describe("llms.txt", () => {
  it("is served as UTF-8 plain text, with the timing and how-to-ask pages", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    expect(body.startsWith("# YaoFlow\n")).toBe(true);
    expect(body).toContain(`${SITE}/en/timing`);
    expect(body).toContain(`${SITE}/en/how-to-ask`);
    expect(body).toContain(`${SITE}/zh-hant/how-to-ask`);
    expect(body).toContain("應期");
    const full = GET_FULL();
    expect(full.status).toBe(200);
    expect(await full.text()).toContain(`${SITE}/en/gua/64-wei-ji`);
  });

  it("never states an accuracy, a percentage, or sells the model", () => {
    process.env.PAYWALL = "on";
    for (const txt of [llmsTxt(SITE, ["zh-hant", "zh"]), llmsFullTxt(SITE, ["zh-hant", "zh"])]) {
      // (the /timing article's own sentence about being called "inaccurate" is not a claim — whole words only)
      expect(txt).not.toMatch(/\baccuracy\b|\baccurate\b|準確率|准确率|正確率|%/i);
      expect(txt).not.toMatch(/\bAI\b|很準|很准/);
    }
  });

  it("reads every price from the pricing tables, so a price change follows on its own", () => {
    process.env.PAYWALL = "on";
    const txt = llmsTxt(SITE, []);
    // 10-22 进度表 78: the pass model — every figure from money.ts
    expect(txt).toContain(formatMoney("USD", PRICES.USD.one, "en"));
    expect(txt).toContain(formatMoney("TWD", TONGKA_PRICES[1].TWD, "en"));
    expect(txt).toContain(formatMoney("HKD", PASS_PRICES.HKD, "en"));
    expect(txt).toContain(formatMoney("JPY", TONGKA_PRICES[7].JPY, "en"));
    expect(txt).toContain(formatMoney("TWD", HEPAN_PRICES.TWD, "en"));
    expect(txt).toContain(formatMoney("TWD", NIANSHU_EARLY_PRICES.TWD, "en"));
    expect(txt).toContain("Passes (通卡)");
    expect(txt).toContain(`${MEMBER_FOLLOWUP_LIMIT} follow-up questions per full reading`);
    expect(txt).not.toMatch(/top-up|Light reading \(輕解讀\)/);
    const was = PRICES.USD.month;
    try {
      PRICES.USD.month = 1234;
      expect(llmsTxt(SITE, [])).toContain("US$12.34");
    } finally {
      PRICES.USD.month = was;
    }
  });

  it("says readings are free while the paywall is off, and lists no prices", () => {
    process.env.PAYWALL = "off";
    const txt = llmsTxt(SITE, []);
    expect(txt).toContain("currently free");
    expect(txt).not.toContain("| Currency |");
  });

  it("lists public cases only in the languages that have them, and legal pages only where they are written", () => {
    process.env.PAYWALL = "on";
    const none = llmsTxt(SITE, []);
    expect(none).not.toContain("/cases");
    const some = llmsTxt(SITE, ["zh-hant", "zh"]);
    expect(some).toContain(`${SITE}/zh-hant/cases`);
    expect(some).not.toContain(`${SITE}/en/cases`);
    // terms and privacy: every language that has its own text, none that would only read the English
    for (const l of LOCALES) {
      const own = !isEnglishFallback(TERMS[0]!, l);
      if (own) expect(some).toContain(`${SITE}/${l}/terms`);
      else expect(some).not.toContain(`${SITE}/${l}/terms`);
    }
  });
});
