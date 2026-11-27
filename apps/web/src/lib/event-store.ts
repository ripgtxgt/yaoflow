import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homeDay } from "./clock";

/**
 * 10-15 进度表 60 (Neil: 「好，开始做吧」): the event log moves from one text file per day (DATA_DIR/events/*.jsonl,
 * ~245k lines by mid-October, re-read and kept in memory by every page that asked) into its own SQLite file,
 * DATA_DIR/events.db. Its own file, not yaoflow.db: it grows ten times faster than everything else, so the main database
 * and its nightly snapshot stay small, and a page view never waits on a customer write.
 *
 *   events        one row per event. The fields every reader filters on are columns (t, e, s, b, path, method, via);
 *                 the rest of the event is one JSON column. Reads ask for a window and, where they can, only the event
 *                 names / browsers they need — through the indexes, nothing kept in memory between calls.
 *   event_daily   the nightly roll-up: per Taipei day × event × method × locale — events, sessions, browsers. Kept for
 *                 good; the raw rows older than RAW_KEEP_DAYS move out to monthly archive files (lib/archive.ts).
 *   event_meta    small facts: when the database first took a live write (the backfill boundary), frozen results.
 *
 * Analytics must never break the product: every write is wrapped, and a read that fails returns nothing.
 */

interface Stmt { run(...p: unknown[]): unknown; get(...p: unknown[]): unknown; all(...p: unknown[]): unknown[] }
export interface Sqlite { exec(sql: string): void; prepare(sql: string): Stmt; close(): void }
const require_ = createRequire(import.meta.url);
const { DatabaseSync } = require_("node:sqlite") as { DatabaseSync: new (path: string) => Sqlite };

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), ".data");
export const EVENTS_DB_PATH = join(DATA_DIR, "events.db");
export const EVENTS_DIR = join(DATA_DIR, "events");
/** raw rows kept in events.db; older whole months go to DATA_DIR/archive/events-YYYY-MM.db */
export const RAW_KEEP_DAYS = 400;

/** The columns pulled out of the JSON. Everything else of a TrackedEvent lives in `x`. */
const COLS = ["t", "e", "s", "b", "path", "method", "via"] as const;
type Ev = { t: number; e: string; s: string; b?: string; path?: string; method?: string; via?: string } & Record<string, unknown>;

const G = globalThis as unknown as { __yfEventsDb?: Sqlite | null };

