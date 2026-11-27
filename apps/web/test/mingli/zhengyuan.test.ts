import { describe, expect, it } from "vitest";
import { SixtyCycle } from "tyme4ts";
import { BANNED, zhengyuanOf } from "@/lib/mingli/bazi/zhengyuan";
import { shenshaOf } from "@/lib/mingli/bazi/shensha";

const texts = (z: ReturnType<typeof zhengyuanOf>) => [
  ...z.traits.flatMap((t) => [t.label, t.text]),
  z.imagePrompt.scene, ...z.imagePrompt.mood, ...z.imagePrompt.palette,
];

describe("zhengyuanOf", () => {
  it("己巳 癸酉 己丑 庚午 male: 偏财·水 透月干, 坐配偶宫, 丑午相害, 桃花", () => {
    const z = zhengyuanOf({ pillars: ["己巳", "癸酉", "己丑", "庚午"], gender: "male" });
    expect(z.star.ten).toBe("偏财");
    expect(z.star.element).toBe("水");
    expect(z.star.where).toEqual([{ pillar: 1, visible: true }, { pillar: 2, visible: false }]);
    expect(z.star.strength).toBe("鲜明");
    expect(z.palace).toMatchObject({ branch: "丑", element: "土", ten: "比肩" });
    expect(z.palace.relations).toContain("丑午相害");
    // 桃花 agrees with shensha.ts (巳酉丑 → 午: on the hour column)
    const natal = { year: "己巳", month: "癸酉", day: "己丑", hour: "庚午" };
    expect(shenshaOf("庚午", natal, "male", "natal-hour")).toContain("桃花");
    expect(z.flowers).toContain("桃花");
    expect(z.traits.map((t) => t.key)).toEqual(["qiyun", "titai", "dise", "shentai", "xiangchu", "yuanfen", "xiangyu"]);
    expect(z.imagePrompt.element).toBe("水");
  });

  it("female takes 官杀; 正 before 偏 when both visible", () => {
    // 甲日: 辛 正官, 庚 七杀
    const z = zhengyuanOf({ pillars: ["庚午", "辛巳", "甲子", "丙寅"], gender: "female" });
    expect(z.star.ten).toBe("正官");
    expect(z.star.element).toBe("金");
  });

  it("hidden only: 藏支 star, no stem", () => {
    // 甲日 male, 财 = 土; no 戊己 stems, 丑 hides 己
    const z = zhengyuanOf({ pillars: ["甲子", "丙寅", "甲子", "乙丑"], gender: "male" });
    expect(z.star.ten).toBe("正财");
    expect(z.star.where.every((w) => !w.visible)).toBe(true);
    expect(["隐约", "适中"]).toContain(z.star.strength);
  });

  it("star absent → 不见, reading falls back to 日支", () => {
    // 壬日 female, 官杀 = 土: no 戊己 stems, no 辰戌丑未, 寅巳申 hide 戊 — pick branches without 戊己
    const z = zhengyuanOf({ pillars: ["壬子", "壬子", "壬子", "癸卯"], gender: "female" });
    expect(z.star.strength).toBe("不见");
    expect(z.star.where).toEqual([]);
    expect(z.traits[0]!.basis).toContain("配偶星不见");
    expect(z.imagePrompt.element).toBe("水"); // 子
    for (const t of z.traits) expect(t.text.length).toBeGreaterThan(10);
  });

  it("works without an hour pillar", () => {
    const z = zhengyuanOf({ pillars: ["己巳", "癸酉", "己丑"], gender: "female" });
    expect(z.traits.length).toBe(7);
  });

  it("no banned words, TA only, for all 60 day pillars × both genders × a few year/month/hour sets", () => {
    const frames = [["己巳", "癸酉", "庚午"], ["甲子", "丙寅", "丙子"], ["庚申", "戊子", "壬午"], ["丁卯", "丁未", "辛亥"]];
    for (let i = 0; i < 60; i++) {
      const day = SixtyCycle.fromIndex(i).getName();
      for (const [y, m, h] of frames) for (const gender of ["male", "female"] as const) {
        const z = zhengyuanOf({ pillars: [y!, m!, day, h!], gender });
        for (const s of texts(z)) {
          for (const w of BANNED) expect(s, `${day} ${gender}: "${w}" in ${s}`).not.toContain(w);
          expect(s).not.toMatch(/undefined|null|NaN/);
        }
        for (const t of z.traits) expect(t.text.length, `${day} ${t.key}`).toBeGreaterThan(10);
        expect(z.imagePrompt.palette.length).toBeGreaterThan(0);
      }
    }
  });

  it("10-21: the 配偶星 follows the partner's sex — default opposite, 同性 reads the same sex", () => {
    const p = ["己巳", "癸酉", "己丑", "庚午"];
    const def = zhengyuanOf({ pillars: p, gender: "male" });
    expect(def.partner).toBe("female");
    expect(["正财", "偏财"]).toContain(def.star.ten);
    const gay = zhengyuanOf({ pillars: p, gender: "male", partner: "male" });
    expect(gay.partner).toBe("male");
    expect(["正官", "七杀"]).toContain(gay.star.ten);
    expect(gay.star.element).toBe("木"); // 己土 → 克我者 木
    const les = zhengyuanOf({ pillars: p, gender: "female", partner: "female" });
    expect(["正财", "偏财"]).toContain(les.star.ten);
    expect(les.star.element).toBe("水"); // 己土 → 我克者 水
    for (const t of [...gay.traits, ...les.traits]) for (const w of BANNED) expect(t.text).not.toContain(w);
  });
});
