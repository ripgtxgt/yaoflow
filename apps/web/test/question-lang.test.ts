import { describe, expect, it } from "vitest";
import { detectQuestionLocale, resolveReadingLocale } from "../src/lib/question-lang";
import { t } from "../src/lib/i18n";
import { LOCALES } from "../src/lib/locales";

/**
 * 09-17, Neil, from five live readings: a reader on the 繁體 site asked five
 * questions in English between 05:46 and 06:10 and got five Chinese readings.
 * The five questions below are those, verbatim.
 */
describe("which language the reading should be written in", () => {
  it("switches for a real English sentence on a Chinese page", () => {
    expect(detectQuestionLocale("This dynamic is ended?", "zh-hant")).toBe("en");
    expect(detectQuestionLocale("Why I think that guy likes me?", "zh-hant")).toBe("en");
    expect(detectQuestionLocale("Just wanna know what he thinks about this dynamic and whether he's gonna come back", "zh-hant")).toBe("en");
    expect(detectQuestionLocale("But I don't even have new interviews yet why the former one indicates that I will have more than one offer as at late Sept?", "zh-hant")).toBe("en");
  });

  it("keeps the page language when the question is too short to be a choice", () => {
    expect(detectQuestionLocale("Him", "zh-hant")).toBeNull();      // one word, the live case
    expect(detectQuestionLocale("ok", "zh-hant")).toBeNull();
    expect(detectQuestionLocale("", "zh-hant")).toBeNull();
    expect(detectQuestionLocale("offer interview salary", "zh-hant")).toBeNull(); // nouns, no grammar
  });

  it("never switches on Han: script follows the page, not the question", () => {
    expect(detectQuestionLocale("今年或明年有没有对象", "zh-hant")).toBeNull();   // Simplified on the 繁體 site
    expect(detectQuestionLocale("我該不該接這個 offer", "zh")).toBeNull();
    // a Cantonese question with one English word in it is still Chinese
    expect(detectQuestionLocale("我星期一喺西九文化區有一個面試，咁想請問會有一個Offer嗎？", "zh-hant")).toBeNull();
  });

  it("reads kana and hangul", () => {
    expect(detectQuestionLocale("転職すべきでしょうか", "zh-hant")).toBe("ja");
    expect(detectQuestionLocale("이직해야 할까요", "en")).toBe("ko");
    expect(detectQuestionLocale("転職すべきでしょうか", "ja")).toBeNull();  // already there
    expect(detectQuestionLocale("이직해야 할까요", "ko")).toBeNull();
  });

  it("tells the four other Latin languages apart by their function words", () => {
    expect(detectQuestionLocale("Dois-je accepter cette offre de travail ?", "zh-hant")).toBe("fr");
    expect(detectQuestionLocale("Soll ich dieses Angebot annehmen oder nicht?", "zh-hant")).toBe("de");
    expect(detectQuestionLocale("¿Debo aceptar esta oferta de trabajo?", "zh-hant")).toBe("es");
    expect(detectQuestionLocale("Devo aceitar esta proposta de trabalho?", "zh-hant")).toBe("pt");
    expect(detectQuestionLocale("Should I take this offer or not?", "en")).toBeNull(); // already there
  });

  it("honours the reader's own switch, and only between the two languages offered", () => {
    const q = "This dynamic is ended?";
    expect(resolveReadingLocale(q, "zh-hant")).toBe("en");              // detection stands
    expect(resolveReadingLocale(q, "zh-hant", "zh-hant")).toBe("zh-hant"); // they switched back
    expect(resolveReadingLocale(q, "zh-hant", "en")).toBe("en");
    expect(resolveReadingLocale(q, "zh-hant", "ko")).toBe("en");        // never offered → ignored
    expect(resolveReadingLocale(q, "zh-hant", 7)).toBe("en");
    expect(resolveReadingLocale("今年或明年有没有对象", "zh-hant")).toBe("zh-hant");
    expect(resolveReadingLocale("今年或明年有没有对象", "zh-hant", "en")).toBe("zh-hant"); // nothing detected → no switch on offer
  });
});

import { NextRequest } from "next/server";
import type { LineValue } from "@yaoflow/engine";
import { POST as checkout } from "../src/app/api/checkout/route";
import { verifyPaidSession } from "../src/lib/paid-store";

const VALUES: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 8, 17, 2);

