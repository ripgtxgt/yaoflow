/**
 * 10-12 多段应期 (进度表 §四 29), once: the revisits still pending get the check-ins a reading scheduled today would get —
 * only those whose day has not passed by more than a day. Dry by default; `--apply` writes.
 *   DATA_DIR=… npx tsx scripts/backfill-checkpoints.ts [--apply]
 */
import { addCheckpoints, checkpointsOf, db, recordOps } from "../src/lib/db";
import { timingCheckpoints } from "../src/lib/revisit";

(async () => {
  const apply = process.argv.includes("--apply");
  const now = Date.now();
  const rows = db().prepare(
    "SELECT id, created_at, due_at, window_days, timing_quote FROM revisits WHERE status = 'pending' AND tier = 'deep' AND outcome IS NULL AND timing_quote IS NOT NULL",
  ).all() as { id: number; created_at: number; due_at: number; window_days: number; timing_quote: string }[];
  let readings = 0, letters = 0;
  const hist: Record<string, number> = {};
  for (const r of rows) {
    if (checkpointsOf(r.id).length) continue;
    const castAt = r.due_at - r.window_days * 86_400_000;
    const cps = timingCheckpoints(r.timing_quote, new Date(castAt), r.window_days).filter((c) => castAt + c.days * 86_400_000 > now - 86_400_000);
    hist[cps.length] = (hist[cps.length] ?? 0) + 1;
    if (!cps.length) continue;
    readings += 1; letters += cps.length;
    if (readings <= 8) console.log(r.id, cps.map((c) => `${c.start.toISOString().slice(5, 10)}..${c.end.toISOString().slice(5, 10)} → ${new Date(castAt + c.days * 86_400_000).toISOString().slice(5, 10)}`).join(" | "), "final", new Date(r.due_at).toISOString().slice(5, 10));
    if (apply) addCheckpoints(r.id, castAt, cps);
  }
  console.log({ pending: rows.length, readings, letters, perReading: hist, apply });
  if (apply) recordOps("checkpoint_backfill_1012", `readings=${readings} letters=${letters}`);
})();
