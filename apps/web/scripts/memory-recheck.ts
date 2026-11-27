/**
 * 10-22 (进度表 §四 30 「一件事」记忆时效, 10-12 修后的复查; Neil：「你查完告诉我」): the sample the 10-11 review used —
 * 10 light + 10 deep readings since the fix, each from a different reader and each with progress notes older than 3 days
 * on its matter, plus 10 follow-ups from 10 readers, plus every reading and follow-up of #651 in the window — printed
 * for a person to read against the two rules: no reader's words quoted back, no record older than 3 days used to say how
 * the reader is now. Also runs lib/echo-guard over every reading in the window. Read-only.
 *   DATA_DIR=… npx tsx scripts/memory-recheck.ts [sinceIso]
 */
import { db } from "../src/lib/db";
import { echoOffense } from "../src/lib/echo-guard";
import { matterSoFar, scaleOf } from "../src/lib/matter-context";
import { asLocale } from "../src/lib/locales";
import { ONE_KEYS, DEEP_KEYS } from "../src/lib/reading";

const since = Date.parse(process.argv[2] ?? "2026-10-12T16:00:00Z");
const OLD = 3;
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
type R = { id: number; customer_id: number | null; matter_id: number; locale: string; question: string; cast_at: number; tz_offset: number; tier: string; body_json: string; rcreated: number };
const rows = db().prepare(
  `SELECT c.id, c.customer_id, c.matter_id, c.locale, c.question, c.cast_at, c.tz_offset, r.tier, r.body_json, r.created_at AS rcreated
   FROM casts c JOIN readings r ON r.cast_id = c.id
   WHERE c.matter_id IS NOT NULL AND r.created_at >= ? ORDER BY r.created_at`,
).all(since) as R[];

const flat = (r: R) => {
  const l = asLocale(r.locale);
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(r.body_json) as Record<string, unknown>; } catch { /* skip */ }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) out[k] = v && typeof v === "object" ? String((v as Record<string, string>)[l] ?? Object.values(v as object)[0] ?? "") : String(v ?? "");
  return out;
};

const tally = { light: { n: 0, ctx: 0, old: 0, flagged: 0 }, deep: { n: 0, ctx: 0, old: 0, flagged: 0 } };
const cands: { r: R; tier: "light" | "deep"; m: NonNullable<ReturnType<typeof matterSoFar>> }[] = [];
const flaggedLines: string[] = [];
for (const r of rows) {
  const tier = r.tier === "deep" ? "deep" : "light";
  const t = tally[tier];
  t.n += 1;
  const m = matterSoFar(r.matter_id, { castIds: [r.id] }, asLocale(r.locale), { at: r.cast_at, scale: scaleOf({ question: r.question }, r.cast_at, r.tz_offset) });
  if (!m || (!m.earlier_casts.length && !m.reader_notes.length && !m.background)) continue;
  t.ctx += 1;
  // the full record of the matter at that moment, not only what the 72-hour window let through
  const full = matterSoFar(r.matter_id, { castIds: [r.id] }, asLocale(r.locale), { at: r.cast_at });
  const hasOld = !!full && (full.reader_notes.some((n) => n.days_ago > OLD) || full.earlier_casts.some((c) => c.days_ago > OLD));
  if (hasOld) t.old += 1;
  const f = flat(r);
  const keys = (tier === "deep" ? DEEP_KEYS : ONE_KEYS).map(String).filter((k) => k !== "basis");
  const hit = echoOffense(f, keys, m, r.question);
  if (hit) { t.flagged += 1; flaggedLines.push(`${r.id} ${tier} ${hit}`); }
  if (hasOld && full) cands.push({ r, tier, m: full });
}
console.log("WINDOW since", new Date(since).toISOString(), JSON.stringify(tally));
console.log("ECHO FLAGGED (stored text, after the guard):", flaggedLines.length ? flaggedLines.join(" | ") : "none");
const ops = db().prepare("SELECT kind, count(*) n FROM ops_events WHERE at >= ? AND kind IN ('echo_light','echo_deep') GROUP BY kind").all(since) as { kind: string; n: number }[];
console.log("OPS (guard caught and rewrote / counted):", JSON.stringify(ops));