/** The whole point: the page stays the page, the reading changes language. */
describe("an English question asked on the 繁體 page", () => {
  const post = (body: Record<string, unknown>) => checkout(new NextRequest("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify({ values: VALUES, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh-hant", currency: "TWD", ...body }),
  }));

  it("is delivered on the 繁體 page but written in English", async () => {
    const prev = process.env.PAYWALL;
    process.env.PAYWALL = "gift";
    const res = await post({ tier: "one", question: "Just wanna know what he thinks about this and whether he is coming back" });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toContain("/zh-hant/reading");           // the page they were on
    const sid = new URL(url).searchParams.get("sid")!;
    const rec = await verifyPaidSession(sid);
    expect(rec!.locale).toBe("en");                       // the language they wrote in
    process.env.PAYWALL = prev;
  });

  it("obeys the reader when they put it back, and ignores a language nobody offered", async () => {
    const prev = process.env.PAYWALL;
    process.env.PAYWALL = "gift";
    const q = "Just wanna know what he thinks about this and whether he is coming back";
    let res = await post({ tier: "one", question: q, rl: "zh-hant" });
    let sid = new URL(((await res.json()) as { url: string }).url).searchParams.get("sid")!;
    expect((await verifyPaidSession(sid))!.locale).toBe("zh-hant");

    res = await post({ tier: "one", question: q, rl: "ko" });
    sid = new URL(((await res.json()) as { url: string }).url).searchParams.get("sid")!;
    expect((await verifyPaidSession(sid))!.locale).toBe("en");   // ko was never on offer
    process.env.PAYWALL = prev;
  });

  it("leaves a Chinese question alone — script is the page's call, not the question's", async () => {
    const prev = process.env.PAYWALL;
    process.env.PAYWALL = "gift";
    const res = await post({ tier: "one", question: "今年或明年有没有对象" });
    const sid = new URL(((await res.json()) as { url: string }).url).searchParams.get("sid")!;
    expect((await verifyPaidSession(sid))!.locale).toBe("zh-hant");
    process.env.PAYWALL = prev;
  });
});

/** 09-17, caught live: t() replaced only the first {lang} and shipped the second raw. */
describe("a sentence may name the same variable twice", () => {
  it("fills every placeholder, in all nine languages", () => {
    for (const l of LOCALES) {
      const s = t(l, "langFollowNote", { lang: "English" });
      expect(s, `${l} langFollowNote`).not.toMatch(/\{lang\}/);
      expect(s, `${l} langFollowNote`).toContain("English");
      expect(t(l, "langSwitchedNote", { lang: "English" }), `${l} langSwitchedNote`).not.toMatch(/\{lang\}/);
      expect(t(l, "langUseInstead", { lang: "English" }), `${l} langUseInstead`).not.toMatch(/\{lang\}/);
    }
  });
});

/**
 * 09-17, Neil, testing his own flow: a light reading with an address, then the
 * deep one — and it sent him back to the cast page to type both again.
 */
