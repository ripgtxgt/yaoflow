import { db } from "./db";

/**
 * 10-22 进度表 94 第二批 「到期回访」 — the revisit letters as a page of their own (until now only the weekly report saw
 * the backlog): due today, sent, waiting, dropped after 14 days, how many letters carried several at once (77: one letter
 * per address), and the answer rate — per product (六爻, the free 六爻 layer, 八字, 紫微, 星盘, 年书, 择日, 塔罗).
 * Our own test accounts are left out unless asked for (`test`). Server only; read-only.
 */

const DAY = 86_400_000;
const TPE = 8 * 3_600_000;
const notTest = (test: boolean) => (test ? "1 = 1" : "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))");
const many = <T,>(sql: string, ...a: unknown[]): T[] => {
  try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; }
};

export const RV_PRODUCT: Record<string, string> = { liuyao: "六爻", cast: "六爻（免费层）", bazi: "八字", ziwei: "紫微", astro: "星盘", nianshu: "年书", zeri: "择日", tarot: "塔罗" };
/** the 「产品」 page a revisit's product opens */
export const RV_PRODUCT_PAGE: Record<string, string> = { liuyao: "liuyao", cast: "liuyao", bazi: "bazi", ziwei: "ziwei", astro: "astro", nianshu: "nianshu", zeri: "zeri", tarot: "tarot" };

export interface RevisitProductRow {
  key: string; name: string;
  dueToday: number; sentToday: number; sent7: number; waiting: number; waitingOver7: number; skipped7: number;
  sent30: number; answered30: number;
}

export function revisitBoard(now = Date.now(), test = false): { rows: RevisitProductRow[]; letters7: number; merged7: number; mergedItems7: number } {
  const today = Math.floor((now + TPE) / DAY) * DAY - TPE;
  const w7 = now - 7 * DAY, w30 = now - 30 * DAY;
  const rows = many<{ k: string; dueToday: number; sentToday: number; sent7: number; waiting: number; waitingOver7: number; skipped7: number; sent30: number; answered30: number }>(
    `SELECT COALESCE(kind, 'liuyao') AS k,
            SUM(CASE WHEN due_at >= ? AND due_at < ? THEN 1 ELSE 0 END) AS dueToday,
            SUM(CASE WHEN status = 'sent' AND sent_at >= ? THEN 1 ELSE 0 END) AS sentToday,
            SUM(CASE WHEN status = 'sent' AND sent_at >= ? THEN 1 ELSE 0 END) AS sent7,
            SUM(CASE WHEN status = 'pending' AND due_at <= ? AND (outcome IS NULL OR outcome = 'open') THEN 1 ELSE 0 END) AS waiting,
            SUM(CASE WHEN status = 'pending' AND due_at <= ? AND (outcome IS NULL OR outcome = 'open') THEN 1 ELSE 0 END) AS waitingOver7,
            SUM(CASE WHEN status = 'skipped' AND sent_at >= ? THEN 1 ELSE 0 END) AS skipped7,
            SUM(CASE WHEN status = 'sent' AND sent_at >= ? THEN 1 ELSE 0 END) AS sent30,
            SUM(CASE WHEN status = 'sent' AND sent_at >= ? AND outcome IS NOT NULL THEN 1 ELSE 0 END) AS answered30
       FROM revisits WHERE ${notTest(test)} GROUP BY k`,
    today, today + DAY, today, w7, now, w7, w7, w30, w30,
  ).map((r) => ({
    key: r.k, name: RV_PRODUCT[r.k] ?? r.k,
    dueToday: Number(r.dueToday), sentToday: Number(r.sentToday), sent7: Number(r.sent7), waiting: Number(r.waiting), waitingOver7: Number(r.waitingOver7),
    skipped7: Number(r.skipped7), sent30: Number(r.sent30), answered30: Number(r.answered30),
  }));
  // the tarot revisit lives on its own row (lib/tarot.ts): due, sent, answered
  const t = many<{ dueToday: number; sentToday: number; sent7: number; waiting: number; waitingOver7: number; sent30: number; answered30: number }>(
    `SELECT SUM(CASE WHEN revisit_due >= ? AND revisit_due < ? THEN 1 ELSE 0 END) AS dueToday,
            SUM(CASE WHEN revisit_sent_at >= ? THEN 1 ELSE 0 END) AS sentToday,
            SUM(CASE WHEN revisit_sent_at >= ? THEN 1 ELSE 0 END) AS sent7,
            SUM(CASE WHEN revisit_due <= ? AND revisit_sent_at IS NULL THEN 1 ELSE 0 END) AS waiting,
            SUM(CASE WHEN revisit_due <= ? AND revisit_sent_at IS NULL THEN 1 ELSE 0 END) AS waitingOver7,
            SUM(CASE WHEN revisit_sent_at >= ? THEN 1 ELSE 0 END) AS sent30,
            SUM(CASE WHEN revisit_sent_at >= ? AND revisit_answer_at IS NOT NULL THEN 1 ELSE 0 END) AS answered30
       FROM tarot_draws WHERE revisit_due IS NOT NULL AND ${notTest(test)}`,
    today, today + DAY, today, w7, now, w7, w30, w30,
  )[0];
  if (t && (Number(t.sent30) || Number(t.waiting) || Number(t.dueToday))) {
    rows.push({ key: "tarot", name: "塔罗", dueToday: Number(t.dueToday), sentToday: Number(t.sentToday), sent7: Number(t.sent7), waiting: Number(t.waiting), waitingOver7: Number(t.waitingOver7), skipped7: 0, sent30: Number(t.sent30), answered30: Number(t.answered30) });
  }
  const order = ["liuyao", "cast", "tarot", "bazi", "ziwei", "astro", "nianshu", "zeri"];
  rows.sort((a, b) => (order.indexOf(a.key) + 99) % 99 - (order.indexOf(b.key) + 99) % 99);
  // 77: one letter per address — a letter that carried several revisits has the key `<first>:digest<N>`
  const mails = many<{ session_id: string | null }>(`SELECT session_id FROM mail_log WHERE kind = 'revisit' AND created_at >= ? AND ${notTest(test)}`, w7);
  const digests = mails.map((m) => /:digest(\d+)$/.exec(m.session_id ?? "")).filter(Boolean) as RegExpExecArray[];
  return { rows, letters7: mails.length, merged7: digests.length, mergedItems7: digests.reduce((a, m) => a + Number(m[1]), 0) };
}

