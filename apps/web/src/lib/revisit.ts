import type { DeepReading, Localized, Reading } from "./reading";
import { questionScale, type QuestionScale } from "./timing";

/** Every language a field carries, joined — for parsing; a reading is written in one language, but old ones carry two. */
const textOf = (f: Localized | undefined | null): string => (f ? Object.values(f).filter(Boolean).join(" ") : "");
/** One language's text — for quoting back: zh first (the authored voice), then en, then whatever exists. */
const quoteOf = (f: Localized | undefined | null): string =>
  f ? (f.zh ?? f.en ?? Object.values(f).find((v): v is string => typeof v === "string" && v.length > 0) ?? "") : "";

/**
 * 应期回访 — the timing-window follow-up.
 *
 * The deep reading names a window ("申酉出空后，约 11–19 日之间见分晓"); when
 * that window closes we write to the customer and ask how it went. This is
 * the one retention move astrology apps cannot copy: our readings make a
 * falsifiable claim with a date on it, and honouring that date is both the
 * product keeping its word and the doorway to the next cast.
 */

export const REVISIT_DEFAULT_DAYS = 14;
export const REVISIT_MIN_DAYS = 3;
export const REVISIT_MAX_DAYS = 60;

const clamp = (n: number) =>
  Math.min(REVISIT_MAX_DAYS, Math.max(REVISIT_MIN_DAYS, Math.round(n)));

/** 一…十, 十一…十九, 二十, 二十一…三十一 → number (0 when malformed). */
export function zhNum(s: string): number {
  const D: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (s === "十") return 10;
  const i = s.indexOf("十");
  if (i === -1) return s.length === 1 ? (D[s] ?? 0) : 0;
  const tens = i === 0 ? 1 : (D[s[0]!] ?? 0);
  const rest = s.slice(i + 1);
  const ones = rest === "" ? 0 : (D[rest] ?? -99);
  return ones < 0 ? 0 : tens * 10 + ones;
}

