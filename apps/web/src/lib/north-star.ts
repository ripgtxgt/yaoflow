import { db } from "./db";
import { eventsDb } from "./event-store";

/**
 * 10-22 进度表 75 ⑦ — the north star: of the people who paid, how many came back to the site within 30 days (any visit on
 * a later Taipei day from any browser we know is theirs). About one in ten when the 通卡 was designed; three in ten is
 * the mark. Measured on a closed cohort — buyers whose first payment in the window is already 30 days old — so the
 * weekly report compares the last closed month against the one before it.
 */
const DAY = 86_400_000, TPE = 8 * 3600_000;
const nextTaipeiDay = (ms: number) => Math.floor((ms + TPE) / DAY) * DAY - TPE + DAY;

export interface ReturnCohort { from: number; to: number; base: number; back: number; unknown: number; rate: number | null }

/** buyers whose first paid order in [from, to) is their anchor; back = a visit on a later Taipei day within 30 days */
export function buyerReturn30(from: number, to: number): ReturnCohort {
  const d = db();
  const buyers = d.prepare(
    `SELECT customer_id AS cid, MIN(created_at) AS at FROM orders
     WHERE status = 'paid' AND COALESCE(amount_cents, 0) > 0 AND customer_id IS NOT NULL AND created_at >= ? AND created_at < ?
       AND customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)
     GROUP BY customer_id`,
  ).all(from, to) as { cid: number; at: number }[];
  const linkStmt = d.prepare("SELECT bid FROM browser_links WHERE customer_id = ?");
  const tabStmt = d.prepare("SELECT tb.bid FROM orders o JOIN tab_browsers tb ON tb.s = o.browser_sid WHERE o.customer_id = ? AND o.browser_sid IS NOT NULL");
  let ev: ReturnType<typeof eventsDb> | null = null;
  try { ev = eventsDb(); } catch { ev = null; }
  let back = 0, unknown = 0;
  for (const b of buyers) {
    const bids = new Set<string>();
    for (const r of linkStmt.all(b.cid) as { bid: string }[]) bids.add(r.bid);
    for (const r of tabStmt.all(b.cid) as { bid: string }[]) bids.add(r.bid);
    if (!bids.size || !ev) { unknown++; continue; }
    const list = [...bids].slice(0, 20);
    const row = ev.prepare(`SELECT 1 AS v FROM events WHERE b IN (${list.map(() => "?").join(",")}) AND t >= ? AND t < ? LIMIT 1`).get(...list, nextTaipeiDay(b.at), b.at + 30 * DAY);
    if (row) back++;
  }
  return { from, to, base: buyers.length, back, unknown, rate: buyers.length ? Math.round((1000 * back) / buyers.length) / 10 : null };
}

/** the weekly report's line: the last closed 30-day cohort against the one before */
export function northStarLine(now = Date.now()): string {
  const cur = buyerReturn30(now - 60 * DAY, now - 30 * DAY);
  const prev = buyerReturn30(now - 90 * DAY, now - 60 * DAY);
  const pct = (c: ReturnCohort) => (c.rate === null ? "—" : `${c.rate}%（${c.back}/${c.base}）`);
  const unk = cur.unknown ? `，其中 ${cur.unknown} 人没有认得的浏览器、算作没回来` : "";
  return `北极星 · 买过的人 30 天内回来的比例：${pct(cur)}（上一个月 ${pct(prev)}；目标三成）${unk}`;
}
