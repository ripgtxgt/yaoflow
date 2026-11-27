import { db, recordOps } from "@/lib/db";
import { INVITE_ID_RE, INVITE_TTL_MS } from "./invite-link";
import type { HepanFacts } from "./facts";

/**
 * 10-21 合盤邀請 — the server half: when TA has filled in, TA's browser sends both births ONCE (POST /api/hepan/invite);
 * the server computes the pair's facts (as the paid checkout does) and keeps only those here, under the id the
 * inviter's browser made — never either birth, a name or a place. The inviter's browser reads them by id
 * (GET /api/hepan/invite) and can buy the report from them (POST /api/hepan/checkout {invite}). Rows live 30 days.
 */
let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS hepan_invites (
      id TEXT PRIMARY KEY, locale TEXT NOT NULL, facts_json TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hepan_invites_at ON hepan_invites(created_at);
  `);
  ready = true;
}

/** the facts under an id, first write wins (TA fills in once; a second send is answered "exists") */
export function storeInviteFacts(id: string, locale: string, facts: HepanFacts, now = Date.now()): "ok" | "exists" | "bad" {
  if (!INVITE_ID_RE.test(id)) return "bad";
  ensure();
  const res = db().prepare("INSERT OR IGNORE INTO hepan_invites (id, locale, facts_json, created_at) VALUES (?, ?, ?, ?)")
    .run(id, locale, JSON.stringify(facts), now) as unknown as { changes?: number | bigint };
  const ok = Number(res.changes ?? 0) > 0;
  if (ok) recordOps("hepan_invite_filled", `${id.slice(-6)} ${locale}`);
  return ok ? "ok" : "exists";
}

/** the facts of a filled invite — null when there is none yet, or it is older than 30 days */
export function inviteFacts(id: string, now = Date.now()): { facts: HepanFacts; locale: string; at: number } | null {
  if (!INVITE_ID_RE.test(id)) return null;
  ensure();
  const r = db().prepare("SELECT locale, facts_json, created_at FROM hepan_invites WHERE id = ?").get(id) as { locale: string; facts_json: string; created_at: number } | undefined;
  if (!r || now - r.created_at > INVITE_TTL_MS) return null;
  try { return { facts: JSON.parse(r.facts_json) as HepanFacts, locale: r.locale, at: r.created_at }; } catch { return null; }
}

/** rows past 30 days go (called from the fulfil sweep) */
export function purgeHepanInvites(now = Date.now()): number {
  ensure();
  const res = db().prepare("DELETE FROM hepan_invites WHERE created_at < ?").run(now - INVITE_TTL_MS) as unknown as { changes?: number | bigint };
  return Number(res.changes ?? 0);
}
