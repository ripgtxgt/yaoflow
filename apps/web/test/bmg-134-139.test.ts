import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import { HEXES, QUESTIONS, BMG_TYPES, dimLines, hexByLines, hexesOfType4, linesType4, scoreFull, scoreQuick, stressChain, type4Lines, type Answer } from "../src/lib/bmg";
import { layerFact, mainLine } from "../src/lib/san-cai";
import { bmgOverlay } from "../src/lib/bmg-overlay";
import { monthBmgText, monthFit, monthOf } from "../src/lib/bmg-month";
import { pairLayers } from "../src/lib/bmg-pair";
import { bmgHistory, bmgLinesForSession, latestBmg, saveBmg } from "../src/lib/bmg-store";
import { deepSystem, oneSystem } from "../src/lib/reading";
import { db, recordOrder, revisitStateTable, setRevisitState, upsertCustomer } from "../src/lib/db";
import { STATE_T } from "../src/lib/dict/revisit-state";
import { LOCALES } from "../src/lib/locales";

/** 11-05 进度表 134–139 */
describe("134 三才 — which layer moves", () => {
  it("picks the leading line by the old rule", () => {
    expect(mainLine([3])).toBe(3);
    expect(mainLine([2, 5])).toBe(5);
    expect(mainLine([1, 3, 6])).toBe(3);
    expect(mainLine([1, 2, 3, 4])).toBe(5);
    expect(mainLine([])).toBeNull();
    expect(mainLine([1, 2, 3, 4, 5, 6])).toBeNull();
  });
  it("names the layer and the 應 line it pulls", () => {
    const f = layerFact([2])!;
    expect(f.layer).toBe("act");
    expect(f.pulls?.line).toBe(5);
    expect(f.pulls?.layer).toBe("want");
    expect(layerFact([3])!.pulls?.line).toBe(6);
    expect(layerFact([4])!.layer).toBe("think");
  });
  it("both tiers ask for one_step and carry the layer rule; light allows it as the one exception", () => {
    for (const s of [oneSystem("zh-hant"), deepSystem("zh-hant")]) {
      expect(s).toContain('"one_step"');
      expect(s).toContain("WHICH LAYER IS MOVING");
      expect(s).toContain("THE READER'S OWN HEXAGRAM");
    }
  });
});

describe("135 回访 state × acted", () => {
  it("stores the taps, a later tap keeps the other one, and the table counts", () => {
    const now = Date.now();
    db().prepare(`INSERT INTO revisits (session_id, cast_id, customer_id, email, locale, tier, created_at, due_at, window_days, timing_quote, ask, plan, outcome, outcome_at)
      VALUES ('cs_135', NULL, NULL, 'r135@example.org', 'zh-hant', 'deep', ?, ?, 7, '', 'event', '先傳訊息', 'hit', ?)`).run(now - 9e8, now - 1e8, now);
    const id = Number((db().prepare("SELECT id FROM revisits WHERE session_id = 'cs_135'").get() as { id: number }).id);
    setRevisitState(id, "tight", null);
    setRevisitState(id, null, "some");
    const r = db().prepare("SELECT state, acted FROM revisits WHERE id = ?").get(id) as { state: string; acted: string };
    expect(r).toEqual({ state: "tight", acted: "some" });
    expect(revisitStateTable(now - 86_400_000).some((x) => x.state === "tight" && x.acted === "some" && x.outcome === "hit")).toBe(true);
  });
  it("every language has the four states and the three answers", () => {
    for (const l of LOCALES) { expect(STATE_T[l].states).toHaveLength(4); expect(STATE_T[l].acted).toHaveLength(3); }
  });
});

