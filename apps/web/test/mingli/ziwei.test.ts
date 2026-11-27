import { describe, expect, it } from "vitest";
import { normalizeBirth, type BirthInput } from "@/lib/mingli/birth/normalize";
import { astrolabeOf, layerOf, PALACES, sanFang, viewOf, ziweiInput } from "@/lib/mingli/ziwei/chart";
import { Z, STAR_SLUG, PALACE_SLUG } from "@/lib/mingli/ziwei/content";

const tp = (y: number, m: number, d: number, h: number, mi: number, extra: Partial<BirthInput> = {}): BirthInput => ({ calendar: "solar", y, m, d, timeMode: "exact", h, mi, placeId: "tw-tpe", trueSolar: false, ...extra });
const chart = (i: BirthInput, g: "male" | "female" = "male") => viewOf(astrolabeOf(normalizeBirth(i), g));

describe("紫微", () => {
  it("palace names are ours (交友, not 僕役) and all twelve are there", () => {
    const v = chart(tp(1990, 5, 16, 0, 30));
    expect(v.palaces.map((p) => p.name).sort()).toEqual([...PALACES].sort());
  });
  it("23:30 under 23:00 換日 equals 00:30 the next day; 晚子時 keeps the lunar day", () => {
    const a = chart(tp(1990, 5, 15, 23, 30));
    const b = chart(tp(1990, 5, 16, 0, 30));
    expect(a.lunarDate).toBe(b.lunarDate);
    expect(a.soulBranch).toBe(b.soulBranch);
    const c = chart(tp(1990, 5, 15, 23, 30, { zi: "same" }));
    expect(c.lunarDate).not.toBe(b.lunarDate);
  });
  it("辛 year: 天魁 in 午, 天鉞 in 寅", () => {
    const v = chart(tp(1991, 6, 1, 10, 0));
    const where = (s: string) => v.palaces.find((p) => p.minor.some((x) => x.name === s))?.branch;
    expect(where("天魁")).toBe("午");
    expect(where("天鉞")).toBe("寅");
  });
  it("layers and 三方四正", () => {
    const a = astrolabeOf(normalizeBirth(tp(1990, 5, 16, 0, 30)), "male");
    const y = layerOf(a, new Date(2026, 6, 1), "yearly");
    expect(y.palaceBranch).toBe("午"); // 2026 丙午
    expect(Object.keys(y.mutagen)).toHaveLength(4);
    expect(sanFang("子")).toEqual(["子", "辰", "申", "午"]);
  });
  it("gender must be given", () => {
    for (const g of ["M", "", undefined]) expect(() => astrolabeOf(normalizeBirth(tp(1990, 5, 16, 0, 30)), g as "male")).toThrow();
  });
  it("content: 168 star×palace, every slug, no banned words", () => {
    expect(Object.keys(Z.pairs)).toHaveLength(168);
    for (const s of Object.keys(STAR_SLUG)) for (const p of Object.keys(PALACE_SLUG)) expect(Z.pairs[`${s}|${p}`]).toBeTruthy();
    expect(JSON.stringify(Z)).not.toMatch(/[準准]|大吉|大凶|血光|破財|剋|改運|這裡|靈驗|倪師|AI/);
  });
});

// 10-19 對照 Windada／LifeDNA (docs/mingli/ziwei-compare.md): 「晚子時不換日」 must give a different chart from 23:00 換日
describe("紫微 晚子時", () => {
  it("zi=same keeps the day (子時 of the same date), zi=next moves to the next day", () => {
    const base = { calendar: "solar" as const, y: 1990, m: 5, d: 15, timeMode: "exact" as const, h: 23, mi: 30, placeId: "tw-tpe", trueSolar: false };
    const same = normalizeBirth({ ...base, zi: "same" }), next = normalizeBirth({ ...base, zi: "next" });
    expect(ziweiInput(same, "male")).toMatchObject({ date: "1990-5-15", timeIndex: 0 });
    expect(ziweiInput(next, "male")).toMatchObject({ date: "1990-5-16", timeIndex: 0 });
    expect(astrolabeOf(same, "male").lunarDate).not.toBe(astrolabeOf(next, "male").lunarDate);
  });
});
