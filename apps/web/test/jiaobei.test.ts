import { describe, expect, it } from "vitest";
import { confirmsNeeded, drawLot, hkWords, NOTES, qiuqianTemples, toss } from "../src/lib/jiaobei";
import { jiaobeiUi } from "../src/lib/jiaobei-ui";

// 10-16 进度表 67: odds 50/25/25, the temple rules, the Hong Kong wording, and none of the words we never write
describe("線上擲筊／求籤", () => {
  it("two even blocks: 聖 50%, 笑 25%, 陰 25%", () => {
    const seq = [0.1, 0.9, 0.1, 0.1, 0.9, 0.9, 0.9, 0.1];
    let i = 0; const r = () => seq[i++ % seq.length]!;
    expect([toss(r).sign, toss(r).sign, toss(r).sign, toss(r).sign]).toEqual(["sheng", "xiao", "yin", "sheng"]);
    const n = 40_000; const c = { sheng: 0, xiao: 0, yin: 0 };
    for (let k = 0; k < n; k++) c[toss().sign]++;
    expect(Math.abs(c.sheng / n - 0.5)).toBeLessThan(0.015);
    expect(Math.abs(c.xiao / n - 0.25)).toBeLessThan(0.015);
    expect(Math.abs(c.yin / n - 0.25)).toBeLessThan(0.015);
  });
  it("lots are 1…count, the temples come with their set and size, 龍山寺 asks for three", () => {
    for (let k = 0; k < 500; k++) { const x = drawLot(60); expect(x).toBeGreaterThanOrEqual(1); expect(x).toBeLessThanOrEqual(60); }
    expect(drawLot(100, () => 0.999999)).toBe(100);
    const ts = qiuqianTemples();
    expect(ts[0]).toMatchObject({ id: "donggang", set: "liushi-jiazi", count: 60 });
    expect(ts.find((t) => t.id === "longshan")?.set).toBe("guanyin");
    expect(confirmsNeeded("longshan")).toBe(3);
    expect(confirmsNeeded("donggang")).toBe(1);
    expect(ts.some((t) => t.id === "mazu")).toBe(false); // unlisted stays unlisted
  });
  it("Hong Kong says 杯; no 神明說 / 靈驗 / 準 / 保證 anywhere", () => {
    expect(hkWords("擲筊得到聖筊、笑筊、陰筊")).toBe("擲杯得到聖杯、笑杯、陰杯");
    const ui = jiaobeiUi({ hans: false, hk: true });
    expect(ui.signs.sheng.name).toBe("聖杯");
    const all = JSON.stringify([jiaobeiUi({ hans: false, hk: false }), NOTES]);
    expect(all).not.toMatch(/神明說|靈驗|準|保證會|改運|AI/);
    expect(jiaobeiUi({ hans: true, hk: false }).tossBtn).toBe("掷筊");
  });
});
