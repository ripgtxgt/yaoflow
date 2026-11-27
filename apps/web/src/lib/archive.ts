import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { db } from "./db";
import { eventsDb, RAW_KEEP_DAYS } from "./event-store";
import { LIVE_SINCE } from "./live";

/**
 * 10-15 进度表 60 ⑤ (Neil: 「如果把服务器里面的数据删除，之后还能查询到吗？」): the log tables keep a fixed stretch in
 * the live database; anything older moves out — summarised first, archived second, deleted last, never just dropped.
 *
 *   - a whole calendar month (Taipei) that has fallen entirely past the keep window is copied into its own file,
 *     DATA_DIR/archive/<name>-YYYY-MM.db (one table, same columns), the copy is counted against the source, and only
 *     then are those rows deleted from the live database. A re-run of the same month rewrites its file from scratch.
 *   - the nightly backup uploads DATA_DIR/archive/ to S3 (deploy/yaoflow-backup.sh), and the local pull takes it too.
 *   - to look something up: open that month's file (any SQLite tool) — same table, same columns.
 *
 * What moves (and what never does):
 *   events       raw analytics rows older than RAW_KEEP_DAYS (400). Their per-day counts stay in event_daily for good.
 *                The painted-door fortnight before go-live is never moved (/admin compares against it).
 *   ops_events   only the high-volume telemetry kinds below, after 180 days. Every other kind is state the code reads
 *                back (unsubscribes, one-off markers, relay de-duplication, pass and refund history…) and stays.
 *   mail_events  webhook de-duplication rows (nothing reads them back), after 180 days.
 * Orders, customers, casts, readings, follow-ups, mail_log, emails: never moved.
 */

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), ".data");
export const ARCHIVE_DIR = join(DATA_DIR, "archive");
const DAY = 86_400_000;

/** ops_events kinds that are pure telemetry — counted on the health card for the last day or week at most. */
export const OPS_TELEMETRY = [
  "cron_fulfill", "cron_revisit", "cron_digest", "gen_ms", "gen_retry", "thread_cast", "thread_prior", "matter_filed",
  "matter_context", "matter_q_parse", "teaser_slip", "teaser_fail", "teaser_more_slip", "teaser_salvaged",
  "teaser_opening_slip", "books_sync", "ledger_sync", "nudge_personal", "nudge_learning", "login", "ab_free_light",
  "llm_fallback", "llm_down", "mp_fallback", "daily_lines", "daily_line_reject", "daily_mail", "wallet_intent",
  "qcheck_no", "hant_leak", "headsup_run", "dayof_run", "card_fp_sweep", "sub_sync_fail", "late_open",
  "admin_warm", "qian_card_notice", "qian_photo_purge", "data_upkeep",
] as const;

export interface ArchivePolicy {
  name: string;
  open: () => ReturnType<typeof db>;
  table: string;
  col: string;
  keepDays: number;
  /** extra condition on the rows that may move */
  where?: string;
  whereArgs?: unknown[];
  /** before a month moves: keep its per-day counts in the live database for good */
  summarise?: (d: ReturnType<typeof db>, from: number, to: number) => void;
}

/** ops_events → ops_daily (Taipei day × kind → count), kept for good */
function summariseOps(d: ReturnType<typeof db>, from: number, to: number): void {
  d.exec("CREATE TABLE IF NOT EXISTS ops_daily (day TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, kind))");
  d.prepare(`INSERT OR REPLACE INTO ops_daily (day, kind, n)
    SELECT date((at / 1000) + 8 * 3600, 'unixepoch'), kind, COUNT(*) FROM ops_events
    WHERE at >= ? AND at < ? AND kind IN (${OPS_TELEMETRY.map(() => "?").join(",")}) GROUP BY 1, 2`).run(from, to, ...OPS_TELEMETRY);
}

