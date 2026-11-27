import { charInfo, type CharInfo } from "./chars";

/**
 * 10-29 进度表 122 姓名學 — one name read as the numbers the 姓名學 books use, and nothing they sell:
 *  · each character: 康熙筆劃, 讀音, 字的五行 (lib/mingli/name/chars.ts says how);
 *  · 五格: 天格 = 姓的筆劃（單姓 +1）, 人格 = 姓的最後一字 + 名的第一字, 地格 = 名的筆劃（單名 +1）, 總格 = 全部筆劃,
 *    外格 = 天格 + 地格 − 人格 (單姓單名 is 2); each 格's 五行 by its last digit (1 2 木, 3 4 火, 5 6 土, 7 8 金, 9 0 水);
 *  · with a birth: the chart's 喜用 elements beside the name's.
 * The 81 數理 吉凶 that books attach to the numbers are left out on purpose (Neil: 只講字義、讀音、筆劃和八字喜用).
 */
export const COMPOUND_SURNAMES = ["歐陽", "司馬", "上官", "諸葛", "東方", "皇甫", "尉遲", "公孫", "慕容", "令狐", "夏侯", "長孫", "宇文", "軒轅", "司徒", "張簡", "范姜", "端木", "南宮", "西門", "獨孤", "鍾離", "澹臺", "公羊", "左丘",
  "欧阳", "诸葛", "皇甫", "尉迟", "公孙", "长孙", "轩辕", "张简", "钟离", "澹台"];
/** 「歐陽娜娜」→ 歐陽 + 娜娜; one character otherwise */
export function splitName(full: string): { surname: string; given: string } {
  const s = [...full.replace(/\s+/g, "")];
  const two = s.slice(0, 2).join("");
  if (s.length >= 3 && COMPOUND_SURNAMES.includes(two)) return { surname: two, given: s.slice(2).join("") };
  return { surname: s[0] ?? "", given: s.slice(1).join("") };
}

export const numElement = (n: number): string => ["水", "木", "木", "火", "火", "土", "土", "金", "金", "水"][n % 10]!;
export interface Grid { tian: number; ren: number; di: number; wai: number; zong: number }
export function fiveGrids(sur: number[], giv: number[]): Grid {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const tian = sur.length === 1 ? sur[0]! + 1 : sum(sur);
  const ren = sur[sur.length - 1]! + (giv[0] ?? 0);
  const di = giv.length === 1 ? giv[0]! + 1 : sum(giv);
  const zong = sum(sur) + sum(giv);
  const wai = sur.length === 1 && giv.length === 1 ? 2 : tian + di - ren;
  return { tian, ren, di, wai, zong };
}

export interface NameReading {
  surname: string; given: string;
  chars: { c: string; info: CharInfo | null; role: "姓" | "名" }[];
  missing: string[];
  grid: Grid | null;
  gridEl: Record<keyof Grid, string> | null;
  /** 三才 = 天格、人格、地格 的五行 */
  sancai: string | null;
  /** the name's elements, counted by character */
  elements: Record<string, number>;
  /** with a birth: the chart's 喜用 and which of the name's characters carry one of them */
  favour?: { favour: string[]; avoid: string[]; carry: string[] };
}

export function readName(surname: string, given: string, chart?: { favour: string[]; avoid: string[] } | null): NameReading {
  const chars = [...[...surname].map((c) => ({ c, role: "姓" as const })), ...[...given].map((c) => ({ c, role: "名" as const }))].map((x) => ({ ...x, info: charInfo(x.c) }));
  const missing = chars.filter((x) => !x.info).map((x) => x.c);
  const elements: Record<string, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const x of chars) if (x.info) elements[x.info.wx] = (elements[x.info.wx] ?? 0) + 1;
  let grid: Grid | null = null, gridEl: NameReading["gridEl"] = null, sancai: string | null = null;
  if (!missing.length && surname && given) {
    grid = fiveGrids([...surname].map((c) => charInfo(c)!.k), [...given].map((c) => charInfo(c)!.k));
    gridEl = { tian: numElement(grid.tian), ren: numElement(grid.ren), di: numElement(grid.di), wai: numElement(grid.wai), zong: numElement(grid.zong) };
    sancai = `${gridEl.tian}${gridEl.ren}${gridEl.di}`;
  }
  const out: NameReading = { surname, given, chars, missing, grid, gridEl, sancai, elements };
  if (chart?.favour?.length) {
    const fav = chart.favour.map(toHantEl), avoid = (chart.avoid ?? []).map(toHantEl);
    out.favour = { favour: fav, avoid, carry: chars.filter((x) => x.role === "名" && x.info && fav.includes(x.info.wx)).map((x) => x.c) };
  }
  return out;
}
const toHantEl = (e: string) => e; // 木火土金水 are the same in both scripts