describe("136 本命卦", () => {
  it("the 64 entries are a complete, consistent set (lines, four letters, stress chain)", () => {
    expect(HEXES).toHaveLength(64);
    expect(new Set(HEXES.map((h) => h.lines.join(""))).size).toBe(64);
    for (const h of HEXES) {
      expect(linesType4(h.lines)).toBe(h.type4);
      const s = stressChain(h.lines);
      expect(s.map((x) => x.kw)).toEqual([h.stress.tense, h.stress.pressure, h.stress.breaking]);
    }
    expect(QUESTIONS).toHaveLength(12);
  });
  it("scores the full quiz; a split line follows question 1 below and question 2 above, and is marked", () => {
    const a: Record<number, Answer> = {};
    for (let n = 1; n <= 12; n++) a[n] = "A";
    expect(scoreFull(a)).toEqual({ lines: [1, 1, 1, 1, 1, 1], ties: [] });
    a[1] = "B"; // line 1 split: first question (B) wins
    a[8] = "B"; // line 4 split: second question (B) wins
    const s = scoreFull(a)!;
    expect(s.lines).toEqual([0, 1, 1, 0, 1, 1]);
    expect(s.ties).toEqual([1, 4]);
    expect(dimLines(s.lines, s.ties).filter((d) => d.both).map((d) => d.line)).toEqual([1, 4]);
    delete a[12];
    expect(scoreFull(a)).toBeNull();
  });
  it("the quick version: four letters fix lines 1–4", () => {
    expect(type4Lines("INTJ")).toEqual([1, 1, 1, 1]);
    expect(scoreQuick("ESFP", "B", "B")!.lines).toEqual([0, 0, 0, 0, 0, 0]);
    expect(hexByLines(scoreQuick("intj", "A", "A")!.lines).kw).toBe(1);
    expect(scoreQuick("XXXX", "A", "A")).toBeNull();
    expect(BMG_TYPES).toHaveLength(16);
    for (const t of BMG_TYPES) expect(new Set(hexesOfType4(t).map((h) => h.kw)).size).toBe(4);
  });
  it("is kept by browser, found by account through the browser link, and reaches the reading", () => {
    const r = saveBmg({ bid: "b136b136b136b136", customerId: null, locale: "zh-hant", mode: "quick", answers: "INTJAA", type4: "INTJ", lines: "111111", ties: [] });
    expect(r.kw).toBe(1);
    expect(r.stress).toBe([10, 6, 12].join(","));
    expect(latestBmg({ bid: "b136b136b136b136" })?.token).toBe(r.token);
    const cid = upsertCustomer("b136@example.org", "zh-hant");
    db().prepare("INSERT INTO browser_links (bid, customer_id, first_at, last_at, how) VALUES ('b136b136b136b136', ?, 0, 0, 'test')").run(cid);
    expect(bmgHistory({ customerId: cid })).toHaveLength(1);
    recordOrder({ sessionId: "cs_b136", customerId: cid, castId: null, tier: "deep", amountCents: 999, currency: "USD", email: "b136@example.org", status: "paid" });
    expect(bmgLinesForSession("cs_b136")).toBe("111111");
    expect(bmgLinesForSession("cs_nobody")).toBeNull();
  });
  it("lays the 本命卦 over a chart layer by layer", () => {
    const o = bmgOverlay([1, 1, 1, 1, 1, 1], [1, 1, 0, 0, 1, 0], [3], "乾為天");
    expect(o.layers.map((x) => x.match)).toEqual(["same", "opposite", "split"]);
    expect(o.layers.map((x) => x.moving)).toEqual([false, true, false]);
  });
});

describe("137 本命卦 × 當月卦", () => {
  it("every month resolves to its 消息卦, and the fit follows the rule order", () => {
    for (let m = 0; m < 12; m++) {
      const x = monthOf(Date.UTC(2027, m, 15, 4));
      expect(x.xiaoxi).toBeTruthy();
    }
    const nov = monthOf(Date.UTC(2026, 10, 15, 4)); // 亥月 → 坤為地, 乾
    expect(nov.month.branchMonth).toBe("亥月");
    expect(monthFit([0, 0, 0, 0, 0, 0], nov).fit).toBe("own");
    expect(monthFit([1, 1, 1, 0, 0, 0], nov).fit).toBe("easy_lower");
    expect(monthBmgText([1, 1, 1, 1, 1, 1], Date.UTC(2026, 10, 15, 4)).body).toMatch(/乾/);
  });
});

describe("138 合卦", () => {
  it("six layers, same or complementary, never a verdict", () => {
    const p = pairLayers([1, 1, 1, 1, 1, 1], [1, 0, 1, 0, 1, 0]);
    expect(p.map((x) => x.same)).toEqual([true, false, true, false, true, false]);
    for (const x of p) expect(x.text).not.toMatch(/不合|不適合|好壞|分數/);
  });
});
