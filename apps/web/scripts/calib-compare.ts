/**
 * 10-13 应验校准: (stats) how the new guard sorts the revisits already decided; (regen) the same casts read again with
 * the new rules, old call beside new. Read-only on the database; regen calls the model.
 *   DATA_DIR=… npx tsx scripts/calib-compare.ts stats
 *   DATA_DIR=… npx tsx scripts/calib-compare.ts regen <revisitId…>   → JSON to stdout
 */
import type { LineValue } from "@yaoflow/engine";
import { db } from "../src/lib/db";
import { chartGuard, resolveServerChart, resolveTiming, type ReadingInput } from "../src/lib/reading";
import { toHans } from "../src/lib/hant";
import { asLocale } from "../src/lib/locales";
import { generateReading } from "../src/lib/generate";
import { revisitAsk } from "../src/lib/revisit-ask";

type Row = { id: number; cast_id: number; lean: string | null; outcome: string | null; event: string | null; ask: string | null; question: string; values_str: string; cast_at: number; tz_offset: number; locale: string; body_json: string | null; tier: string };
const rows = (where: string, args: number[] = []) => db().prepare(
  `SELECT v.id, v.cast_id, v.lean, v.outcome, v.event, v.ask, v.tier, c.question, c.values_str, c.cast_at, c.tz_offset, c.locale,
     (SELECT body_json FROM readings r WHERE r.cast_id = c.id AND r.tier = 'deep' ORDER BY r.id DESC LIMIT 1) AS body_json
   FROM revisits v JOIN casts c ON c.id = v.cast_id WHERE ${where} ORDER BY v.id`).all(...args) as Row[];
const inputOf = (r: Row): ReadingInput => ({ question: r.question, values: r.values_str.split(",").map(Number) as LineValue[], castAtMs: r.cast_at, tzOffsetMinutes: r.tz_offset });
const guardOf = (r: Row) => { const i = inputOf(r); const c = resolveServerChart(i, true); return chartGuard(c, resolveTiming({ ...i, question: toHans(i.question) }, c, true), toHans(i.question)); };
const field = (body: string | null, k: string) => { if (!body) return null; const v = (JSON.parse(body) as Record<string, Record<string, string>>)[k]; return v ? Object.values(v)[0] ?? null : null; };

(async () => {
  const mode = process.argv[2];
  if (mode === "stats") {
    const t: Record<string, number> = {};
    const flips: number[] = [];
    for (const r of rows("v.outcome IN ('hit','partial','miss') AND v.lean IS NOT NULL")) {
      const g = guardOf(r);
      const k = `${r.lean} | ${g ? g.level : "none"} | ${r.outcome}`;
      t[k] = (t[k] ?? 0) + 1;
    }
    for (const r of rows("v.outcome IS NOT NULL")) if ((r.ask ?? "event") === "event" && revisitAsk(r.question) === "signals") flips.push(r.id);
    console.log(JSON.stringify({ table: Object.entries(t).sort(), now_signals: flips }, null, 1));
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
    const pick = (o: Record<string, unknown> | null, k: string) => { const v = o?.[k] as Record<string, string> | undefined; return v ? Object.values(v)[0] : null; };
    out.push({
      id: r.id, outcome: r.outcome, event: r.event, guard: g,
      old: { verdict: field(r.body_json, "verdict"), odds: field(r.body_json, "odds"), timing: field(r.body_json, "timing") },
      new: { verdict: pick(fresh, "verdict"), odds: pick(fresh, "odds"), timing: pick(fresh, "timing"), basis: pick(fresh, "basis"), error: fresh?.error },
    });
  }
  console.log(JSON.stringify(out, null, 1));
})();
