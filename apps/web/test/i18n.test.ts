import { describe, expect, it } from "vitest";
import { DICT, LOCALES, LOCALE_META, dictFor, hasDictionary, t, alternatesFor, type DictKey } from "../src/lib/i18n";
import { ZH_HANT } from "../src/lib/dict/zh-hant";
import { asLocale, isLocale } from "../src/lib/locales";
import { pick } from "../src/lib/reading";
import { hexName, hexSubName, judgmentFor, scriptFor } from "../src/lib/names";
import { allHexagrams, textsFor } from "@yaoflow/engine";

describe("locales", () => {
  it("knows nine languages with complete metadata", () => {
    expect(LOCALES).toHaveLength(9);
    for (const l of LOCALES) {
      const m = LOCALE_META[l];
      expect(m.native.length).toBeGreaterThan(0);
      expect(m.hreflang.length).toBeGreaterThan(0);
      expect(m.stripe.length).toBeGreaterThan(0);
    }
    expect(isLocale("zh-hant")).toBe(true);
    expect(isLocale("zh-TW")).toBe(false);
    expect(asLocale("nope")).toBe("zh");
    expect(asLocale("ja")).toBe("ja");
  });

  it("hreflang map covers every locale plus x-default", () => {
    const alt = alternatesFor("/gua");
    expect(alt["zh-Hant"]).toBe("/zh-hant/gua");
    expect(alt["x-default"]).toBe("/en/gua");
    expect(Object.keys(alt)).toHaveLength(LOCALES.length + 1);
  });
});

describe("dictionaries", () => {
  const keys = Object.keys(DICT.zh);

  it("zh and en carry the same keys", () => {
    expect(Object.keys(DICT.en).sort()).toEqual([...keys].sort());
  });

  it("every translated dictionary is complete (no key silently falls back)", () => {
    for (const l of LOCALES) {
      if (!hasDictionary(l)) continue;
      const d = dictFor(l);
      const missing = keys.filter((k) => !(k in d) || !d[k as keyof typeof d]);
      expect(missing, `${l} missing`).toEqual([]);
    }
    expect(Object.keys(ZH_HANT).sort()).toEqual([...keys].sort());
  });

  it("Traditional Chinese is really traditional and keeps Taiwan/HK vocabulary", () => {
    expect(t("zh-hant", "heroTitle")).toBe("問一件事，給一個日子，到期回來問你。");
    expect(t("zh-hant", "paidUnpaid")).toContain("重新整理");
    expect(t("zh-hant", "emailSent")).toContain("連結");
    expect(t("zh-hant", "emailSent")).toContain("信箱");
    // no simplified-only characters survive
    expect(t("zh-hant", "heroSub")).not.toMatch(/[这个说读]/);
    expect(t("zh-hant", "metaDesc")).not.toMatch(/[这个说读]/);
  });

  it("languages without a dictionary yet read English, never a blank", () => {
    for (const l of LOCALES) {
      for (const k of keys.slice(0, 40)) {
        const v = t(l, k as keyof typeof DICT.zh);
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
      }
    }
    expect(t("fr", "navAbout")).toBe(hasDictionary("fr") ? t("fr", "navAbout") : "About");
  });

  it("all nine languages ship a dictionary", () => {
    for (const l of LOCALES) expect(hasDictionary(l), l).toBe(true);
    expect(t("ja", "primary")).toBe("本卦");
    expect(t("ko", "primary")).toBe("본괘");
    expect(t("fr", "navAbout")).toBe("À propos");
    expect(t("de", "castButton")).toBe("Werfen");
    expect(t("es", "castButton")).toBe("Lanzar");
    expect(t("pt", "castButton")).toBe("Lançar");
  });

  it("every translation keeps the placeholders of its English key", () => {
    const holes = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort();
    for (const l of LOCALES) {
      const d = dictFor(l);
      for (const k of keys) {
        const want = holes(DICT.en[k as DictKey]);
        if (want.length === 0) continue;
        expect(holes(d[k as DictKey]), `${l}.${k}`).toEqual(want);
      }
    }
  });

  it("no translation leaks another script (a copy-paste from zh/en would)", () => {
    const cjk = /[一-鿿]/;
    const kana = /[぀-ヿ]/;
    const hangul = /[가-힯]/;
    for (const l of ["fr", "de", "es", "pt"] as const) {
      for (const k of keys) expect(dictFor(l)[k as DictKey], `${l}.${k}`).not.toMatch(cjk);
    }
    // Japanese keeps kanji but must never carry Hangul; Korean the reverse
    for (const k of keys) {
      expect(dictFor("ja")[k as DictKey], `ja.${k}`).not.toMatch(hangul);
      expect(dictFor("ko")[k as DictKey], `ko.${k}`).not.toMatch(kana);
    }
  });
});

