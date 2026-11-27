/**
 * Core types for the YaoFlow Liu Yao engine.
 *
 * Design rule (see MVP doc §6): everything here is DETERMINISTIC.
 * The AI layer never computes or alters any of these values.
 */

/** Three-coin cast value for one line: 6 老阴, 7 少阳, 8 少阴, 9 老阳. */
export type LineValue = 6 | 7 | 8 | 9;

export type Polarity = "yin" | "yang";

/** Line position, 1 = bottom (初爻) … 6 = top (上爻). */
export type LinePosition = 1 | 2 | 3 | 4 | 5 | 6;

export type TrigramKey =
  | "qian" // 乾 ☰
  | "dui" //  兑 ☱
  | "li" //   离 ☲
  | "zhen" // 震 ☳
  | "xun" //  巽 ☴
  | "kan" //  坎 ☵
  | "gen" //  艮 ☶
  | "kun"; // 坤 ☷

/** 0 = yin, 1 = yang. Arrays are always bottom-up. */
export type Bit = 0 | 1;

export type Stem = "甲" | "乙" | "丙" | "丁" | "戊" | "己" | "庚" | "辛" | "壬" | "癸";

export type Branch =
  | "子" | "丑" | "寅" | "卯" | "辰" | "巳"
  | "午" | "未" | "申" | "酉" | "戌" | "亥";

export type Phase = "wood" | "fire" | "earth" | "metal" | "water";

export interface CastLine {
  position: LinePosition;
  value: LineValue;
  polarity: Polarity;
  changing: boolean;
}

export interface TrigramInfo {
  key: TrigramKey;
  zh: string;
  pinyin: string;
  en: string;
  /** Natural image, e.g. 天/Heaven. */
  natureZh: string;
  natureEn: string;
  /** Lines bottom-up. */
  lines: readonly [Bit, Bit, Bit];
  symbol: string;
}

export interface HexagramInfo {
  /** King Wen sequence number, 1–64. */
  number: number;
  zh: string;
  pinyin: string;
  en: string;
  /** Full traditional name, e.g. 乾为天 / 水雷屯. */
  fullZh: string;
  lower: TrigramKey;
  upper: TrigramKey;
  /** Unicode hexagram symbol ䷀–䷿. */
  symbol: string;
}

export interface NajiaLine {
  position: LinePosition;
  stem: Stem;
  branch: Branch;
  phase: Phase;
}

/** 六亲: 父母/兄弟/子孙/妻财/官鬼 relative to the palace phase. */
export type Relation = "parent" | "sibling" | "child" | "wealth" | "officer";

/** 六神, assigned by day stem from line 1 upward. */
export type Spirit = "qinglong" | "zhuque" | "gouchen" | "tengshe" | "baihu" | "xuanwu";

export type PalaceCategory =
  | "pure" | "one" | "two" | "three" | "four" | "five" | "youhun" | "guihun";

export interface PalaceInfo {
  palace: TrigramKey;
  palacePhase: Phase;
  category: PalaceCategory;
  /** 世爻 position. */
  world: LinePosition;
  /** 应爻 position (world ± 3). */
  response: LinePosition;
}

/** 旺相休囚死 seasonal strength. */
export type Strength = "wang" | "xiang" | "xiu" | "qiu" | "si";

export interface Pillar {
  stem: Stem;
  branch: Branch;
}

export interface CalendarContext {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  /** 0–59 sexagenary index of the day. */
  dayIndex: number;
  /** 旬空 of the day. */
  voidBranches: readonly [Branch, Branch];
  /** Apparent solar longitude in degrees at the instant, for audit. */
  solarLongitude: number;
}

export interface CastResult {
  /** Raw immutable input, bottom-up. */
  values: readonly [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue];
  lines: CastLine[];
  changingPositions: LinePosition[];
  primary: HexagramInfo;
  /** Null when no changing lines. */
  changed: HexagramInfo | null;
  /** Najia of the primary hexagram. */
  najia: NajiaLine[];
}