const MONTHS_EN: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
/** Month names in the other Latin-script languages we write (accents optional). */
const MONTHS_LATIN: Record<string, number> = {
  // fr
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  // de
  januar: 1, februar: 2, marz: 3, maerz: 3, april: 4, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
  // es
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, setiembre: 9, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  // pt
  janeiro: 1, fevereiro: 2, marco: 3, maio: 5, junho: 6, julho: 7, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const strip = (w: string) => w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Every calendar date mentioned in the prose, in order, resolved to the next
 * occurrence on or after `from` (a "1月5日" written in December means next year).
 */
export function absoluteDates(text: string, from: Date): Date[] {
  return resolveFound(collectDates(text), from).map((f) => f.date);
}

/** One date written in the prose: where it sits, and — for the tail of a "13日到16日" span — where its span starts. */
interface FoundDate { idx: number; end: number; m: number; d: number; y?: number; spanFrom?: number }

function collectDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];
  for (const m of text.matchAll(/(\d{4})-(\d{1,2})-(\d{1,2})/g)) {
    found.push({ idx: m.index!, end: m.index! + m[0].length, y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) });
  }
  for (const m of text.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]/g)) {
    found.push({ idx: m.index!, end: m.index! + m[0].length, m: Number(m[1]), d: Number(m[2]) });
  }
  // 09-26 spans: "9月10日到14日" / "9月10日–14日" — the tail day keeps the month (or the next one when it is smaller)
  for (const m of text.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]\s*(?:[-–—~～至到]|之间到|之間到)\s*(\d{1,2})\s*[日号號]/g)) {
    const mm = Number(m[1]), d0 = Number(m[2]), d1 = Number(m[3]);
    found.push({ idx: m.index! + m[0].length - 1, end: m.index! + m[0].length, m: d1 >= d0 ? mm : (mm % 12) + 1, d: d1, spanFrom: m.index! });
  }
  // ko "9월 10일~14일", en "September 10–14"
  for (const m of text.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*[-–—~～]\s*(\d{1,2})\s*일/g)) {
    const mm = Number(m[1]), d0 = Number(m[2]), d1 = Number(m[3]);
    found.push({ idx: m.index! + m[0].length - 1, end: m.index! + m[0].length, m: d1 >= d0 ? mm : (mm % 12) + 1, d: d1, spanFrom: m.index! });
  }
  for (const m of text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+(\d{1,2})\s*(?:[-–—]|to|and)\s*(\d{1,2})\b/gi)) {
    const mm = MONTHS_EN[m[1]!.toLowerCase().slice(0, 3)]!, d0 = Number(m[2]), d1 = Number(m[3]);
    found.push({ idx: m.index! + m[0].length - 1, end: m.index! + m[0].length, m: d1 >= d0 ? mm : (mm % 12) + 1, d: d1, spanFrom: m.index! });
  }
  // Chinese numerals: 九月九日 / 十一月二十三日 / 三月初五 — the model sometimes writes them
  for (const m of text.matchAll(/([一二三四五六七八九十]{1,3})\s*月\s*([一二三四五六七八九十]{1,3})\s*[日号號]/g)) {
    const mm = zhNum(m[1]!), dd = zhNum(m[2]!);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) found.push({ idx: m.index!, end: m.index! + m[0].length, m: mm, d: dd });
  }
  for (const m of text.matchAll(/([一二三四五六七八九十]{1,3})\s*月初([一二三四五六七八九十]{1,2})(?![日号號])/g)) {
    const mm = zhNum(m[1]!), dd = zhNum(m[2]!);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 10) found.push({ idx: m.index!, end: m.index! + m[0].length, m: mm, d: dd });
  }
  // phases: 1月上旬 / 2月初 / 3月中旬 / 4月底 — a month-level window's edges
  const PHASE_DAY: Record<string, number> = { 初: 3, 上旬: 5, 中旬: 15, 中: 15, 下旬: 25, 底: 28, 末: 28 };
  for (const m of text.matchAll(/(\d{1,2})\s*月\s*(上旬|中旬|下旬|初|中|底|末)(?!\d)/g)) {
    found.push({ idx: m.index!, end: m.index! + m[0].length, m: Number(m[1]), d: PHASE_DAY[m[2]!]! });
  }
  for (const m of text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+(\d{1,2})\b/gi)) {
    found.push({ idx: m.index!, end: m.index! + m[0].length, m: MONTHS_EN[m[1]!.toLowerCase().slice(0, 3)]!, d: Number(m[2]) });
  }
  // ko: 9월 12일
  for (const m of text.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
    found.push({ idx: m.index!, end: m.index! + m[0].length, m: Number(m[1]), d: Number(m[2]) });
  }
  // fr/es/pt "12 septembre" / "12 de septiembre" / "12 de setembro"; de "12. September"
  for (const m of text.matchAll(/(\d{1,2})(?:er|\.)?\s+(?:de\s+)?([A-Za-zÀ-ÿ]{3,10})/g)) {
    const mm = MONTHS_LATIN[strip(m[2]!)];
    if (mm) found.push({ idx: m.index!, end: m.index! + m[0].length, m: mm, d: Number(m[1]) });
  }
  found.sort((a, b) => a.idx - b.idx);
  return found.filter((f) => f.m >= 1 && f.m <= 12 && f.d >= 1 && f.d <= 31);
}

function resolveFound(found: FoundDate[], from: Date): (FoundDate & { date: Date })[] {
  const out: (FoundDate & { date: Date })[] = [];
  for (const f of found) {
    let y = f.y ?? from.getFullYear();
    let dt = new Date(y, f.m - 1, f.d);
    if (f.y === undefined && dt.getTime() < from.getTime() - 86_400_000) {
      y += 1;
      dt = new Date(y, f.m - 1, f.d);
    }
    out.push({ ...f, date: dt });
  }
  return out;
}

const DAY_MS = 86_400_000;

