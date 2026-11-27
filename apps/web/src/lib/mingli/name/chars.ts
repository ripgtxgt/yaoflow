import DATA from "@/data/name-chars.json";

/**
 * 10-29 进度表 122 姓名學 — the character data (scripts/name/build-chars.py + gen-char-text.ts → data/name-chars.json):
 * 6,857 characters of 通用规范汉字表 levels 1–2 with their traditional form. Server only (the file is a few MB).
 *
 * 我們怎麼算（shown on the pages):
 *  · 筆劃 = 康熙筆劃: the traditional form, its radical counted as the full Kangxi radical (氵 as 水 4, 扌 as 手 4, 忄 as
 *    心 4, 艹 as 艸 6, 辶 as 辵 7, 阝 on the left as 阜 8, on the right as 邑 7, 王 as 玉 5, 月(肉) as 肉 6, 礻 as 示 5,
 *    衤 as 衣 6, 犭 as 犬 4) plus the rest of the character, from Unicode Unihan; 一 to 十 by their value.
 *  · 字的五行: by the radical when it is one of 木艸竹禾 (木)、火日 (火)、土山石田 (土)、金玉 (金)、水雨冫 (水); otherwise by
 *    the initial sound (五音: 唇音 水, 舌音 火, 牙音 木, 齒音 金, 喉音 土) — schools differ, so the sound rule is marked 參考.
 */
export interface CharInfo {
  h: string; s: string; a: string[]; k: number; kn: string | null; t: number; py: string; zy: string | null; jp: string;
  wx: string; by: "部首" | "讀音"; lv: 1 | 2;
  d: string; w: string[]; p: string; x: string; o: 0 | 1 | 2;
  dS: string; wS: string[]; pS: string; xS: string;
}
const LIST = DATA as unknown as CharInfo[];
const BY = new Map<string, CharInfo>();
for (const c of LIST) { if (!BY.has(c.h)) BY.set(c.h, c); }
for (const c of LIST) { if (!BY.has(c.s)) BY.set(c.s, c); for (const a of c.a) if (!BY.has(a)) BY.set(a, c); }

export const charInfo = (c: string): CharInfo | null => BY.get(c) ?? null;
/** every character with a page: the traditional form is the key (zh-hant), the simplified the zh page */
export const NAME_CHARS: CharInfo[] = LIST;
/** the characters people actually use in names first (ok 2), for the index and the sitemap order */
export const nameCharsByUse = () => [...LIST].sort((a, b) => b.o - a.o || a.lv - b.lv);
export const charText = (c: CharInfo, locale: string) => (locale === "zh" ? { d: c.dS, w: c.wS, p: c.pS, x: c.xS, ch: c.s } : { d: c.d, w: c.w, p: c.p, x: c.x, ch: c.h });