export const POLICIES: ArchivePolicy[] = [
  { name: "events", open: () => eventsDb() as unknown as ReturnType<typeof db>, table: "events", col: "t", keepDays: RAW_KEEP_DAYS, where: "t >= ?", whereArgs: [LIVE_SINCE] },
  { name: "ops_events", open: db, table: "ops_events", col: "at", keepDays: 180, where: `kind IN (${OPS_TELEMETRY.map(() => "?").join(",")})`, whereArgs: [...OPS_TELEMETRY], summarise: summariseOps },
  { name: "mail_events", open: db, table: "mail_events", col: "at", keepDays: 180 },
];

/** Taipei month bounds */
const monthStart = (ym: string) => Date.parse(`${ym}-01T00:00:00+08:00`);
function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
const ymOf = (t: number) => new Date(t + 8 * 3_600_000).toISOString().slice(0, 7);

export interface ArchiveResult { name: string; month: string; moved: number; file: string }

/**
 * Move every whole month that lies entirely before now − keepDays. Returns what moved. `limitMonths` keeps one run
 * short (the cron moves at most a couple of months a night; a first run on old data catches up over a few nights).
 */
export function archiveOld(policy: ArchivePolicy, now = Date.now(), limitMonths = 2): ArchiveResult[] {
  const d = policy.open();
  const cutoff = now - policy.keepDays * DAY;
  const extra = policy.where ? ` AND ${policy.where}` : "";
  const args = policy.whereArgs ?? [];
  const oldest = (d.prepare(`SELECT MIN(${policy.col}) AS t FROM ${policy.table} WHERE ${policy.col} < ?${extra}`).get(cutoff, ...args) as { t: number | null }).t;
  if (oldest === null) return [];
  if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
  const out: ArchiveResult[] = [];
  for (let ym = ymOf(oldest); out.length < limitMonths; ym = nextMonth(ym)) {
    const from = monthStart(ym), to = monthStart(nextMonth(ym));
    if (to > cutoff) break; // the month is not wholly past the window yet
    const range = `${policy.col} >= ? AND ${policy.col} < ?${extra}`;
    const rangeArgs = [from, to, ...args];
    const n = (d.prepare(`SELECT COUNT(*) AS n FROM ${policy.table} WHERE ${range}`).get(...rangeArgs) as { n: number }).n;
    if (!n) continue;
    policy.summarise?.(d, from, to);
    const file = join(ARCHIVE_DIR, `${policy.name}-${ym}.db`);
    d.exec(`ATTACH DATABASE '${file.replace(/'/g, "''")}' AS arc`);
    try {
      d.exec(`CREATE TABLE IF NOT EXISTS arc.${policy.table} AS SELECT * FROM main.${policy.table} WHERE 0`);
      d.exec("BEGIN");
      try {
        // a re-run rewrites the month: clear what an interrupted run may have left, then copy
        d.prepare(`DELETE FROM arc.${policy.table} WHERE ${range}`).run(...rangeArgs);
        d.prepare(`INSERT INTO arc.${policy.table} SELECT * FROM main.${policy.table} WHERE ${range}`).run(...rangeArgs);
        d.exec("COMMIT");
      } catch (err) { d.exec("ROLLBACK"); throw err; }
      const copied = (d.prepare(`SELECT COUNT(*) AS n FROM arc.${policy.table} WHERE ${range}`).get(...rangeArgs) as { n: number }).n;
      if (copied !== n) throw new Error(`${policy.name} ${ym}: archived ${copied} of ${n} — nothing deleted`);
      d.prepare(`DELETE FROM main.${policy.table} WHERE ${range}`).run(...rangeArgs);
    } finally {
      d.exec("DETACH DATABASE arc");
    }
    out.push({ name: policy.name, month: ym, moved: n, file });
  }
  return out;
}

export function archiveAll(now = Date.now()): ArchiveResult[] {
  const out: ArchiveResult[] = [];
  for (const p of POLICIES) out.push(...archiveOld(p, now));
  return out;
}

export function archiveFiles(): { file: string; bytes: number }[] {
  if (!existsSync(ARCHIVE_DIR)) return [];
  return readdirSync(ARCHIVE_DIR).filter((f) => f.endsWith(".db")).sort().map((f) => ({ file: f, bytes: statSync(join(ARCHIVE_DIR, f)).size }));
}