describe("upgrading a light reading to the deep one", () => {
  const post = (body: Record<string, unknown>) => checkout(new NextRequest("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.44" },
    body: JSON.stringify({ locale: "zh-hant", currency: "TWD", ...body }),
  }));

  it("takes the cast and the address off the light session — nothing retyped", async () => {
    const prev = process.env.PAYWALL;
    const prevMail = process.env.NEXT_PUBLIC_GIFT_EMAIL;
    process.env.PAYWALL = "gift";
    process.env.NEXT_PUBLIC_GIFT_EMAIL = "deep";   // as it runs in production
    const first = await post({ tier: "one", question: "我到底該不該換這份工作", values: VALUES, castAtMs: AT, tzOffsetMinutes: 480, email: "Upgrade@Example.com" });
    const lightSid = new URL(((await first.json()) as { url: string }).url).searchParams.get("sid")!;

    // the upgrade knows nothing but the session it came from
    const res = await post({ from: lightSid, tier: "deep" });
    expect(res.status).toBe(200);                       // not 400 email_required
    const deepSid = new URL(((await res.json()) as { url: string }).url).searchParams.get("sid")!;
    const deep = await verifyPaidSession(deepSid);
    expect(deep!.tier).toBe("deep");
    expect(deep!.input.question).toBe("我到底該不該換這份工作");   // same question
    expect(deep!.input.values).toEqual(VALUES);                    // same six lines
    expect(deep!.input.castAtMs).toBe(AT);                         // same instant, so the same chart
    expect(deep!.email).toBe("upgrade@example.com");               // same address
    process.env.PAYWALL = prev;
    process.env.NEXT_PUBLIC_GIFT_EMAIL = prevMail;
  });

  it("settles in the light reading's currency and keeps its referral — the panel sends neither (09-18: TWD light readings were upgrading into USD)", async () => {
    const prev = process.env.PAYWALL;
    const prevMail = process.env.NEXT_PUBLIC_GIFT_EMAIL;
    process.env.PAYWALL = "gift";
    process.env.NEXT_PUBLIC_GIFT_EMAIL = "deep";
    const first = await post({ tier: "one", currency: "TWD", curSrc: "tz", timeZone: "Asia/Taipei", via: "787878", question: "前男友會復合嗎", values: VALUES, castAtMs: AT, tzOffsetMinutes: 480, email: "tw@example.com", teaser: " 這段關係現在不是談能修好的，\n是退才保得住。 " });
    const lightSid = new URL(((await first.json()) as { url: string }).url).searchParams.get("sid")!;
    // exactly what UpgradePanel posts: from + tier + the page locale, nothing else
    const res = await checkout(new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.45" },
      body: JSON.stringify({ from: lightSid, tier: "deep", locale: "zh-hant" }),
    }));
    expect(res.status).toBe(200);
    const deepSid = new URL(((await res.json()) as { url: string }).url).searchParams.get("sid")!;
    const deep = await verifyPaidSession(deepSid);
    expect(deep!.currency).toBe("TWD");        // not USD
    expect(deep!.via).toBe("787878");          // the referral credit survives the upgrade
    expect(deep!.email).toBe("tw@example.com");
    expect(deep!.upgradedFrom).toBe(lightSid); // the deep page knows which light session it grew out of
    // 09-19: the free line the cast page showed rides along (whitespace tidied) and the upgrade inherits it
    expect((await verifyPaidSession(lightSid))!.input.teaser).toBe("這段關係現在不是談能修好的， 是退才保得住。");
    expect(deep!.input.teaser).toBe("這段關係現在不是談能修好的， 是退才保得住。");
    // a second tap (or the light page reloaded and tapped again) lands on the same deep reading, not a new one
    const again = await checkout(new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.45" },
      body: JSON.stringify({ from: lightSid, tier: "deep", locale: "zh-hant" }),
    }));
    const againUrl = new URL(((await again.json()) as { url: string }).url);
    expect(againUrl.searchParams.get("sid")).toBe(deepSid);
    const { giftUpgradeOf, giftTrace } = await import("../src/lib/db");
    expect(giftUpgradeOf(lightSid.slice(3))).toBe(deepSid.slice(3));
    // how the currency was settled rides along, and the upgrade inherits it (09-18: the dashboard says why)
    // 09-22: the trace gained edgeCountry so a real (non-gift) upgrade can inherit
    // one; a painted-door gift never recorded the edge's country, hence null.
    expect(giftTrace(lightSid.slice(3))).toEqual({ curSrc: "tz", tzName: "Asia/Taipei", edgeCountry: null });
    expect(giftTrace(deepSid.slice(3))).toEqual({ curSrc: "tz", tzName: "Asia/Taipei", edgeCountry: null });
    process.env.PAYWALL = prev;
    process.env.NEXT_PUBLIC_GIFT_EMAIL = prevMail;
  });

  it("will not let `from` turn into a free deep reading out of nowhere", async () => {
    const prev = process.env.PAYWALL;
    const prevMail = process.env.NEXT_PUBLIC_GIFT_EMAIL;
    process.env.PAYWALL = "gift";
    process.env.NEXT_PUBLIC_GIFT_EMAIL = "deep";
    // an unknown session is ignored, so the request stands on its own and is refused for want of an address
    const res = await post({ from: "gf_" + "0".repeat(36), tier: "deep", question: "我到底該不該換這份工作", values: VALUES, castAtMs: AT, tzOffsetMinutes: 480 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "email_required" });
    process.env.PAYWALL = prev;
    process.env.NEXT_PUBLIC_GIFT_EMAIL = prevMail;
  });
});

import { detectRegister, readsAsCantonese } from "../src/lib/question-lang";
import { readCastExtras } from "../src/lib/cast-extras";
import { CANTONESE_NOTE, CONTINUATION_NOTE, buildUserPayload as payload, deepSystem, followupSystem, oneSystem, resolveServerChart as chartOf } from "../src/lib/reading";

