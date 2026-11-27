import { describe, expect, it } from "vitest";
import { placeByGeoId, searchPlaces, type GazLocale } from "@/lib/mingli/birth/gazetteer";

const first = (q: string, locale: GazLocale = "zh-hant") => searchPlaces(q, locale)[0];

describe("出生地點 gazetteer", () => {
  it("臺中 / 台中 → Taichung, Asia/Taipei", () => {
    for (const q of ["臺中", "台中", "臺中市", "台中市"]) {
      const p = first(q)!;
      expect(p.name).toBe("臺中市");
      expect(p.tz).toBe("Asia/Taipei");
      expect(p.label).toBe("臺中市 · 臺灣");
    }
    expect(first("台中", "zh")!.name).toBe("台中市");
  });

  it("东莞 / 東莞 → Dongguan, Asia/Shanghai", () => {
    for (const q of ["东莞", "東莞", "東莞市"]) {
      const p = first(q)!;
      expect(p.id).toBe("1812545");
      expect(p.tz).toBe("Asia/Shanghai");
    }
    expect(first("東莞")!.label).toBe("東莞 · 廣東 · 中國");
    expect(first("东莞", "zh")!.label).toBe("东莞 · 广东 · 中国");
  });

  it("溫哥華 / Vancouver → Vancouver, America/Vancouver", () => {
    for (const q of ["溫哥華", "温哥华", "Vancouver", "vancouver"]) {
      const p = first(q)!;
      expect(p.id).toBe("6173331");
      expect(p.tz).toBe("America/Vancouver");
    }
    expect(first("溫哥華")!.label).toBe("溫哥華 · 卑詩省 · 加拿大");
  });

  it("竹北 / 新竹縣竹北 → Zhubei", () => {
    for (const q of ["竹北", "竹北市", "新竹縣竹北", "新竹竹北"]) {
      const p = first(q)!;
      expect(p.id).toBe("1677112");
      expect(p.tz).toBe("Asia/Taipei");
    }
  });

  it("深圳 → the city in 廣東, not the village in 桃園; no repeated labels", () => {
    expect(first("深圳")!.label).toBe("深圳 · 廣東 · 中國");
    const labels = searchPlaces("喀什", "zh-hant").map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("屯門 → Tuen Mun", () => {
    const p = first("屯門")!;
    expect(p.id).toBe("1818446");
    expect(p.tz).toBe("Asia/Hong_Kong");
    expect(first("屯门", "zh")!.id).toBe("1818446");
  });

  it("义乌 / 義烏 found", () => {
    for (const q of ["义乌", "義烏"]) expect(first(q)!.id).toBe("1814870");
  });

  it("吉隆坡 → Asia/Kuala_Lumpur", () => {
    const p = first("吉隆坡")!;
    expect(p.tz).toBe("Asia/Kuala_Lumpur");
    expect(p.label).toBe("吉隆坡 · 馬來西亞");
  });

  it("墨尔本 / 墨爾本 → Melbourne", () => {
    for (const q of ["墨尔本", "墨爾本", "Melbourne"]) {
      const p = first(q)!;
      expect(p.id).toBe("2158177");
      expect(p.tz).toBe("Australia/Melbourne");
    }
  });

  it("empty query lists Taiwan, then Hong Kong, then the mainland; limit is honoured", () => {
    const list = searchPlaces("", "zh-hant");
    expect(list.length).toBe(20);
    expect(list[0]!.name).toBe("臺北市");
    expect(list.some((p) => p.tz === "Asia/Hong_Kong")).toBe(true);
    expect(list[list.length - 1]!.tz).toBe("Asia/Shanghai");
    expect(searchPlaces("市", "zh", 5).length).toBe(5);
  });

  it("placeByGeoId", () => {
    expect(placeByGeoId("1668399")!.name).toBe("臺中市");
    expect(placeByGeoId("1668399", "zh")!.name).toBe("台中市");
    expect(placeByGeoId("nope")).toBeNull();
  });
});
