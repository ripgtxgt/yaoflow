import { db, recordOps } from "./db";
import { backfillFromFiles, eventsDb, metaGet, metaSet, rollupRecent } from "./event-store";
import { archiveAll } from "./archive";

/**
 * 10-15 进度表 60: the event log's and the log tables' housekeeping, run from the 10-minute fulfil cron (admin process).
 *   every run      import a few of the old day files into events.db until all are in (one-off, after the switch)
 *   hourly         re-count yesterday and today into event_daily (lib/event-store.ts)
 *   nightly 04:xx  (Taipei, after the 03:00 backup) move whole months past their keep window to archive files
 *                  (lib/archive.ts); Sundays also ANALYZE both databases so the planner knows the tables' sizes
 * Each step is wrapped: a failure is logged to ops_events (kind data_upkeep) and the cron goes on.
 */
export function runDataUpkeep(now = Date.now()): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const step = (name: string, fn: () => unknown) => {
    try { out[name] = fn(); } catch (e) { out[name] = `failed: ${e instanceof Error ? e.message.slice(0, 160) : "?"}`; recordOps("data_upkeep", `${name} ${String(out[name])}`); }
  };
  if (metaGet("backfill_done") !== "1") {
    step("backfill", () => {
      const r = backfillFromFiles(60); // ~3 s for the whole history (255k lines, measured)
      if (r.boundary !== null && r.left === 0) { metaSet("backfill_done", "1"); recordOps("data_upkeep", `backfill done ${r.files} files ${r.rows} rows`); }
      return r;
    });
  }
  const t = new Date(now + 8 * 3_600_000); // Taipei clock
  const minute = t.getUTCMinutes(), hour = t.getUTCHours();
  // the roll-up waits for the backfill, or the old days would be counted half-imported and never re-counted
  if (metaGet("backfill_done") === "1" && (minute < 10 || metaGet("rollup_first") !== "1")) {
    step("rollup", () => { const n = rollupRecent(now); metaSet("rollup_first", "1"); return n; });
  }
  if (hour === 4 && minute < 10) {
    step("archive", () => {
      const moved = archiveAll(now);
      if (moved.length) recordOps("data_upkeep", `archived ${moved.map((m) => `${m.name} ${m.month} ${m.moved}`).join(", ")}`);
      return moved;
    });
    if (t.getUTCDay() === 0) step("analyze", () => { db().exec("ANALYZE"); eventsDb().exec("ANALYZE"); return "ok"; });
  }
  return out;
}
