/**
 * 10-12 (进度表 §四 30): run lib/echo-guard.ts over stored readings that had matter context — how many it would flag,
 * and whether it catches the four the 10-11 review found. Read-only.
 *   DATA_DIR=… npx tsx scripts/echo-audit.ts [castId…]
 */
import { db } from "../src/lib/db";
import { toHans } from "../src/lib/hant";
import { echoOffense } from "../src/lib/echo-guard";
import { matterSoFar } from "../src/lib/matter-context";
import { scaleOf } from "../src/lib/matter-context";
import { asLocale } from "../src/lib/locales";
import { ONE_KEYS, DEEP_KEYS } from "../src/lib/reading";

(async () => {
  const ids = process.argv.slice(2).map(Number).filter(Boolean);
  const since = Date.UTC(2026, 9, 4, 0, 40);
  const rows = db().prepare(
    `SELECT c.id, c.matter_id, c.locale, c.question, c.cast_at, c.tz_offset, r.tier, r.body_json
     FROM casts c JOIN readings r ON r.cast_id = c.id
     WHERE c.matter_id IS NOT NULL AND ${ids.length ? `c.id IN (${ids.join(",")})` : "c.created_at >= ?"}
     ORDER BY c.id`,
  ).all(...(ids.length ? [] : [since])) as { id: number; matter_id: number; locale: string; question: string; cast_at: number; tz_offset: number; tier: string; body_json: string }[];
  const tally: Record<string, { n: number; withCtx: number; flagged: number }> = {};
  const shown: string[] = [];
  for (const r of rows) {
    const tier = r.tier === "deep" ? "deep" : "one";
    const t = (tally[tier] ??= { n: 0, withCtx: 0, flagged: 0 });
    t.n += 1;
    const l = asLocale(r.locale);
    const m = matterSoFar(r.matter_id, { castIds: [r.id] }, l, { at: r.cast_at, scale: scaleOf({ question: r.question }, r.cast_at, r.tz_offset) });
    if (!m || (!m.earlier_casts.length && !m.reader_notes.length)) continue;
    t.withCtx += 1;
    let body: Record<string, Record<string, string>>;
    try { body = JSON.parse(r.body_json); } catch { continue; }
    const flat: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) flat[k] = v && typeof v === "object" ? (v[l] ?? Object.values(v)[0]) : v;
    const keys = (tier === "deep" ? DEEP_KEYS : ONE_KEYS).map(String).filter((k) => k !== "basis");
    const hit = echoOffense(flat, keys, m, r.question);
    if (hit) {
      t.flagged += 1;
      const field = String(flat[hit.split(":")[0]!] ?? "");
      const g = hit.slice(hit.indexOf(":") + 1);
      const i = toHans(field).indexOf(g);
      const ctx = i >= 0 ? field.slice(Math.max(0, i - 12), i + g.length + 24) : "";
      if (shown.length < 60) shown.push(`${r.id} ${tier} ${hit} ‖ Q:${r.question.slice(0, 30)} ‖ ${ctx.replace(/\s+/g, " ")}`);
    }
  }
  console.log(tally);
  console.log(shown.join("\n"));
})();
