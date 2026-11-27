import { randomBytes } from "node:crypto";
import { cancelSelfRevisit, customerEmailById, customerIdByEmail, db, recordOps, scheduleSelfRevisit, selfRevisitOf, type RevisitRow, type SelfRevisitKind } from "./db";
import { toHans } from "./hant";
import { matterBySlug } from "./mingli/calendar/zeri";
import { monthRanges } from "./mingli/ziwei/report-facts";
import { isForeign, fmt, type Foreign } from "./l10n/core";
import { isLocale, LOCALE_META } from "./locales";
import { selfRevText, type SelfRevisitWords } from "./self-revisit-text";
import { dayIn, mdIn, spanIn } from "./l10n/dates";
import { nsForeignText } from "./mingli/nianshu/foreign-text";
import { josa } from "./mingli/bazi/names-fmt";

/**
 * 10-22 进度表 80 看自己幾項接上「到期回來問你」 (需求 71／72／74 結果頁第 7 區塊; 竞争力深调 §五: a new product ships only
 * with a revisit). A paid report — 八字 / 紫微 / 星盤 deep report, the 年書 — and a picked day (擇日) get the same
 * "what would count, and when to ask you" as a reading: one letter when the day comes, one tap to answer, the answer
 * on the account page. The rows ride in `revisits` (kind set), so 77's one-letter-per-address run and its caps, the
 * signed answer links and the record all carry them; the readings' record (outcomeStats) leaves them out.
 *
 *   八字   3 個月 / 半年 / 今年年底        紫微   這個流月過完 / 1 個月 / 3 個月        星盤   3 個月 / 半年
 *   年書   each key month the book named, two days after it ends (ref `token:pivot|slow|smooth`)
 *   擇日   three days after the picked day (set with the reminder, lib/mingli/calendar/zeri-remind.ts; on by default,
 *          cancelled with the reminder; ref `ymd:slug:remindToken`)
 *   六爻（免費）  2 週 / 1 個月 / 3 個月 after the cast, the reader's pick (进度表 90, ref a random token)
 *
 * 10-22 进度表 85 (80 的验收「每張看自己付費單在『我的 · 回訪』裡看得到回訪日期」): a paid deep report gets its default day the
 * moment it is paid (八字 3 個月、紫微 這個流月過完、星盤 3 個月 — the page shows it, changeable, cancellable), and a 年書
 * gets its three key months the moment it is bought (months already over are left out). A member's monthly rewrite
 * (a salted row) gets none: it is the same chart.
 */
