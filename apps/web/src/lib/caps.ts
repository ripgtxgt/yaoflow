import { db, recordOps } from "./db";

/**
 * 10-22 通卡 fair-use caps (进度表 75 ④, Neil: 「上限按你列的數字先上」) — not a product rule, a fuse against scripts and
 * runaway sessions. Two layers, both invisible to a normal reader:
 *   - rate: one account, at most RATE_PER_MIN generations a minute (any kind);
 *   - day: per kind, per Taipei day — 六爻 20 matters (一事一占 already keeps one matter to one cast), 追問 40 (5 per
 *     cast is the follow-up state's own rule), 塔羅 10, 解籤 10, 命盤報告 3 charts (the same chart is written once
 *     anyway), 問答 20 for a pass / 60 for a member.
 * A hit is answered with one line (tongka.ts capHit) and logged as ops `cap_hit`, so the numbers can be loosened when
 * a real person meets them. Counted here, in one small table, whatever surface spent the generation.
 */
export type CapKind = "cast" | "followup" | "tarot" | "qian" | "report" | "qa";
export const DAY_CAPS: Record<CapKind, number> = { cast: 20, followup: 40, tarot: 10, qian: 10, report: 3, qa: 20 };
export const MEMBER_DAY_CAPS: Partial<Record<CapKind, number>> = { qa: 60 };
export const RATE_PER_MIN = 6;
const TPE_MS = 8 * 3600_000;

/**
 * 10-22 进度表 94 第三批 (75 ④「正常人碰到就放宽」): the numbers above are the defaults; /admin/limits can change any of
 * them without a deploy — `site_settings` keys `cap:<kind>` (a pass holder, and a member where there is no member
 * number), `cap_member:<kind>` and `cap_rate`. Read through a 30-second cache, so every process follows within half a
 * minute; each change is written to ops (`cap_set`).
 */
const OVERRIDE_TTL_MS = 30_000;
export const CAP_MAX = 1000;
let overrideCache: { at: number; v: Map<string, number> } | null = null;
function overrides(now = Date.now()): Map<string, number> {
  if (overrideCache && now - overrideCache.at < OVERRIDE_TTL_MS) return overrideCache.v;
  const v = new Map<string, number>();
  try {
    db().exec("CREATE TABLE IF NOT EXISTS site_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)");
    for (const r of db().prepare("SELECT k, v FROM site_settings WHERE k LIKE 'cap:%' OR k LIKE 'cap_member:%' OR k = 'cap_rate'").all() as { k: string; v: string }[]) {
      const n = Number(r.v);
      if (Number.isInteger(n) && n > 0 && n <= CAP_MAX) v.set(r.k, n);
    }
  } catch { /* no settings: the defaults */ }
  overrideCache = { at: now, v };
  return v;
}
/** the day cap in force for this kind (a member's own number when there is one) */
export function dayCapFor(kind: CapKind, member = false): number {
  const o = overrides();
  if (member) {
    const m = o.get(`cap_member:${kind}`) ?? MEMBER_DAY_CAPS[kind];
    if (m != null) return m;
  }
  return o.get(`cap:${kind}`) ?? DAY_CAPS[kind];
}
/** the per-minute rate in force */
export const ratePerMin = (): number => overrides().get("cap_rate") ?? RATE_PER_MIN;
export const CAP_KINDS: readonly CapKind[] = ["cast", "followup", "tarot", "qian", "report", "qa"];
const isCapKey = (k: string) => k === "cap_rate" || CAP_KINDS.some((kind) => k === `cap:${kind}` || k === `cap_member:${kind}`);

/** set (or, with null, clear back to the default) one number — /admin/limits; returns what it was and what it is now */
export function setCapOverride(key: string, value: number | null, by: string, now = Date.now()): { ok: true; before: number | null; after: number | null } | { ok: false; why: "key" | "value" } {
  if (!isCapKey(key)) return { ok: false, why: "key" };
  if (value != null && (!Number.isInteger(value) || value < 1 || value > CAP_MAX)) return { ok: false, why: "value" };
  const before = overrides(now).get(key) ?? null;
  db().exec("CREATE TABLE IF NOT EXISTS site_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  if (value == null) db().prepare("DELETE FROM site_settings WHERE k = ?").run(key);
  else db().prepare("INSERT INTO site_settings (k, v, updated_at) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").run(key, String(value), now);
  overrideCache = null;
  recordOps("cap_set", `${key} ${before ?? "默认"}→${value ?? "默认"} by ${by}`.slice(0, 200));
  return { ok: true, before, after: value };
}
/** every override now in force (the admin page) */
export const capOverrides = (): Map<string, number> => new Map(overrides());

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS cap_events (
      id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT, at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cap_events_cust_at ON cap_events(customer_id, at);
  `);
  ready = true;
}

/** the start of this Taipei day, in ms */
export const dayStart = (now = Date.now()): number => Math.floor((now + TPE_MS) / 86_400_000) * 86_400_000 - TPE_MS;

export type CapVerdict = { ok: true } | { ok: false; why: "rate" | "day"; cap: number };

/**
 * May this account spend one more generation of this kind right now? `ref` names the thing (a chart hash, a cast
 * token): the same ref counted today is not counted twice, so re-opening or retrying never eats the day's cap.
 */
export function capCheck(customerId: number, kind: CapKind, opt: { member?: boolean; ref?: string | null; now?: number } = {}): CapVerdict {
  ensure();
  const now = opt.now ?? Date.now();
  const d = db();
  if (opt.ref && (d.prepare("SELECT 1 FROM cap_events WHERE customer_id = ? AND kind = ? AND ref = ? AND at >= ? LIMIT 1").get(customerId, kind, opt.ref, dayStart(now)))) return { ok: true };
  const perMin = (d.prepare("SELECT COUNT(*) AS v FROM cap_events WHERE customer_id = ? AND at > ?").get(customerId, now - 60_000) as { v: number }).v;
  const rate = ratePerMin();
  if (perMin >= rate) { note(customerId, kind, "rate"); return { ok: false, why: "rate", cap: rate }; }
  const cap = dayCapFor(kind, !!opt.member);
  const today = (d.prepare("SELECT COUNT(*) AS v FROM cap_events WHERE customer_id = ? AND kind = ? AND at >= ?").get(customerId, kind, dayStart(now)) as { v: number }).v;
  if (today >= cap) { note(customerId, kind, "day"); return { ok: false, why: "day", cap }; }
  return { ok: true };
}

/** one generation spent (call after capCheck said ok and the work is really being done) */
export function capSpend(customerId: number, kind: CapKind, ref: string | null = null, now = Date.now()): void {
  ensure();
  db().prepare("INSERT INTO cap_events (customer_id, kind, ref, at) VALUES (?,?,?,?)").run(customerId, kind, ref, now);
}

const noted = new Map<string, number>();
function note(customerId: number, kind: CapKind, why: "rate" | "day"): void {
  const k = `${customerId}:${kind}:${why}`;
  const last = noted.get(k) ?? 0;
  if (Date.now() - last < 10 * 60_000) return; // one line per account, kind and reason every ten minutes
  noted.set(k, Date.now());
  if (noted.size > 2000) noted.clear();
  recordOps("cap_hit", `cust ${customerId} ${kind} ${why}`);
}

/** rows older than 35 days go (the fulfil sweep) */
export function purgeCapEvents(now = Date.now()): number {
  ensure();
  const r = db().prepare("DELETE FROM cap_events WHERE at < ?").run(now - 35 * 86_400_000) as unknown as { changes?: number | bigint };
  return Number(r.changes ?? 0);
}