/**
 * 10-12 (进度表 §四 29): the clause that only repeats the reader's own deadline — 「你問的是1月20日之前」 — names a date
 * that is no window; it pushed the one revisit two months out while the reading's windows closed in October.
 */
const SCOPE_CLAUSE = /(?:^|[。！？!?；;，,：:\n])\s*(?:你問|你问|You asked|You're asking)[^。！？!?；;，,：:\n]*/gi;
const SCOPE_WORD = /之前|以前|前|底前|範圍|范围|before|by\b|until/i;
export function stripScope(text: string): string {
  return maskAskedRange(text.replace(SCOPE_CLAUSE, (c) => (SCOPE_WORD.test(c) ? c.replace(/\d/g, "·") : c)));
}

/**
 * 10-14 (Neil: 「要的」): the reader's own range said back with its dates — 「你問年底前，即係10月14日到12月31日」
 * 「你问的这周就是10月14日到18日」「你問的一個月後，就是國曆11月10日到11月16日」 — is no window either. It pushed 14 check-ins
 * late (one to day 60 instead of day 12) and made the timeline draw one long span over the real windows. The dates in
 * such a clause are masked (positions kept), for every letter and the timeline alike.
 */
const ASKED = /你問|你问|你所問|你所问/;
const RESTATE = /^\s*(?:即係|即是|就是|也就是|亦即|那就在|那就是|換句話說|换句话说)/;
const HAS_DATE = /\d{1,2}\s*月\s*\d{1,2}\s*[日號号]|\d{4}-\d{2}-\d{2}/;
export function maskAskedRange(text: string): string {
  const parts = text.split(/([，,。；;！!？?\n])/);
  let prevAsked = false;
  for (let k = 0; k < parts.length; k += 2) {
    const clause = parts[k] ?? "";
    const asked = ASKED.test(clause);
    const restate = HAS_DATE.test(clause) && ((asked && /就是|即係|即是|也就是/.test(clause)) || (prevAsked && RESTATE.test(clause)));
    if (restate) parts[k] = clause.replace(/\d/g, "·");
    prevAsked = asked && !HAS_DATE.test(clause);
  }
  return parts.join("");
}

/** A stretch of days the timing prose names: "10月13日到16日" (+ "14日前後" inside it) is one. */
export interface TimingSegment { start: Date; end: Date }

/**
 * 10-12 多段应期 (进度表 §四 29): the windows the prose names, in order. A reading often names two or three
 * ("10月13日到16日會先有個眉目……真正定下來是12月7日到1月5日"): the revisit used to wait for the last one only, while the
 * heads-up and day-of letters spoke of the first — "过了之后我们会来问你" with nothing coming. Spans written as a range
 * stay one segment even across a month or year; a date inside a segment or the day after it joins it ("13日到16日……如果沒動靜，下一個點是18日到22日" is two); dates more than 200
 * days out and the reader's own deadline are left out.
 */
export function timingSegments(text: string | null | undefined, from: Date): TimingSegment[] {
  if (!text) return [];
  const clean = stripScope(text);
  const found = resolveFound(collectDates(clean), from);
  const spans: TimingSegment[] = [];
  const used = new Set<number>();
  for (let i = 0; i < found.length; i++) {
    if (used.has(i)) continue;
    const f = found[i]!;
    // the head of a written range: "10月13日到16日" (tail carries spanFrom) or "12月7日到1月5日" / "Oct 4 to Nov 2"
    const tailIdx = found.findIndex((g, j) => j > i && !used.has(j) && (g.spanFrom === f.idx
      || (g.spanFrom === undefined && /^\s*(?:[-–—~～〜至到]|之间到|之間到|to|and|until|bis|au|a|até)\s*(?:明年|隔年|next year)?\s*$/i.test(clean.slice(f.end, g.idx)))));
    if (tailIdx > i && f.spanFrom === undefined) {
      const g = found[tailIdx]!;
      used.add(tailIdx);
      let end = g.date;
      while (end.getTime() < f.date.getTime()) end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate());
      spans.push({ start: f.date, end });
    } else {
      spans.push({ start: f.date, end: f.date });
    }
  }
  const near = spans.filter((s) => s.start.getTime() - from.getTime() < 200 * DAY_MS && s.end.getTime() >= from.getTime() - DAY_MS);
  near.sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: TimingSegment[] = [];
  for (const s of near) {
    const last = out[out.length - 1];
    if (last && s.start.getTime() <= last.end.getTime() + DAY_MS) {
      if (s.end.getTime() > last.end.getTime()) last.end = s.end;
    } else out.push({ ...s });
  }
  return out;
}

