import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";

/**
 * 11-10 avs 回调（Neil：「新建一个接收 avs 回调的接口，用 AVS_EXT_TOKEN 验 X-AVS-Signature 签名」）.
 * avs (Neil's video workbench on this same machine, 127.0.0.1:8790) makes the 拙伯 videos we order and POSTs every
 * status change to /api/avs/callback. The body is the order as `GET /api/ext/v1/videos/{id}` gives it plus
 * `"event": "status"`; the header `X-AVS-Signature: sha256=<hex>` is HMAC-SHA256(key = AVS_EXT_TOKEN, msg = raw body).
 * What is kept: one row per order with its latest status and the last body — so 素材工坊 and the admin can see where
 * each video stands without polling. Nothing here publishes anything.
 */

export const AVS_STATUSES = ["queued", "rendering", "dubbing", "post", "review", "ready", "rejected", "failed", "cancelled"] as const;
export type AvsStatus = (typeof AVS_STATUSES)[number];

/** the callback address every order carries (avs reaches us on the loopback; the site listens on 3200) */
export const AVS_CALLBACK_URL = "http://127.0.0.1:3200/api/avs/callback";

export function avsSignature(rawBody: string, token: string): string {
  return "sha256=" + createHmac("sha256", token).update(rawBody).digest("hex");
}

/** true only for `sha256=<64 hex>` that matches the raw body; constant-time */
export function verifyAvsSignature(rawBody: string, header: string | null, token: string | undefined): boolean {
  if (!token || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const given = Buffer.from(m[1]!.toLowerCase(), "hex");
  const expected = createHmac("sha256", token).update(rawBody).digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface AvsVideoRow {
  id: string; external_id: string | null; status: string; lang: string | null; title: string | null;
  note: string | null; error: string | null; video_url: string | null; cover_url: string | null; local_path: string | null;
  duration_s: number | null; first_at: number; updated_at: number; ready_at: number | null; calls: number; body: string;
}

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS avs_videos (
      id TEXT PRIMARY KEY, external_id TEXT, status TEXT NOT NULL, lang TEXT, title TEXT, note TEXT, error TEXT,
      video_url TEXT, cover_url TEXT, local_path TEXT, duration_s REAL,
      first_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ready_at INTEGER, calls INTEGER NOT NULL DEFAULT 1, body TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_avs_updated ON avs_videos(updated_at DESC);
  `);
  ready = true;
}

const str = (v: unknown, max = 500): string | null => (typeof v === "string" && v ? v.slice(0, max) : null);

export interface AvsParsed { id: string; status: string; externalId: string | null }

/** the fields we need from a callback body, or null when it is not an avs order */
export function parseAvsCallback(json: unknown): AvsParsed | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const id = typeof j.id === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(j.id) ? j.id : null;
  const status = typeof j.status === "string" && /^[a-z_]{2,24}$/.test(j.status) ? j.status : null;
  if (!id || !status) return null;
  return { id, status, externalId: str(j.external_id, 120) };
}

/**
 * Keep the latest state of an order. avs may send the same status twice (a retry) — the row is simply written again;
 * `changed` says whether the status moved, so the caller logs one ops line per real change.
 */
export function saveAvsCallback(json: unknown, rawBody: string, now = Date.now()): { id: string; status: string; changed: boolean } | null {
  const p = parseAvsCallback(json);
  if (!p) return null;
  ensure();
  const j = json as Record<string, unknown>;
  const r = (j.result && typeof j.result === "object" ? j.result : {}) as Record<string, unknown>;
  const prev = db().prepare("SELECT status FROM avs_videos WHERE id = ?").get(p.id) as { status: string } | undefined;
  const dur = typeof r.duration_s === "number" && Number.isFinite(r.duration_s) ? r.duration_s : null;
  db().prepare(`
    INSERT INTO avs_videos (id, external_id, status, lang, title, note, error, video_url, cover_url, local_path, duration_s, first_at, updated_at, ready_at, calls, body)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
    ON CONFLICT(id) DO UPDATE SET
      external_id = COALESCE(excluded.external_id, external_id), status = excluded.status, lang = COALESCE(excluded.lang, lang),
      title = COALESCE(excluded.title, title), note = excluded.note, error = excluded.error,
      video_url = COALESCE(excluded.video_url, video_url), cover_url = COALESCE(excluded.cover_url, cover_url),
      local_path = COALESCE(excluded.local_path, local_path), duration_s = COALESCE(excluded.duration_s, duration_s),
      updated_at = excluded.updated_at, ready_at = COALESCE(ready_at, excluded.ready_at), calls = calls + 1, body = excluded.body
  `).run(
    p.id, p.externalId, p.status, str(j.lang, 8), str(j.title, 200), str(j.note, 1000), str(j.error, 1000),
    str(r.video_url), str(r.cover_url), str(r.local_path), dur, now, now, p.status === "ready" ? now : null, rawBody.slice(0, 20_000),
  );
  return { id: p.id, status: p.status, changed: prev?.status !== p.status };
}

export function avsVideo(id: string): AvsVideoRow | null {
  ensure();
  return (db().prepare("SELECT * FROM avs_videos WHERE id = ?").get(id) as unknown as AvsVideoRow | undefined) ?? null;
}

export function avsVideos(limit = 50): AvsVideoRow[] {
  ensure();
  return db().prepare("SELECT * FROM avs_videos ORDER BY updated_at DESC LIMIT ?").all(Math.max(1, Math.min(200, limit))) as unknown as AvsVideoRow[];
}
