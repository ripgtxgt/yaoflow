import { describe, expect, it } from "vitest";
import { allQian, HK_SETS, qianByNum, qianPageDescription, qianPageTitle, QIAN_SETS, QIAN_TITLE_MAX, qianSamePoem, qianWording } from "@/lib/qian";
import { lineHeading, lineLoveWork } from "@/lib/gua-liuyao";

/** 10-28 进度表 117 (GSC 28 天): 籤页 titles/descriptions carry the poem's words, same-poem links, 卦页 one heading per 爻 */
describe("籤页 search head", () => {
  // 11-05 T-020: back to the pre-10-28 format — the tag (or the first line where the slip prints none), no 「姻緣」, no
  // other temples' wording in the snippet; the page body from 10-28 stays
  it("titles: tag or first line, within 60 characters, no claims", () => {
    for (const s of QIAN_SETS) for (const e0 of allQian(s.id)) {
      const e = qianWording(e0, HK_SETS.has(e0.set));
      const t = qianPageTitle(e);
      expect([...t].length).toBeLessThanOrEqual(QIAN_TITLE_MAX);
      expect(t).not.toContain("感情姻緣");
      expect(t).not.toMatch(/AI|準|靈驗/);
    }
  });

  it("the description: the lot's title line and what the page offers, no other wording", () => {
    const lj7 = qianByNum(7)!;
    expect(qianPageDescription(lj7)).toBe(`六十甲子籤第 7 籤：${lj7.title}。籤詩原文與各廟用字；輸入籤號和你想問的事，看白話、感情與工作怎麼讀。`);
    for (const s of QIAN_SETS) for (const e of allQian(s.id)) expect([...qianPageDescription(e)].length).toBeLessThanOrEqual(160);
  });
});

describe("其他廟的同一首", () => {
  it("links lots that print the same poem under another set, never the lot itself", () => {
    let linked = 0;
    for (const s of QIAN_SETS) for (const e of allQian(s.id)) {
      const same = qianSamePoem(e);
      for (const x of same) { expect(x.set).not.toBe(e.set); }
      if (same.length) linked++;
    }
    expect(linked).toBeGreaterThan(10);
    // it goes both ways
    for (const e of allQian("hunglodei")) for (const x of qianSamePoem(e)) expect(qianSamePoem(x).some((y) => y.set === "hunglodei" && y.num === e.num)).toBe(true);
  });
});

describe("卦页逐爻", () => {
  it("heads each line with its label and the text to the first pause", () => {
    expect(lineHeading("初六", "謙謙君子，用涉大川，吉。")).toBe("初六：謙謙君子");
    expect(lineHeading("初九", "初九：潛龍勿用。")).toBe("初九：潛龍勿用");
  });
  it("has a 感情 and a 工作 sentence for all 384 lines, in both scripts, with none of the banned words", () => {
    for (let n = 1; n <= 64; n++) for (const l of ["zh", "zh-hant"] as const) {
      const r = lineLoveWork(n, l);
      expect(r, `hex ${n} ${l}`).not.toBeNull();
      for (const x of r!) for (const s of [x.love, x.work]) {
        expect([...s].length).toBeGreaterThanOrEqual(15);
        expect(s).not.toMatch(/準確|很準|準不準|算得準|准确|靈驗|灵验|AI|神明|化解|改運|改运|注定|保證|保证|大吉|大凶/);
      }
    }
    expect(lineLoveWork(15, "en")).toBeNull();
  });
});
