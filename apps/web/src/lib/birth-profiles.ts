import { db, recordOps } from "./db";
import { normalizeBirth, type BirthInput, type Gender } from "./mingli/birth/normalize";
import type { Who } from "./mingli/birth/profiles";

/**
 * 10-22 进度表 76 ⑤ 生辰檔案 — a signed-in reader's birth profiles, kept with the account so the three chart pages need
 * nothing typed on a new device (the browser copy in lib/mingli/birth/profiles.ts stays the working copy; this is
 * where it is kept and refilled from). At most 10 per account, the newest kept; one tap deletes one, one tap deletes
 * all; erasing the account erases them (lib/db eraseCustomer). The birth itself never goes into a URL or an event.
 */
export interface StoredProfile { id: string; who: Who; name: string; gender?: Gender; input: BirthInput; at: number }

export const PROFILE_MAX = 10;
const WHO = new Set<Who>(["self", "partner", "family", "friend", "other"]);
const ID_RE = /^[a-z0-9]{4,16}$/;

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`CREATE TABLE IF NOT EXISTS birth_profiles (
    customer_id INTEGER NOT NULL,
    id TEXT NOT NULL,
    who TEXT NOT NULL,
    name TEXT NOT NULL,
    gender TEXT,
    input TEXT NOT NULL,
    at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (customer_id, id)
  )`);
  ready = true;
}

/** the shape a browser sends, checked field by field; null when it is not a profile (the birth must at least normalise) */
export function cleanProfile(raw: unknown): StoredProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID_RE.test(r.id)) return null;
  if (typeof r.who !== "string" || !WHO.has(r.who as Who)) return null;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 12) : "";
  const gender = r.gender === "male" || r.gender === "female" ? r.gender : undefined;
  if (!r.input || typeof r.input !== "object") return null;
  const input = r.input as BirthInput;
  try { normalizeBirth(input); } catch { return null; }
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : Date.now();
  // keep only the fields the chart pages read — nothing else a browser might attach travels into the table
  const keep: BirthInput = {
    calendar: input.calendar, y: input.y, m: input.m, d: input.d, leap: !!input.leap, timeMode: input.timeMode,
    ...(input.h !== undefined ? { h: input.h } : {}), ...(input.mi !== undefined ? { mi: input.mi } : {}), ...(input.branch !== undefined ? { branch: input.branch } : {}),
    ...(input.placeId ? { placeId: input.placeId } : {}),
    ...(input.place && typeof input.place === "object" ? { place: { id: String(input.place.id ?? "").slice(0, 40), name: String(input.place.name ?? "").slice(0, 80), lat: Number(input.place.lat), lon: Number(input.place.lon), tz: String(input.place.tz ?? "").slice(0, 60) } } : {}),
    ...(input.gender ? { gender: input.gender } : {}),
    ...(input.trueSolar !== undefined ? { trueSolar: !!input.trueSolar } : {}),
    ...((input as { dstAlreadyRemoved?: boolean }).dstAlreadyRemoved !== undefined ? { dstAlreadyRemoved: !!(input as { dstAlreadyRemoved?: boolean }).dstAlreadyRemoved } : {}),
    ...((input as { zi?: string }).zi ? { zi: (input as { zi?: "next" | "same" }).zi } : {}),
    ...((input as { houses?: string }).houses ? { houses: (input as { houses?: "placidus" | "whole" }).houses } : {}),
  } as BirthInput;
  return { id: r.id, who: r.who as Who, name: name || "我", gender, input: keep, at };
}

export function listProfiles(customerId: number): StoredProfile[] {
  ensure();
  const rows = db().prepare("SELECT id, who, name, gender, input, at FROM birth_profiles WHERE customer_id = ? ORDER BY at DESC").all(customerId) as { id: string; who: Who; name: string; gender: string | null; input: string; at: number }[];
  const out: StoredProfile[] = [];
  for (const r of rows) {
    try { out.push({ id: r.id, who: r.who, name: r.name, gender: r.gender === "male" || r.gender === "female" ? r.gender : undefined, input: JSON.parse(r.input) as BirthInput, at: r.at }); } catch { /* a row that no longer parses is skipped */ }
  }
  return out;
}

/** upsert one or more; the oldest beyond PROFILE_MAX go. Returns the list as it stands. */
export function saveProfiles(customerId: number, list: StoredProfile[], now = Date.now()): StoredProfile[] {
  ensure();
  const d = db();
  const up = d.prepare(`INSERT INTO birth_profiles (customer_id, id, who, name, gender, input, at, updated_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(customer_id, id) DO UPDATE SET who = excluded.who, name = excluded.name, gender = excluded.gender, input = excluded.input, at = excluded.at, updated_at = excluded.updated_at`);
  for (const p of list) up.run(customerId, p.id, p.who, p.name, p.gender ?? null, JSON.stringify(p.input), p.at, now);
  const all = listProfiles(customerId);
  for (const extra of all.slice(PROFILE_MAX)) d.prepare("DELETE FROM birth_profiles WHERE customer_id = ? AND id = ?").run(customerId, extra.id);
  return all.slice(0, PROFILE_MAX);
}

export function deleteProfile(customerId: number, id: string): boolean {
  ensure();
  const r = db().prepare("DELETE FROM birth_profiles WHERE customer_id = ? AND id = ?").run(customerId, id);
  return Number((r as { changes?: number | bigint }).changes ?? 0) > 0;
}

export function deleteAllProfiles(customerId: number): number {
  ensure();
  const n = Number((db().prepare("DELETE FROM birth_profiles WHERE customer_id = ?").run(customerId) as { changes?: number | bigint }).changes ?? 0);
  if (n) recordOps("profiles_cleared", `#${customerId} n=${n}`);
  return n;
}