/** 09-18, Neil: Hong Kong readers ask in Cantonese and should be answered in Cantonese. */
describe("written Cantonese", () => {
  it("is told from standard written Chinese by its own characters, not by 係", () => {
    expect(detectRegister("我想知我應唔應該再諗呢個人？我諗我係對佢行為覺得好奇，但我睇唔透")).toBe("yue");
    expect(detectRegister("我星期一喺西九文化區有一個面試，咁想請問會有一個Offer嗎？")).toBe("yue");
    expect(detectRegister("佢會唔會返嚟搵我")).toBe("yue");
    // 09-18: the HK reader whose reading came back in standard Chinese — 唔 alone decides it
    expect(detectRegister("依家份工好辛苦好想轉工，但出面市道都唔好")).toBe("yue");
    // and without the 唔, the everyday words carry it: 依家 (her spelling of 而家), 份工, 轉工
    expect(detectRegister("依家份工好辛苦好想轉工")).toBe("yue");
    expect(detectRegister("我哋之間仲有冇可能")).toBe("yue");   // 哋 is Cantonese-only
    expect(detectRegister("佢啱啱先同我講")).toBe("yue");
    // 關係 carries 係 and is not Cantonese; 睇 alone is not either
    expect(detectRegister("該怎麼做才能改善跟前任的關係")).toBeNull();
    expect(detectRegister("我睇好這份工作")).toBeNull();
    expect(detectRegister("公司出面處理，好似沒問題")).toBeNull();   // 出面 / 好似 are ordinary Mandarin too — deliberately not markers
    expect(detectRegister("我很喜歡現在的工作，該不該轉職")).toBeNull();
    expect(detectRegister("我睇好這份工作，想轉工作")).toBeNull();   // 份工作 / 轉工作 are Mandarin, not 份工 / 轉工
    expect(detectRegister("我该不该接这个 offer")).toBeNull();
    expect(detectRegister("Should I take this offer?")).toBeNull();
  });

  it("only applies on the Traditional page, and the client cannot ask for it", () => {
    expect(readCastExtras({ register: "yue" }, "我该不该接这个 offer", "zh")).toEqual({});
    expect(readCastExtras({}, "佢會唔會返嚟搵我", "zh-hant")).toEqual({ register: "yue" });
    expect(readCastExtras({}, "佢會唔會返嚟搵我", "zh")).toEqual({});   // Cantonese in Simplified script is not a thing we write
  });

  it("goes into every prompt, and the guard knows Cantonese prose when it sees it", () => {
    expect(deepSystem("zh-hant", { register: "yue" })).toContain(CANTONESE_NOTE);
    expect(oneSystem("zh-hant", { register: "yue" })).toContain(CANTONESE_NOTE);
    expect(followupSystem("deep", "zh-hant", { register: "yue" })).toContain(CANTONESE_NOTE);
    expect(deepSystem("zh-hant")).not.toContain(CANTONESE_NOTE);
    expect(readsAsCantonese("你唔係想同佢一齊，你係想搞清楚佢點解會咁做。呢種好奇，再諗落去都唔會有答案。")).toBe(true);
    expect(readsAsCantonese("這段關係現在不是「談」能修好的，是「退」才能保住的。你越主動靠近，對方越往後縮。")).toBe(false);
  });
});

/** 09-18, Neil: the same matter asked again must not be answered as if the first time never happened. */
describe("continuing an earlier reading on the same matter", () => {
  const input = { question: "他還會回來找我嗎", values: VALUES, castAtMs: AT, tzOffsetMinutes: 480 };
  const prior = { question: "我哋仲有冇可能復合", at: AT - 3_600_000, hex: "水雷屯", call: "還有機會再連上，但不會回到從前那樣。" };

  it("is accepted from the cast page only in its own shape and only while fresh", () => {
    const now = Date.now();
    expect(readCastExtras({ prior: { q: "我哋仲有冇可能復合", at: now - 3_600_000, hex: "水雷屯", call: "還有機會再連上" } }, "x", "zh-hant").prior)
      .toEqual({ question: "我哋仲有冇可能復合", at: now - 3_600_000, hex: "水雷屯", call: "還有機會再連上" });
    expect(readCastExtras({ prior: { q: "x", at: now - 5 * 86_400_000, hex: "h", call: "old call" } }, "x", "zh-hant").prior).toBeUndefined(); // too old
    expect(readCastExtras({ prior: { q: "x", at: now, hex: "h" } }, "x", "zh-hant").prior).toBeUndefined();                          // no call
    expect(readCastExtras({ prior: "nonsense" }, "x", "zh-hant").prior).toBeUndefined();
  });

  it("reaches the model as prior_reading plus the continuation rule", () => {
    const chart = chartOf(input);
    const body = JSON.parse(payload(input.question, chart, undefined, { prior })) as { prior_reading?: Record<string, string> };
    expect(body.prior_reading?.question).toBe("我哋仲有冇可能復合");
    expect(body.prior_reading?.hexagram).toBe("水雷屯");
    expect(body.prior_reading?.call).toContain("還有機會");
    expect(deepSystem("zh-hant", { prior: true })).toContain(CONTINUATION_NOTE);
    expect(oneSystem("zh-hant", { prior: true })).toContain(CONTINUATION_NOTE);
    expect(JSON.parse(payload(input.question, chart)) as object).not.toHaveProperty("prior_reading");
  });
});
