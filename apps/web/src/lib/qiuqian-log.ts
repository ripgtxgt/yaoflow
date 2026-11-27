import { randomBytes } from "node:crypto";
import { db } from "./db";

/**
 * 10-23 进度表 106 ②: 线上求籤 kept on our side. The tosses and the draw happen in the browser (components/JiaobeiFlow
 * Qiuqian); when a lot is confirmed, the page files which temple, which lot, how many tosses it took to be allowed to
 * draw (请示几次) and how many lots were put back before one was confirmed — and the matter, when the reader wrote one.
 * Until now only a 「qq_done」 event was kept, so the admin could count people and nothing else. Admin only: the
 * question is the reader's own words and is never shown anywhere public.
 */
let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS qiuqian_draws (
      token TEXT PRIMARY KEY, created_at INTEGER NOT NULL, locale TEXT NOT NULL, bid TEXT, customer_id INTEGER,
      temple TEXT NOT NULL, set_id TEXT NOT NULL, num INTEGER NOT NULL, asks INTEGER NOT NULL, redraws INTEGER NOT NULL DEFAULT 0,
      question TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_qiuqian_created ON qiuqian_draws(created_at);
  `);
  ready = true;
}

export interface QiuqianDraw {
  token: string; created_at: number; locale: string; bid: string | null; customer_id: number | null;
  temple: string; set_id: string; num: number; asks: number; redraws: number; question: string | null;
}

export function saveQiuqianDraw(i: { temple: string; setId: string; num: number; asks: number; redraws: number; question: string | null; locale: string; bid: string | null; customerId: number | null }, now = Date.now()): string {
  ensure();
  const token = randomBytes(12).toString("hex");
  db().prepare("INSERT INTO qiuqian_draws (token, created_at, locale, bid, customer_id, temple, set_id, num, asks, redraws, question) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(token, now, i.locale, i.bid, i.customerId, i.temple.slice(0, 40), i.setId.slice(0, 40), i.num, i.asks, i.redraws, i.question ? i.question.slice(0, 120) : null);
  return token;
}

/** the admin's list (read-only), newest first; an empty list before the first draw */
export function qiuqianDraws(since: number, until = Date.now() + 1, limit = 500): QiuqianDraw[] {
  ensure();
  return db().prepare("SELECT * FROM qiuqian_draws WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT ?").all(since, until, limit) as unknown as QiuqianDraw[];
}