export function eventsDb(): Sqlite {
  if (G.__yfEventsDb) return G.__yfEventsDb;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const d = new DatabaseSync(EVENTS_DB_PATH);
  d.exec("PRAGMA journal_mode = WAL");
  d.exec("PRAGMA busy_timeout = 3000");
  d.exec("PRAGMA synchronous = NORMAL"); // an event lost to a power cut is acceptable; a slow page view is not
  d.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, t INTEGER NOT NULL, e TEXT NOT NULL, s TEXT NOT NULL,
      b TEXT, path TEXT, method TEXT, via TEXT, x TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_t ON events(t);
    CREATE INDEX IF NOT EXISTS idx_events_e_t ON events(e, t);
    CREATE INDEX IF NOT EXISTS idx_events_b_t ON events(b, t) WHERE b IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_events_via_t ON events(t) WHERE via IS NOT NULL;
    CREATE TABLE IF NOT EXISTS event_daily (
      day TEXT NOT NULL, e TEXT NOT NULL, method TEXT NOT NULL DEFAULT '', locale TEXT NOT NULL DEFAULT '',
      n INTEGER NOT NULL, sessions INTEGER NOT NULL, browsers INTEGER NOT NULL,
      PRIMARY KEY (day, e, method, locale)
    );
    CREATE TABLE IF NOT EXISTS event_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    -- 10-15: when each tab session was first seen — the overview counts a tab on the day it started (lib/admin-bundle.ts)
    CREATE TABLE IF NOT EXISTS ev_sessions (s TEXT PRIMARY KEY, t INTEGER NOT NULL) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_ev_sessions_t ON ev_sessions(t);
    CREATE INDEX IF NOT EXISTS idx_events_s_t ON events(s, t);
  `);
  if (!(d.prepare("SELECT 1 FROM event_meta WHERE k = 'ev_sessions_built'").get())) {
    // ("WHERE true" lets SQLite tell the upsert apart from the SELECT)
    d.exec("INSERT INTO ev_sessions (s, t) SELECT s, MIN(t) FROM events WHERE true GROUP BY s ON CONFLICT(s) DO UPDATE SET t = MIN(t, excluded.t)");
    d.prepare("INSERT OR REPLACE INTO event_meta (k, v) VALUES ('ev_sessions_built', '1')").run();
  }
  G.__yfEventsDb = d;
  return d;
}

function toRow(ev: Ev): unknown[] {
  const x: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ev)) if (v !== undefined && !(COLS as readonly string[]).includes(k)) x[k] = v;
  return [ev.t, ev.e, ev.s ?? "", ev.b ?? null, ev.path ?? null, ev.method ?? null, ev.via ?? null, Object.keys(x).length ? JSON.stringify(x) : null];
}

let _live = false;
const UPSERT_SESSION = "INSERT INTO ev_sessions (s, t) VALUES (?, ?) ON CONFLICT(s) DO UPDATE SET t = MIN(t, excluded.t)";
export function insertEvent(ev: Ev): void {
  const d = eventsDb();
  d.prepare("INSERT INTO events (t, e, s, b, path, method, via, x) VALUES (?,?,?,?,?,?,?,?)").run(...toRow(ev));
  d.prepare(UPSERT_SESSION).run(ev.s ?? "", ev.t);
  if (!_live) {
    // the first live write fixes the backfill boundary: older day files are imported, newer lines are already here
    d.prepare("INSERT OR IGNORE INTO event_meta (k, v) VALUES ('live_since', ?)").run(String(Date.now()));
    _live = true;
  }
}

type Row = { t: number; e: string; s: string; b: string | null; path: string | null; method: string | null; via: string | null; x: string | null };
function fromRow(r: Row): Ev {
  const ev: Ev = r.x ? { ...(JSON.parse(r.x) as Record<string, unknown>), t: r.t, e: r.e, s: r.s } : { t: r.t, e: r.e, s: r.s };
  if (r.b !== null) ev.b = r.b;
  if (r.path !== null) ev.path = r.path;
  if (r.method !== null) ev.method = r.method;
  if (r.via !== null) ev.via = r.via;
  return ev;
}

export interface EventQuery {
  /** only these event names (through the e,t index) */
  only?: readonly string[];
  /** …plus every event that carries a share code (castsByShareCode: first touch, then casts) */
  orVia?: boolean;
  /** only these browsers (through the b,t index) */
  browsers?: readonly string[];
  /** events before this instant only */
  until?: number;
  /** only the events of tab sessions first seen in [from, to) (ev_sessions) — `from` may be -Infinity */
  startedIn?: [number, number];
}

export function selectEvents(since: number, q: EventQuery = {}): Ev[] {
  const where = ["t >= ?"];
  const args: unknown[] = [since];
  if (q.until !== undefined) { where.push("t < ?"); args.push(q.until); }
  if (q.only) {
    if (!q.only.length && !q.orVia) return [];
    const ph = q.only.map(() => "?").join(",");
    const names = q.only.length ? `e IN (${ph})` : "0";
    where.push(q.orVia ? `(${names} OR via IS NOT NULL)` : names);
    args.push(...q.only);
  }
  if (q.startedIn) {
    const [a, z] = q.startedIn;
    where.push(Number.isFinite(a) ? "s IN (SELECT s FROM ev_sessions WHERE t >= ? AND t < ?)" : "s IN (SELECT s FROM ev_sessions WHERE t < ?)");
    if (Number.isFinite(a)) args.push(a);
    args.push(z);
  }
  if (q.browsers) {
    if (!q.browsers.length) return [];
    where.push(`b IN (${q.browsers.map(() => "?").join(",")})`);
    args.push(...q.browsers);
  }
  const rows = eventsDb().prepare(`SELECT t, e, s, b, path, method, via, x FROM events WHERE ${where.join(" AND ")} ORDER BY t, id`).all(...args) as Row[];
  const out = new Array<Ev>(rows.length);
  for (let i = 0; i < rows.length; i++) out[i] = fromRow(rows[i]!);
  return out;
}

/* ------------------------------------------------------------------ backfill */

export function liveSince(): number | null {
  const r = eventsDb().prepare("SELECT v FROM event_meta WHERE k = 'live_since'").get() as { v: string } | undefined;
  return r ? Number(r.v) : null;
}

/**
 * One-off: the day files written before events.db took its first live write. Imported one file at a time (a file is a
 * few MB at most), each in its own transaction, each recorded in event_meta so a second run skips it. Lines at or after
 * the boundary are already in the database (record() wrote both) and are skipped.
 */
export function backfillFromFiles(limitFiles = 1000): { files: number; rows: number; skipped: number; boundary: number | null; left: number } {
  const d = eventsDb();
  const boundary = liveSince();
  if (boundary === null || !existsSync(EVENTS_DIR)) return { files: 0, rows: 0, skipped: 0, boundary, left: 0 };
  const firstDay = new Date(boundary).toISOString().slice(0, 10);
  const todo = readdirSync(EVENTS_DIR).filter((f) => f.endsWith(".jsonl") && f.slice(0, 10) <= firstDay).sort()
    .filter((f) => !d.prepare("SELECT 1 FROM event_meta WHERE k = ?").get(`file:${f}`));
  let files = 0, rows = 0, skipped = 0;
  const ins = d.prepare("INSERT INTO events (t, e, s, b, path, method, via, x) VALUES (?,?,?,?,?,?,?,?)");
  const seen = d.prepare("SELECT 1 FROM events WHERE t = ? AND e = ? AND s = ? LIMIT 1");
  const upsertS = d.prepare(UPSERT_SESSION);
  for (const f of todo.slice(0, limitFiles)) {
    const text = readFileSync(join(EVENTS_DIR, f), "utf8");
    let n = 0;
    d.exec("BEGIN");
    try {
      for (const line of text.split("\n")) {
        if (!line) continue;
        let ev: Ev;
        try { ev = JSON.parse(line) as Ev; } catch { skipped++; continue; }
        if (typeof ev.t !== "number" || typeof ev.e !== "string" || ev.t >= boundary) { skipped++; continue; }
        // an event stamped just before the switch can arrive just after it (a browser's clock, a slow request) and be
        // written to both: near the boundary, skip a line the database already holds
        if (ev.t >= boundary - 2 * 86_400_000 && seen.get(ev.t, ev.e, ev.s ?? "")) { skipped++; continue; }
        ins.run(...toRow(ev)); n++;
        upsertS.run(ev.s ?? "", ev.t);
      }
      d.prepare("INSERT OR REPLACE INTO event_meta (k, v) VALUES (?, ?)").run(`file:${f}`, String(n));
      d.exec("COMMIT");
    } catch (err) {
      d.exec("ROLLBACK");
      throw err;
    }
    files++; rows += n;
  }
  return { files, rows, skipped, boundary, left: Math.max(0, todo.length - files) };
}

/* ------------------------------------------------------------------ daily roll-up */

/** Taipei-day bounds (UTC+8, the site's home day — lib/clock.ts) */
const dayStart = (day: string) => Date.parse(`${day}T00:00:00+08:00`);

/**
 * Re-count the given Taipei days into event_daily (replace, so a re-run is exact). The cron runs it for yesterday and
 * today every hour; the first run fills every day in the table.
 */
export function rollupDays(days: readonly string[]): number {
  const d = eventsDb();
  let n = 0;
  for (const day of days) {
    const from = dayStart(day), to = from + 86_400_000;
    d.exec("BEGIN");
    try {
      d.prepare("DELETE FROM event_daily WHERE day = ?").run(day);
      const r = d.prepare(`
        INSERT INTO event_daily (day, e, method, locale, n, sessions, browsers)
        SELECT ?, e, COALESCE(method, ''), COALESCE(json_extract(x, '$.locale'), ''), COUNT(*), COUNT(DISTINCT s), COUNT(DISTINCT b)
        FROM events WHERE t >= ? AND t < ? GROUP BY 2, 3, 4`).run(day, from, to) as { changes?: number | bigint };
      d.exec("COMMIT");
      n += Number(r.changes ?? 0);
    } catch (err) {
      d.exec("ROLLBACK");
      throw err;
    }
  }
  return n;
}

export function rollupRecent(now = Date.now()): number {
  const d = eventsDb();
  const today = homeDay(now);
  const yesterday = homeDay(now - 86_400_000);
  const days = new Set([yesterday, today]);
  // first run (or a gap): every day the raw table holds that has no roll-up yet
  const have = new Set((d.prepare("SELECT DISTINCT day FROM event_daily").all() as { day: string }[]).map((r) => r.day));
  const first = (d.prepare("SELECT MIN(t) AS t FROM events").get() as { t: number | null }).t;
  if (first !== null) for (let t = first; t < now; t += 86_400_000) { const day = homeDay(t); if (!have.has(day)) days.add(day); }
  return rollupDays([...days].sort());
}

export interface DailyRow { day: string; e: string; method: string; locale: string; n: number; sessions: number; browsers: number }
export function dailyRows(fromDay: string, toDay: string, only?: readonly string[]): DailyRow[] {
  const args: unknown[] = [fromDay, toDay];
  let extra = "";
  if (only?.length) { extra = ` AND e IN (${only.map(() => "?").join(",")})`; args.push(...only); }
  return (eventsDb().prepare(`SELECT day, e, method, locale, n, sessions, browsers FROM event_daily WHERE day >= ? AND day <= ?${extra} ORDER BY day`).all(...args) as DailyRow[])
    .map((r) => ({ ...r }));
}

/* ------------------------------------------------------------------ kept results */

/**
 * 10-15: finished pieces of the /admin overview (lib/admin-bundle.ts), kept in the database so a restart or a deploy
 * does not re-count every day of 「上线以来」 (25 days cold took 7 s in the pre-deploy check).
 */
export function pieceGet(k: string, maxAge: number, now = Date.now()): string | null {
  const d = eventsDb();
  d.exec("CREATE TABLE IF NOT EXISTS piece_cache (k TEXT PRIMARY KEY, at INTEGER NOT NULL, v TEXT NOT NULL)");
  const r = d.prepare("SELECT at, v FROM piece_cache WHERE k = ?").get(k) as { at: number; v: string } | undefined;
  return r && now - r.at < maxAge ? r.v : null;
}
export function pieceSet(k: string, v: string, now = Date.now()): void {
  const d = eventsDb();
  d.prepare("INSERT OR REPLACE INTO piece_cache (k, at, v) VALUES (?,?,?)").run(k, now, v);
  if (Math.random() < 0.02) d.prepare("DELETE FROM piece_cache WHERE at < ?").run(now - 30 * 86_400_000);
}

export function metaGet(k: string): string | null {
  return (eventsDb().prepare("SELECT v FROM event_meta WHERE k = ?").get(k) as { v: string } | undefined)?.v ?? null;
}
export function metaSet(k: string, v: string): void {
  eventsDb().prepare("INSERT OR REPLACE INTO event_meta (k, v) VALUES (?, ?)").run(k, v);
}

export function eventCounts(): { rows: number; oldest: number | null; days: number } {
  const d = eventsDb();
  const r = d.prepare("SELECT COUNT(*) AS n, MIN(t) AS t FROM events").get() as { n: number; t: number | null };
  const days = (d.prepare("SELECT COUNT(DISTINCT day) AS n FROM event_daily").get() as { n: number }).n;
  return { rows: r.n, oldest: r.t, days };
}
