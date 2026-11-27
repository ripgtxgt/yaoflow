import type { Foreign } from "./core";
import { LOCALE_META } from "../locales";

/**
 * 10-30 进度表 128 ④-5 — dates on a page in another language, written the way that language writes them (Intl, on the
 * calendar day itself — no time zone can move it): "Feb 4", 「2月4日」, 「2월 4일」, « 4 févr. », „4. Feb.“; a span with
 * the language's own dash; a month's name. The report facts keep 國曆 "M/D" (and "YYYY/M/D" for a day in another year).
 */
const cache = new Map<string, Intl.DateTimeFormat>();
function fmtOf(l: Foreign, key: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${l}:${key}`;
  let f = cache.get(k);
  if (!f) { f = new Intl.DateTimeFormat(LOCALE_META[l].htmlLang, { ...o, timeZone: "UTC" }); cache.set(k, f); }
  return f;
}
const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** a day without its year: Feb 4 · 2月4日 · 2월 4일 · 4 févr. · 4. Feb. · 4 feb · 4 de fev. */
export const dayIn = (l: Foreign, y: number, m: number, d: number): string => fmtOf(l, "md", { month: "short", day: "numeric" }).format(at(y, m, d));
/** a day with its year (a day of another year than the report's) */
export const dayYearIn = (l: Foreign, y: number, m: number, d: number): string => fmtOf(l, "ymd", { year: "numeric", month: "short", day: "numeric" }).format(at(y, m, d));
/** a month's name: February · 2月 · 2월 · février · Februar · febrero · fevereiro */
export const monthIn = (l: Foreign, m: number): string => fmtOf(l, "m", { month: "long" }).format(at(2001, m, 1));
/** the dash between two dates or months */
const DASH: Record<Foreign, string> = { en: " – ", ja: "〜", ko: "~", fr: " – ", de: " – ", es: " – ", pt: " – " };
export const spanIn = (l: Foreign, a: string, b: string): string => `${a}${DASH[l]}${b}`;
/** a run of whole months: January – March · 1月〜3月 · 1월~3월 */
export const monthsIn = (l: Foreign, a: number, b: number): string => spanIn(l, monthIn(l, a), monthIn(l, b));

const dayRe = new Map<Foreign, RegExp>();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** the month names of a Latin-script language, long and short, as one alternation (longest first) */
const monthAlt = new Map<Foreign, string>();
function monthNames(l: Foreign): string {
  const hit = monthAlt.get(l);
  if (hit) return hit;
  const names = new Set<string>();
  for (let m = 1; m <= 12; m++) for (const month of ["long", "short"] as const) names.add(fmtOf(l, month, { month }).format(at(2001, m, 1)).replace(/\.$/, ""));
  const alt = [...names].sort((a, b) => b.length - a.length).map(esc).join("|");
  monthAlt.set(l, alt);
  return alt;
}
/**
 * a day of a month written out in this language — "March 5", "5th of March", « 5 mars », „5. März“, "5 de marzo",
 * 「3月5日」, 「3월 5일」 — for the texts that name months only (the 年書's own chapters)
 */
export function dayDateRe(l: Foreign): RegExp {
  const hit = dayRe.get(l);
  if (hit) return hit;
  let re: RegExp;
  if (l === "ja") re = /\d{1,2}\s?月\s?\d{1,2}\s?日/;
  else if (l === "ko") re = /\d{1,2}\s?월\s?\d{1,2}\s?일/;
  else {
    const M = `(?:${monthNames(l)})\\.?`;
    re = l === "en" ? new RegExp(`\\b${M}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${M}(?!\\p{L})`, "iu")
      : l === "fr" ? new RegExp(`\\b\\d{1,2}(?:er)?\\s+${M}(?!\\p{L})`, "iu")
      : l === "de" ? new RegExp(`\\b\\d{1,2}\\.\\s*${M}(?!\\p{L})`, "iu")
      : new RegExp(`\\b\\d{1,2}º?\\s+de\\s+${M}(?!\\p{L})`, "iu");
  }
  dayRe.set(l, re);
  return re;
}

/**
 * The same mentions with the day taken out — "March 5" → "March", « 1er mars » → « mars », 「3月5日」→「3月」 — for text
 * a writer is given to read: the 年書's own chapters name months only, and a writer copies the dates it reads.
 */
const dropRe = new Map<Foreign, [RegExp, string][]>();
export function dropDays(l: Foreign, s: string): string {
  let rs = dropRe.get(l);
  if (!rs) {
    const M = `((?:${l === "ja" || l === "ko" ? "" : monthNames(l)})\\.?)`;
    rs = l === "ja" ? [[/(\d{1,2})\s?月\s?\d{1,2}\s?日/g, "$1月"]]
      : l === "ko" ? [[/(\d{1,2})\s?월\s?\d{1,2}\s?일/g, "$1월"]]
      : l === "en" ? [[new RegExp(`\\b${M}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "giu"), "$1"], [new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${M}(?!\\p{L})`, "giu"), "$1"]]
      : l === "fr" ? [[new RegExp(`\\b\\d{1,2}(?:er)?\\s+${M}(?!\\p{L})`, "giu"), "$1"]]
      : l === "de" ? [[new RegExp(`\\b\\d{1,2}\\.\\s*${M}(?!\\p{L})`, "giu"), "$1"]]
      : [[new RegExp(`\\b\\d{1,2}º?\\s+de\\s+${M}(?!\\p{L})`, "giu"), "$1"]];
    dropRe.set(l, rs);
  }
  return rs.reduce((t, [re, to]) => t.replace(re, to), s);
}

/**
 * A 國曆 date as the facts write it — "M/D" in the report's year, or "YYYY/M/D" — in words. `year` is the year an "M/D"
 * belongs to; `wrap` moves January into the next year (a 八字 year runs 立春 → 小寒, so its 小寒 month starts in January).
 */
export function mdIn(l: Foreign, md: string, year: number, wrap = false): string {
  const p = md.split("/").map(Number);
  if (p.length === 3) return p[0] === year ? dayIn(l, p[0]!, p[1]!, p[2]!) : dayYearIn(l, p[0]!, p[1]!, p[2]!);
  const [m, d] = p as [number, number];
  return dayIn(l, wrap && m < 2 ? year + 1 : year, m, d);
}
