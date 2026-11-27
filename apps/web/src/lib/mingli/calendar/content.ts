import YIJI from "@/data/mingli/huangli-yiji.json";
import PAGES from "@/data/mingli/huangli-term-pages.json";
import NOTES from "@/data/mingli/huangli-notes.json";
import { toHans } from "@/lib/hant";
import { term, type HlLocale, type HuangliDay } from "./day";

/**
 * 10-17 进度表 69: the almanac's words for readers — 宜忌 in plain words, the 30 term pages, the short notes on 沖煞、
 * 彭祖百忌、建除、二十八宿、九星、十二神、神煞, the day's overview templates and the FAQ. Written in 繁體 (draft by 开发,
 * reviewed text from 推广 replaces the files in data/mingli); 简体 pages get them through OpenCC.
 */
type Yiji = { tw: string; plain: string; example: string };
type TermPage = { tw: string; intro: string; practice: string; faq: { q: string; a: string }[] };
type Notes = {
  chongsha: string; pengzu: Record<string, string>; duty: Record<string, string>; xiu: Record<string, string>;
  twelveGods: Record<string, string>; nineStar: Record<string, string>; gods: Record<string, string>;
  overview: string[]; howTo: string; faq: { q: string; a: string }[];
};
const Y = YIJI as Record<string, Yiji>;
const P = PAGES as Record<string, TermPage>;
export const N = NOTES as Notes;

export const loc = (s: string, locale: HlLocale) => (locale === "zh" ? toHans(s) : s);

/** a 宜/忌 word with its plain meaning, and a page slug when it has one (the Traditional word itself) */
export function yijiInfo(key: string, locale: HlLocale): { name: string; plain: string; example: string; page: string | null } {
  const y = Y[key];
  return { name: term(key, locale), plain: y ? loc(y.plain, locale) : "", example: y ? loc(y.example, locale) : "", page: P[key] ? (y?.tw ?? term(key)) : null };
}

/** the term pages, by their Traditional name (the URL slug) */
export function termPage(tw: string): (TermPage & { key: string }) | null {
  for (const [key, p] of Object.entries(P)) if (p.tw === tw) return { ...p, key };
  return null;
}
export const termPageNames = (): string[] => Object.values(P).map((p) => p.tw);

/** the day's overview sentence, picked by the day so it changes from day to day */
export function overview(d: HuangliDay, locale: HlLocale): string {
  const tpl = N.overview[(d.d + d.m) % N.overview.length] ?? N.overview[0]!;
  const z = (s: string) => term(s, "zh-hant");
  const yi1 = d.yi[0] ? z(d.yi[0]) : "祭祀", yi2 = d.yi[1] ? z(d.yi[1]) : yi1;
  const ji1 = d.ji[0] ? z(d.ji[0]) : (d.nothing ? "大事" : "動土");
  const chong = z(d.chong.zodiac);
  return loc(tpl.replaceAll("{宜1}", yi1).replaceAll("{宜2}", yi2).replaceAll("{忌1}", ji1).replaceAll("{沖}", chong), locale);
}

/** one short note for a name from one of the note tables (Traditional key) */
export function note(table: "pengzu" | "duty" | "xiu" | "twelveGods" | "nineStar" | "gods", tw: string, locale: HlLocale): string {
  const v = N[table][tw];
  return v ? loc(v, locale) : "";
}
