import { randomBytes } from "node:crypto";
import { db } from "./db";
import type { XwAgo, XwCat, XwPlace, XwRegion, XwTier } from "./xunwu-text";

/**
 * 10-29 进度表 127 尋物 — what is kept of a cast: the three choices, the dice, the hour and the outcome. Never the
 * reader's own name for the thing (that stays in their browser), never anything typed. The row is what makes
 *   ① 同一件東西 24 小時內看第一次 (this browser, the same category and last place),
 *   ② 每個瀏覽器每天 10 次,
 *   ③ the funnel 「用六爻細看」 → cast → deep reading (click_at; cast_id via lib/pre-cast.ts "xw:<token>"), and
 *   ④ the revisit's 找到了／還沒 (back), counted by band — counts only, never shown to readers.
 */
export const XW_TOKEN_RE = /^[0-9a-f]{24}$/;
export const SAME_MS = 24 * 3_600_000;
export const DAY_LIMIT = 10;

export interface XunwuRow {
  token: string; created_at: number; bid: string | null; customer_id: number | null; locale: string; region: string;
  cat: XwCat; place: XwPlace; ago: XwAgo; dice: string; hour: number; sum: number;
  hex: number; changed: number; tier: XwTier; rel: string; toward: string;
  click_at: number | null; cast_id: number | null; matter_id: number | null; back: "found" | "not" | null; back_at: number | null;
}

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS xunwu_casts (
      token TEXT PRIMARY KEY, created_at INTEGER NOT NULL, bid TEXT, customer_id INTEGER, locale TEXT NOT NULL, region TEXT NOT NULL,
      cat TEXT NOT NULL, place TEXT NOT NULL, ago TEXT NOT NULL, dice TEXT NOT NULL, hour INTEGER NOT NULL, sum INTEGER NOT NULL,
      hex INTEGER NOT NULL, changed INTEGER NOT NULL, tier TEXT NOT NULL, rel TEXT NOT NULL, toward TEXT NOT NULL,
      click_at INTEGER, cast_id INTEGER, matter_id INTEGER, back TEXT, back_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_xw_bid ON xunwu_casts(bid, created_at);
    CREATE INDEX IF NOT EXISTS idx_xw_created ON xunwu_casts(created_at);
    CREATE INDEX IF NOT EXISTS idx_xw_cast ON xunwu_casts(cast_id) WHERE cast_id IS NOT NULL;
  `);
  ready = true;
}

/** the first cast on the same thing (category + last place) from this browser within 24 hours */
export function sameThing(bid: string, cat: XwCat, place: XwPlace, now = Date.now()): XunwuRow | null {
  ensure();
  return (db().prepare("SELECT * FROM xunwu_casts WHERE bid = ? AND cat = ? AND place = ? AND created_at > ? ORDER BY created_at ASC LIMIT 1")
    .get(bid, cat, place, now - SAME_MS) as unknown as XunwuRow | undefined) ?? null;
}

/** new casts from this browser in the last 24 hours (a repeat of the same thing is not a new one) */
export function castsToday(bid: string, now = Date.now()): number {
  ensure();
  return Number((db().prepare("SELECT COUNT(*) AS n FROM xunwu_casts WHERE bid = ? AND created_at > ?").get(bid, now - SAME_MS) as { n: number }).n);
}

export interface NewCast { bid: string | null; customerId: number | null; locale: string; region: XwRegion | "intl"; cat: XwCat; place: XwPlace; ago: XwAgo; dice: [number, number, number]; hour: number; hex: number; changed: number; tier: XwTier; rel: string; toward: string }

export function saveCast(c: NewCast, now = Date.now()): string {
  ensure();
  const token = randomBytes(12).toString("hex");
  db().prepare(`INSERT INTO xunwu_casts (token, created_at, bid, customer_id, locale, region, cat, place, ago, dice, hour, sum, hex, changed, tier, rel, toward)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(token, now, c.bid, c.customerId, c.locale, c.region, c.cat, c.place, c.ago, c.dice.join(""), c.hour, c.dice[0] + c.dice[1] + c.dice[2], c.hex, c.changed, c.tier, c.rel, c.toward);
  return token;
}

export function xunwuByToken(token: string): XunwuRow | null {
  if (!XW_TOKEN_RE.test(token)) return null;
  ensure();
  return (db().prepare("SELECT * FROM xunwu_casts WHERE token = ?").get(token) as unknown as XunwuRow | undefined) ?? null;
}

export const diceOf = (r: Pick<XunwuRow, "dice">): [number, number, number] => [Number(r.dice[0]), Number(r.dice[1]), Number(r.dice[2])];

