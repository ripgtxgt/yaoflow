import { describe, expect, it } from "vitest";

/**
 * 10-28 (Neil: 「補籤庫吧，把這些都補完」): two sets the unrecognised photos were from — 臺中樂成宮's own 月老靈籤 (40 七言)
 * and 烘爐地南山福德宮's printing of the 金錢卦 (its own numbering from 18, its own lot 24). The Japanese shrine's 恋みくじ
 * is not a numbered set and stays out.
 */
describe("籤系 10-28: 樂成宮月老靈籤、烘爐地三十二籤", async () => {
  const q = await import("../src/lib/qian");
  const { chineseNumber, judgeReading, matchSlip, printedNumber, setFromTemple, verdict } = await import("../src/lib/qian-photo");

  it("counts, line lengths, temples, Hong Kong text, 宜忌", () => {
    for (const [set, count, len] of [["lecheng-yuelao", 40, 7], ["hunglodei", 32, 5]] as const) {
      const all = q.allQian(set);
      expect(all, set).toHaveLength(count);
      for (const e of all) {
        expect(e.poem.length, `${set} ${e.num}`).toBe(4);
        for (const l of e.poem) expect([...l].length, `${set} ${e.num} ${l}`).toBe(len);
        expect(e.ask_next.endsWith("？")).toBe(true);
        expect(e.yi && e.ji, `${set} ${e.num} 宜忌`).toBeTruthy();
        expect(q.qianTag(e)).toBe("");
        for (const k of ["title", "plain", "overall", "love", "work"] as const) expect(e[k], `${set} ${e.num} ${k}`).not.toMatch(/神明說|靈驗|改運|保證|一定|AI|大吉|凶籤|上上|下下/);
      }
      expect(q.templesFor(set).length, set).toBeGreaterThan(0);
      expect(all.filter((e) => q.qianWording(e, true).love !== e.love).length, set).toBeGreaterThan(count * 0.9);
      expect(q.QIAN_SET_SOURCE[set]).toBeTruthy();
    }
    expect(q.qianByNum(1, "lecheng-yuelao")!.poem).toEqual(["久旱喜獲甘霖降", "他鄉猶可遇故知", "洞房喜慶花燭夜", "金榜高掛題名時"]);
    expect(q.qianByNum(7, "hunglodei")!.poem).toEqual(["國治人安泰", "家財漸漸興", "有財求望吉", "有福亦平安"]);
    expect(q.qianByNum(24, "hunglodei")!.poem[0]).toBe("羸馬登程去"); // the lot the 台版 does not have
  });

  it("the two photos that failed on 10-27 now land on their lot", () => {
    // 樂成宮 第一首, as the 30B model read it (lines 3/4 swapped): before, 月老聖籤 #22 at 0.526 was offered
    const le = judgeReading({ isSlip: true, number: 1, temple: "臺中樂成宮", text: "第一首\n久旱喜獲甘霖降\n洞房喜慶花燭夜\n他鄉猶可遇故知\n金榜高掛題名時" });
    expect(le.verdict).toMatchObject({ kind: "one", match: { set: "lecheng-yuelao", num: 1 } });
    // 烘爐地 第柒號: the same poem as 金錢卦 #7 in the 台版 wording — the printed temple decides
    expect(printedNumber("第柒號 上上")).toBe(7);
    expect(chineseNumber("貳拾壹")).toBe(21);
    expect(setFromTemple("中和區烘爐地南山福德宮財神殿")).toBe("hunglodei");
    expect(setFromTemple("臺中樂成宮")).toBe("lecheng-yuelao");
    expect(setFromTemple("某某宮")).toBeNull();
    const hb = judgeReading({ isSlip: true, number: 7, temple: "中和區烘爐地南山福德宮財神殿", text: "第柒號\n國治人安泰\n家財漸漸興\n有財求望吉\n有福亦平安" });
    expect(hb.verdict).toMatchObject({ kind: "one", match: { set: "hunglodei", num: 7 } });
    // the 10-25 photo as the 32B model actually read it — columns read across, number unread: the characters still name the lot
    const hb2 = judgeReading({ isSlip: true, number: null, temple: "地府烘區和中宮德福山南殿神財", text: "北市中區南投二三六○籤\n有家國\n福財財治\n亦求漸人\n平望漸安上" });
    expect(hb2.verdict).toMatchObject({ kind: "one", match: { set: "hunglodei", num: 7 } });
    // but not from a few shared characters
    expect(judgeReading({ isSlip: true, number: null, temple: "烘爐地南山福德宮", text: "福財安平" }).verdict.kind).toBe("none");
    // the same wording with no temple printed: both sets stay on the table
    const v = verdict(matchSlip("第七籤\n彩鳳呈祥瑞\n麒麟降帝都\n禍除迎福至\n喜氣自然生", 5), 7);
    expect(v.kind).toBe("some");
    // a 六十甲子 slip is not pulled into 樂成宮 by its shared poem
    const lj = judgeReading({ isSlip: true, number: 7, temple: "北港朝天宮", text: "六十甲子第七籤 乙丑\n雲開月出正分明\n不須進退問前程\n婚姻皆由天註定\n和合清吉萬事成" });
    expect(lj.verdict).toMatchObject({ kind: "one", match: { set: "liushi-jiazi", num: 7 } });
  });
});
