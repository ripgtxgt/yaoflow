import { bzNameOf, josa, type BaziNames, type BzLang } from "@/lib/mingli/bazi/names-fmt";

/**
 * 10-30 进度表 128 ④ — the 紫微斗數 names, helpers side (client-safe, no data): the keys, the shape of one language's
 * names (ZiweiNames) and zwNameOf, which names any chart word the iztro zh-TW view hands over — a star, a palace, a
 * brightness, a 四化, a 五行局, a stem or a branch. The names themselves: names.ts (ZIWEI_NAMES).
 * Latin languages write stars in pinyin (Zi Wei, Tian Ji); Japanese keeps the kanji (新字体: 禄 権 徳 陥); Korean writes
 * hangul (자미, 천기). The 38 雜曜 (adjective stars) are not named outside Chinese — the pages leave them out.
 */
export type ZwLang = BzLang;

export const ZW_MAJOR = ["紫微", "天機", "太陽", "武曲", "天同", "廉貞", "天府", "太陰", "貪狼", "巨門", "天相", "天梁", "七殺", "破軍"] as const;
export const ZW_MINOR = ["左輔", "右弼", "文昌", "文曲", "天魁", "天鉞", "祿存", "天馬", "擎羊", "陀羅", "火星", "鈴星", "地空", "地劫"] as const;
export const ZW_PALACES = ["命宮", "兄弟", "夫妻", "子女", "財帛", "疾厄", "遷移", "交友", "官祿", "田宅", "福德", "父母"] as const;
export const ZW_BRIGHT = ["廟", "旺", "得", "利", "平", "不", "陷"] as const;
export const ZW_MUT = ["祿", "權", "科", "忌"] as const;
export const ZW_FIVE = ["水二局", "木三局", "金四局", "土五局", "火六局"] as const;

export interface ZiweiNames {
  /** the fourteen main stars, then the fourteen minor ones (ZW_MAJOR, ZW_MINOR order) */
  major: string[]; minor: string[];
  /** Latin languages: what each main star is called in English-language books ("the Emperor star"); none in ja / ko */
  gloss?: string[];
  /** a palace on the board (short) and in a sentence (full) */
  palace: string[]; palaceFull: string[];
  /** brightness: the mark on the board, the word in a sentence */
  bright: string[]; brightWord: string[];
  /** 祿權科忌: the badge, the full name, what it means */
  mut: string[]; mutFull: string[]; mutGloss: string[];
  five: string[];
  /** the board's mark for a layer's palace names: 大限 / 流年 / 流月 */
  layer: { decadal: string; yearly: string; monthly: string };
}


/** iztro / OpenCC forms of the same keys (简体 view, 僕役 for 交友) */
const ALIAS: Record<string, string> = {
  天机: "天機", 太阳: "太陽", 廉贞: "廉貞", 太阴: "太陰", 贪狼: "貪狼", 巨门: "巨門", 七杀: "七殺", 破军: "破軍",
  左辅: "左輔", 文曲: "文曲", 天钺: "天鉞", 禄存: "祿存", 天马: "天馬", 陀罗: "陀羅", 铃星: "鈴星",
  命宫: "命宮", 财帛: "財帛", 迁移: "遷移", 僕役: "交友", 仆役: "交友", 官禄: "官祿", 福德: "福德",
  庙: "廟", 禄: "祿", 权: "權", 陥: "陷",
};
const key = (s: string): string => ALIAS[s] ?? s;
const at = <T extends readonly string[]>(list: T, s: string): number => (list as readonly string[]).indexOf(key(s));

/** everything a foreign page needs to name a 紫微 chart word, for one language */
export function zwNameOf(N: ZiweiNames, BN: BaziNames, l: ZwLang) {
  const B = bzNameOf(BN);
  const star = (s: string): string => { const i = at(ZW_MAJOR, s); if (i >= 0) return N.major[i]!; const j = at(ZW_MINOR, s); return j >= 0 ? N.minor[j]! : s; };
  /** a minor or main star this language names (the 雜曜 are left out of foreign pages) */
  const named = (s: string): boolean => at(ZW_MAJOR, s) >= 0 || at(ZW_MINOR, s) >= 0;
  const palaceIdx = (p: string): number => at(ZW_PALACES, p.replace(/[宮宫]$/, "") === "命" ? "命宮" : p.replace(/(.{2})[宮宫]$/, "$1"));
  const palace = (p: string): string => { const i = palaceIdx(p); return i >= 0 ? N.palace[i]! : p; };
  const palaceFull = (p: string): string => { const i = palaceIdx(p); return i >= 0 ? N.palaceFull[i]! : p; };
  const bright = (x: string): string => { const i = at(ZW_BRIGHT, x); return i >= 0 ? N.bright[i]! : x; };
  const brightWord = (x: string): string => { const i = at(ZW_BRIGHT, x); return i >= 0 ? N.brightWord[i]! : x; };
  const mut = (m: string): string => { const i = at(ZW_MUT, m.replace(/^化/, "")); return i >= 0 ? N.mut[i]! : m; };
  const mutFull = (m: string): string => { const i = at(ZW_MUT, m.replace(/^化/, "")); return i >= 0 ? N.mutFull[i]! : m; };
  const mutGloss = (m: string): string => { const i = at(ZW_MUT, m.replace(/^化/, "")); return i >= 0 ? N.mutGloss[i]! : ""; };
  const five = (f: string): string => { const i = at(ZW_FIVE, f); return i >= 0 ? N.five[i]! : f; };
  const gloss = (s: string): string => { const i = at(ZW_MAJOR, s); return i >= 0 && N.gloss ? N.gloss[i]! : ""; };
  const cjk = l === "ja";
  const punct = cjk ? { colon: "：", gap: "　", list: "、", paren: (s: string) => `（${s}）` } : { colon: BN.colon ?? ": ", gap: " ", list: ", ", paren: (s: string) => ` (${s})` };
  /** a star with its brightness in a sentence: 「Zi Wei (at its peak)」「紫微（廟）」 */
  const starBright = (s: string, b?: string): string => `${star(s)}${b ? punct.paren(brightWord(b)) : ""}`;
  /** a lunar date in words */
  const lunar = (y: number, m: number, leap: boolean, d: number): string => B.fill(BN.lunar, { y, m, leap: leap ? BN.leap : "", d });
  /** an hour by its branch index (子 = 0): Zi hour, 子の刻, 자시 */
  const hour = (i: number): string => B.fill(BN.hour, { b: BN.branches[i] ?? "" });
  return {
    N, l, star, named, palace, palaceFull, bright, brightWord, mut, mutFull, mutGloss, five, gloss, starBright, lunar, hour,
    stem: B.stem, branch: B.branch, gz: B.gz, ch: B.ch, elOf: B.elOf, fill: B.fill, josa, ...punct,
    /** a joined list of stars with their brightness */
    stars: (list: { name: string; bright?: string }[]): string => list.map((s) => starBright(s.name, s.bright)).join(punct.list),
  };
}
export type ZwName = ReturnType<typeof zwNameOf>;
