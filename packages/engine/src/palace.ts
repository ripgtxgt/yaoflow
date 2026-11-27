import { hexagramFromBits } from "./hexagram";
import { najiaFor } from "./najia";
import { relationTo } from "./relations";
import { TRIGRAMS } from "./trigram";
import type {
  Bit, LinePosition, PalaceCategory, PalaceInfo, Phase, Relation, Spirit, Stem, TrigramKey,
} from "./types";

/** 八宫五行: 乾兑金, 离火, 震巽木, 坎水, 艮坤土. */
export const PALACE_PHASE: Readonly<Record<TrigramKey, Phase>> = {
  qian: "metal", dui: "metal", li: "fire", zhen: "wood",
  xun: "wood", kan: "water", gen: "earth", kun: "earth",
};

/**
 * 八宫卦序 generation.
 * 本宫→一世…五世: 由初爻起依次变; 游魂: 五世复变四爻; 归魂: 游魂复变下卦.
 * Net flip sets relative to the pure hexagram, with world positions from
 * 《卜筮正宗·安世应诀》: 八卦之首世六当，以下初爻轮上扬，游魂八宫四爻立，归魂八卦三爻详。
 */
const SEQUENCE: ReadonlyArray<{ category: PalaceCategory; world: LinePosition; flips: readonly number[] }> = [
  { category: "pure",   world: 6, flips: [] },
  { category: "one",    world: 1, flips: [1] },
  { category: "two",    world: 2, flips: [1, 2] },
  { category: "three",  world: 3, flips: [1, 2, 3] },
  { category: "four",   world: 4, flips: [1, 2, 3, 4] },
  { category: "five",   world: 5, flips: [1, 2, 3, 4, 5] },
  { category: "youhun", world: 4, flips: [1, 2, 3, 5] },
  { category: "guihun", world: 3, flips: [5] },
];

function buildPalaces(): ReadonlyMap<number, PalaceInfo> {
  const map = new Map<number, PalaceInfo>();
  for (const key of Object.keys(TRIGRAMS) as TrigramKey[]) {
    const t = TRIGRAMS[key].lines;
    const pure: Bit[] = [...t, ...t];
    for (const step of SEQUENCE) {
      const bits = pure.map((b, i) => (step.flips.includes(i + 1) ? ((1 - b) as Bit) : b));
      const hex = hexagramFromBits(bits);
      if (map.has(hex.number)) throw new Error(`palace collision at hexagram ${hex.number}`);
      map.set(hex.number, {
        palace: key,
        palacePhase: PALACE_PHASE[key],
        category: step.category,
        world: step.world,
        response: ((step.world + 3) > 6 ? step.world - 3 : step.world + 3) as LinePosition,
      });
    }
  }
  if (map.size !== 64) throw new Error(`palace table incomplete: ${map.size}`);
  return map;
}

const PALACES = buildPalaces();

/** Palace, 世应 and palace phase for a hexagram (King Wen number). */
export function palaceOf(hexNumber: number): PalaceInfo {
  const p = PALACES.get(hexNumber);
  if (!p) throw new Error(`invalid hexagram number: ${hexNumber}`);
  return p;
}

/** 六亲 for the six lines of a hexagram, derived from najia phases vs palace phase. */
export function relationsFor(hexNumber: number, lower: TrigramKey, upper: TrigramKey): Relation[] {
  const palace = palaceOf(hexNumber);
  return najiaFor(lower, upper).map((l) => relationTo(palace.palacePhase, l.phase));
}

const SPIRITS: readonly Spirit[] = ["qinglong", "zhuque", "gouchen", "tengshe", "baihu", "xuanwu"];

export const SPIRIT_ZH: Readonly<Record<Spirit, string>> = {
  qinglong: "青龙", zhuque: "朱雀", gouchen: "勾陈",
  tengshe: "螣蛇", baihu: "白虎", xuanwu: "玄武",
};

export const RELATION_ZH: Readonly<Record<Relation, string>> = {
  parent: "父母", sibling: "兄弟", child: "子孙", wealth: "妻财", officer: "官鬼",
};

/**
 * 六神起例（《卜筮正宗·六兽歌》）:
 * 甲乙起青龙, 丙丁起朱雀, 戊日起勾陈, 己日起螣蛇, 庚辛起白虎, 壬癸起玄武。
 * Assigned from line 1 upward, cycling.
 */
export function spiritsForDay(dayStem: Stem): Spirit[] {
  const START: Readonly<Record<Stem, number>> = {
    甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5,
  };
  const s = START[dayStem];
  return Array.from({ length: 6 }, (_, i) => SPIRITS[(s + i) % 6]!);
}
