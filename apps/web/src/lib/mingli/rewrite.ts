import { db, recordOps } from "@/lib/db";

/**
 * 10-22 深度報告月更 (进度表 75 ③ 會員權益, 第二批): a member may have a deep report of a chart written again, once every
 * 30 days — the new one reads the chart as of today (this year's facts, this 節氣月), so a report opened in spring is not
 * the only one they ever see. The rewrite is a new report row (the create functions take `salt` = the month, which
 * changes the dedupe hash); the old one stays readable. One small table remembers when each chart was last rewritten.
 */
export const REWRITE_EVERY_MS = 30 * 86_400_000;
const TPE_MS = 8 * 3600_000;

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`CREATE TABLE IF NOT EXISTS report_rewrites (customer_id INTEGER NOT NULL, system TEXT NOT NULL, chart TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (customer_id, system, chart))`);
  ready = true;
}

/** when this chart may next be rewritten by this member: null = now; otherwise the ms of the next allowed time */
export function rewriteNextAt(customerId: number, system: string, chart: string, firstWrittenAt: number | null, now = Date.now()): number | null {
  ensure();
  const r = db().prepare("SELECT at FROM report_rewrites WHERE customer_id = ? AND system = ? AND chart = ?").get(customerId, system, chart) as { at: number } | undefined;
  const last = r?.at ?? firstWrittenAt;
  if (last == null) return null;
  return last + REWRITE_EVERY_MS <= now ? null : last + REWRITE_EVERY_MS;
}

export function noteRewrite(customerId: number, system: string, chart: string, now = Date.now()): void {
  ensure();
  db().prepare("INSERT INTO report_rewrites (customer_id, system, chart, at) VALUES (?,?,?,?) ON CONFLICT(customer_id, system, chart) DO UPDATE SET at = excluded.at").run(customerId, system, chart, now);
  recordOps("report_rewrite", `${system} cust ${customerId}`);
}

/** the salt a rewrite carries: the Taipei month, so one rewrite a month also means one hash a month */
export const rewriteSalt = (now = Date.now()): string => { const d = new Date(now + TPE_MS); return `rw:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; };
