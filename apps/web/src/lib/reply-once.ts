import { createHash } from "node:crypto";

/**
 * 10-23 进度表 99 (客服 #510, 10-22 21:24): the back office's 「以 support@ 发给读者并标处理」 sent the same letter twice
 * (Resend 01a163c8-8ec7 and -ae93, seconds apart) — two taps, two requests, two sends. One letter per draft now:
 *   - a second request for the same inbox row with the same words while the first is still sending joins it (`sendOnce`);
 *   - within five minutes of one that finished, the row itself says so (`sentRecently`) and nothing is sent again.
 * Pure helpers; the route (/api/admin/inbox/reply) wires them to the request.
 */
export const REPLY_ONCE_MS = 5 * 60_000;

export const draftKey = (id: string, body: string): string => `${id}:${createHash("sha256").update(body).digest("hex")}`;

/** a copy of this draft already went out from the back office within the window — read off the row, so a restart forgets nothing */
export function sentRecently(row: { handled_at?: number | null; auto_draft?: string | null; note?: string | null; auto_reply_id?: string | null }, body: string, now = Date.now()): string | null {
  if (!row.handled_at || now - row.handled_at > REPLY_ONCE_MS) return null;
  if ((row.auto_draft ?? "").replace(/\r\n/g, "\n").trim() !== body.replace(/\r\n/g, "\n").trim()) return null;
  if (!/从后台发出回信/.test(row.note ?? "")) return null;
  return row.auto_reply_id ?? "?";
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * Run `send` once per key: a caller arriving while it runs gets the same promise (`joined` true) instead of a second
 * send. A finished send is remembered for the window; a failed one is forgotten at once so it can be tried again.
 */
export function sendOnce<T extends { ok: boolean }>(key: string, send: () => Promise<T>, windowMs = REPLY_ONCE_MS): { result: Promise<T>; joined: boolean } {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return { result: running, joined: true };
  const p = send().then(
    (r) => { if (r.ok) setTimeout(() => { if (inflight.get(key) === p) inflight.delete(key); }, windowMs).unref?.(); else inflight.delete(key); return r; },
    (e) => { inflight.delete(key); throw e; },
  );
  inflight.set(key, p);
  return { result: p, joined: false };
}

/** tests only */
export const _resetSendOnce = (): void => inflight.clear();
