import MATTERS from "@/data/mingli/zeri-matters.json";
import { huangliDay, parseYmd, term, type HlLocale } from "./day";
import { loc } from "./content";

/**
 * 10-17 进度表 70 擇日: one matter (搬家、開市、結婚…) → the days ahead whose almanac lists it as suitable. A day counts
 * when its 宜 names one of the matter's words (data/mingli/zeri-matters.json, written by 推广) and its 忌 names none of
 * the matter's excluded words; 諸事不宜 days and 破日 are left out. The reader's 生肖 and 「避開農曆七月」 are applied in
 * the browser (they never go into the URL).
 */
export interface Matter { slug: string; tw: string; hk: string; yi: string[]; ji: string[]; weight: "big" | "normal"; tips: string[]; intro: string; faq: { q: string; a: string }[] }
export const MATTER_LIST = MATTERS as Matter[];
export const matterBySlug = (slug: string) => MATTER_LIST.find((m) => m.slug === slug) ?? null;

/** 10-22 进度表 92: `gz` (the day's 日柱) lets a member's list leave out the days that 沖／刑 their own 日柱 */
export interface ZeriDay { ymd: string; weekday: number; lunar: string; lunarMonth: number; chong: string; why: string[]; weekend: boolean; gz: string }
export interface ZeriResult { days: ZeriDay[]; excluded: { ji: number; po: number; nothing: number } }

export function zeriDays(m: Matter, fromYmd: string, span: number, locale: HlLocale): ZeriResult {
  const p = parseYmd(fromYmd);
  if (!p) return { days: [], excluded: { ji: 0, po: 0, nothing: 0 } };
  const out: ZeriDay[] = [];
  const excluded = { ji: 0, po: 0, nothing: 0 };
  let t = Date.UTC(p.y, p.m - 1, p.d);
  for (let i = 0; i < span; i++, t += 86_400_000) {
    const dt = new Date(t);
    const d = huangliDay(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    const hits = d.yi.filter((k) => m.yi.includes(k));
    if (!hits.length) continue;
    if (d.nothing) { excluded.nothing++; continue; }
    if (d.ji.some((k) => m.ji.includes(k))) { excluded.ji++; continue; }
    if (d.duty === "破") { excluded.po++; continue; }
    out.push({
      ymd: d.ymd, weekday: d.weekday, lunar: loc(`${term(d.lunar.month)}${term(d.lunar.day)}`, locale), lunarMonth: d.lunar.leap ? -d.lunar.monthNum : d.lunar.monthNum,
      chong: d.chong.zodiac, why: hits.map((k) => term(k, locale)), weekend: d.weekday === 0 || d.weekday === 6, gz: d.gz.day,
    });
  }
  return { days: out, excluded };
}

export const ZODIAC = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"] as const;
