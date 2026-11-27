import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

/**
 * 10-26 (Neil: 「三條路都做」): ① a love question's result points at 正緣畫像 (合盤 for a reader who has one) on every asking
 * product; ② the card's sentence is written by the model for that question and checked; ③ the daily 運營摘要.
 */
const { upsertCustomer } = await import("../src/lib/db");
const { createReport, factsFromBirth, birthFromBody } = await import("../src/lib/mingli/bazi/report");
const { bridgeLine, bridgeProductFor, isLoveQuestion, lineOk } = await import("../src/lib/bridge");
const { buildInsight, dayNumbers, latestInsight, tpeDayStart } = await import("../src/lib/daily-insight");
const bridge = await import("../src/app/api/bridge/route");

const post = (body: unknown) => bridge.POST(new NextRequest("http://localhost/api/bridge", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe("感情題 → 正緣畫像", () => {
  it("only love questions get the card", async () => {
    expect(isLoveQuestion("他會對我回心轉意嗎")).toBe(true);
    expect(isLoveQuestion("今年這段感情會怎樣？")).toBe(true);
    expect(isLoveQuestion("這份工作會順利嗎")).toBe(false);
    expect(await (await post({ question: "這份工作會順利嗎", surface: "tarot", locale: "zh-hant" })).json()).toEqual({ show: false });
    expect(await (await post({ question: "他會對我回心轉意嗎", surface: "tarot", locale: "en" })).json()).toEqual({ show: false });
  });

  it("a love question gets 正緣畫像, with a sentence that names it", async () => {
    const j = (await (await post({ question: "他是我的正緣嗎？", surface: "jiaobei", locale: "zh-hant" })).json()) as { show: boolean; product: string; href: string; line: string };
    expect(j).toMatchObject({ show: true, product: "zhengyuan", href: "/zh-hant/zhengyuan?c=bridge-jiaobei" });
    expect(j.line).toContain("正緣畫像");
  });

  it("a reader who already has a 正緣畫像 is pointed at 合盤", () => {
    const cid = upsertCustomer("bridge-love1026@example.com", "zh-hant");
    expect(bridgeProductFor(cid)).toBe("zhengyuan");
    const b = birthFromBody({ calendar: "solar", y: 1990, m: 5, d: 17, leap: false, timeMode: "exact", h: 12, mi: 30, place: { id: "1668341", name: "Taipei", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" } }, "female");
    if ("error" in b) throw new Error("birth");
    createReport({ kind: "love", locale: "zh-hant", register: null, customerId: cid, email: null, facts: factsFromBirth(b.n, "female", "love"), paid: { session: "member:x", amountMinor: 0 } });
    expect(bridgeProductFor(cid)).toBe("hepan");
  });

  it("the model's sentence is checked: one short line, naming the product, nothing the site never says", () => {
    expect(lineOk("你在意這段感情會不會有結果；先看看容易和你走得長的是哪一類人，正緣畫像能幫你看清楚。", "zhengyuan")).toBe(true);
    expect(lineOk("你在意他會不會回來，正緣畫像能幫你看清楚。", "zhengyuan")).toBe(false); // 他
    expect(lineOk("你在意這段感情會不會有結果，先看清楚自己。", "zhengyuan")).toBe(false); // no product
    expect(lineOk("正緣畫像很準，一定能找到對的人。", "zhengyuan")).toBe(false);
    expect(lineOk("你們的相處節奏，可以從合盤看。", "hepan")).toBe(true);
  });

  it("the sentence is kept per question (written once)", async () => {
    const a = await bridgeLine("我們還有機會嗎", "zhengyuan", "qa", "zh-hant", { model: false });
    expect(a.how).toBe("fixed");
    const first = await bridgeLine("我們還有沒有可能復合", "zhengyuan", "qa", "zh-hant");
    const again = await bridgeLine("我們還有沒有可能復合", "zhengyuan", "qa", "zh");
    expect(again.how).toBe("cached");
    expect(again.line.length).toBe(first.line.length); // the same sentence, in 简体
  });
});

describe("每日運營摘要", () => {
  it("counts a Taipei day and keeps the summary (numbers only reach the model)", async () => {
    const n = dayNumbers(tpeDayStart(Date.now()) - 86_400_000);
    for (const k of ["casts", "tarotDraws", "jiaobeiAsks", "chartQa", "paidOrders", "revenueUsd", "zhengyuanViews"]) expect(typeof n[k]).toBe("number");
    const r = await buildInsight(Date.now(), { model: false });
    expect(r.how).toBe("none");
    expect(latestInsight()?.day).toBe(r.day);
    expect(JSON.stringify(r.numbers)).not.toMatch(/@|會|嗎/); // no addresses, no questions
  });
});
