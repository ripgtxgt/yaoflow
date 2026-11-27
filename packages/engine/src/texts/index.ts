import { EN_PART1 } from "./en/part1";
import { EN_PART2 } from "./en/part2";
import { EN_PART3 } from "./en/part3";
import { EN_PART4 } from "./en/part4";
import type { HexTextEn } from "./en/types";
import { ZHOUYI_ZH, type ZhouyiHexText, type ZhouyiLineText } from "./zhouyi-zh";

export type { HexTextEn } from "./en/types";
export { ZHOUYI_ZH, type ZhouyiHexText, type ZhouyiLineText } from "./zhouyi-zh";

export const ZHOUYI_EN: Readonly<Record<number, HexTextEn>> = {
  ...EN_PART1,
  ...EN_PART2,
  ...EN_PART3,
  ...EN_PART4,
};

export interface HexTexts {
  zh: ZhouyiHexText;
  en: HexTextEn;
}

/** Bilingual judgment + line texts for a hexagram (King Wen number). */
export function textsFor(hexNumber: number): HexTexts {
  const zh = ZHOUYI_ZH[hexNumber];
  const en = ZHOUYI_EN[hexNumber];
  if (!zh || !en) throw new Error(`no texts for hexagram ${hexNumber}`);
  return { zh, en };
}
