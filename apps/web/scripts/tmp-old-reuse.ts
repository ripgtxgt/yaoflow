/** 10-22 prototype (not kept): how often a deep reading reuses wording found only in the matter's older-than-3-days record. */
import { db } from "../src/lib/db";
import { matterSoFar, scaleOf } from "../src/lib/matter-context";
import { asLocale } from "../src/lib/locales";
import { toHans } from "../src/lib/hant";

const since = Date.parse("2026-10-12T16:00:00Z");
const OLD = 3;
const cjkGrams = (t: string, n = 3) => {
  const out = new Set<string>();
  for (const clause of toHans(t).split(/[^\p{Script=Han}]+/u)) for (let i = 0; i + n <= clause.length; i++) out.add(clause.slice(i, i + n));
  return out;
};
type R = { id: number; customer_id: number; matter_id: number; locale: string; question: string; cast_at: number; tz_offset: number; body_json: string };
const rows = db().prepare(`SELECT c.id, c.customer_id, c.matter_id, c.locale, c.question, c.cast_at, c.tz_offset, r.body_json FROM casts c JOIN readings r ON r.cast_id = c.id WHERE c.matter_id IS NOT NULL AND r.tier = 'deep' AND r.created_at >= ?`).all(since) as R[];
// document frequency of 3-grams over all deep readings in the window: what is common prose, not someone's own detail
const df = new Map<string, number>();
const textOf = (r: R) => {
  const l = asLocale(r.locale);
  const b = JSON.parse(r.body_json) as Record<string, unknown>;
  return ["verdict", "tendency", "other_side", "strategy", "caution", "next_step", "signals", "closing"].map((k) => { const v = b[k]; return typeof v === "string" ? v : v && typeof v === "object" ? String((v as Record<string, string>)[l] ?? Object.values(v as object)[0] ?? "") : ""; }).join("。");
};
for (const r of rows) for (const g of cjkGrams(textOf(r))) df.set(g, (df.get(g) ?? 0) + 1);
const common = (g: string) => (df.get(g) ?? 0) > Math.max(3, rows.length * 0.02);
const dist: Record<string, number> = {};
const shown: string[] = [];
for (const r of rows) {
  const m = matterSoFar(r.matter_id, { castIds: [r.id] }, asLocale(r.locale), { at: r.cast_at, scale: scaleOf({ question: r.question }, r.cast_at, r.tz_offset) });
  if (!m) continue;
  const oldTexts = [...m.reader_notes.filter((n) => n.days_ago > OLD).map((n) => n.note), ...m.earlier_casts.filter((c) => c.days_ago > OLD).map((c) => c.question)];
  if (!oldTexts.length) continue;
  const recentTexts = [r.question, m.title ?? "", ...m.reader_notes.filter((n) => n.days_ago <= OLD).map((n) => n.note), ...m.earlier_casts.filter((c) => c.days_ago <= OLD).map((c) => c.question)];
  const recent = new Set<string>(); for (const t of recentTexts) for (const g of cjkGrams(t)) recent.add(g);
  const oldOnly = new Set<string>(); for (const t of oldTexts) for (const g of cjkGrams(t)) if (!recent.has(g) && !common(g)) oldOnly.add(g);
  const txt = toHans(textOf(r));
  const hits = [...cjkGrams(txt)].filter((g) => oldOnly.has(g));
  // merge overlapping grams into spans
  const spans: string[] = [];
  for (const g of hits) { const s = spans.find((x) => x.includes(g.slice(0, 2)) || x.includes(g.slice(1))); if (s) { if (!s.includes(g)) spans[spans.indexOf(s)] = s + "|" + g; } else spans.push(g); }
  const k = spans.length >= 4 ? "4+" : String(spans.length);
  dist[k] = (dist[k] ?? 0) + 1;
  if (spans.length >= 2) shown.push(`${r.id} cust ${r.customer_id} spans ${spans.length}: ${spans.slice(0, 6).join(" / ")}`);
}
console.log("deep with old records:", Object.values(dist).reduce((a, b) => a + b, 0), JSON.stringify(dist));
console.log(shown.join("\n"));