export type SelfOption = { id: string; label: string; dueAt: (now: number) => number };
type OptionDef = { id: string; label: string | ((now: number) => string); dueAt: (now: number) => number };
const DAY = 86_400_000;
const TPE_MS = 8 * 3600_000;
const months = (n: number) => (now: number) => { const d = new Date(now); d.setMonth(d.getMonth() + n); return d.getTime(); };
const yearEnd = (now: number) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), 11, 31, 12); };
const tpeDay = (now: number) => { const d = new Date(now + TPE_MS); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

/* ------------------------------------------------------------------ 流月 (紫微) */

export type Liuyue = { lunar: string; fromUtc: number; toUtc: number };
/** the twelve 流月 of lunar year Y with their 國曆 days (UTC midnight), split at a leap month the way the 紫微 chart splits it */
function liuyueOfYear(y: number): Liuyue[] {
  let yr = y, prev = 0;
  return monthRanges(y).map((r) => {
    const [fm, fd] = r.from.split("/").map(Number) as [number, number];
    if (fm < prev) yr++;
    prev = fm;
    const [tm, td] = r.to.split("/").map(Number) as [number, number];
    return { lunar: r.lunar, fromUtc: Date.UTC(yr, fm - 1, fd), toUtc: Date.UTC(tm < fm ? yr + 1 : yr, tm - 1, td) };
  });
}
/** the 流月 running on `now` (Taipei) and the one after it */
export function liuyueAround(now = Date.now()): { cur: Liuyue; next: Liuyue | null } | null {
  try {
    const today = tpeDay(now), y = new Date(now + TPE_MS).getUTCFullYear();
    const all = [...liuyueOfYear(y - 1), ...liuyueOfYear(y), ...liuyueOfYear(y + 1)];
    const i = all.findIndex((m) => m.fromUtc <= today && today <= m.toUtc);
    return i < 0 ? null : { cur: all[i]!, next: all[i + 1] ?? null };
  } catch { return null; }
}
/** 紫微's 「流月提到的那個月」: the 流月 running now — or, with under a week of it left, the next one */
export function liuyuePick(now = Date.now()): { m: Liuyue; next: boolean } | null {
  const a = liuyueAround(now);
  if (!a) return null;
  if (a.cur.toUtc - tpeDay(now) < 7 * DAY && a.next) return { m: a.next, next: true };
  return { m: a.cur, next: false };
}
const md = (utc: number) => { const d = new Date(utc); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

const OPTIONS: Record<"bazi" | "ziwei" | "astro", OptionDef[]> = {
  bazi: [{ id: "3m", label: "3 個月後", dueAt: months(3) }, { id: "6m", label: "半年後", dueAt: months(6) }, { id: "ye", label: "今年年底", dueAt: yearEnd }],
  ziwei: [
    {
      id: "ly",
      label: (now) => { const p = liuyuePick(now); return p ? `${p.next ? "下一個流月" : "這個流月"}過完（農曆${p.m.lunar}，到 ${md(p.m.toUtc)}）` : "這個流月過完"; },
      dueAt: (now) => { const p = liuyuePick(now); return p ? daysAfterNoon(p.m.toUtc + DAY, 2) : months(1)(now); },
    },
    { id: "1m", label: "1 個月後", dueAt: months(1) }, { id: "3m", label: "3 個月後", dueAt: months(3) },
  ],
  astro: [{ id: "3m", label: "3 個月後", dueAt: months(3) }, { id: "6m", label: "半年後", dueAt: months(6) }],
};
/** 10-30 进度表 128 ④: a choice's words outside Chinese (lib/self-revisit-text.ts) — the 流月 one with its month and end day */
const OPT_KEY: Record<string, "m1" | "m3" | "m6" | "ye"> = { "1m": "m1", "3m": "m3", "6m": "m6", ye: "ye" };
const LUNAR_NUM: Record<string, number> = { 正: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 冬: 11, 十一: 11, 臘: 12, 腊: 12, 十二: 12 };
function foreignOptionLabel(id: string, locale: string, now: number): string {
  const t = selfRevText(locale).opt;
  if (id !== "ly") return t[OPT_KEY[id] ?? "m3"];
  const p = liuyuePick(now);
  if (!p) return t.lyBare;
  const n = LUNAR_NUM[p.m.lunar.replace(/^閏|^闰|月$/g, "")];
  let d = md(p.m.toUtc);
  try { d = new Intl.DateTimeFormat(isLocale(locale) ? LOCALE_META[locale].htmlLang : locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(p.m.toUtc)); } catch { /* M/D */ }
  return n ? fmt(p.next ? t.lyNext : t.lyThis, { lunar: String(n), d }) : t.lyBare;
}
export const selfOptions = (kind: SelfRevisitKind, locale: string, now = Date.now()): SelfOption[] =>
  (isHandSetKind(kind) ? OPTIONS[kind] : []).map((o) => {
    if (isForeign(locale)) return { id: o.id, dueAt: o.dueAt, label: foreignOptionLabel(o.id, locale, now) };
    const label = typeof o.label === "function" ? o.label(now) : o.label;
    return { id: o.id, dueAt: o.dueAt, label: locale === "zh" ? toHans(label) : label };
  });
/**
 * 10-22: what a page hands the 「到期回來問你」 block (a client component) — the id and the words only. The options carry
 * a `dueAt` function, and a function cannot cross into a client component: passing selfOptions() as it is made every
 * paid report page fail (500) after 进度表 85.
 */
export const selfChoices = (kind: SelfRevisitKind, locale: string, now = Date.now()): { id: string; label: string }[] =>
  selfOptions(kind, locale, now).map(({ id, label }) => ({ id, label }));
/** the kinds a reader sets from a page (the rest are set with a letter, a reminder or the free block) */
export const isHandSetKind = (kind: SelfRevisitKind): kind is "bazi" | "ziwei" | "astro" => kind === "bazi" || kind === "ziwei" || kind === "astro";
/** the day a paid report asks by default (进度表 85) */
export const DEFAULT_OPTION: Record<"bazi" | "ziwei" | "astro", string> = { bazi: "3m", ziwei: "ly", astro: "3m" };

/** 10-22: the year end is in the past from November on — then "今年年底" means next year's */
export function selfDueAt(kind: SelfRevisitKind, optionId: string, now = Date.now()): number | null {
  const o = selfOptions(kind, "zh-hant", now).find((x) => x.id === optionId);
  if (!o) return null;
  let due = o.dueAt(now);
  if (due - now < 7 * DAY) { const d = new Date(due); d.setFullYear(d.getFullYear() + 1); due = d.getTime(); }
  return due;
}

/** 10-30 进度表 128 ④: the names (and the words below) in every language — lib/self-revisit-text.ts */
export const selfKindName = (kind: SelfRevisitKind, locale: string): string => selfRevText(locale).kind[kind];

/** where the letter and the account page send the reader back to */
export function selfReportUrl(site: string, kind: SelfRevisitKind, ref: string, locale: string): string {
  const l = isLocale(locale) ? locale : "zh-hant";
  if (kind === "bazi") return `${site}/${l}/bazi/r/${ref}`;
  if (kind === "ziwei") return `${site}/${l}/ziwei/r/${ref}`;
  if (kind === "astro") return `${site}/${l}/xingpan/r/${ref}`;
  if (kind === "nianshu") return `${site}/${l}/nianshu/r/${ref.split(":")[0] ?? ref}`;
  if (kind === "cast") return `${site}/${l}/cast?c=free-revisit`;
  const slug = ref.split(":")[1] ?? "";
  return `${site}/${l}/zeri/${slug}`;
}

/** the words on the link back (the digest letter, 「我的」): a report, the 年書, the day, a new cast */
export function selfReviewLabel(kind: SelfRevisitKind, locale: string): string {
  const t = selfRevText(locale).review;
  return kind === "nianshu" ? t.nianshu : kind === "zeri" ? t.zeri : kind === "cast" ? t.cast : t.report;
}

/** the letter's name for the thing asked about: 「紫微深度報告」, 「擇日：搬家 · 2026-11-03」 */
export function selfLabel(kind: SelfRevisitKind, ref: string, locale: string): string {
  if (kind === "zeri") {
    const [ymd, slug] = ref.split(":");
    const m = slug ? matterBySlug(slug) : null;
    const what = m && !isForeign(locale) ? (locale === "zh" ? toHans(m.tw) : m.tw) : "";
    return `${selfKindName(kind, locale)}${what ? `：${what}` : ""} · ${ymd ?? ""}`;
  }
  return selfKindName(kind, locale);
}

const REPORT_TABLE: Record<"bazi" | "ziwei" | "astro" | "nianshu", string> = { bazi: "bazi_reports", ziwei: "ziwei_reports", astro: "astro_reports", nianshu: "nianshu_reports" };

/** does this report belong to the person asking (its customer, or the address it was bought with)? */
export function selfRefOwned(kind: SelfRevisitKind, ref: string, who: { customerId: number | null; email: string | null }): boolean {
  if (kind === "zeri" || kind === "cast") return false;
  if (kind === "nianshu") ref = ref.split(":")[0] ?? "";
  if (!/^[0-9a-f]{16,64}$/.test(ref)) return false;
  try {
    const r = db().prepare(`SELECT customer_id, email, paid_at FROM ${REPORT_TABLE[kind]} WHERE token = ?`).get(ref) as { customer_id: number | null; email: string | null; paid_at: number | null } | undefined;
    if (!r || !r.paid_at) return false;
    if (who.customerId && r.customer_id === who.customerId) return true;
    if (who.email && r.email && r.email.toLowerCase() === who.email.toLowerCase()) return true;
    if (who.email && r.customer_id && customerIdByEmail(who.email) === r.customer_id) return true;
    return false;
  } catch { return false; }
}

/** the account a paid report belongs to (so a revisit set without a cookie still lands on that account's page) */
export function selfRefCustomer(kind: SelfRevisitKind, ref: string): number | null {
  if (kind === "zeri" || kind === "cast") return null;
  const token = kind === "nianshu" ? ref.split(":")[0] ?? "" : ref;
  if (!/^[0-9a-f]{16,64}$/.test(token)) return null;
  try { return (db().prepare(`SELECT customer_id FROM ${REPORT_TABLE[kind]} WHERE token = ?`).get(token) as { customer_id: number | null } | undefined)?.customer_id ?? null; } catch { return null; }
}

const clip = (s: string | null | undefined, n = 80): string | null => { const v = (s ?? "").replace(/\s+/g, " ").trim().slice(0, n); return v || null; };

export function setSelfRevisit(i: { kind: SelfRevisitKind; ref: string; email: string; customerId: number | null; locale: string; dueAt: number; hint: string | null; plan?: string | null }, now = Date.now()): "set" | "moved" | "kept" {
  return scheduleSelfRevisit({ kind: i.kind, ref: i.ref, customerId: i.customerId, email: i.email.trim().toLowerCase(), locale: isLocale(i.locale) ? i.locale : "zh-hant", dueAt: i.dueAt, label: selfLabel(i.kind, i.ref, i.locale), hint: clip(i.hint), plan: i.plan === undefined ? undefined : clip(i.plan) }, now);
}
export const unsetSelfRevisit = (kind: SelfRevisitKind, ref: string): boolean => cancelSelfRevisit(kind, ref);

/** noon Taipei on the n-th day after a 國曆 day given as "YYYY-MM-DD" (or a UTC day in ms) */
export function daysAfterNoon(day: string | number, n: number): number {
  const base = typeof day === "number" ? day : Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  return base + n * DAY + 12 * 3600_000 - TPE_MS;
}

/* ------------------------------------------------------------------ 年書 */

export const KEY_MONTH_WORD: Record<"pivot" | "slow" | "smooth", string> = { pivot: "全年最有動靜的月份", slow: "全年最該放慢的月份", smooth: "全年最順手的月份" };
type MonthsFacts = { months?: Record<string, { start: string; term: string }[]>; book?: { year: number; key: { pivot: number; slow: number; smooth: number } } };

/** when the key 節氣月 ends — the next month's start, or 立春 of the next year after the 小寒 month (UTC midnight of that 國曆 day) */
export function keyMonthEndUtc(f: Pick<MonthsFacts, "months">, year: number, i: number): number {
  const ms = f.months?.[String(year)] ?? [];
  const next = ms[i + 1];
  if (next) {
    const [mm, dd] = next.start.split("/").map(Number);
    return Date.UTC(mm! >= 2 ? year : year + 1, mm! - 1, dd!);
  }
  return Date.UTC(year + 1, 1, 4);
}

/**
 * 10-30 进度表 128 ④-5: a key 節氣月 in another language — its first and last day, written that language's way
 * ("Mar 6 – Apr 4", 「3月6日〜4月4日」); `start` is the facts' 國曆 "M/D", `monthEndUtc` the next month's first day
 */
export function keyMonthSpanIn(l: Foreign, year: number, start: string, monthEndUtc: number): string {
  const last = new Date(monthEndUtc - DAY);
  return spanIn(l, mdIn(l, start, year, true), dayIn(l, last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate()));
}

/** 年書: ask two days after a key 節氣月 ends (set at purchase, and again — same row — when the key-month letter goes) */
export function scheduleNianshuRevisit(i: { token: string; year: number; keyKind: "pivot" | "slow" | "smooth"; term: string; start: string; kindWord: string; monthEndUtc: number; customerId: number | null; email: string; locale: string }, now = Date.now()): "set" | "moved" | "kept" {
  const due = daysAfterNoon(i.monthEndUtc, 2), email = i.email.trim().toLowerCase(), ref = `${i.token}:${i.keyKind}`;
  // 10-30 进度表 128 ④-5: a 年書 bought on a page in another language is asked about in that language
  if (isLocale(i.locale) && isForeign(i.locale)) {
    const l = i.locale, T = nsForeignText(l), ko = (s: string) => (l === "ko" ? josa(s) : s);
    return scheduleSelfRevisit({
      kind: "nianshu", ref, customerId: i.customerId, email, locale: l, dueAt: due,
      label: fmt(T.rev.label, { y: i.year, m: keyMonthSpanIn(l, i.year, i.start, i.monthEndUtc) }), hint: ko(fmt(T.rev.hint, { k: T.km.kind[i.keyKind] })),
    }, now);
  }
  const z = (s: string) => (i.locale === "zh" ? toHans(s) : s);
  return scheduleSelfRevisit({
    kind: "nianshu", ref, customerId: i.customerId, email, locale: i.locale === "zh" ? "zh" : "zh-hant",
    dueAt: due, label: z(`三合一年書 ${i.year} · ${i.term}月`), hint: z(`年書把這個月標成${i.kindWord}；它過去了，像那樣嗎？`),
  }, now);
}

/** 进度表 85: a bought 年書 gets its three key months at once (a month already over is left out) — returns how many were set */
export function nianshuPurchaseRevisits(token: string, now = Date.now()): number {
  try {
    const r = db().prepare("SELECT year, locale, customer_id, email, paid_at, chart_json FROM nianshu_reports WHERE token = ?").get(token) as
      { year: number; locale: string; customer_id: number | null; email: string | null; paid_at: number | null; chart_json: string } | undefined;
    if (!r || !r.paid_at) return 0;
    const email = r.email ?? (r.customer_id ? customerEmailById(r.customer_id) : null);
    if (!email || !email.includes("@")) return 0;
    const f = (JSON.parse(r.chart_json) as { bazi?: MonthsFacts }).bazi;
    const book = f?.book, ms = f?.months?.[String(r.year)];
    if (!f || !book || !ms) return 0;
    let n = 0;
    for (const k of ["pivot", "slow", "smooth"] as const) {
      const i = book.key[k], m = ms[i];
      if (!m) continue;
      const end = keyMonthEndUtc(f, r.year, i);
      if (daysAfterNoon(end, 2) < now + DAY) continue;
      if (selfRevisitOf("nianshu", `${token}:${k}`)) continue;
      scheduleNianshuRevisit({ token, year: r.year, keyKind: k, term: m.term, start: m.start, kindWord: KEY_MONTH_WORD[k], monthEndUtc: end, customerId: r.customer_id, email, locale: r.locale }, now);
      n++;
    }
    return n;
  } catch { return 0; }
}

/* ------------------------------------------------------------------ the default day of a paid deep report (进度表 85) */

/**
 * A paid 八字／紫微／星盤 deep report asks by default: 3 months / this 流月 / 3 months. Once per report — a revisit the
 * reader already set, moved or cancelled stays as it is. A report with no address has nobody to write to.
 */
export function defaultSelfRevisit(kind: "bazi" | "ziwei" | "astro", token: string, now = Date.now()): "set" | "skip" {
  try {
    const r = db().prepare(`SELECT kind, locale, customer_id, email, paid_at FROM ${REPORT_TABLE[kind]} WHERE token = ?`).get(token) as
      { kind: string; locale: string; customer_id: number | null; email: string | null; paid_at: number | null } | undefined;
    if (!r || !r.paid_at || r.kind !== "deep") return "skip";
    if (selfRevisitOf(kind, token)) return "skip";
    const email = r.email ?? (r.customer_id ? customerEmailById(r.customer_id) : null);
    if (!email || !email.includes("@")) return "skip";
    const due = selfDueAt(kind, DEFAULT_OPTION[kind], now) ?? selfDueAt(kind, kind === "ziwei" ? "1m" : "3m", now);
    if (!due) return "skip";
    setSelfRevisit({ kind, ref: token, email, customerId: r.customer_id, locale: r.locale, dueAt: due, hint: null }, now);
    return "set";
  } catch { return "skip"; }
}

/**
 * The reports paid before the defaults existed (and anything a payment path missed): a deep report with no revisit
 * row, a 年書 with none of its months. A member's monthly rewrite is the same chart — its row carries a salted hash,
 * so it is told apart by recomputing the plain one. Run by the daily revisit sweep; cheap when there is nothing to do.
 */
export async function backfillSelfRevisits(now = Date.now(), since = Date.UTC(2026, 9, 15)): Promise<number> {
  let n = 0;
  try {
    const [{ inputHash }, { zwInputHash }, { asInputHash }] = await Promise.all([import("./mingli/bazi/report"), import("./mingli/ziwei/report"), import("./mingli/astro/report")]);
    const plain: Record<"bazi" | "ziwei" | "astro", (facts: unknown, locale: string) => string> = {
      bazi: (f, l) => inputHash(f as Parameters<typeof inputHash>[0], "deep", ((f as { years?: { year: number }[] }).years ?? []).map((y) => y.year), l),
      ziwei: (f, l) => zwInputHash(f as Parameters<typeof zwInputHash>[0], "deep", l),
      astro: (f, l) => asInputHash(f as Parameters<typeof asInputHash>[0], "deep", l),
    };
    for (const kind of ["bazi", "ziwei", "astro"] as const) {
      const rows = db().prepare(`SELECT t.token, t.locale, t.chart_json, t.input_hash FROM ${REPORT_TABLE[kind]} t
        WHERE t.paid_at IS NOT NULL AND t.paid_at >= ? AND t.kind = 'deep'
          AND NOT EXISTS (SELECT 1 FROM revisits v WHERE v.session_id = 'self:${kind}:' || t.token) LIMIT 300`).all(since) as { token: string; locale: string; chart_json: string; input_hash: string }[];
      for (const r of rows) {
        try { if (plain[kind](JSON.parse(r.chart_json), r.locale) !== r.input_hash) continue; } catch { continue; }
        if (defaultSelfRevisit(kind, r.token, now) === "set") n++;
      }
    }
    const books = db().prepare(`SELECT t.token FROM nianshu_reports t WHERE t.paid_at IS NOT NULL AND t.paid_at >= ?
      AND NOT EXISTS (SELECT 1 FROM revisits v WHERE v.session_id LIKE 'self:nianshu:' || t.token || ':%') LIMIT 300`).all(since) as { token: string }[];
    for (const b of books) n += nianshuPurchaseRevisits(b.token, now);
  } catch { /* the sweep tries again tomorrow */ }
  if (n) recordOps("self_revisit_backfill", `set ${n}`);
  return n;
}

/* ------------------------------------------------------------------ 擇日 */

/** 擇日: the reminder is set — ask three days after the picked day; taking the reminder back takes this back too */
export function scheduleZeriRevisit(i: { remindToken: string; ymd: string; slug: string; email: string; locale: string; customerId?: number | null }, now = Date.now()): "set" | "moved" | "kept" {
  const ref = `${i.ymd}:${i.slug}:${i.remindToken}`;
  const z = (s: string) => (i.locale === "zh" ? toHans(s) : s);
  return scheduleSelfRevisit({
    kind: "zeri", ref, customerId: i.customerId ?? null, email: i.email.trim().toLowerCase(), locale: i.locale === "zh" ? "zh" : "zh-hant",
    dueAt: daysAfterNoon(i.ymd, 3), label: selfLabel("zeri", ref, i.locale), hint: z("那天的事，辦得順不順？"),
  }, now);
}
export const cancelZeriRevisit = (remindToken: string, ymd: string, slug: string): boolean => cancelSelfRevisit("zeri", `${ymd}:${slug}:${remindToken}`);
export const currentSelfRevisit = (kind: SelfRevisitKind, ref: string): RevisitRow | null => selfRevisitOf(kind, ref);

/* ------------------------------------------------------------------ 六爻（免費）— 进度表 90 */

export const FREE_DAYS = [14, 30, 90] as const;
export type FreeDays = (typeof FREE_DAYS)[number];
/** a free reading asks too (设计稿 R7「付不付費都給回訪」): the reader's own day, what would count, what they mean to do */
export function scheduleFreeCastRevisit(i: { question: string; hexName: string | null; days: FreeDays; hint: string | null; plan: string | null; email: string; customerId: number | null; locale: string }, now = Date.now()): { ref: string; dueAt: number } {
  const ref = randomBytes(12).toString("hex");
  const q = (clip(i.question, 60) ?? "").replace(/[「」]/g, "");
  const label = `${q ? (isForeign(i.locale) ? `“${q}”` : `「${q}」`) : selfKindName("cast", i.locale)}${i.hexName ? ` · ${i.hexName}` : ""}`;
  const dueAt = daysAfterNoon(tpeDay(now), i.days);
  scheduleSelfRevisit({ kind: "cast", ref, customerId: i.customerId, email: i.email.trim().toLowerCase(), locale: isLocale(i.locale) ? i.locale : "zh-hant", dueAt, label, hint: clip(i.hint), plan: clip(i.plan) }, now);
  return { ref, dueAt };
}

/** a 看自己 (or free) answer scores itself: the reader said what happened to the thing they set as the result */
export function selfVerdict(event: "happened" | "stirred" | "nothing" | "open" | "offwindow"): "hit" | "partial" | "miss" | "open" {
  return event === "happened" ? "hit" : event === "stirred" || event === "offwindow" ? "partial" : event === "nothing" ? "miss" : "open";
}

/** the report page block's words (components/SelfRevisitSet) and the account page list: lib/self-revisit-text.ts */
export type { SelfRevisitWords };
export function selfRevisitUi(locale: string): SelfRevisitWords {
  return selfRevText(locale).ui;
}