/** 「用六爻細看」 tapped — the first tap counts */
export function markClick(token: string, now = Date.now()): boolean {
  if (!XW_TOKEN_RE.test(token)) return false;
  ensure();
  return Number((db().prepare("UPDATE xunwu_casts SET click_at = COALESCE(click_at, ?) WHERE token = ?").run(now, token) as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** the revisit card's answer — the last answer stands (「還沒」 one day, 「找到了」 the next) */
export function markBack(token: string, found: boolean, now = Date.now()): boolean {
  if (!XW_TOKEN_RE.test(token)) return false;
  ensure();
  return Number((db().prepare("UPDATE xunwu_casts SET back = ?, back_at = ? WHERE token = ?").run(found ? "found" : "not", now, token) as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** lib/pre-cast.ts: the cast that followed, and its matter (set once) */
export function attachXunwuCast(token: string, castId: number, matterId: number | null): void {
  if (!XW_TOKEN_RE.test(token)) return;
  ensure();
  db().prepare("UPDATE xunwu_casts SET cast_id = COALESCE(cast_id, ?), matter_id = COALESCE(matter_id, ?) WHERE token = ?").run(castId, matterId, token);
}

const NOT_TEST = "(x.customer_id IS NULL OR x.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
/** a deep reading on that cast: paid, by a 通卡, or by a membership (the research's 「付了費或用會員看了深斷」) */
const DEEP_ON = `EXISTS (SELECT 1 FROM orders o WHERE o.cast_id = x.cast_id AND (o.tier = 'deep' OR substr(o.tier, 1, 5) = 'pass_')
  AND (COALESCE(o.entitlement_kind, '') IN ('purchase', 'membership') OR o.payment_state = 'paid'))`;

export interface XunwuStats {
  casts: number; people: number;
  byCat: Record<string, number>; byTier: Record<string, number>; byPlace: Record<string, number>;
  /** 「用六爻細看」 tapped → a cast from that browser within six hours (it needs signing in) → a reading on it → a deep one */
  clicked: number; castAfter: number; reading: number; deep: number;
  back: Record<string, { found: number; not: number }>;
}

/** 后台 (进度表 127): casts, by category and band; 六爻細看 → 登入起卦 → 解讀 → 深斷; the revisit by band. Counts only. */
export function xunwuStats(since: number, until = Date.now(), test = false): XunwuStats {
  ensure();
  const d = db();
  const where = `x.created_at >= ? AND x.created_at < ? AND ${test ? "1 = 1" : NOT_TEST}`;
  const n = (sql: string) => { try { return Number(((d.prepare(sql).get(since, until) as { n: number | null } | undefined)?.n) ?? 0); } catch { return 0; } };
  const group = (col: string) => Object.fromEntries((d.prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM xunwu_casts x WHERE ${where} GROUP BY ${col}`).all(since, until) as { k: string; n: number }[]).map((r) => [r.k, r.n]));
  const back: XunwuStats["back"] = {};
  for (const r of d.prepare(`SELECT tier AS k, SUM(back = 'found') AS f, SUM(back = 'not') AS m FROM xunwu_casts x WHERE ${where} GROUP BY tier`).all(since, until) as { k: string; f: number | null; m: number | null }[]) {
    back[r.k] = { found: r.f ?? 0, not: r.m ?? 0 };
  }
  return {
    casts: n(`SELECT COUNT(*) AS n FROM xunwu_casts x WHERE ${where}`),
    people: n(`SELECT COUNT(DISTINCT COALESCE(x.bid, x.token)) AS n FROM xunwu_casts x WHERE ${where}`),
    byCat: group("cat"), byTier: group("tier"), byPlace: group("place"),
    clicked: n(`SELECT COUNT(*) AS n FROM xunwu_casts x WHERE ${where} AND x.click_at IS NOT NULL`),
    castAfter: n(`SELECT COUNT(*) AS n FROM xunwu_casts x WHERE ${where} AND x.click_at IS NOT NULL AND x.bid IS NOT NULL
      AND (x.cast_id IS NOT NULL OR EXISTS (SELECT 1 FROM cast_log c WHERE c.bid = x.bid AND c.at >= x.click_at AND c.at < x.click_at + 21600000))`),
    reading: n(`SELECT COUNT(*) AS n FROM xunwu_casts x WHERE ${where} AND x.cast_id IS NOT NULL`),
    deep: n(`SELECT COUNT(*) AS n FROM xunwu_casts x WHERE ${where} AND x.cast_id IS NOT NULL AND ${DEEP_ON}`),
    back,
  };
}

/** the latest rows for the product detail page (no names — there are none to show) */
export function recentXunwu(limit: number, test = false): XunwuRow[] {
  ensure();
  return db().prepare(`SELECT * FROM xunwu_casts x WHERE ${test ? "1 = 1" : NOT_TEST} ORDER BY created_at DESC LIMIT ?`).all(limit) as unknown as XunwuRow[];
}