/** At most this many letters about one reading's windows: the in-between ones plus the final revisit. */
export const CHECKPOINT_MAX = 2;
/** An in-between letter needs this much room from the cast and from the final revisit, or it is left out. */
export const CHECKPOINT_MIN_AFTER_CAST_DAYS = 2;
export const CHECKPOINT_MIN_BEFORE_FINAL_DAYS = 4;

/**
 * 10-12 多段应期: the in-between check-ins of a reading — one the day after each window but the last closes (at most
 * two), counted in days from `from` like the revisit itself. A check-in asks only whether that stretch brought a
 * stir; the reading's verdict waits for the final revisit.
 */
export function timingCheckpoints(text: string | null | undefined, from: Date, finalDays: number): { days: number; start: Date; end: Date }[] {
  const segs = timingSegments(text, from);
  if (segs.length < 2) return [];
  const out: { days: number; start: Date; end: Date }[] = [];
  for (const s of segs.slice(0, -1)) {
    const days = Math.ceil((s.end.getTime() - from.getTime()) / DAY_MS) + 1;
    if (days < CHECKPOINT_MIN_AFTER_CAST_DAYS) continue;
    if (finalDays - days < CHECKPOINT_MIN_BEFORE_FINAL_DAYS) continue;
    if (out.length && days - out[out.length - 1]!.days < CHECKPOINT_MIN_BEFORE_FINAL_DAYS) continue;
    out.push({ days, start: s.start, end: s.end });
    if (out.length >= CHECKPOINT_MAX) break;
  }
  return out;
}

/**
 * Pull a day count out of the timing prose. We take the UPPER bound of a
 * range plus one day of grace — the email must land after the window has
 * had its chance, or "how did it go" reads as impatience.
 */
