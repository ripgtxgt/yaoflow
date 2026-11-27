import { describe, expect, it } from "vitest";
import { allQian } from "../src/lib/qian";
import { QIAN_SETS, TEMPLES } from "../src/lib/qian-meta";
import { betterTry, chineseNumber, judgeReading, lotFromPrint, matchSlip, normaliseSlip, parseSlipReading, printedNumber, setFromPrint, templeFromPrint, VISION_MODELS, verdict } from "../src/lib/qian-photo";
import { POST } from "../src/app/api/qian/photo/route";
import { NextRequest } from "next/server";

/** 10-13 拍照认籤: the photo is only transcribed; WE decide which lot it is, against every poem we hold. */
describe("拍照认籤 · 比对", () => {
  // a photo transcription: header, the poem with a few characters unreadable, and some of the slip's explanation
  const photoOf = (lines: string[], num: number) => {
    const poem = lines.map((l) => [...l].map((ch, i) => (i % 6 === 5 ? "□" : ch)).join("")).join("\n");
    return `第${num}籤\n${poem}\n解曰：凡事守舊，謀望未遂，婚姻慢成。`;
  };

  it("finds every lot of every set from a damaged transcription — or says which few it could be", () => {
    let one = 0, some = 0, wrong: string[] = [];
    for (const st of QIAN_SETS) for (const e of allQian(st.id)) {
      const v = verdict(matchSlip(photoOf(e.poem, e.num), 5), e.num);
      if (v.kind === "one") { if (v.match.set === st.id && v.match.num === e.num) one++; else wrong.push(`${st.id}#${e.num}→${v.match.set}#${v.match.num}`); }
      else if (v.kind === "some") { if (v.matches.some((m) => m.set === st.id && m.num === e.num)) some++; else wrong.push(`${st.id}#${e.num} not among`); }
      else wrong.push(`${st.id}#${e.num} none`);
    }
    expect(wrong).toEqual([]);
    expect(one).toBeGreaterThan(800); // almost all are certain; the rest are poems two sets share
    console.log(`photo match: one ${one} · some ${some}`);
  });

  it("does not invent a lot from text that is not a poem we hold", () => {
    expect(verdict(matchSlip("今天天氣很好，我們去公園散步，順便買了一杯咖啡。", 5), null).kind).toBe("none");
    expect(matchSlip("abc", 3)).toEqual([]);
  });

  it("names the temple only from what the slip prints", () => {
    const cg = TEMPLES.find((t) => t.name.includes("城隍"))!;
    expect(templeFromPrint("省城隍廟", "liushi-jiazi")).toBe(cg.id);
    expect(templeFromPrint("北港朝天宮", "liushi-jiazi")).toBe("beigang");
    expect(templeFromPrint("", "liushi-jiazi")).toBeNull();
    expect(templeFromPrint("某某宮", "liushi-jiazi")).toBeNull();
  });

  it("10-14: a printed temple we know plus a number names the lot when the wording does not match", () => {
    const t = TEMPLES.find((x) => !x.id.endsWith("-other") && x.name.length >= 3)!;
    const m = lotFromPrint(t.name, 23);
    expect(m?.set).toBe(t.set);
    expect(m?.num).toBe(23);
    expect(lotFromPrint(t.name, null)).toBeNull();
    expect(lotFromPrint("", 23)).toBeNull();
    expect(lotFromPrint("某某不知名小廟", 23)).toBeNull();
  });

  it("10-14 (a real slip, lying sideways): the printed number beats the model's, 六十甲子第N籤 names the set, the poem array is read", () => {
    expect(printedNumber("觀音靈籤\n六十甲子第五十三籤 壬申")).toBe(53);
    expect(setFromPrint("觀音靈籤 六十甲子第五十三籤")).toBe("liushi-jiazi");
    expect(setFromPrint("關聖帝君第二十三籤")).toBeNull();
    const r = parseSlipReading('{"is_slip":true,"number":61,"temple":"松竹寺","poem":["看君來問心中事","積善之家慶有餘"],"text":"六十甲子第五十三籤 壬申"}')!;
    expect(r.number).toBe(53);
    expect(r.text).toContain("看君來問心中事");
    const scrambled = judgeReading({ isSlip: true, number: 53, temple: "松竹寺", text: "觀音靈籤 六十甲子第五十三籤 屬金利秋 保必財持有解善轉功說" });
    expect(scrambled.verdict.kind === "one" ? `${scrambled.verdict.match.set}#${scrambled.verdict.match.num}` : scrambled.verdict.kind).toBe("liushi-jiazi#53");
    const upright = judgeReading({ isSlip: true, number: 53, temple: "", text: "看君來問心中事\n積善之家慶有餘\n運亨財子雙雙至\n指日喜氣溢門閭" }, 90);
    const weak = judgeReading({ isSlip: true, number: null, temple: "", text: "保必財 持有 解 善轉功說 良機名" });
    expect(betterTry(weak, upright)).toBe(upright);
    expect(betterTry(null, weak)).toBe(weak);
  });

  it("10-14: a fast model and the 32B (on the photo turned both ways) read together", () => {
    const [first, second] = VISION_MODELS();
    expect(first!.model).toContain("A3B");
    expect(second!.model).toContain("32B");
    expect(Math.max(first!.ms, second!.ms)).toBeLessThan(55_000); // read together, under nginx 60 s
  });

  it("reads numbers the way slips print them", () => {
    expect(chineseNumber("二十三")).toBe(23);
    expect(chineseNumber("一百")).toBe(100);
    expect(chineseNumber("廿八")).toBe(28);
    expect(chineseNumber("十")).toBe(10);
    expect(chineseNumber("七")).toBe(7);
    expect(chineseNumber("五十九")).toBe(59);
    const r = parseSlipReading('好的：{"is_slip": true, "number": null, "temple": "", "text": "第四十二籤\\n詩句"}')!;
    expect(r.number).toBe(42);
    expect(parseSlipReading('{"is_slip": false, "number": 7, "text": ""}')!.isSlip).toBe(false);
    expect(normaliseSlip("台南 来 萬 ABC 123")).toBe("臺南來萬");
  });

  it("the endpoint takes only an image, of a sane size", async () => {
    const req = (body: unknown) => new NextRequest("https://yaoflow.com/api/qian/photo", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.1` } });
    expect((await POST(req({ image: "hello" }))).status).toBe(400);
    expect((await POST(req({ image: "data:text/html;base64," + "A".repeat(3000) }))).status).toBe(400);
    expect((await POST(req({ image: "data:image/jpeg;base64," + "A".repeat(1_100_000) }))).status).toBe(400);
  });
});
