import { db } from "./db";

/**
 * 10-23 进度表 97 ④: the support desk's side road when SSH is out. Its rounds used to have one way to the facts — a
 * shell on the server — and on 10-22, while a build ate the machine, that road was closed for an hour although the
 * site itself answered. This is the same few facts over HTTP, read-only: for each inbox letter, whether it was handled
 * (and the note), and the writer's last 24 hours — orders, the reading each one got, and whether the delivery letter
 * reached them. Enough to decide 「已处理的跳过」 and the C class 「解读已生成且交付信已达」. No address, no letter text,
 * no reading text leaves here.
 */
export const PEEK_WINDOW_MS = 24 * 3_600_000;
export const PEEK_MAX_IDS = 50;

export interface PeekOrder {
  id: number; sid: string; at: number; tier: string; status: string; castId: number | null;
  /** the latest reading on that cast, if any */
  reading: { tier: string; at: number } | null;
  /** the delivery letter: our send record, and what Resend reported */
  delivery: { status: string; deliveredAt: number | null; openedAt: number | null } | null;
}
export interface PeekLetter {
  id: string; found: boolean;
  receivedAt?: number; handledAt?: number | null; note?: string | null;
  customerId?: number | null;
  auto?: { at: number | null; action: string | null; cls: string | null } | null;
  /** the writer's last 24 hours (by the customer the letter was matched to) */
  orders?: PeekOrder[];
}

export function peekLetters(ids: string[], now = Date.now()): PeekLetter[] {
  const d = db();
  const cols = new Set((d.prepare("PRAGMA table_info(support_inbox)").all() as { name: string }[]).map((c) => c.name));
  const autoCols = ["auto_at", "auto_action", "auto_class"].every((c) => cols.has(c));
  const letter = d.prepare(`SELECT id, received_at, handled_at, note, customer_id${autoCols ? ", auto_at, auto_action, auto_class" : ""} FROM support_inbox WHERE id = ?`);
  const orders = d.prepare(
    `SELECT o.id, o.session_id AS sid, o.created_at AS at, o.tier, o.status, o.cast_id AS castId,
            (SELECT r.tier FROM readings r WHERE r.cast_id = o.cast_id ORDER BY r.id DESC LIMIT 1) AS rtier,
            (SELECT r.created_at FROM readings r WHERE r.cast_id = o.cast_id ORDER BY r.id DESC LIMIT 1) AS rat,
            (SELECT e.status FROM emails e WHERE e.session_id = o.session_id AND e.kind = 'reading') AS mstatus,
            (SELECT e.detail FROM emails e WHERE e.session_id = o.session_id AND e.kind = 'reading') AS mid
     FROM orders o WHERE o.customer_id = ? AND o.created_at > ? ORDER BY o.id DESC LIMIT 20`,
  );
  const mail = d.prepare("SELECT delivered_at, opened_at FROM mail_log WHERE id = ?");
  return ids.map((id): PeekLetter => {
    const row = letter.get(id) as { id: string; received_at: number; handled_at: number | null; note: string | null; customer_id: number | null; auto_at?: number | null; auto_action?: string | null; auto_class?: string | null } | undefined;
    if (!row) return { id, found: false };
    const list = row.customer_id ? (orders.all(row.customer_id, now - PEEK_WINDOW_MS) as { id: number; sid: string; at: number; tier: string; status: string; castId: number | null; rtier: string | null; rat: number | null; mstatus: string | null; mid: string | null }[]) : [];
    return {
      id, found: true, receivedAt: row.received_at, handledAt: row.handled_at, note: row.note, customerId: row.customer_id,
      auto: autoCols ? { at: row.auto_at ?? null, action: row.auto_action ?? null, cls: row.auto_class ?? null } : null,
      orders: list.map((o) => {
        const m = o.mid && !/\s/.test(o.mid) ? (mail.get(o.mid) as { delivered_at: number | null; opened_at: number | null } | undefined) : undefined;
        return {
          id: o.id, sid: o.sid, at: o.at, tier: o.tier, status: o.status, castId: o.castId,
          reading: o.rtier && o.rat ? { tier: o.rtier, at: o.rat } : null,
          delivery: o.mstatus ? { status: o.mstatus, deliveredAt: m?.delivered_at ?? null, openedAt: m?.opened_at ?? null } : null,
        };
      }),
    };
  });
}