export interface RevisitLine { id: string; customerId: number | null; due: number; status: string; sentAt: number | null; outcome: string | null; label: string | null }

/** one product's revisits, the latest first (due, then waiting ones on top): the rows behind a line of the board */
export function revisitRows(key: string, test = false, limit = 80): RevisitLine[] {
  if (key === "tarot") {
    return many<{ token: string; customer_id: number | null; revisit_due: number; revisit_sent_at: number | null; revisit_answer: string | null; question: string | null }>(
      `SELECT token, customer_id, revisit_due, revisit_sent_at, revisit_answer, question FROM tarot_draws WHERE revisit_due IS NOT NULL AND ${notTest(test)}
        ORDER BY (revisit_sent_at IS NULL) DESC, revisit_due DESC LIMIT ?`, limit,
    ).map((r) => ({ id: r.token.slice(0, 8), customerId: r.customer_id, due: r.revisit_due, status: r.revisit_sent_at ? "sent" : "pending", sentAt: r.revisit_sent_at, outcome: r.revisit_answer, label: null }));
  }
  return many<{ id: number; customer_id: number | null; due_at: number; status: string; sent_at: number | null; outcome: string | null; label: string | null }>(
    `SELECT id, customer_id, due_at, status, sent_at, outcome, label FROM revisits WHERE COALESCE(kind, 'liuyao') = ? AND ${notTest(test)}
      ORDER BY (status = 'pending' AND due_at <= strftime('%s','now') * 1000) DESC, due_at DESC LIMIT ?`, key, limit,
  ).map((r) => ({ id: String(r.id), customerId: r.customer_id, due: r.due_at, status: r.status, sentAt: r.sent_at, outcome: r.outcome, label: r.label }));
}
