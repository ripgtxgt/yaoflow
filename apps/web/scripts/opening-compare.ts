/**
 * 10-23 进度表 84 深断「下一步」「訊號」开头雷同 — before and after the prompt change (lib/reading.ts Field intents).
 *   DATA_DIR=<a copy> npx tsx scripts/opening-compare.ts stats [days]     → the share of openings shared by ≥5 readings (30 days)
 *   DATA_DIR=<a copy> npx tsx scripts/opening-compare.ts regen <n>        → the n latest deep readings (one per cast) read again
 *                                                                             with today's prompt: openings old vs new, and
 *                                                                             what must not move (odds, the fields all there)
 * Run on a COPY of the database (the model calls write ops lines). Prints counts and short opening prefixes only — never a
 * question or an address.
 */
import type { LineValue } from "@yaoflow/engine";
import { db } from "../src/lib/db";
import { asLocale } from "../src/lib/locales";
import { generateReading } from "../src/lib/generate";
import { toHans } from "../src/lib/hant";

type Row = { cast_id: number; question: string; values_str: string; cast_at: number; tz_offset: number; locale: string; body_json: string; created_at: number };
const FIELDS = ["next_step", "signals"] as const;
const text = (body: Record<string, unknown> | null, k: string): string | null => {
  const v = body?.[k] as Record<string, string> | string | undefined;
  if (!v) return null;
  return typeof v === "string" ? v : Object.values(v)[0] ?? null;
};
const head = (s: string | null, n = 10) => (s ? toHans(s).replace(/\s+/g, "").slice(0, n) : "");
const TIME_OPENER = /^(这七天|這七天|接下来|接下來|这几天|這幾天|这一周|這一週|这周|這週|未来|未來|七天内|七天內|一周内|一週內)/;
const STOCK_OPENER = /^(如果他先|如果对方先|如果对方主动|如果他主动)/;

function rows(sinceMs: number, limit = 100000): Row[] {
  return db().prepare(`SELECT r.cast_id, c.question, c.values_str, c.cast_at, c.tz_offset, r.locale, r.body_json, r.created_at
    FROM readings r JOIN casts c ON c.id = r.cast_id
    WHERE r.tier = 'deep' AND r.created_at >= ? AND r.locale IN ('zh','zh-hant')
      AND r.id = (SELECT MAX(r2.id) FROM readings r2 WHERE r2.cast_id = r.cast_id AND r2.tier = 'deep')
    ORDER BY r.created_at DESC LIMIT ?`).all(sinceMs, limit) as Row[];
}

/** share of texts whose first 10 characters are shared by at least `k` texts in the set */
function sharedShare(texts: string[], k: number): number {
  const heads = texts.map((t) => head(t)).filter(Boolean);
  const count = new Map<string, number>();
  for (const h of heads) count.set(h, (count.get(h) ?? 0) + 1);
  return heads.length ? heads.filter((h) => (count.get(h) ?? 0) >= k).length / heads.length : 0;
}
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const share = (texts: string[], re: RegExp) => (texts.length ? texts.filter((t) => re.test(toHans(t))).length / texts.length : 0);

(async () => {
  const mode = process.argv[2];
  if (mode === "stats") {
    const days = Number(process.argv[3] ?? 30);
    const rs = rows(Date.now() - days * 86_400_000);
    const out: Record<string, unknown> = { readings: rs.length };
    for (const f of FIELDS) {
      const ts = rs.map((r) => text(JSON.parse(r.body_json), f)).filter((t): t is string => !!t);
      out[f] = { n: ts.length, sharedBy5: pct(sharedShare(ts, 5)), timeOpener: pct(share(ts, TIME_OPENER)), stockOpener: pct(share(ts, STOCK_OPENER)) };
    }
    console.log(JSON.stringify(out, null, 1));
    return;
  }
  const n = Math.min(Math.max(Number(process.argv[3] ?? 20), 1), 60);
  const sample = rows(Date.now() - 30 * 86_400_000, n);
  const olds: Record<string, string[]> = { next_step: [], signals: [] }, news: Record<string, string[]> = { next_step: [], signals: [] };
  let sameOdds = 0, compared = 0, failed = 0, missing = 0;
  const prefixes: { old: string[]; new: string[] }[] = [];
  for (const r of sample) {
    const old = JSON.parse(r.body_json) as Record<string, unknown>;
    const input = { question: r.question, values: r.values_str.split(",").map(Number) as LineValue[], castAtMs: r.cast_at, tzOffsetMinutes: r.tz_offset };
    const real = Date.now;
    Date.now = () => r.cast_at + 90_000; // read as on the cast day
    let fresh: Record<string, unknown> | null = null;
    try { fresh = (await generateReading("deep", input, true, asLocale(r.locale))) as unknown as Record<string, unknown>; } catch { failed += 1; }
    Date.now = real;
    if (!fresh) continue;
    for (const f of FIELDS) {
      const a = text(old, f), b = text(fresh, f);
      if (a) olds[f]!.push(a);
      if (b) news[f]!.push(b); else missing += 1;
    }
    const oa = text(old, "odds"), ob = text(fresh, "odds");
    if (oa && ob) { compared += 1; if (oa === ob) sameOdds += 1; }
    prefixes.push({ old: FIELDS.map((f) => head(text(old, f), 6)), new: FIELDS.map((f) => head(text(fresh, f), 6)) });
  }
  const sum = (set: Record<string, string[]>) => Object.fromEntries(FIELDS.map((f) => [f, { n: set[f]!.length, sharedBy2: pct(sharedShare(set[f]!, 2)), timeOpener: pct(share(set[f]!, TIME_OPENER)), stockOpener: pct(share(set[f]!, STOCK_OPENER)) }]));
  console.log(JSON.stringify({ sample: sample.length, regenerated: sample.length - failed, failed, fieldsMissing: missing, oddsSame: `${sameOdds}/${compared}`, old: sum(olds), new: sum(news), prefixes }, null, 1));
})();