describe("reading fields in any language", () => {
  it("pick() reads new single-language fields and legacy {zh,en} alike", () => {
    expect(pick({ ja: "はい" }, "ja")).toBe("はい");
    expect(pick({ zh: "是", en: "yes" }, "zh")).toBe("是");
    expect(pick({ zh: "是", en: "yes" }, "en")).toBe("yes");
    expect(pick({ zh: "是", en: "yes" }, "zh-hant")).toBe("是"); // falls back to Simplified rather than English
    expect(pick({ zh: "是", en: "yes" }, "fr")).toBe("yes");
    expect(pick({ de: "ja" }, "zh")).toBe("ja"); // anything beats nothing
    expect(pick(undefined, "zh")).toBe("");
  });
});

describe("names per script", () => {
  it("Traditional and Japanese readers see 乾為天, Korean readers 중천건; others the English title", async () => {
    const qian = allHexagrams()[0]!;
    expect(hexName(qian, "zh")).toBe("乾为天");
    expect(hexName(qian, "zh-hant")).toBe("乾為天");
    expect(hexName(qian, "ja")).toBe("乾為天");
    expect(hexName(qian, "ko")).toBe("중천건");
    expect(hexSubName(qian, "ko")).toBe("重天乾");
    expect(hexName(allHexagrams()[62]!, "ko")).toBe("수화기제");
    expect(hexName(qian, "fr")).toBe("Le Créateur");
    expect(hexName(qian, "de")).toBe("Das Schöpferische");
    expect(hexName(allHexagrams()[63]!, "pt")).toBe("Antes da Conclusão");
    expect(hexName(qian, "en")).toBe("The Creative");
    expect(scriptFor("pt")).toBe("en");
    const j = judgmentFor(textsFor(1), "zh-hant");
    expect(j.main).toBe("元亨。利貞。");
    expect(judgmentFor(textsFor(1), "es").main).toContain("Sublime");
  });
});

