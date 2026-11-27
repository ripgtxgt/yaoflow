/**
 * 10-26 (#3112「我的卦找不到了」): since the 10-25 login wall every cast is made signed in, but a free cast was only kept in
 * cast_log, never in `casts`, so it never showed in 「我的」. Copy those casts into the owner's 「我的」: cast_log rows from
 * the wall on, on a browser linked to exactly one account, made after that link, not sensitive, and with no casts row for
 * that account on the same instant and figure. Dry by default; `--apply` writes.
 *   DATA_DIR=… vite-node --config vitest.config.ts scripts/backfill-free-casts-1026.ts [--apply]
 */
import { fullChart, type LineValue } from "@yaoflow/engine";
import { db, saveCast } from "../src/lib/db";
import { fileCast } from "../src/lib/matter-assign";
import { classifyTopic } from "../src/lib/topic";
import { toHans } from "../src/lib/hant";

const apply = process.argv.includes("--apply");
const WALL = Date.parse("2026-10-25T00:00:00+08:00");
const rows = db().prepare(
  `SELECT l.id, l.at, l.tz, l.locale, l.question, l.values_str, l.topic, b.customer_id
   FROM cast_log l JOIN browser_links b ON b.bid = l.bid
   WHERE l.at >= ? AND COALESCE(l.sensitive, 0) = 0 AND l.question IS NOT NULL AND l.values_str IS NOT NULL
     AND l.at >= b.first_at - 600000
     AND (SELECT COUNT(*) FROM browser_links b2 WHERE b2.bid = l.bid) = 1
     AND NOT EXISTS (SELECT 1 FROM casts c WHERE c.customer_id = b.customer_id AND c.cast_at = l.at AND REPLACE(c.values_str, ',', '') = l.values_str)
   ORDER BY l.id`,
).all(WALL) as { id: number; at: number; tz: number; locale: string | null; question: string; values_str: string; topic: string | null; customer_id: number }[];

let n = 0;
for (const r of rows) {
  const values = r.values_str.split("").map(Number) as LineValue[];
  if (values.length !== 6 || values.some((v) => ![6, 7, 8, 9].includes(v))) continue;
  n++;
  console.log(`log ${r.id} → #${r.customer_id} · ${new Date(r.at + 8 * 3_600_000).toISOString().slice(5, 16)}`);
  if (!apply) continue;
  const locale = r.locale ?? "zh-hant";
  const topic = r.topic ?? classifyTopic(toHans(r.question));
  const chart = fullChart({ values, utcMs: r.at, tzOffsetMinutes: r.tz });
  const castId = saveCast({ customerId: r.customer_id, castAtMs: r.at, tzOffsetMinutes: r.tz, locale, question: r.question, topic, values, chart: chart as unknown as Record<string, unknown> });
  fileCast(castId, null, r.customer_id, r.question, topic, locale);
}
console.log(`${apply ? "kept" : "would keep"} ${n} of ${rows.length}`);
