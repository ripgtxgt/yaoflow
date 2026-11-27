import { describe, expect, it } from "vitest";
import { includedNote, upgradePanelView } from "../src/lib/upgrade-panel";
import { TONGKA_T } from "../src/lib/tongka";

/**
 * 10-05 (进度表 §四 28, 客服 #838「會員權益好像又跑了，深斷要單次付費」): a member viewing their own light reading was
 * shown the NT$269 price + pay-consent on the upgrade panel. The panel shows a price only when there is actually a
 * payment — never to a member who still has deep readings this month.
 */
describe("upgrade panel: a member is never shown a price on their own reading", () => {
  it("member with deep readings left → redeem (no price, no consent), says what's included", () => {
    const v = upgradePanelView({ deepLeft: 3, deepTotal: 24, packLeft: 0 });
    expect(v.allowance).toBe(true);
    expect(v.addOnMember).toBe(false);
    expect(v.usingPack).toBe(false);
    expect(v.usedThisPeriod).toBe(21); // 24 total − 3 left = 21 used (#838's exact state: 24/21/剩3)
  });

  it("member down to their bought pack → the included note names the pack", () => {
    const v = upgradePanelView({ deepLeft: 2, deepTotal: 10, packLeft: 2 });
    expect(v.allowance).toBe(true);
    expect(v.usingPack).toBe(true);
  });

  it("member whose month is spent → pay the light add-on price (a real payment)", () => {
    const v = upgradePanelView({ deepLeft: 0, deepTotal: 10, packLeft: 0 });
    expect(v.allowance).toBe(false);
    expect(v.addOnMember).toBe(true);
  });

  it("non-member (or a forwarded link / paywall off) → unchanged paid door", () => {
    const v = upgradePanelView(null);
    expect(v.allowance).toBe(false);
    expect(v.addOnMember).toBe(false);
    expect(v.usingPack).toBe(false);
  });

  it("the guarantee: allowance ⇒ no price shown", () => {
    for (const m of [{ deepLeft: 1, deepTotal: 10, packLeft: 0 }, { deepLeft: 24, deepTotal: 24, packLeft: 0 }, { deepLeft: 5, deepTotal: 10, packLeft: 5 }]) {
      const v = upgradePanelView(m);
      // allowance means redeem; the panel renders no price and no consent in this branch
      expect(v.allowance && !v.addOnMember).toBe(true);
    }
  });
});

/**
 * 10-23 进度表 96 ④ (客服 #510): under the 通卡 model the entitlement carries 999 as a count — the panel must not turn that
 * into 「本月 10 次深斷，已用 N 次」. A pass holder reads the pass's end, a member 「會員不限次」; the older model's words stay
 * for the older model.
 */
describe("upgrade panel under the 通卡 model: no 「本月 N 次」", () => {
  const end = Date.UTC(2026, 9, 24, 12, 52); // 10-24 20:52 Taipei
  it("a 1-day pass → 通卡期內不限次 · 到 {date with the hour}; a 30-day one → the day only", () => {
    const one = includedNote({ deepLeft: 999, deepTotal: 1001, packLeft: 0, unlimited: true, pass: true, passDays: 1, periodEnd: end }, "zh-hant")!;
    expect(one.startsWith("通卡期內不限次 · 到 ")).toBe(true);
    expect(one).toMatch(/\d{1,2}:\d{2}/);
    expect(one).not.toMatch(/本月|10 次|已用/);
    const month = includedNote({ deepLeft: 999, deepTotal: 999, packLeft: 0, unlimited: true, pass: true, passDays: 30, periodEnd: end }, "zh-hant")!;
    expect(month.startsWith("通卡期內不限次 · 到 ")).toBe(true);
    expect(month).not.toMatch(/\d{1,2}:\d{2}/);
  });
  it("a member (or a complimentary one) → 會員不限次, in every language", () => {
    for (const l of Object.keys(TONGKA_T)) {
      const n = includedNote({ deepLeft: 999, deepTotal: 1003, packLeft: 0, unlimited: true, pass: false, periodEnd: end }, l);
      expect(n, l).toBe(TONGKA_T[l]!.includedMember);
      expect(n).not.toMatch(/\{\w+\}|10/);
      expect(TONGKA_T[l]!.includedPass, l).toContain("{date}");
    }
    const v = upgradePanelView({ deepLeft: 999, deepTotal: 1003, packLeft: 0, unlimited: true, pass: false, periodEnd: end });
    expect(v).toMatchObject({ allowance: true, addOnMember: false, usingPack: false, usedThisPeriod: 0, included: "member" });
  });
  it("the older model is untouched: no `unlimited` → the counted words, and no note from the table", () => {
    expect(includedNote({ deepLeft: 3, deepTotal: 24, packLeft: 0 }, "zh-hant")).toBeNull();
    expect(upgradePanelView({ deepLeft: 3, deepTotal: 24, packLeft: 0 }).included).toBeNull();
    expect(includedNote(null, "zh-hant")).toBeNull();
  });
});
