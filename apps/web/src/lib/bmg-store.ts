import { randomBytes } from "node:crypto";
import { db } from "./db";
import { hexByLines, isLinesKey, linesOf, stressChain } from "./bmg";

/**
 * 11-05 进度表 136 本命卦 — what is kept. One row per finished quiz (a re-take is a new row, the old ones stay: 「可重測（保留歷次）」).
 * Kept under the browser id (no sign-in, no birth data); a customer's are the rows of every browser filed under them
 * (`browser_links`) plus rows stamped with their id when they took it signed in. `token` is the public result link —
 * it shows the hexagram only, never who took it.
 * Answers are kept as the A/B string (twelve or four letters plus two) so the scoring can be re-run if the key changes.
 */
let ready = false;
function ensure() {
  if (ready) return;
  db().exec(`CREATE TABLE IF NOT EXISTS bmg_results (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      token        TEXT UNIQUE NOT NULL,
      bid          TEXT,
      customer_id  INTEGER,
      locale       TEXT NOT NULL,
      mode         TEXT NOT NULL,
      answers      TEXT NOT NULL,
      type4        TEXT,
      lines        TEXT NOT NULL,
      kw           INTEGER NOT NULL,
      ties         TEXT,
      stress       TEXT,
      via          TEXT,
      invited_by   TEXT,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bmg_bid ON bmg_results(bid);
    CREATE INDEX IF NOT EXISTS idx_bmg_customer ON bmg_results(customer_id);
    CREATE INDEX IF NOT EXISTS idx_bmg_invited ON bmg_results(invited_by);`);
  ready = true;
}

export interface BmgRow {
  id: number; token: string; bid: string | null; customer_id: number | null; locale: string; mode: "full" | "quick";
  answers: string; type4: string | null; lines: string; kw: number; ties: string | null; stress: string | null;
  via: string | null; invited_by: string | null; created_at: number;
}

export function saveBmg(i: { bid: string | null; customerId: number | null; locale: string; mode: "full" | "quick"; answers: string; type4: string | null; lines: string; ties: number[]; via?: string | null; invitedBy?: string | null }, now = Date.now()): BmgRow {
  ensure();
  if (!isLinesKey(i.lines)) throw new Error("lines");
  const token = randomBytes(6).toString("base64url");
  const st = stressChain(linesOf(i.lines)).map((h) => h.kw).join(",");
  db().prepare(`INSERT INTO bmg_results (token, bid, customer_id, locale, mode, answers, type4, lines, kw, ties, stress, via, invited_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    token, i.bid, i.customerId, i.locale, i.mode, i.answers.slice(0, 40), i.type4, i.lines, hexByLines(linesOf(i.lines)).kw,
    i.ties.length ? i.ties.join(",") : null, st, i.via ? i.via.slice(0, 40) : null, i.invitedBy ?? null, now,
  );
  return bmgByToken(token)!;
}

export function bmgByToken(token: string): BmgRow | null {
  ensure();
  if (!/^[A-Za-z0-9_-]{6,16}$/.test(token)) return null;
  return (db().prepare("SELECT * FROM bmg_results WHERE token = ?").get(token) as unknown as BmgRow | undefined) ?? null;
}

/** every quiz this person took, newest first (signed in: theirs and their browsers'; otherwise this browser's) */
export function bmgHistory(who: { customerId?: number | null; bid?: string | null }, limit = 20): BmgRow[] {
  ensure();
  const parts: string[] = [];
  const args: (string | number)[] = [];
  if (who.customerId) {
    parts.push("customer_id = ?", "bid IN (SELECT bid FROM browser_links WHERE customer_id = ?)");
    args.push(who.customerId, who.customerId);
  }
  if (who.bid) { parts.push("bid = ?"); args.push(who.bid); }
  if (!parts.length) return [];
  return db().prepare(`SELECT * FROM bmg_results WHERE ${parts.join(" OR ")} ORDER BY created_at DESC, id DESC LIMIT ?`).all(...args, limit) as unknown as BmgRow[];
}

export const latestBmg = (who: { customerId?: number | null; bid?: string | null }): BmgRow | null => bmgHistory(who, 1)[0] ?? null;

/** For a reading: the 本命卦 of whoever this paid/allowance session belongs to (by account, or the browser that cast it). */
export function bmgLinesForSession(sid: string): string | null {
  ensure();
  const o = db().prepare("SELECT customer_id FROM orders WHERE session_id = ?").get(sid) as { customer_id: number | null } | undefined;
  const b = db().prepare("SELECT bid FROM cast_log WHERE paid_sid = ? ORDER BY id DESC LIMIT 1").get(sid) as { bid: string } | undefined;
  const r = latestBmg({ customerId: o?.customer_id ?? null, bid: b?.bid ?? null });
  return r?.lines ?? null;
}

/** sign-in or payment files the browser under the customer: stamp its quizzes too (browser_links already joins them) */
export function adoptBmg(bid: string, customerId: number): number {
  ensure();
  return Number((db().prepare("UPDATE bmg_results SET customer_id = ? WHERE bid = ? AND customer_id IS NULL").run(customerId, bid) as { changes?: number | bigint }).changes ?? 0);
}

/** the admin line: quizzes, by mode, how many went on to cast with ?c=bmg (counted from events by the caller) */
export function bmgCounts(since: number): { total: number; full: number; quick: number; people: number; invited: number } {
  ensure();
  const r = db().prepare(`SELECT COUNT(*) AS total, SUM(mode='full') AS full, SUM(mode='quick') AS quick,
      COUNT(DISTINCT COALESCE(CAST(customer_id AS TEXT), bid)) AS people, SUM(invited_by IS NOT NULL) AS invited
    FROM bmg_results WHERE created_at >= ?`).get(since) as Record<string, number | null>;
  return { total: Number(r.total ?? 0), full: Number(r.full ?? 0), quick: Number(r.quick ?? 0), people: Number(r.people ?? 0), invited: Number(r.invited ?? 0) };
}

/** the admin product row (lib/admin-products.ts): people who finished a quiz in a window, and the latest ones */
export function bmgPeople(since: number, until: number): number {
  ensure();
  return Number((db().prepare("SELECT COUNT(DISTINCT COALESCE(CAST(customer_id AS TEXT), bid, token)) AS v FROM bmg_results WHERE created_at >= ? AND created_at < ? AND COALESCE(via,'') <> 'devtest'").get(since, until) as { v: number }).v);
}
export function bmgRecent(limit: number): { at: number; customer_id: number | null; kw: number; mode: string; via: string | null; invited: boolean }[] {
  ensure();
  return (db().prepare("SELECT created_at AS at, customer_id, kw, mode, via, invited_by IS NOT NULL AS invited FROM bmg_results WHERE COALESCE(via,'') <> 'devtest' ORDER BY created_at DESC LIMIT ?").all(limit) as { at: number; customer_id: number | null; kw: number; mode: string; via: string | null; invited: number }[])
    .map((r) => ({ ...r, invited: !!r.invited }));
}

/** customer erase: their quiz rows go with them */
export function eraseBmg(customerId: number, bids: string[]): void {
  ensure();
  db().prepare("DELETE FROM bmg_results WHERE customer_id = ?").run(customerId);
  for (const b of bids) db().prepare("DELETE FROM bmg_results WHERE bid = ?").run(b);
}
