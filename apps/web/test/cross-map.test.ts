import { describe, expect, it } from "vitest";
import { CROSS_MAP, crossFor } from "../src/lib/cross-map";
import { promoPick } from "../src/lib/promo";
import { SERVICE_IDS } from "../src/lib/services";

/** 10-22 进度表 86 承接地圖 (设计稿第 3 節): one main card and up to two small ones per result page, by the design's table */
describe("承接地圖 (86)", () => {
  it("follows the design's table: 六爻 → 擇日 first; 塔羅／解籤／命盤／每天 → 六爻 first; 星盤 → 八字 first; 擇日 → 六爻", () => {
    expect(crossFor("reading").main!.id).toBe("zeri");
    expect(crossFor("reading").main!.line).toBe("卦說可以，挑哪天動手？");
    for (const s of ["jieqian", "tarot", "bazi", "ziwei", "hepan", "nianshu", "daily", "zeri"] as const) expect(crossFor(s).main!.id).toBe("cast");
    expect(crossFor("astro").main!.id).toBe("bazi");
    expect(crossFor("astro").more.map((p) => p.id)).toEqual(["cast"]);
  });

  it("never sends a reader to another 問事 tool for the same matter (六爻 never to 塔羅; 塔羅 never to 求籤 or 擲筊)", () => {
    const ids = (s: keyof typeof CROSS_MAP) => [CROSS_MAP[s].main, ...CROSS_MAP[s].more].map((p) => p.id);
    expect(ids("reading")).not.toContain("tarot"); expect(ids("reading")).not.toContain("jieqian"); expect(ids("reading")).not.toContain("jiaobei");
    expect(ids("tarot")).not.toContain("jieqian"); expect(ids("tarot")).not.toContain("jiaobei");
    // at most two small cards, every id a real service
    for (const s of Object.keys(CROSS_MAP) as (keyof typeof CROSS_MAP)[]) {
      expect(CROSS_MAP[s].more.length).toBeLessThanOrEqual(2);
      for (const id of ids(s)) expect(SERVICE_IDS).toContain(id);
    }
  });

  it("命盤 cards wait for a birth profile; the page's own product is left out and the next card steps up", () => {
    expect(CROSS_MAP.reading.more.find((p) => p.id === "bazi")!.needsProfile).toBe(true);
    const z = crossFor("zeri", ["cast"]);
    expect(z.main!.id).toBe("huangli"); expect(z.more).toEqual([]);
    // 10-29: the 每天 pages carry 犯太歲 as well (Neil: 产品之间的互相引导)
    expect(crossFor("daily", ["zeri"]).more.map((p) => p.id)).toEqual(["taisui"]);
  });

  it("the 「也可以試試」 defaults no longer point 六爻 at 塔羅", () => {
    expect(promoPick("reading").ids).not.toContain("tarot");
    expect(promoPick("tarot").ids[0]).toBe("cast");
  });
});
