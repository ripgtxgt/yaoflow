/**
 * 10-31 进度表 129 ⑥: past real casts read again under the 129 rules (contact guard, observation period + check-back
 * date, deadline-only for even/no), old call beside new. Run against a COPY of the database; calls the model.
 *   DATA_DIR=<copy> npx tsx scripts/calib-compare-129.ts pick          → sample ids by group
 *   DATA_DIR=<copy> npx tsx scripts/calib-compare-129.ts regen <id…>  → JSON to stdout
 */
import type { LineValue } from "@yaoflow/engine";
import { db } from "../src/lib/db";
import { chartGuard, resolveServerChart, resolveTiming, type ReadingInput } from "../src/lib/reading";
import { toHans } from "../src/lib/hant";
import { asLocale } from "../src/lib/locales";
import { generateReading } from "../src/lib/generate";
import { isContactQuestion } from "../src/lib/contact-question";
import { timingOffense } from "../src/lib/reading";

type Row = { id: number; kind?: string | null; cast_id: number; lean: string | null; outcome: string | null; event: string | null; ask: string | null; question: string; values_str: string; cast_at: number; tz_offset: number; locale: string; body_json: string | null; tier: string };
const rows = (where: string, args: number[] = []) => db().prepare(
  `SELECT v.id, v.cast_id, v.lean, v.outcome, v.event, v.ask, v.tier, c.question, c.values_str, c.cast_at, c.tz_offset, c.locale,
     (SELECT body_json FROM readings r WHERE r.cast_id = c.id AND r.tier = 'deep' ORDER BY r.id DESC LIMIT 1) AS body_json
   FROM revisits v JOIN casts c ON c.id = v.cast_id WHERE ${where} ORDER BY v.id`).all(...args) as Row[];
const inputOf = (r: Row): ReadingInput => ({ question: r.question, values: r.values_str.split(",").map(Number) as LineValue[], castAtMs: r.cast_at, tzOffsetMinutes: r.tz_offset });
const guardOf = (r: Row) => { const i = inputOf(r); const c = resolveServerChart(i, true); return chartGuard(c, resolveTiming({ ...i, question: toHans(i.question) }, c, true), toHans(i.question)); };
const field = (body: string | null, k: string): string | null => { if (!body) return null; const v = (JSON.parse(body) as Record<string, Record<string, string> | string>)[k]; return typeof v === "string" ? v : v ? Object.values(v)[0] ?? null : null; };

(async () => {
  const mode = process.argv[2];
  if (mode === "pick") {
    const all = rows("v.kind IS NULL AND v.tier = 'deep' AND v.event IN ('happened','stirred','nothing') AND COALESCE(v.ask,'event') = 'event' AND v.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)");
    const g: Record<string, number[]> = {};
    for (const r of all) { const k = `${isContactQuestion(toHans(r.question)) ? "contact" : "other"}|${r.lean}|${r.event}`; (g[k] ??= []).push(r.id); }
    console.log(JSON.stringify(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { n: v.length, ids: v.slice(-8) }])), null, 1));
    return;
  }
  const ids = process.argv.slice(3).map(Number).filter(Boolean);
  const out = [];
  for (const r of rows(`v.id IN (${ids.join(",")})`)) {
    const input = inputOf(r);
    const g = guardOf(r);
    const real = Date.now;
    Date.now = () => r.cast_at + 90_000; // read as on the cast day, as it was then
    let fresh: Record<string, unknown> | null = null;
    try { fresh = (await generateReading("deep", input, true, asLocale(r.locale))) as unknown as Record<string, unknown>; } catch (e) { fresh = { error: String(e) }; }
    Date.now = real;
    const pick = (o: Record<string, unknown> | null, k: string) => { const v = o?.[k] as Record<string, string> | string | undefined; return typeof v === "string" ? v : v ? Object.values(v)[0] : null; };
    out.push({
      id: r.id, outcome: r.outcome, event: r.event, contact: isContactQuestion(toHans(r.question)), guard: g?.signals ?? null,
      old_offense: field(r.body_json, "timing") ? timingOffense({ timing: field(r.body_json, "timing")!, odds: field(r.body_json, "odds") ?? "" }, asLocale(r.locale)) : null,
      old: { verdict: field(r.body_json, "verdict"), odds: field(r.body_json, "odds"), timing: field(r.body_json, "timing") },
      new: { verdict: pick(fresh, "verdict"), odds: pick(fresh, "odds"), timing: pick(fresh, "timing"), basis: pick(fresh, "basis"), error: fresh?.error },
    });
  }
  console.log(JSON.stringify(out, null, 1));
})();