export function parseTimingDays(text: string | undefined | null, from: Date = new Date()): number | null {
  if (!text) return null;

  // Absolute dates first — "9月12日前后", "10月8日–11月7日", "Sep 12", "2026-10-08".
  // Timing v2 names real dates, and a bare "12日" must not be read as "12 days".
  // Several dates → the LAST one is the window's end.
  // 10-12: the reader's own deadline repeated back (「你問的是1月20日之前」) is no window — left out when anything else is named
  const scoped = absoluteDates(stripScope(text), from);
  const abs = scoped.length ? scoped : absoluteDates(text, from);
  if (abs.length > 0) {
    // 09-26: the LATEST date, not the last written — "10月3日到7日之间，10月5日前后" ends on the 7th
    const near = abs.filter((x) => x.getTime() - from.getTime() < 200 * 86_400_000);
    const pool = near.length ? near : abs;
    const end = pool.reduce((m, x) => (x.getTime() > m.getTime() ? x : m), pool[0]!);
    const days = Math.ceil((end.getTime() - from.getTime()) / 86_400_000);
    return clamp(days + 1);
  }

  // 11–19日 / 11-19天 / 11 到 19 日
  const zhRange = text.match(/(\d{1,3})\s*[-–—~～至到]\s*(\d{1,3})\s*[日天]/);
  if (zhRange) return clamp(Number(zhRange[2]) + 1);

  // 7日内 / 约10天 / 十日内 is rare — digits only, deliberately
  const zhSingle = text.match(/(\d{1,3})\s*[日天](?:内|之内|左右|前后|上下)?/);
  if (zhSingle) return clamp(Number(zhSingle[1]) + 1);

  // 11-19 days / 11 to 19 days
  const enRange = text.match(/(\d{1,3})\s*(?:[-–—~]|to)\s*(\d{1,3})\s*days?/i);
  if (enRange) return clamp(Number(enRange[2]) + 1);

  // within 10 days / in about 7 days / next 14 days
  const enSingle = text.match(/(\d{1,3})\s*days?/i);
  if (enSingle) return clamp(Number(enSingle[1]) + 1);

  // ja/ko/fr/de/es/pt relative spans: 2週間 · 2주 · 2 semaines · 2 Wochen · 2 semanas
  const spanW = text.match(/(\d{1,2})\s*(?:週間|週|주|semaines?|wochen?|semanas?)/i);
  if (spanW) return clamp(Number(spanW[1]) * 7);
  const spanD = text.match(/(\d{1,3})\s*(?:日間|일|jours?|tagen?|d[ií]as?)/i);
  if (spanD) return clamp(Number(spanD[1]) + 1);
  const spanM = text.match(/(\d{1,2})\s*(?:ヶ月|か月|カ月|개월|mois|monaten?|meses|mês|mes)\b/i);
  if (spanM) return clamp(Number(spanM[1]) * 30);

  // 两周 / 三个月 / two weeks / a month
  const weekMap: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const zhW = text.match(/([一两二三四五六])周|([一两二三四五六])个月/);
  if (zhW) {
    if (zhW[1]) return clamp(weekMap[zhW[1]]! * 7);
    if (zhW[2]) return clamp(weekMap[zhW[2]]! * 30);
  }
  const enW = text.match(/(\d{1,2}|a|one|two|three|four)\s*weeks?/i);
  if (enW) {
    const n = { a: 1, one: 1, two: 2, three: 3, four: 4 }[enW[1]!.toLowerCase()] ?? Number(enW[1]);
    if (Number.isFinite(n)) return clamp(n * 7);
  }
  const enM = text.match(/(a|one|two|1|2)\s*months?/i);
  if (enM) {
    const n = { a: 1, one: 1, two: 2 }[enM[1]!.toLowerCase()] ?? Number(enM[1]);
    if (Number.isFinite(n)) return clamp(n * 30);
  }

  return null;
}

/**
 * The window for a reading: parsed from its timing prose, else the default.
 * A same-day question ("现在能睡个好午觉吗") gets the shortest window — its
 * answer is known by tonight, and "how did it go" two weeks later is absurd.
 */
export function revisitWindow(
  tier: "one" | "deep",
  reading: Reading | DeepReading,
  question?: string,
  scaleHint?: QuestionScale,
  from: Date = new Date(),
): { days: number; quote: string | null; checkpoints: { days: number; start: Date; end: Date }[] } {
  const scale = scaleHint ?? (question ? questionScale(question) : "open");
  if (scale === "now") {
    const quote = tier === "deep" ? (quoteOf((reading as DeepReading).timing) || null) : null;
    return { days: REVISIT_MIN_DAYS, quote, checkpoints: [] };
  }
  if (tier === "deep") {
    const r = reading as DeepReading;
    const days = parseTimingDays(textOf(r.timing), from);
    // a months-long matter without a parsable date: check in at the ceiling, not in two weeks
    const fallback = scale === "long" ? REVISIT_MAX_DAYS : REVISIT_DEFAULT_DAYS;
    const final = days ?? fallback;
    // 10-12 多段应期: a letter after each earlier window too — the quote is one language's text, parsed as written
    return { days: final, quote: quoteOf(r.timing) || null, checkpoints: timingCheckpoints(quoteOf(r.timing), from, final) };
  }
  const r = reading as Reading;
  const days = parseTimingDays(`${textOf(r.movement)} ${textOf(r.direction)}`);
  return { days: days ?? REVISIT_DEFAULT_DAYS, quote: null, checkpoints: [] };
}
