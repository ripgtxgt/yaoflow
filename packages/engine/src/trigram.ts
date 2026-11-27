import type { Bit, TrigramInfo, TrigramKey } from "./types";

/**
 * 八卦 base data. `lines` are bottom-up, 1 = yang, 0 = yin.
 * 乾三连、坤六断、震仰盂、艮覆碗、离中虚、坎中满、兑上缺、巽下断。
 */
export const TRIGRAMS: Readonly<Record<TrigramKey, TrigramInfo>> = {
  qian: { key: "qian", zh: "乾", pinyin: "Qián", en: "The Creative", natureZh: "天", natureEn: "Heaven", lines: [1, 1, 1], symbol: "☰" },
  dui:  { key: "dui",  zh: "兑", pinyin: "Duì",  en: "The Joyous",   natureZh: "泽", natureEn: "Lake",   lines: [1, 1, 0], symbol: "☱" },
  li:   { key: "li",   zh: "离", pinyin: "Lí",   en: "The Clinging", natureZh: "火", natureEn: "Fire",   lines: [1, 0, 1], symbol: "☲" },
  zhen: { key: "zhen", zh: "震", pinyin: "Zhèn", en: "The Arousing", natureZh: "雷", natureEn: "Thunder",lines: [1, 0, 0], symbol: "☳" },
  xun:  { key: "xun",  zh: "巽", pinyin: "Xùn",  en: "The Gentle",   natureZh: "风", natureEn: "Wind",   lines: [0, 1, 1], symbol: "☴" },
  kan:  { key: "kan",  zh: "坎", pinyin: "Kǎn",  en: "The Abysmal",  natureZh: "水", natureEn: "Water",  lines: [0, 1, 0], symbol: "☵" },
  gen:  { key: "gen",  zh: "艮", pinyin: "Gèn",  en: "Keeping Still",natureZh: "山", natureEn: "Mountain",lines: [0, 0, 1], symbol: "☶" },
  kun:  { key: "kun",  zh: "坤", pinyin: "Kūn",  en: "The Receptive",natureZh: "地", natureEn: "Earth",  lines: [0, 0, 0], symbol: "☷" },
};

const KEY_BY_BITS = new Map<string, TrigramKey>(
  (Object.values(TRIGRAMS) as TrigramInfo[]).map((t) => [t.lines.join(""), t.key]),
);

/** Resolve a trigram from three bottom-up bits. */
export function trigramFromBits(bits: readonly [Bit, Bit, Bit]): TrigramInfo {
  const key = KEY_BY_BITS.get(bits.join(""));
  if (!key) throw new Error(`invalid trigram bits: ${bits.join(",")}`);
  return TRIGRAMS[key];
}
