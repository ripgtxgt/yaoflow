/**
 * 10-14 (Neil: 「要的」): pending check-ins scheduled from a reading whose timing restated the reader's own range
 * (「你問的是這兩個月，也就是國曆10月6日到12月5日」) were pushed late. Recompute them with the fixed parse (lib/revisit.ts
 * maskAskedRange). Only rows whose timing really restated the range, and not a "now" question's shortest window. Dry by default; `--apply` writes.
 *   DATA_DIR=… npx tsx scripts/fix-asked-range-1014.ts [--apply]
 */
import { db, addCheckpoints } from "../src/lib/db";
import { maskAskedRange, parseTimingDays, REVISIT_MIN_DAYS, timingCheckpoints } from "../src/lib/revisit";

const DAY = 86_400_000;
const apply = process.argv.includes("--apply");
const rows = db().prepare(
  `SELECT r.id, r.window_days, r.due_at, r.timing_quote q, c.cast_at FROM revisits r JOIN casts c ON c.id = r.cast_id
   WHERE r.status = 'pending' AND r.timing_quote IS NOT NULL`,
).all() as { id: number; window_days: number; due_at: number; q: string; cast_at: number }[];
let n = 0;
for (const r of rows) {
  const from = new Date(r.cast_at);
  // only readings that restated the reader's range, whose stored window differs from the fixed parse; a "now" question's
  // shortest window is left alone
  if (maskAskedRange(r.q) === r.q || r.window_days === REVISIT_MIN_DAYS) continue;
  const after = parseTimingDays(r.q, from);
  if (!after || after === r.window_days) continue;
  const due = Math.max(r.cast_at + after * DAY, Date.now() + 3_600_000);
  n++;
  console.log(`#${r.id}: ${r.window_days}d → ${after}d · due ${new Date(r.due_at).toISOString().slice(0, 10)} → ${new Date(due).toISOString().slice(0, 10)}`);
  if (!apply) continue;
  db().prepare("UPDATE revisits SET window_days = ?, due_at = ? WHERE id = ? AND status = 'pending'").run(after, due, r.id);
  // the earlier-window check-ins too — only when none of them has gone out yet (their numbering starts again)
  const sent = (db().prepare("SELECT COUNT(*) AS n FROM revisit_checkpoints WHERE revisit_id = ? AND status <> 'pending'").get(r.id) as { n: number }).n;
  if (!sent) {
    db().prepare("DELETE FROM revisit_checkpoints WHERE revisit_id = ?").run(r.id);
    addCheckpoints(r.id, r.cast_at, timingCheckpoints(r.q, from, after));
  }
}
console.log(`${apply ? "updated" : "would update"} ${n}`);