describe("root redirect picks the visitor's language", () => {
  it("maps Accept-Language to one of the nine locales", async () => {
    const { pickLocale } = await import("../src/middleware");
    expect(pickLocale("ja,en-US;q=0.9,en;q=0.8")).toBe("ja");
    expect(pickLocale("zh-TW,zh;q=0.9,en;q=0.8")).toBe("zh-hant");
    expect(pickLocale("zh-HK")).toBe("zh-hant");
    expect(pickLocale("zh-CN,zh;q=0.9")).toBe("zh");
    expect(pickLocale("ko-KR,ko;q=0.9,en-US;q=0.8")).toBe("ko");
    expect(pickLocale("pt-BR,pt;q=0.9")).toBe("pt");
    expect(pickLocale("de-CH,fr-CH;q=0.9")).toBe("de");
    expect(pickLocale("it-IT,it;q=0.9,en;q=0.5")).toBe("en");
    expect(pickLocale("")).toBe("en");
    // quality ordering wins over position
    expect(pickLocale("en;q=0.5,es;q=0.9")).toBe("es");
  });

  it("corrects a Chinese deep link to the script the browser asks for, and leaves content-bound pages alone (09-17)", async () => {
    const { chineseScript, middleware } = await import("../src/middleware");
    const { NextRequest } = await import("next/server");
    // the browser's opinion: first zh tag decides; bare "zh" defers to the edge country; no zh → no opinion
    expect(chineseScript("zh-CN,zh;q=0.9,en;q=0.8", "TW")).toBe("zh");
    expect(chineseScript("zh-TW,zh;q=0.9", "CN")).toBe("zh-hant");
    expect(chineseScript("zh-Hant-HK", null)).toBe("zh-hant");
    expect(chineseScript("zh,en;q=0.9", "CN")).toBe("zh");
    expect(chineseScript("zh,en;q=0.9", "TW")).toBe("zh-hant");
    expect(chineseScript("zh,en;q=0.9", "US")).toBeNull();
    expect(chineseScript("en-US,en;q=0.9", "CN")).toBeNull();
    expect(chineseScript("ja,zh-TW;q=0.8", null)).toBe("zh-hant");

    const run = async (path: string, accept: string, extra: Record<string, string> = {}) =>
      (await middleware(new NextRequest(`https://yaoflow.com${path}`, { headers: { "accept-language": accept, ...extra } }))).headers.get("location");
    // a mainland browser on a 繁體 promotion link → the same page in Simplified, query kept
    expect(await run("/zh-hant/cast?c=threads", "zh-CN,zh;q=0.9")).toBe("https://yaoflow.com/zh/cast?c=threads");
    expect(await run("/zh-hant", "zh-CN")).toBe("https://yaoflow.com/zh");
    // and the other way round
    expect(await run("/zh/gua/qian", "zh-TW,zh;q=0.9")).toBe("https://yaoflow.com/zh-hant/gua/qian");
    // already the right script, an English browser, or a hand-picked language: no redirect
    expect(await run("/zh-hant/cast", "zh-TW")).toBeNull();
    expect(await run("/zh-hant/cast", "en-US,en;q=0.9")).toBeNull();
    expect(await run("/zh-hant/cast", "zh-CN", { cookie: "yf_lang=zh-hant" })).toBeNull();
    // a delivered reading, a share card, a scene page: the reader opened exactly what they were sent
    expect(await run("/zh-hant/reading?sid=gf_abc", "zh-CN")).toBeNull();
    expect(await run("/zh-hant/share/679878", "zh-CN")).toBeNull();
    expect(await run("/zh-hant/for/moving", "zh-CN")).toBeNull();
    // other locales are untouched
    expect(await run("/ja/cast", "zh-CN")).toBeNull();
  });

  it("Japanese names are shinjitai with a reading; the Traditional table has no OpenCC slips", async () => {
    const { FULL_ZH_HANT } = await import("../src/lib/hant-names");
    const { JA_NAMES } = await import("../src/lib/ja-names");
    expect(FULL_ZH_HANT[31]).toBe("澤山咸");
    expect(FULL_ZH_HANT[33]).toBe("天山遯");
    expect(JA_NAMES[31]).toEqual(["沢山咸", "たくざんかん"]);
    expect(Object.keys(JA_NAMES)).toHaveLength(64);
    const qian = allHexagrams()[0]!;
    expect(hexName(qian, "ja")).toBe("乾為天");
    expect(hexSubName(qian, "ja")).toBe("けんいてん");
  });
});

import { ADMIN_COOKIE, adminToken, isAdmin } from "../src/lib/admin-auth";

/** 09-18: the dashboard key leaves the URL — a `?key=` link becomes a cookie session and is redirected clean. */
describe("dashboard access", () => {
  it("swaps a valid ?key= for a cookie and strips it; ignores a wrong one", async () => {
    const { middleware } = await import("../src/middleware");
    const { NextRequest } = await import("next/server");
    const prev = process.env.ADMIN_KEY;
    process.env.ADMIN_KEY = "test-admin-key";
    const good = await middleware(new NextRequest("https://yaoflow.com/admin?key=test-admin-key&days=7"));
    expect(good.status).toBe(303);
    expect(good.headers.get("location")).toBe("https://yaoflow.com/admin?days=7");
    const cookie = good.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${ADMIN_COOKIE}=${await adminToken()}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toContain("test-admin-key");        // the cookie is a digest, never the key
    const bad = await middleware(new NextRequest("https://yaoflow.com/admin?key=nope"));
    expect(bad.headers.get("location")).toBeNull();
    expect(bad.headers.get("set-cookie")).toBeNull();
    // the pages and admin routes accept either the cookie or the key itself
    expect(await isAdmin(await adminToken() ?? "", null)).toBe(true);
    expect(await isAdmin("garbage", null)).toBe(false);
    expect(await isAdmin(undefined, "test-admin-key")).toBe(true);
    process.env.ADMIN_KEY = prev;
  });
});
