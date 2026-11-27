import { TRIGRAMS, trigramFromBits } from "./trigram";
import type { Bit, HexagramInfo, TrigramKey } from "./types";

/**
 * King Wen sequence lookup: KINGWEN[lower][upper] → hexagram number.
 * This is the classical 上下卦→卦序 matrix (分宫卦象次序 cross table).
 * Verified against the received text order 乾坤屯蒙需讼师比…既济未济
 * and spot-checked in unit tests (泰/否/屯/未济/复/姤 etc.).
 */
export const KINGWEN: Readonly<Record<TrigramKey, Readonly<Record<TrigramKey, number>>>> = {
  //        upper: qian dui  li   zhen xun  kan  gen  kun
  qian: { qian: 1,  dui: 43, li: 14, zhen: 34, xun: 9,  kan: 5,  gen: 26, kun: 11 },
  dui:  { qian: 10, dui: 58, li: 38, zhen: 54, xun: 61, kan: 60, gen: 41, kun: 19 },
  li:   { qian: 13, dui: 49, li: 30, zhen: 55, xun: 37, kan: 63, gen: 22, kun: 36 },
  zhen: { qian: 25, dui: 17, li: 21, zhen: 51, xun: 42, kan: 3,  gen: 27, kun: 24 },
  xun:  { qian: 44, dui: 28, li: 50, zhen: 32, xun: 57, kan: 48, gen: 18, kun: 46 },
  kan:  { qian: 6,  dui: 47, li: 64, zhen: 40, xun: 59, kan: 29, gen: 4,  kun: 7 },
  gen:  { qian: 33, dui: 31, li: 56, zhen: 62, xun: 53, kan: 39, gen: 52, kun: 15 },
  kun:  { qian: 12, dui: 45, li: 35, zhen: 16, xun: 20, kan: 8,  gen: 23, kun: 2 },
};

/** name tables, index 0 → hexagram 1. Chinese per received text; English titles are conventional. */
const ZH = [
  "乾", "坤", "屯", "蒙", "需", "讼", "师", "比", "小畜", "履",
  "泰", "否", "同人", "大有", "谦", "豫", "随", "蛊", "临", "观",
  "噬嗑", "贲", "剥", "复", "无妄", "大畜", "颐", "大过", "坎", "离",
  "咸", "恒", "遁", "大壮", "晋", "明夷", "家人", "睽", "蹇", "解",
  "损", "益", "夬", "姤", "萃", "升", "困", "井", "革", "鼎",
  "震", "艮", "渐", "归妹", "丰", "旅", "巽", "兑", "涣", "节",
  "中孚", "小过", "既济", "未济",
] as const;

const PINYIN = [
  "Qián", "Kūn", "Zhūn", "Méng", "Xū", "Sòng", "Shī", "Bǐ", "Xiǎo Chù", "Lǚ",
  "Tài", "Pǐ", "Tóng Rén", "Dà Yǒu", "Qiān", "Yù", "Suí", "Gǔ", "Lín", "Guān",
  "Shì Kè", "Bì", "Bō", "Fù", "Wú Wàng", "Dà Chù", "Yí", "Dà Guò", "Kǎn", "Lí",
  "Xián", "Héng", "Dùn", "Dà Zhuàng", "Jìn", "Míng Yí", "Jiā Rén", "Kuí", "Jiǎn", "Xiè",
  "Sǔn", "Yì", "Guài", "Gòu", "Cuì", "Shēng", "Kùn", "Jǐng", "Gé", "Dǐng",
  "Zhèn", "Gèn", "Jiàn", "Guī Mèi", "Fēng", "Lǚ", "Xùn", "Duì", "Huàn", "Jié",
  "Zhōng Fú", "Xiǎo Guò", "Jì Jì", "Wèi Jì",
] as const;

const EN = [
  "The Creative", "The Receptive", "Difficulty at the Beginning", "Youthful Folly", "Waiting", "Conflict", "The Army", "Holding Together", "Small Taming", "Treading",
  "Peace", "Standstill", "Fellowship", "Great Possession", "Modesty", "Enthusiasm", "Following", "Work on the Decayed", "Approach", "Contemplation",
  "Biting Through", "Grace", "Splitting Apart", "Return", "Innocence", "Great Taming", "Nourishment", "Great Exceeding", "The Abysmal", "The Clinging",
  "Influence", "Duration", "Retreat", "Great Power", "Progress", "Darkening of the Light", "The Family", "Opposition", "Obstruction", "Deliverance",
  "Decrease", "Increase", "Breakthrough", "Coming to Meet", "Gathering Together", "Pushing Upward", "Oppression", "The Well", "Revolution", "The Cauldron",
  "The Arousing", "Keeping Still", "Gradual Progress", "The Marrying Maiden", "Abundance", "The Wanderer", "The Gentle", "The Joyous", "Dispersion", "Limitation",
  "Inner Truth", "Small Exceeding", "After Completion", "Before Completion",
] as const;

/** Unicode hexagram symbols, U+4DC0 ䷀ is hexagram 1. */
function symbolFor(num: number): string {
  return String.fromCodePoint(0x4dc0 + num - 1);
}

/** 乾为天-style full name: same-trigram hexagrams use 为, others 上卦nature+下卦nature+name. */
function fullZhFor(num: number, lower: TrigramKey, upper: TrigramKey): string {
  const zh = ZH[num - 1]!;
  if (lower === upper) return `${TRIGRAMS[lower].zh}为${TRIGRAMS[lower].natureZh}`;
  return `${TRIGRAMS[upper].natureZh}${TRIGRAMS[lower].natureZh}${zh}`;
}

function buildAll(): ReadonlyMap<number, HexagramInfo> {
  const map = new Map<number, HexagramInfo>();
  for (const lower of Object.keys(KINGWEN) as TrigramKey[]) {
    for (const upper of Object.keys(KINGWEN[lower]) as TrigramKey[]) {
      const number = KINGWEN[lower][upper];
      map.set(number, {
        number,
        zh: ZH[number - 1]!,
        pinyin: PINYIN[number - 1]!,
        en: EN[number - 1]!,
        fullZh: fullZhFor(number, lower, upper),
        lower,
        upper,
        symbol: symbolFor(number),
      });
    }
  }
  return map;
}

const HEXAGRAMS = buildAll();

export function hexagramByNumber(num: number): HexagramInfo {
  const h = HEXAGRAMS.get(num);
  if (!h) throw new Error(`invalid hexagram number: ${num}`);
  return h;
}

/** Resolve a hexagram from six bottom-up bits. */
export function hexagramFromBits(bits: readonly Bit[]): HexagramInfo {
  if (bits.length !== 6) throw new Error("need exactly 6 lines");
  const lower = trigramFromBits([bits[0]!, bits[1]!, bits[2]!]);
  const upper = trigramFromBits([bits[3]!, bits[4]!, bits[5]!]);
  return hexagramByNumber(KINGWEN[lower.key][upper.key]);
}

export function allHexagrams(): HexagramInfo[] {
  return [...HEXAGRAMS.values()].sort((a, b) => a.number - b.number);
}
