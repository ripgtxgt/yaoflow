/**
 * 10-26 (Neil: 「之前的能补回吗？」): the casts from before the 10-25 login wall that never reached 「我的」 — every cast_log
 * row on a browser later linked to exactly one account (made signed in, or on that browser before it signed in), not
 * sensitive, with no casts row for that account on the same figure within half an hour. Kept with its own time; filed by
 * the browser's own grouping (cast_threads): a thread that already has a kept cast joins that matter, otherwise one matter
 * per thread, dated at its first cast. No model calls. Dry by default; `--apply` writes.
 *   DATA_DIR=… vite-node --config vitest.config.ts scripts/backfill-old-casts-1026.ts [--apply]
 */
import { fullChart, type LineValue } from "@yaoflow/engine";
import { asLocale } from "../src/lib/locales";
import { createMatter, db, saveCast, setCastMatter } from "../src/lib/db";
import { fallbackTitle } from "../src/lib/matter-assign";
import { classifyTopic } from "../src/lib/topic";
import { toHans } from "../src/lib/hant";

const apply = process.argv.includes("--apply");
const WALL = Date.parse("2026-10-25T00:00:00+08:00");
type Row = { id: number; at: number; tz: number; locale: string | null; question: string; values_str: string; topic: string | null; thread_id: number | null; customer_id: number; signed: number; title: string | null };
const rows = db().prepare(
  `SELECT l.id, l.at, l.tz, l.locale, l.question, l.values_str, l.topic, l.thread_id, b.customer_id,
          (l.at >= b.first_at - 600000) AS signed, t.title
   FROM cast_log l JOIN browser_links b ON b.bid = l.bid LEFT JOIN cast_threads t ON t.id = l.thread_id
   WHERE l.at < ? AND COALESCE(l.sensitive, 0) = 0 AND l.question IS NOT NULL AND l.values_str IS NOT NULL
     AND (SELECT COUNT(*) FROM browser_links b2 WHERE b2.bid = l.bid) = 1
     AND NOT EXISTS (SELECT 1 FROM casts c WHERE c.customer_id = b.customer_id AND ABS(c.cast_at - l.at) < 1800000 AND REPLACE(c.values_str, ',', '') = l.values_str)
   ORDER BY l.at`,
).all(WALL) as Row[];

// a thread's matter: one its kept casts are already in, else a new one made at its first backfilled cast
const threadMatter = new Map<string, number>();
const keptIn = (customerId: number, threadId: number): number | null => {
  const r = db().prepare(
    `SELECT c.matter_id FROM cast_log l JOIN casts c ON c.customer_id = ? AND ABS(c.cast_at - l.at) < 1800000 AND REPLACE(c.values_str, ',', '') = l.values_str
     WHERE l.thread_id = ? AND c.matter_id IS NOT NULL ORDER BY c.cast_at DESC LIMIT 1`,
  ).get(customerId, threadId) as { matter_id: number } | undefined;
  return r?.matter_id ?? null;
};

let n = 0, signed = 0, newMatters = 0;
const people = new Set<number>();
for (const r of rows) {
  const values = r.values_str.split("").map(Number) as LineValue[];
  if (values.length !== 6 || values.some((v) => ![6, 7, 8, 9].includes(v))) continue;
  n++; signed += r.signed ? 1 : 0; people.add(r.customer_id);
  if (!apply) continue;
  const locale = r.locale ?? "zh-hant";
  const topic = r.topic ?? classifyTopic(toHans(r.question));
  const chart = fullChart({ values, utcMs: r.at, tzOffsetMinutes: r.tz });
  const castId = saveCast({ customerId: r.customer_id, castAtMs: r.at, tzOffsetMinutes: r.tz, locale, question: r.question, topic, values, chart: chart as unknown as Record<string, unknown> });
  db().prepare("UPDATE casts SET created_at = ? WHERE id = ?").run(r.at, castId);
  const key = `${r.customer_id}:${r.thread_id ?? `log${r.id}`}`;
  let m = threadMatter.get(key) ?? (r.thread_id ? keptIn(r.customer_id, r.thread_id) : null);
  if (!m) { m = createMatter(r.customer_id, r.title || fallbackTitle(r.question, asLocale(locale)), "rule", topic, r.at); newMatters++; }
  threadMatter.set(key, m);
  setCastMatter(castId, m, "backfill");
}
console.log(`${apply ? "kept" : "would keep"} ${n} casts for ${people.size} readers (${signed} made signed in, ${n - signed} on the browser before it signed in)${apply ? ` · ${newMatters} new matters` : ""}`);
