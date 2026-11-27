import { describe, expect, it } from "vitest";
import { GUA, guaSlug } from "../src/lib/gua";
import { changesFrom, hexBySlug, movingLabel, readingRule, singleLineChanges, transition, transitionPath, transitionValues } from "../src/lib/transitions";

/** §14 ⑨ 本卦→之卦 pages: the data layer under the 4,096 English pages. */
describe("transitions", () => {
  it("derives the cast from the two figures: differing lines are old, the rest young", () => {
    const qian = GUA[0]!; const kun = GUA[1]!; const tai = GUA[10]!; const xu = GUA[4]!;
    expect(transitionValues(qian, kun).join("")).toBe("999999");
    expect(transitionValues(kun, qian).join("")).toBe("666666");
    expect(transitionValues(qian, qian).join("")).toBe("777777");
    expect(transitionValues(tai, xu).join("")).toBe("777868"); // 泰 line 5 (old yin) moving → 需
    const t = transition(11, 5)!;
    expect(t.moving).toEqual([5]);
    expect(t.a.number).toBe(11); expect(t.b.number).toBe(5);
    expect(movingLabel(t)).toBe("line 5");
    expect(movingLabel(transition(1, 2)!)).toBe("all six lines");
    expect(movingLabel(transition(3, 3)!)).toBe("no line");
    expect(movingLabel(transition(1, 11)!)).toBe("lines 4, 5 and 6");
  });

  it("keeps only the date-free relations and carries palace, world and response", () => {
    const t = transition(11, 5)!; // 泰 (坤宫三世) line 5 moving
    expect(t.palace.palace).toBe("kun");
    expect(t.palace.world).toBe(3); expect(t.palace.response).toBe(6);
    expect(t.changes).toHaveLength(1);
    const c = t.changes[0]!;
    expect(c.position).toBe(5);
    for (const k of c.kinds) expect(["kong", "po"]).not.toContain(k);
    expect(t.lines.filter((l) => l.changing).map((l) => l.position)).toEqual([5]);
    // a still chart has no changes at all
    expect(transition(11, 11)!.changes).toEqual([]);
  });

  it("applies Zhu Xi's rule by how many lines move", () => {
    expect(readingRule(transition(11, 11)!).key).toBe("none");
    expect(readingRule(transition(11, 5)!).weigh.map((w) => w.label)).toEqual(["Line 5 of Peace"]);
    const one = readingRule(transition(1, 9)!); // 乾→小畜: line 4 only
    expect(one.key).toBe("one");
    const two = readingRule(transition(11, 34)!); // 泰→大壮: line 4 only? no — 泰 111000 → 大壮 111100 is line 4; use 泰→夬 (111110): lines 4 and 5
    void two;
    const pair = readingRule(transition(11, 43)!);
    expect(pair.key).toBe("two");
    expect(pair.weigh.map((w) => w.note)).toEqual(["governs", undefined]);
    const three = readingRule(transition(1, 11)!);
    expect(three.key).toBe("three");
    expect(three.weigh).toHaveLength(2);
    const four = readingRule(transition(1, 24)!); // 乾→复: lines 2-6 moving = five
    expect(four.key).toBe("five");
    expect(readingRule(transition(1, 2)!).weigh[0]!.label).toBe("All nines (用九)");
    expect(readingRule(transition(3, 50)!).key).toBe("six"); // 屯 ↔ 鼎 are complements
  });

  it("lists the six single-line changes and all 63 changes of a hexagram", () => {
    const qian = GUA[0]!;
    expect(singleLineChanges(qian).map((x) => x.b.number)).toEqual([44, 13, 10, 9, 14, 43]);
    const groups = changesFrom(qian);
    expect(groups.map((g) => g.count)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(63);
    expect(groups.map((g) => g.items.length)).toEqual([6, 15, 20, 15, 6, 1]);
  });

  it("resolves slugs the same way the hexagram pages do", () => {
    expect(hexBySlug("11-tai")?.number).toBe(11);
    expect(hexBySlug("11-nope")).toBeNull();
    expect(hexBySlug("99-x")).toBeNull();
    expect(transitionPath("en", GUA[10]!, GUA[4]!)).toBe(`/en/gua/${guaSlug(GUA[10]!)}/to/${guaSlug(GUA[4]!)}`);
  });
});