// the sample: newest first, one per reader, 10 light + 10 deep
const pick = (tier: "light" | "deep") => {
  const seen = new Set<number>(), out: typeof cands = [];
  for (const c of [...cands].reverse()) {
    if (c.tier !== tier || c.r.customer_id === 651) continue;
    const who = c.r.customer_id ?? -c.r.id;
    if (seen.has(who)) continue;
    seen.add(who); out.push(c);
    if (out.length >= 10) break;
  }
  return out;
};
const show = (c: (typeof cands)[number], label: string) => {
  const f = flat(c.r);
  console.log(`\n### ${label} cast ${c.r.id} ${c.tier} cust ${c.r.customer_id} ${new Date(c.r.cast_at + 8 * 3600_000).toISOString().slice(5, 16)}`);
  console.log("  Q:", clip(c.r.question, 80));
  for (const n of c.m.reader_notes) console.log(`  note d${n.days_ago}${n.days_ago > OLD ? " OLD" : ""}:`, clip(n.note, 110));
  for (const e of c.m.earlier_casts) if (e.days_ago > OLD) console.log(`  earlier Q d${e.days_ago} OLD:`, clip(e.question, 70));
  const keys = c.tier === "deep" ? ["verdict", "tendency", "other_side", "strategy", "caution", "next_step", "closing"] : ["summary", "inner_condition", "outer_condition", "direction"];
  for (const k of keys) if (f[k]) console.log(`  [${k}]`, clip(f[k], 260));
};
pick("light").forEach((c, i) => show(c, `L${i + 1}`));
pick("deep").forEach((c, i) => show(c, `D${i + 1}`));

// follow-ups: answers since the window, on casts whose matter has old notes, one per reader
type F = { id: number; cast_id: number; customer_id: number | null; created_at: number; content: string; matter_id: number; locale: string };
const fups = db().prepare(
  `SELECT f.id, f.cast_id, f.customer_id, f.created_at, f.content, c.matter_id, c.locale FROM followups f JOIN casts c ON c.id = f.cast_id
   WHERE f.role = 'assistant' AND f.created_at >= ? AND c.matter_id IS NOT NULL ORDER BY f.created_at DESC`,
).all(since) as F[];
const userQ = db().prepare("SELECT content FROM followups WHERE cast_id = ? AND role = 'user' AND created_at <= ? ORDER BY created_at DESC LIMIT 1");
const seenF = new Set<number>();
let nf = 0;
const showF = (f: F, label: string) => {
  const m = matterSoFar(f.matter_id, { castIds: [f.cast_id] }, asLocale(f.locale), { at: f.created_at });
  console.log(`\n### ${label} followup ${f.id} cast ${f.cast_id} cust ${f.customer_id} ${new Date(f.created_at + 8 * 3600_000).toISOString().slice(5, 16)}`);
  console.log("  ask:", clip((userQ.get(f.cast_id, f.created_at) as { content: string } | undefined)?.content, 90));
  for (const n of m?.reader_notes ?? []) console.log(`  note d${n.days_ago}${n.days_ago > OLD ? " OLD" : ""}:`, clip(n.note, 110));
  let a = f.content;
  try { const j = JSON.parse(f.content) as Record<string, unknown>; a = Object.values(j).map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" / "); } catch { /* plain text */ }
  console.log("  answer:", clip(a, 420));
};
for (const f of fups) {
  if (f.customer_id === 651 || seenF.has(f.customer_id ?? -f.id)) continue;
  const m = matterSoFar(f.matter_id, { castIds: [f.cast_id] }, asLocale(f.locale), { at: f.created_at });
  if (!m || !m.reader_notes.some((n) => n.days_ago > OLD)) continue;
  seenF.add(f.customer_id ?? -f.id);
  showF(f, `F${++nf}`);
  if (nf >= 10) break;
}

// #651, everything in the window
const mine = cands.filter((c) => c.r.customer_id === 651);
const all651 = rows.filter((r) => r.customer_id === 651);
const f651 = fups.filter((f) => f.customer_id === 651);
console.log(`\n=== #651 in the window: readings ${all651.length} (with old records ${mine.length}), follow-ups ${f651.length}`);
mine.forEach((c, i) => show(c, `S${i + 1}`));
f651.slice(0, 25).forEach((f, i) => showF(f, `SF${i + 1}`));
