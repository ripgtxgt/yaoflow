import { describe, expect, it } from "vitest";
import { hkReader, registerOpt, toHkWording } from "../src/lib/register";
import { readCastExtras } from "../src/lib/cast-extras";
import { HK_WRITTEN_NOTE } from "../src/lib/reading";
import { qianPersonalSystem } from "../src/lib/qian-personal";
import { qianByNum, qianWording } from "../src/lib/qian";

/**
 * 10-12 读者识别 (Neil: 白话是台湾口吻——「你应该增加客户识别吧」): a Hong Kong / Macau reader is written to in Hong Kong
 * written Chinese; a question in Cantonese still gets Cantonese; everyone else keeps Taiwan wording.
 */
const H = (o: Record<string, string>) => new Headers(o);

describe("香港读者识别", () => {
  it("reads the edge country or the browser's first Chinese tag", () => {
    expect(hkReader(H({ "cf-ipcountry": "HK" }))).toBe(true);
    expect(hkReader(H({ "cf-ipcountry": "MO" }))).toBe(true);
    expect(hkReader(H({ "cf-ipcountry": "TW", "accept-language": "zh-TW,zh;q=0.9" }))).toBe(false);
    expect(hkReader(H({ "accept-language": "zh-HK,zh;q=0.9,en;q=0.8" }))).toBe(true);
    expect(hkReader(H({ "accept-language": "en-US,zh-HK;q=0.9" }))).toBe(true); // first Chinese tag
    expect(hkReader(H({ "accept-language": "zh-TW,zh-HK;q=0.5" }))).toBe(false);
    expect(hkReader(H({ "accept-language": "yue" }))).toBe(true);
    expect(hkReader(null)).toBe(false);
  });

  it("a cast carries register hk — Cantonese wins, and only 繁體 readings take it", () => {
    expect(readCastExtras({}, "我下個月會不會升職？", "zh-hant", H({ "cf-ipcountry": "HK" })).register).toBe("hk");
    expect(readCastExtras({}, "佢會唔會返嚟搵我？", "zh-hant", H({ "cf-ipcountry": "HK" })).register).toBe("yue");
    expect(readCastExtras({}, "我下個月會不會升職？", "zh-hant", H({ "cf-ipcountry": "TW" })).register).toBeUndefined();
    expect(readCastExtras({}, "我下个月会不会升职？", "zh", H({ "cf-ipcountry": "HK" })).register).toBeUndefined();
    expect(registerOpt("zh-hant", "hk")).toEqual({ register: "hk" });
    expect(registerOpt("en", "hk")).toEqual({});
  });

  it("prompts: Hong Kong written wording, not Cantonese and not Taiwan's", () => {
    expect(HK_WRITTEN_NOTE).toMatch(/上司/);
    expect(HK_WRITTEN_NOTE).toMatch(/NOT spoken Cantonese/);
    expect(qianPersonalSystem("hk")).toContain(HK_WRITTEN_NOTE);
    expect(qianPersonalSystem(null)).toMatch(/Taiwan/);
    expect(qianPersonalSystem("hk")).not.toMatch(/as people in Taiwan write it/);
  });

  it("our fixed lot text in Hong Kong words, the poem untouched", () => {
    expect(toHkWording("你可以傳一則訊息，也可以傳個訊息給主管，談薪水和專案")).toBe("你可以發一個訊息，也可以發個訊息給上司，談人工和項目");
    expect(toHkWording("曖昧、斷聯、復合")).toBe("曖昧、斷聯、復合");
    const e = qianByNum(34, "huangdaxian")!;
    const w = qianWording(e, true);
    expect(w.poem).toEqual(e.poem);
    expect(w.love).not.toBe(e.love); // the whole-text Hong Kong version, not a word swap
    // every lot of both sets has its Hong Kong version, and none of it is spoken Cantonese
    for (const set of ["liushi-jiazi", "huangdaxian"]) for (const x of [...Array(set === "huangdaxian" ? 100 : 60)].map((_, i) => qianWording(qianByNum(i + 1, set)!, true))) {
      expect(x.plain, `${set} ${x.num}`).not.toBe(qianByNum(x.num, set)!.plain);
      for (const f of [x.title, x.plain, x.overall, x.love, x.work, x.ask_next]) expect(f, `${set} ${x.num}`).not.toMatch(/唔|佢|嘅|咗|喺|冇|啲|嚟|諗|搵|一定|保證|靈驗/);
      expect(x.ask_next.endsWith("？")).toBe(true);
    }
    expect(qianWording(e, false)).toBe(e);
    // the 黃大仙 pages are rendered in Hong Kong wording; no Taiwan-only words left in any field
    for (const x of Array.from({ length: 100 }, (_, i) => qianWording(qianByNum(i + 1, "huangdaxian")!, true)))
      for (const f of [x.title, x.plain, x.overall, x.love, x.work, x.ask_next]) expect(f, String(x.num)).not.toMatch(/傳訊|主管|薪水|專案|案子|品質|網路|軟體|簡訊/);
  });
});
