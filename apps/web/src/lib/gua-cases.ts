import { resolveCast, type LineValue } from "@yaoflow/engine";
import raw from "@/data/gua-cases.json";
import { toHans, toHant } from "./hant";
import type { Locale } from "./locales";

/**
 * 卦例 on the 64 reference pages (09-23, 推广总方案 §14 ⑯ / §4.10 ①).
 *
 * Google indexed 1 of our 4,820 pages; the 64 hexagram pages read alike to it
 * because they are the same template with the same kind of commentary. One
 * real cast per page makes each one different in a way no competitor's page
 * is: the verdict and the timing exactly as our engine gave them.
 *
 * Source: the promotion batches (推广素材/W02–W04zh/卦例-原始.json), each a
 * real three-coin cast run through the production deep-reading pipeline. The
 * questions are examples we wrote, not a reader's — the page says so. Verdict
 * and timing are kept word for word (the rule for every 卦例 we publish).
 */

export interface GuaCase {
  locale: string; code: string; question: string; verdict: string; timing: string; cast_at: string; tz: number; primary_zh: string;
}

const CASES = raw as GuaCase[];

export function primaryOf(code: string): number {
  return resolveCast(code.split("").map(Number) as LineValue[]).primary.number;
}

/** The newest case for this hexagram that a reader in `locale` can read, or null. */
export function caseForHex(hexNumber: number, locale: Locale): GuaCase | null {
  const mine = CASES.filter((c) => primaryOf(c.code) === hexNumber);
  const newest = (xs: GuaCase[]) => xs.sort((a, b) => b.cast_at.localeCompare(a.cast_at))[0] ?? null;
  const same = newest(mine.filter((c) => c.locale === locale));
  if (same) return same;
  // the two Chinese scripts read each other's cases, converted
  if (locale === "zh" || locale === "zh-hant") {
    const other = newest(mine.filter((c) => c.locale === (locale === "zh" ? "zh-hant" : "zh")));
    if (!other) return null;
    const conv = locale === "zh" ? toHans : toHant;
    return { ...other, locale, question: conv(other.question), verdict: conv(other.verdict), timing: conv(other.timing) };
  }
  return null;
}

/** The day it was cast, on the caster's own clock. */
export function caseDay(c: GuaCase, htmlLang: string): string {
  const local = new Date(Date.parse(c.cast_at) + c.tz * 60_000);
  return new Intl.DateTimeFormat(htmlLang, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(local);
}
